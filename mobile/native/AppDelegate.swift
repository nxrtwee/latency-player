// Full AppDelegate copied over the Capacitor-generated one during the iOS build
// (see scripts/patch-ios.sh). Pinned to the Capacitor 8 template structure.
//
// Native pieces:
//   1. AVAudioSession .playback → audio when locked/backgrounded.
//   2. NativeAudioBridge → WKScriptMessageHandler for lock-screen prev/next-track
//      and native AVPlayer playback. Handles both network URLs and base64-encoded
//      blob data (for offline files that can't be played via blob: URLs).
//   3. A 10-band equalizer inside the audio tap. Because playback is AVPlayer, the
//      renderer's Web Audio EQ is not in the path at all; the tap's PCM is, so the
//      filtering happens here and JS only forwards the slider values ("setEq").
//   4. Loudness leveling in the same tap, for the same reason: AGC → compressor →
//      limiter, mirroring src/renderer/src/audio/leveler.ts. JS forwards the config
//      ("setLeveler") and nothing else.
import UIKit
import Capacitor
import AVFoundation
import MediaPlayer
import WebKit
import Accelerate
import os

// MARK: - Equalizer settings (shared between the bridge and the audio thread)

/// The EQ curve as JS last set it. Written from the WebKit message handler (main
/// thread), read by the audio thread once per buffer.
///
/// The lock is only ever *tried* on the audio side: if JS happens to hold it while
/// a buffer is being filtered, that buffer reuses the previous gains (~10 ms stale)
/// instead of blocking a real-time thread.
final class EqSettings {
    static let shared = EqSettings()

    /// Same centre frequencies, Q and range as the renderer's Web Audio EQ
    /// (src/renderer/src/audio/analyser.ts). One curve, identical on both platforms.
    static let frequencies: [Double] = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    static let q: Double = 1.1
    static let maxDb: Double = 12
    static var bandCount: Int { frequencies.count }

    private let lock = UnsafeMutablePointer<os_unfair_lock>.allocate(capacity: 1)
    private let gains = UnsafeMutablePointer<Double>.allocate(capacity: EqSettings.bandCount)

    private init() {
        lock.initialize(to: os_unfair_lock())
        gains.initialize(repeating: 0, count: EqSettings.bandCount)
    }

    /// Copy the current gains without waiting. False = lock busy, caller keeps
    /// whatever it read last time.
    func tryCopy(into out: UnsafeMutablePointer<Double>) -> Bool {
        guard os_unfair_lock_trylock(lock) else { return false }
        out.update(from: gains, count: EqSettings.bandCount)
        os_unfair_lock_unlock(lock)
        return true
    }

    /// Blocking copy — for tap setup, which is not a real-time callback.
    func copy(into out: UnsafeMutablePointer<Double>) {
        os_unfair_lock_lock(lock)
        out.update(from: gains, count: EqSettings.bandCount)
        os_unfair_lock_unlock(lock)
    }

    /// Store the gains in dB. A disabled EQ is stored as all-zero, so the audio
    /// thread never has to know about the on/off flag — flat means bypass.
    func update(gains newGains: [Double], enabled: Bool) {
        var next = [Double](repeating: 0, count: EqSettings.bandCount)
        if enabled {
            for i in 0..<min(newGains.count, next.count) {
                let v = newGains[i]
                next[i] = v.isFinite ? max(-EqSettings.maxDb, min(EqSettings.maxDb, v)) : 0
            }
        }
        os_unfair_lock_lock(lock)
        for i in 0..<EqSettings.bandCount { gains[i] = next[i] }
        os_unfair_lock_unlock(lock)
    }
}

// MARK: - Loudness leveling settings (shared between the bridge and the audio thread)

/// What Settings last asked of the leveler. Same lock discipline as EqSettings: the
/// audio thread only ever *tries* the lock and keeps its previous copy on a miss.
///
/// The presets mirror src/renderer/src/audio/leveler.ts one for one — one behaviour
/// described in two languages, so a track sounds the same however it is playing.
final class LevelerSettings {
    static let shared = LevelerSettings()

    struct Preset {
        let threshold: Float   // dBFS where the compressor starts holding back
        let knee: Float        // dB of soft knee
        let ratio: Float
        let attack: Float      // seconds
        let release: Float     // seconds
        let maxBoost: Float    // dB the AGC may add
        let maxCut: Float      // dB the AGC may take away
    }

    static let presets: [Preset] = [
        /* light  */ Preset(threshold: -18, knee: 10, ratio: 2, attack: 0.02, release: 0.35, maxBoost: 9, maxCut: 12),
        /* medium */ Preset(threshold: -22, knee: 12, ratio: 3, attack: 0.012, release: 0.28, maxBoost: 12, maxCut: 15),
        /* strong */ Preset(threshold: -28, knee: 12, ratio: 5, attack: 0.008, release: 0.2, maxBoost: 15, maxCut: 18)
    ]

    struct State {
        var enabled = false
        var target: Float = -14   // program loudness to aim for
        var strength = 1          // index into `presets`
    }

    private let lock = UnsafeMutablePointer<os_unfair_lock>.allocate(capacity: 1)
    private var state = State()

    private init() { lock.initialize(to: os_unfair_lock()) }

    func tryRead() -> State? {
        guard os_unfair_lock_trylock(lock) else { return nil }
        let copy = state
        os_unfair_lock_unlock(lock)
        return copy
    }

    func read() -> State {
        os_unfair_lock_lock(lock)
        let copy = state
        os_unfair_lock_unlock(lock)
        return copy
    }

    func update(enabled: Bool, target: Double, strength: String) {
        let idx = strength == "light" ? 0 : (strength == "strong" ? 2 : 1)
        let t = target.isFinite ? Float(max(-30, min(-5, target))) : -14
        os_unfair_lock_lock(lock)
        state = State(enabled: enabled, target: t, strength: idx)
        os_unfair_lock_unlock(lock)
    }
}

/// The leveling chain, per tap: AGC → compressor → limiter, exactly the stages the
/// renderer builds out of Web Audio nodes (audio/leveler.ts).
///
/// Everything is per-sample scalar maths on the tap's own buffer — no allocation, no
/// locking beyond the one `tryRead`, so it is safe on the real-time thread. Stereo is
/// LINKED: one gain for all channels, computed from the loudest channel, otherwise the
/// image would wander as the two sides were reduced by different amounts.
final class Leveler {
    /// Max channels the pointer table is sized for. A wider buffer is left alone
    /// rather than half-processed (no real player item hands the tap more than this).
    private static let maxChannels = 8

    private var sampleRate: Float = 44100
    private var channels = 0
    /// This buffer's channel base pointers. Allocated in prepare() so that process()
    /// — a real-time callback — never allocates (the EQ above follows the same rule).
    private var chans: UnsafeMutablePointer<UnsafeMutablePointer<Float>?>?

    // AGC
    private var envDb: Float = -30        // slow envelope of program level
    private var agcGain: Float = 1        // smoothed, what we actually multiply by
    private var agcTarget: Float = 1
    // Compressor / limiter envelopes, in linear gain (1 = no reduction).
    private var compGain: Float = 1
    private var limGain: Float = 1

    private var envUp: Float = 0          // per-buffer smoothing coefficients
    private var envDown: Float = 0
    private var agcSmooth: Float = 0      // per-sample
    private var attackCoef: Float = 0
    private var releaseCoef: Float = 0
    private var limRelease: Float = 0
    private var lastStrength = -1
    private var lastFrames = 0
    /// Re-seed the envelope from the next buffer instead of gliding to it.
    private var seedNext = true
    /// Last config seen. The audio thread only *tries* the settings lock; on a miss it
    /// keeps working from this rather than letting a buffer through unprocessed, which
    /// would be an audible step in level.
    private var cfg = LevelerSettings.State()

    // K-weighted measurement (ITU-R BS.1770): channels are summed into `scratch`, then
    // run through a ~38 Hz high-pass and a +4 dB shelf above ~1.7 kHz before the RMS.
    // That is roughly how loud a band SOUNDS rather than how much energy it carries —
    // without it bass dominates the measurement and a bass-heavy track gets pushed
    // down too far. The measurement happens BEFORE the EQ (see TapContext.process), so
    // the user's own curve never feeds back into the AGC.
    private static let scratchCapacity = 8192
    private var scratch: UnsafeMutablePointer<Float>?
    private var hp = (b0: Float(1), b1: Float(0), b2: Float(0), a1: Float(0), a2: Float(0))
    private var shelf = (b0: Float(1), b1: Float(0), b2: Float(0), a1: Float(0), a2: Float(0))
    private var hpState = (x1: Float(0), x2: Float(0), y1: Float(0), y2: Float(0))
    private var shelfState = (x1: Float(0), x2: Float(0), y1: Float(0), y2: Float(0))

    /// Below this a buffer is a gap, not music — hold the gain instead of boosting
    /// the noise floor and then slamming back down when the track returns.
    private let gateDb: Float = -55

    func prepare(sampleRate: Double, channels: Int) {
        self.sampleRate = Float(sampleRate > 0 ? sampleRate : 44100)
        self.channels = min(max(1, channels), Leveler.maxChannels)
        chans?.deallocate()
        let table = UnsafeMutablePointer<UnsafeMutablePointer<Float>?>.allocate(capacity: Leveler.maxChannels)
        table.initialize(repeating: nil, count: Leveler.maxChannels)
        chans = table
        cfg = LevelerSettings.shared.read()
        envDb = cfg.target
        agcGain = 1
        agcTarget = 1
        compGain = 1
        limGain = 1
        lastStrength = -1
        lastFrames = 0
        // A tap is created per player item, so this runs once per track — which is
        // exactly when the envelope should forget the previous one.
        seedNext = true
        // 0.4 s gain glide, as on the desktop: fast enough to follow a section, slow
        // enough that the ear hears level rather than movement.
        agcSmooth = 1 - exp(-1 / (0.4 * self.sampleRate))
        limRelease = 1 - exp(-1 / (0.1 * self.sampleRate))

        scratch?.deallocate()
        let sc = UnsafeMutablePointer<Float>.allocate(capacity: Leveler.scratchCapacity)
        sc.initialize(repeating: 0, count: Leveler.scratchCapacity)
        scratch = sc
        buildWeighting()
    }

    /// RBJ-cookbook coefficients for the two K-weighting sections, normalized by a0.
    private func buildWeighting() {
        hpState = (0, 0, 0, 0)
        shelfState = (0, 0, 0, 0)

        // Stage 2 of BS.1770: high-pass, 38 Hz, Q 0.5.
        var w0 = 2 * Float.pi * 38 / sampleRate
        var cosw = cos(w0)
        var alpha = sin(w0) / (2 * 0.5)
        var a0 = 1 + alpha
        hp = (
            b0: ((1 + cosw) / 2) / a0,
            b1: (-(1 + cosw)) / a0,
            b2: ((1 + cosw) / 2) / a0,
            a1: (-2 * cosw) / a0,
            a2: (1 - alpha) / a0
        )

        // Stage 1: high shelf, 1681 Hz, +4 dB, S = 1.
        let A: Float = pow(10, 4 / 40)
        w0 = 2 * Float.pi * 1681 / sampleRate
        cosw = cos(w0)
        alpha = sin(w0) / 2 * sqrt(2)
        let sqrtA = sqrt(A)
        a0 = (A + 1) - (A - 1) * cosw + 2 * sqrtA * alpha
        shelf = (
            b0: (A * ((A + 1) + (A - 1) * cosw + 2 * sqrtA * alpha)) / a0,
            b1: (-2 * A * ((A - 1) + (A + 1) * cosw)) / a0,
            b2: (A * ((A + 1) + (A - 1) * cosw - 2 * sqrtA * alpha)) / a0,
            a1: (2 * ((A - 1) - (A + 1) * cosw)) / a0,
            a2: ((A + 1) - (A - 1) * cosw - 2 * sqrtA * alpha) / a0
        )
    }

    func teardown() {
        chans?.deallocate()
        chans = nil
        scratch?.deallocate()
        scratch = nil
        channels = 0
    }

    private func refreshCoefficients(_ preset: LevelerSettings.Preset, frames: Int) {
        // Envelope constants are expressed as time, then converted for this buffer
        // size — the renderer ticks on a 100 ms timer, the tap on ~23 ms buffers, and
        // both have to end up with the same rise/fall in seconds.
        let dt = Float(max(1, frames)) / sampleRate
        envUp = 1 - exp(-dt / 0.3)
        envDown = 1 - exp(-dt / 5.0)
        attackCoef = 1 - exp(-1 / (max(0.001, preset.attack) * sampleRate))
        releaseCoef = 1 - exp(-1 / (max(0.001, preset.release) * sampleRate))
    }

    /// AGC + compressor, in place, BEFORE the EQ (see TapContext.process). Measuring and
    /// detecting ahead of the EQ is what keeps a bass boost from turning the whole track
    /// down and from ducking the vocal on every kick — leveler.ts has the same split.
    func preProcess(_ bufferList: UnsafeMutablePointer<AudioBufferList>, frames: Int, isFloat: Bool) {
        guard isFloat, channels > 0, frames > 0, let chans = chans else { return }
        if let fresh = LevelerSettings.shared.tryRead() { cfg = fresh }
        let preset = LevelerSettings.presets[min(max(cfg.strength, 0), LevelerSettings.presets.count - 1)]
        if cfg.strength != lastStrength || frames != lastFrames {
            refreshCoefficients(preset, frames: frames)
            lastStrength = cfg.strength
            lastFrames = frames
        }

        // Resolve this buffer's channel pointers into the preallocated table. The two
        // layouts the tap uses (one buffer per channel, or one interleaved buffer)
        // differ only here.
        let abl = UnsafeMutableAudioBufferListPointer(bufferList)
        var step = 1
        if abl.count >= channels {
            for ch in 0..<channels {
                guard let raw = abl[ch].mData else { return }
                chans[ch] = raw.assumingMemoryBound(to: Float.self)
            }
        } else if abl.count == 1, Int(abl[0].mNumberChannels) == channels, let raw = abl[0].mData {
            let base = raw.assumingMemoryBound(to: Float.self)
            step = channels
            for ch in 0..<channels { chans[ch] = base + ch }
        } else {
            return
        }

        if !cfg.enabled {
            // Glide back to unity rather than jumping, so switching the setting off
            // mid-track is not a step in level.
            guard abs(agcGain - 1) > 0.0005 || abs(compGain - 1) > 0.0005 || abs(limGain - 1) > 0.0005
            else { return }
            agcTarget = 1
            var idx = 0
            for _ in 0..<frames {
                agcGain += (agcTarget - agcGain) * agcSmooth
                compGain += (1 - compGain) * releaseCoef
                limGain += (1 - limGain) * limRelease
                let g = agcGain * compGain * limGain
                for ch in 0..<channels {
                    if let p = chans[ch] { p[idx] = max(-1, min(1, p[idx] * g)) }
                }
                idx += step
            }
            return
        }

        // ---- AGC: where should the whole program sit? ----
        // Mono sum into the scratch buffer, K-weighted, then RMS. A buffer larger than
        // the scratch (never seen in practice) just keeps the previous envelope.
        if let sc = scratch, frames <= Leveler.scratchCapacity {
            var idx = 0
            for i in 0..<frames {
                var sum: Float = 0
                for ch in 0..<channels {
                    if let p = chans[ch] { sum += p[idx] }
                }
                sc[i] = sum / Float(channels)
                idx += step
            }
            // Two biquad sections in series, state carried across buffers.
            var s = hpState
            for i in 0..<frames {
                let x = sc[i]
                let y = hp.b0 * x + hp.b1 * s.x1 + hp.b2 * s.x2 - hp.a1 * s.y1 - hp.a2 * s.y2
                s.x2 = s.x1; s.x1 = x
                s.y2 = s.y1; s.y1 = y
                sc[i] = y
            }
            hpState = s
            var t = shelfState
            for i in 0..<frames {
                let x = sc[i]
                let y = shelf.b0 * x + shelf.b1 * t.x1 + shelf.b2 * t.x2 - shelf.a1 * t.y1 - shelf.a2 * t.y2
                t.x2 = t.x1; t.x1 = x
                t.y2 = t.y1; t.y1 = y
                sc[i] = y
            }
            shelfState = t

            var meanSq: Float = 0
            vDSP_measqv(sc, 1, &meanSq, vDSP_Length(frames))
            let db: Float = 20 * log10(max(sqrt(meanSq), 1e-7))
            if db > gateDb {
                if seedNext {
                    // First real buffer of a new track: start the envelope AT it (see
                    // the JS twin's resetForTrack) so the level is right in one glide.
                    seedNext = false
                    envDb = db
                } else {
                    envDb += (db - envDb) * (db > envDb ? envUp : envDown)
                }
                let want = max(-preset.maxCut, min(preset.maxBoost, cfg.target - envDb))
                agcTarget = pow(10, want / 20)
            }
        }

        // ---- Per sample: compressor → makeup ----
        let slope: Float = 1 - 1 / preset.ratio
        let kneeLo: Float = preset.threshold - preset.knee / 2
        let kneeHi: Float = preset.threshold + preset.knee / 2

        var idx = 0
        for _ in 0..<frames {
            // Linked detector: the loudest channel decides the reduction, or the
            // stereo image would wander as the two sides were ducked differently.
            var peak: Float = 0
            for ch in 0..<channels {
                if let p = chans[ch] { peak = max(peak, abs(p[idx])) }
            }

            // Static curve with a soft knee, in dB, then smoothed with
            // attack/release — the shape DynamicsCompressorNode implements.
            var reductionDb: Float = 0
            if peak > 1e-7 {
                let peakDb: Float = 20 * log10(peak)
                if peakDb > kneeHi {
                    reductionDb = (peakDb - preset.threshold) * slope
                } else if peakDb > kneeLo, preset.knee > 0 {
                    let x = peakDb - kneeLo
                    reductionDb = slope * x * x / (2 * preset.knee)
                }
            }
            let compWant: Float = pow(10, -reductionDb / 20)
            compGain += (compWant - compGain) * (compWant < compGain ? attackCoef : releaseCoef)

            agcGain += (agcTarget - agcGain) * agcSmooth
            let g = compGain * agcGain

            for ch in 0..<channels {
                if let p = chans[ch] { p[idx] = p[idx] * g }
            }
            idx += step
        }
    }

    /// The brickwall, AFTER the EQ. It has to be last: a boosted band is exactly what
    /// pushes a levelled track past full scale, and clipping there would be the one
    /// thing worse than the level being slightly off.
    func limit(_ bufferList: UnsafeMutablePointer<AudioBufferList>, frames: Int, isFloat: Bool) {
        guard isFloat, channels > 0, frames > 0, let chans = chans else { return }
        let abl = UnsafeMutableAudioBufferListPointer(bufferList)
        var step = 1
        if abl.count >= channels {
            for ch in 0..<channels {
                guard let raw = abl[ch].mData else { return }
                chans[ch] = raw.assumingMemoryBound(to: Float.self)
            }
        } else if abl.count == 1, Int(abl[0].mNumberChannels) == channels, let raw = abl[0].mData {
            let base = raw.assumingMemoryBound(to: Float.self)
            step = channels
            for ch in 0..<channels { chans[ch] = base + ch }
        } else {
            return
        }

        let limitLin: Float = pow(10, -1.5 / 20)
        var idx = 0
        for _ in 0..<frames {
            var peak: Float = 0
            for ch in 0..<channels {
                if let p = chans[ch] { peak = max(peak, abs(p[idx])) }
            }
            // Instant attack, 100 ms release: it ducks the overshoot instead of
            // colouring the whole passage.
            if peak > limitLin {
                limGain = min(limGain, limitLin / peak)
            } else {
                limGain += (1 - limGain) * limRelease
            }
            if limGain < 0.999 {
                for ch in 0..<channels {
                    if let p = chans[ch] { p[idx] = max(-1, min(1, p[idx] * limGain)) }
                }
            } else {
                for ch in 0..<channels {
                    if let p = chans[ch] { p[idx] = max(-1, min(1, p[idx])) }
                }
            }
            idx += step
        }
    }
}

// MARK: - Audio tap (equalizer + real visualizer levels)

// Streamed/offline audio on iOS plays through AVPlayer (outside Web Audio), so the
// JS analyser can't see it and the JS EQ can't shape it. An MTAudioProcessingTap on
// the player item hands us the PCM on a real-time audio thread: we filter it in
// place (that buffer is what continues to the output — see applyEq), then run an FFT
// and push per-band 0..1 levels to JS (throttled, on the main thread) to drive the
// visualizer.
final class TapContext {
    weak var bridge: NativeAudioBridge?
    let bandCount = 24
    private let n = 1024
    private var half: Int { n / 2 }
    private let log2n: vDSP_Length = 10 // log2(1024)
    private var fftSetup: FFTSetup?
    private var window: UnsafeMutablePointer<Float>?
    private var samples: UnsafeMutablePointer<Float>?
    private var realp: UnsafeMutablePointer<Float>?
    private var imagp: UnsafeMutablePointer<Float>?
    private var mags: UnsafeMutablePointer<Float>?
    private var smoothed = [Float](repeating: 0, count: 24)
    private var lastSend: CFTimeInterval = 0

    // EQ: everything below is allocated in prepare() and only read/written by the
    // audio thread afterwards, so no buffer is ever allocated inside process().
    private let eqBands = EqSettings.bandCount
    private var eqSampleRate: Double = 44100
    private var eqChannels = 0
    private var eqFloat = false
    private var eqTarget: UnsafeMutablePointer<Double>?  // gains JS asked for
    private var eqCurrent: UnsafeMutablePointer<Double>? // gains we are actually at
    private var eqCoeffs: UnsafeMutablePointer<Float>?   // 5 per band: b0 b1 b2 a1 a2
    private var eqState: UnsafeMutablePointer<Float>?    // 4 per (channel, band)
    private var eqActive = false

    // Loudness leveling runs after the EQ on the same buffer (see process).
    private let leveler = Leveler()

    init(bridge: NativeAudioBridge) { self.bridge = bridge }

    func prepare(format: AudioStreamBasicDescription) {
        fftSetup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))
        window = .allocate(capacity: n)
        vDSP_hann_window(window!, vDSP_Length(n), Int32(vDSP_HANN_NORM))
        samples = .allocate(capacity: n)
        realp = .allocate(capacity: half)
        imagp = .allocate(capacity: half)
        mags = .allocate(capacity: half)

        // The tap's processing format decides the filter: coefficients depend on the
        // real sample rate, and the state array on the real channel count.
        eqSampleRate = format.mSampleRate > 0 ? format.mSampleRate : 44100
        eqChannels = max(1, Int(format.mChannelsPerFrame))
        eqFloat = format.mFormatFlags & kAudioFormatFlagIsFloat != 0 && format.mBitsPerChannel == 32
        let target = UnsafeMutablePointer<Double>.allocate(capacity: eqBands)
        let current = UnsafeMutablePointer<Double>.allocate(capacity: eqBands)
        let coeffs = UnsafeMutablePointer<Float>.allocate(capacity: eqBands * 5)
        let state = UnsafeMutablePointer<Float>.allocate(capacity: eqBands * eqChannels * 4)
        target.initialize(repeating: 0, count: eqBands)
        coeffs.initialize(repeating: 0, count: eqBands * 5)
        state.initialize(repeating: 0, count: eqBands * eqChannels * 4)
        // Start *at* the saved curve instead of gliding up to it, so switching
        // tracks doesn't sweep the EQ in from flat.
        EqSettings.shared.copy(into: target)
        current.initialize(from: target, count: eqBands)
        eqTarget = target
        eqCurrent = current
        eqCoeffs = coeffs
        eqState = state
        updateCoefficients()
        eqActive = (0..<eqBands).contains { current[$0] != 0 }
        leveler.prepare(sampleRate: eqSampleRate, channels: eqChannels)
    }

    func teardown() {
        if let s = fftSetup { vDSP_destroy_fftsetup(s); fftSetup = nil }
        window?.deallocate(); window = nil
        samples?.deallocate(); samples = nil
        realp?.deallocate(); realp = nil
        imagp?.deallocate(); imagp = nil
        mags?.deallocate(); mags = nil
        eqTarget?.deallocate(); eqTarget = nil
        eqCurrent?.deallocate(); eqCurrent = nil
        eqCoeffs?.deallocate(); eqCoeffs = nil
        eqState?.deallocate(); eqState = nil
        eqChannels = 0
        eqActive = false
        leveler.teardown()
    }

    func process(_ bufferList: UnsafeMutablePointer<AudioBufferList>, frames: Int) {
        guard frames > 0 else { return }
        // Order matters and mirrors the desktop graph (audio/analyser.ts):
        //   AGC + compressor → EQ → FFT for the visualizer → limiter.
        // The leveler's detectors run BEFORE the EQ so the user's curve cannot feed
        // back into them, and the limiter runs after it so a boosted band cannot clip.
        leveler.preProcess(bufferList, frames: frames, isFloat: eqFloat)
        applyEq(bufferList, frames: frames)
        analyse(bufferList, frames: frames)
        leveler.limit(bufferList, frames: frames, isFloat: eqFloat)
    }

    // MARK: EQ

    /// Shape the tap's PCM in place. This buffer is what AVPlayer sends downstream,
    /// so filtering it here *is* the equalizer. It runs before the FFT below, which
    /// makes the visualizer post-EQ — the same order as the desktop graph
    /// (source → … → EQ → analyser).
    private func applyEq(_ bufferList: UnsafeMutablePointer<AudioBufferList>, frames: Int) {
        guard eqFloat, eqChannels > 0,
              let target = eqTarget, let current = eqCurrent, let state = eqState else { return }

        _ = EqSettings.shared.tryCopy(into: target)

        // Glide toward the target so dragging a slider can't click: 25% of the
        // remaining distance per buffer settles in ~100-200 ms. Coefficients are
        // only recomputed while something is actually moving.
        var moved = false
        var active = false
        for i in 0..<eqBands {
            let delta = target[i] - current[i]
            if abs(delta) > 0.001 {
                current[i] += delta * 0.25
                if abs(target[i] - current[i]) <= 0.001 { current[i] = target[i] }
                moved = true
            }
            if current[i] != 0 { active = true }
        }
        if moved { updateCoefficients() }

        guard active else {
            // Flat curve: leave the PCM untouched, and drop the filter history so a
            // later re-enable starts clean instead of ringing out an old buffer.
            if eqActive { state.update(repeating: 0, count: eqBands * eqChannels * 4) }
            eqActive = false
            return
        }
        eqActive = true

        let abl = UnsafeMutableAudioBufferListPointer(bufferList)
        if abl.count >= eqChannels {
            // Deinterleaved (what the tap normally hands out): one buffer per channel.
            for ch in 0..<eqChannels {
                guard let raw = abl[ch].mData else { continue }
                filter(raw.assumingMemoryBound(to: Float.self), frames: frames, step: 1, channel: ch)
            }
        } else if abl.count == 1, Int(abl[0].mNumberChannels) == eqChannels,
                  let raw = abl[0].mData {
            let base = raw.assumingMemoryBound(to: Float.self)
            for ch in 0..<eqChannels {
                filter(base + ch, frames: frames, step: eqChannels, channel: ch)
            }
        }
    }

    /// Run one channel through the cascade of peaking sections (direct form 1, the
    /// same topology and state layout Web Audio uses).
    private func filter(_ p: UnsafeMutablePointer<Float>, frames: Int, step: Int, channel: Int) {
        guard let coeffs = eqCoeffs, let state = eqState else { return }
        for band in 0..<eqBands {
            let c = coeffs + band * 5
            // A 0 dB band is written as a literal pass-through, so skipping it here
            // is exact, not an approximation.
            if c[0] == 1 && c[1] == 0 && c[2] == 0 && c[3] == 0 && c[4] == 0 { continue }
            let b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4]
            let st = state + (channel * eqBands + band) * 4
            var x1 = st[0], x2 = st[1], y1 = st[2], y2 = st[3]
            var idx = 0
            for _ in 0..<frames {
                let x = p[idx]
                let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
                x2 = x1; x1 = x
                y2 = y1; y1 = y
                p[idx] = y
                idx += step
            }
            st[0] = x1; st[1] = x2; st[2] = y1; st[3] = y2
        }
        // A boosted band can push peaks past full scale; clip so the output stage
        // gets valid samples instead of wrapping into a crackle.
        var lo: Float = -1, hi: Float = 1
        vDSP_vclip(p, step, &lo, &hi, p, step, vDSP_Length(frames))
    }

    /// RBJ-cookbook peaking coefficients, normalized by a0 — the same formulas
    /// BiquadFilterNode uses, so a curve dialled in on the desktop sounds the same
    /// here. Called on a gain change, never per buffer.
    private func updateCoefficients() {
        guard let current = eqCurrent, let coeffs = eqCoeffs else { return }
        let nyquist = eqSampleRate / 2
        for (band, f) in EqSettings.frequencies.enumerated() {
            let out = coeffs + band * 5
            let db = current[band]
            // Nothing to shape at 0 dB, or above Nyquist at this sample rate.
            guard abs(db) > 0.0005, f < nyquist else {
                out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0; out[4] = 0
                continue
            }
            let a = pow(10, db / 40) // sqrt of the linear gain
            let w0 = 2 * Double.pi * f / eqSampleRate
            let alpha = sin(w0) / (2 * EqSettings.q)
            let cosw = cos(w0)
            let a0 = 1 + alpha / a
            out[0] = Float((1 + alpha * a) / a0)
            out[1] = Float((-2 * cosw) / a0)
            out[2] = Float((1 - alpha * a) / a0)
            out[3] = Float((-2 * cosw) / a0)
            out[4] = Float((1 - alpha / a) / a0)
        }
    }

    // MARK: Levels

    private func analyse(_ bufferList: UnsafeMutablePointer<AudioBufferList>, frames: Int) {
        guard let setup = fftSetup, let window, let samples, let realp, let imagp, let mags,
              frames > 0 else { return }
        let abl = UnsafeMutableAudioBufferListPointer(bufferList)
        guard let first = abl.first, let raw = first.mData else { return }
        let src = raw.assumingMemoryBound(to: Float.self)

        let count = min(frames, n)
        memset(samples, 0, n * MemoryLayout<Float>.size)
        samples.update(from: src, count: count)
        vDSP_vmul(samples, 1, window, 1, samples, 1, vDSP_Length(n))

        var split = DSPSplitComplex(realp: realp, imagp: imagp)
        samples.withMemoryRebound(to: DSPComplex.self, capacity: half) { cp in
            vDSP_ctoz(cp, 2, &split, 1, vDSP_Length(half))
        }
        vDSP_fft_zrip(setup, &split, 1, log2n, FFTDirection(FFT_FORWARD))
        vDSP_zvmags(&split, 1, mags, 1, vDSP_Length(half))

        // Bin the lower ~60% of bins (music energy) into bands; sqrt(power) → amplitude.
        let usable = Int(Float(half) * 0.6)
        var bars = [Double](repeating: 0, count: bandCount)
        for b in 0..<bandCount {
            let lo = b * usable / bandCount
            let hi = max(lo + 1, (b + 1) * usable / bandCount)
            var sum: Float = 0
            for i in lo..<hi { sum += mags[i] }
            let amp = sqrtf(sum / Float(hi - lo))
            // Perceptual scale + smoothing (rise fast, fall slow).
            var v = amp / 900.0
            if v > 1 { v = 1 }
            let prev = smoothed[b]
            let eased = v > prev ? prev + (v - prev) * 0.6 : prev + (v - prev) * 0.25
            smoothed[b] = eased
            bars[b] = Double(eased)
        }

        // Throttle to ~30 fps and hop to the main thread for the JS call.
        let now = CFAbsoluteTimeGetCurrent()
        if now - lastSend < 0.033 { return }
        lastSend = now
        DispatchQueue.main.async { [weak bridge] in
            bridge?.sendLevels(bars)
        }
    }
}

private let tapInit: MTAudioProcessingTapInitCallback = { _, clientInfo, tapStorageOut in
    tapStorageOut.pointee = clientInfo
}
private let tapFinalize: MTAudioProcessingTapFinalizeCallback = { tap in
    let ctx = Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap))
    ctx.takeUnretainedValue().teardown()
    ctx.release()
}
private let tapPrepare: MTAudioProcessingTapPrepareCallback = { tap, _, format in
    Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap))
        .takeUnretainedValue()
        .prepare(format: format.pointee)
}
private let tapUnprepare: MTAudioProcessingTapUnprepareCallback = { tap in
    Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue().teardown()
}
private let tapProcess: MTAudioProcessingTapProcessCallback = { tap, numberFrames, _, bufferListInOut, numberFramesOut, flagsOut in
    let status = MTAudioProcessingTapGetSourceAudio(tap, numberFrames, bufferListInOut, flagsOut, nil, numberFramesOut)
    guard status == noErr else { return }
    Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap))
        .takeUnretainedValue()
        .process(bufferListInOut, frames: Int(numberFramesOut.pointee))
}

// MARK: - NativeAudioBridge

class NativeAudioBridge: NSObject, WKScriptMessageHandler {

    static let handlerName = "latencyAudio"
    static let shared = NativeAudioBridge()

    private weak var webView: WKWebView?
    private var player: AVPlayer?
    private var timeObserver: Any?
    private var statusObserver: NSKeyValueObservation?
    private var didEndObserver: NSObjectProtocol?
    /// Duration (seconds) from the JS track metadata — AVPlayerItem.duration is NaN
    /// for progressive MP3, so we can't rely on it for the lock-screen progress bar.
    private var currentDuration: Double = 0
    private var currentVolume: Float = 1.0
    private var nextHandler: NSObjectProtocol?
    private var prevHandler: NSObjectProtocol?
    private var playHandler: NSObjectProtocol?
    private var pauseHandler: NSObjectProtocol?

    private override init() { super.init() }

    func install(on webView: WKWebView) {
        self.webView = webView
        webView.configuration.userContentController.add(self, name: Self.handlerName)
        setupRemoteCommands()
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.handlerName,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "load":
            guard let urlStr = body["url"] as? String, let url = URL(string: urlStr) else { return }
            loadURL(url)
        case "loadBase64":
            guard let b64 = body["base64"] as? String else { return }
            loadBase64(b64)
        case "play":
            // Re-assert the playback session right before playing. If the session
            // isn't active / in the .playback category at this moment, a native
            // AVPlayer produces NO audio (and obeys the ring/silent switch). This
            // is the usual cause of "it switches tracks but there's no sound".
            Self.activatePlaybackSession()
            player?.play()
            sendEvent("playingChange", data: ["playing": true])
        case "pause":
            player?.pause()
            sendEvent("playingChange", data: ["playing": false])
        case "seek":
            if let time = body["time"] as? Double {
                player?.seek(to: CMTime(seconds: time, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
            }
        case "setVolume":
            let volNum = (body["volume"] as? NSNumber)?.floatValue ?? (body["volume"] as? Double).map(Float.init)
            if let vol = volNum {
                currentVolume = vol
                player?.volume = vol
            }
        case "setEq":
            // Settings only — it touches no player and no now-playing state, so the
            // EQ can never interfere with playback or the lock screen. The running
            // tap picks the new curve up on its next buffer.
            let gains = (body["gains"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? []
            EqSettings.shared.update(gains: gains, enabled: body["enabled"] as? Bool ?? false)
        case "setLeveler":
            // Same contract as setEq: settings only, read by the tap on its next
            // buffer, nothing here can reach the player or the now-playing info.
            LevelerSettings.shared.update(
                enabled: body["enabled"] as? Bool ?? false,
                target: (body["target"] as? NSNumber)?.doubleValue ?? -14,
                strength: body["strength"] as? String ?? "medium"
            )
        case "setMetadata":
            setMetadata(
                title: body["title"] as? String ?? "",
                artist: body["artist"] as? String ?? "",
                artwork: body["artwork"] as? String,
                duration: body["duration"] as? Double
            )
        case "setPlaybackState":
            updateNowPlayingProgress(
                position: body["position"] as? Double,
                playing: body["playing"] as? Bool ?? false,
                duration: body["duration"] as? Double
            )
        case "getPosition":
            let sec = player?.currentTime().seconds ?? 0
            sendEvent("positionResult", data: ["position": sec.isFinite ? sec : 0])
        case "getDuration":
            let dur = player?.currentItem?.duration.seconds ?? 0
            sendEvent("durationResult", data: ["duration": dur.isFinite ? dur : 0])
        default:
            break
        }
    }

    // MARK: - Audio session

    /// Force the app's audio session into .playback and activate it. Safe to call
    /// repeatedly. Reports failures to JS so they surface in-app instead of being
    /// silent. `.playback` is what makes audio ignore the ring/silent switch and
    /// keep going when the screen locks.
    @discardableResult
    static func activatePlaybackSession() -> Bool {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
            return true
        } catch {
            NativeAudioBridge.shared.reportError("audio session: \(error.localizedDescription)")
            return false
        }
    }

    func reportError(_ message: String) {
        sendEvent("nativeError", data: ["message": message])
    }

    // MARK: - Audio Loading

    // A desktop-browser User-Agent. SoundCloud / Yandex CDNs reject AVPlayer's
    // default "AppleCoreMedia" UA (→ 403 → "Cannot Open"); the same URL plays in a
    // web <audio> element because it sends a browser UA. Pass it via AVURLAsset.
    private static let browserUA =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 " +
        "(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"

    private func loadURL(_ url: URL) {
        let asset = AVURLAsset(url: url, options: [
            "AVURLAssetHTTPHeaderFieldsKey": ["User-Agent": Self.browserUA]
        ])
        startPlayer(asset: asset)
    }

    /// Load from base64-encoded audio data (for blob: URLs that AVPlayer can't handle).
    private func loadBase64(_ b64: String) {
        guard let data = Data(base64Encoded: b64) else { return }
        // Write to a temp file — AVPlayer needs a file or network URL
        // SoundCloud / Yandex progressive downloads are MP3 — name the temp file
        // .mp3 so AVPlayer's container sniffing doesn't choke on a wrong extension.
        let tmp = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("lp_audio_\(ProcessInfo.processInfo.globallyUniqueString).mp3")
        do {
            try data.write(to: tmp)
        } catch {
            print("NativeAudioBridge: failed to write temp file: \(error)")
            return
        }
        startPlayer(asset: AVURLAsset(url: tmp))
    }

    private func startPlayer(asset: AVURLAsset) {
        teardownPlayer()
        let item = AVPlayerItem(asset: asset)
        let av = AVPlayer(playerItem: item)
        av.volume = currentVolume
        av.allowsExternalPlayback = true
        self.player = av
        attachObservers(av)
        attachTap(to: item, asset: asset)
    }

    /// Attach an MTAudioProcessingTap to the item's audio track so we can compute
    /// real visualizer levels. The audio track loads asynchronously (streaming), so
    /// we wait for it, then set the item's audioMix.
    private func attachTap(to item: AVPlayerItem, asset: AVURLAsset) {
        asset.loadValuesAsynchronously(forKeys: ["tracks"]) { [weak self, weak item] in
            guard let self = self else { return }
            guard asset.statusOfValue(forKey: "tracks", error: nil) == .loaded,
                  let track = asset.tracks(withMediaType: .audio).first else { return }
            let ctx = TapContext(bridge: self)
            var callbacks = MTAudioProcessingTapCallbacks(
                version: kMTAudioProcessingTapCallbacksVersion_0,
                clientInfo: UnsafeMutableRawPointer(Unmanaged.passRetained(ctx).toOpaque()),
                init: tapInit,
                finalize: tapFinalize,
                prepare: tapPrepare,
                unprepare: tapUnprepare,
                process: tapProcess
            )
            var tap: Unmanaged<MTAudioProcessingTap>?
            let status = MTAudioProcessingTapCreate(kCFAllocatorDefault, &callbacks,
                                                    kMTAudioProcessingTapCreationFlag_PostEffects, &tap)
            guard status == noErr, let tapObj = tap?.takeRetainedValue() else { return }
            let params = AVMutableAudioMixInputParameters(track: track)
            params.audioTapProcessor = tapObj
            let mix = AVMutableAudioMix()
            mix.inputParameters = [params]
            DispatchQueue.main.async { item?.audioMix = mix }
        }
    }

    func sendLevels(_ bars: [Double]) {
        sendEvent("levels", data: ["bars": bars])
    }

    private func attachObservers(_ av: AVPlayer) {
        let interval = CMTime(seconds: 0.2, preferredTimescale: 600)
        timeObserver = av.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            let sec = time.seconds
            guard sec.isFinite else { return }
            let dur = av.currentItem?.duration.seconds ?? 0
            self?.sendEvent("timeUpdate", data: ["position": sec, "duration": dur.isFinite ? dur : 0])
        }
        if let item = av.currentItem {
            didEndObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
            ) { [weak self] _ in
                self?.sendEvent("ended", data: [:])
            }
            // Surface load failures (bad URL, unsupported codec, offline file with
            // wrong extension, expired signed URL, …) to JS instead of failing mute.
            statusObserver = item.observe(\.status, options: [.new]) { [weak self] it, _ in
                if it.status == .failed {
                    let e = it.error as NSError?
                    let base = e?.localizedDescription ?? "AVPlayerItem failed"
                    let msg = "\(base) [\(e?.domain ?? "?"):\(e?.code ?? 0)]"
                    self?.reportError(msg)
                }
            }
        }
    }

    private func teardownPlayer() {
        if let obs = timeObserver, let p = player { p.removeTimeObserver(obs) }
        timeObserver = nil
        if let obs = didEndObserver { NotificationCenter.default.removeObserver(obs) }
        didEndObserver = nil
        statusObserver?.invalidate(); statusObserver = nil
        player?.pause(); player = nil
    }

    // MARK: - Lock Screen

    private func setupRemoteCommands() {
        let cc = MPRemoteCommandCenter.shared()
        cc.skipForwardCommand.isEnabled = false
        cc.skipBackwardCommand.isEnabled = false
        cc.changePlaybackPositionCommand.isEnabled = false
        playHandler = cc.playCommand.addTarget { [weak self] _ in
            self?.player?.play()
            self?.sendEvent("playingChange", data: ["playing": true])
            return .success
        } as? NSObjectProtocol
        pauseHandler = cc.pauseCommand.addTarget { [weak self] _ in
            self?.player?.pause()
            self?.sendEvent("playingChange", data: ["playing": false])
            return .success
        } as? NSObjectProtocol
        cc.togglePlayPauseCommand.isEnabled = true
        nextHandler = cc.nextTrackCommand.addTarget { [weak self] _ in
            self?.sendEvent("nextTrack", data: [:])
            return .success
        } as? NSObjectProtocol
        prevHandler = cc.previousTrackCommand.addTarget { [weak self] _ in
            self?.sendEvent("previousTrack", data: [:])
            return .success
        } as? NSObjectProtocol
        cc.nextTrackCommand.isEnabled = true
        cc.previousTrackCommand.isEnabled = true
    }

    // MARK: - Metadata

    private func setMetadata(title: String, artist: String, artwork: String?, duration: Double?) {
        // A new track: adopt its duration, or CLEAR the previous one if this track
        // has no known length. Keeping the old value here is what made a track with
        // a missing/zero duration inherit the previous track's length on the lock
        // screen (a "random" duration). Transient state pushes (play/pause/seek) go
        // through updateNowPlayingProgress, which keeps the last good value.
        if let d = duration, d.isFinite, d > 0 { currentDuration = d } else { currentDuration = 0 }

        var info: [String: Any] = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyTitle] = title
        info[MPMediaItemPropertyArtist] = artist
        info[MPMediaItemPropertyAlbumTitle] = "Latency"
        if currentDuration > 0 { info[MPMediaItemPropertyPlaybackDuration] = currentDuration }
        let pos = player?.currentTime().seconds ?? 0
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = pos.isFinite ? pos : 0
        info[MPNowPlayingInfoPropertyPlaybackRate] = (player?.timeControlStatus == .playing) ? 1.0 : 0.0
        // New track → drop the previous artwork until the new one loads.
        info.removeValue(forKey: MPMediaItemPropertyArtwork)
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info

        // Load artwork off the main thread and MERGE it in (don't overwrite the
        // dict — that would wipe the elapsed/rate/duration we just set, freezing
        // the progress bar).
        if let artStr = artwork, let artURL = URL(string: artStr) {
            DispatchQueue.global().async {
                guard let data = try? Data(contentsOf: artURL), let img = UIImage(data: data) else { return }
                DispatchQueue.main.async {
                    var i = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                    i[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
                    MPNowPlayingInfoCenter.default().nowPlayingInfo = i
                }
            }
        }
    }

    /// Update just the elapsed time / rate / duration so the lock-screen progress
    /// bar animates. iOS extrapolates position between updates from the rate, so
    /// this only needs to fire on play/pause/seek, not every tick.
    private func updateNowPlayingProgress(position: Double?, playing: Bool, duration: Double?) {
        if let d = duration, d.isFinite, d > 0 { currentDuration = d }
        var i = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        if let p = position, p.isFinite { i[MPNowPlayingInfoPropertyElapsedPlaybackTime] = p }
        if currentDuration > 0 { i[MPMediaItemPropertyPlaybackDuration] = currentDuration }
        i[MPNowPlayingInfoPropertyPlaybackRate] = playing ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = i
    }

    // MARK: - JS Communication

    private func sendEvent(_ name: String, data: [String: Any]) {
        var json = data
        json["_event"] = name
        guard let jsonData = try? JSONSerialization.data(withJSONObject: json),
              let jsonStr = String(data: jsonData, encoding: .utf8) else { return }
        let js = "window.__nativeAudioEvent && window.__nativeAudioEvent(\(jsonStr))"
        webView?.evaluateJavaScript(js)
    }
}

// MARK: - AppDelegate

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var bridgeInstalled = false

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        NativeAudioBridge.activatePlaybackSession()
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        installBridgeIfNeeded()
    }

    private func installBridgeIfNeeded() {
        guard !bridgeInstalled else { return }
        guard let webView = findWebView(in: window?.rootViewController?.view) else { return }
        bridgeInstalled = true
        NativeAudioBridge.shared.install(on: webView)
    }

    private func findWebView(in view: UIView?) -> WKWebView? {
        guard let view = view else { return nil }
        if let wv = view as? WKWebView { return wv }
        for sub in view.subviews {
            if let found = findWebView(in: sub) { return found }
        }
        return nil
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
