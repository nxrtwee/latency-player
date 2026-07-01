// Full AppDelegate copied over the Capacitor-generated one during the iOS build
// (see scripts/patch-ios.sh). Pinned to the Capacitor 8 template structure.
//
// Native pieces:
//   1. AVAudioSession .playback → audio when locked/backgrounded.
//   2. NativeAudioBridge → WKScriptMessageHandler for lock-screen prev/next-track
//      and native AVPlayer playback. Handles both network URLs and base64-encoded
//      blob data (for offline files that can't be played via blob: URLs).
import UIKit
import Capacitor
import AVFoundation
import MediaPlayer
import WebKit
import Accelerate

// MARK: - Audio tap (real visualizer levels)

// Streamed/offline audio on iOS plays through AVPlayer (outside Web Audio), so the
// JS analyser can't see it. An MTAudioProcessingTap on the player item taps the PCM
// on a real-time audio thread; we run an FFT and push per-band 0..1 levels to JS
// (throttled, on the main thread) to drive the visualizer.
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

    init(bridge: NativeAudioBridge) { self.bridge = bridge }

    func prepare() {
        fftSetup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))
        window = .allocate(capacity: n)
        vDSP_hann_window(window!, vDSP_Length(n), Int32(vDSP_HANN_NORM))
        samples = .allocate(capacity: n)
        realp = .allocate(capacity: half)
        imagp = .allocate(capacity: half)
        mags = .allocate(capacity: half)
    }

    func teardown() {
        if let s = fftSetup { vDSP_destroy_fftsetup(s); fftSetup = nil }
        window?.deallocate(); window = nil
        samples?.deallocate(); samples = nil
        realp?.deallocate(); realp = nil
        imagp?.deallocate(); imagp = nil
        mags?.deallocate(); mags = nil
    }

    func process(_ bufferList: UnsafeMutablePointer<AudioBufferList>, frames: Int) {
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
private let tapPrepare: MTAudioProcessingTapPrepareCallback = { tap, _, _ in
    Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue().prepare()
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
            if let vol = body["volume"] as? Float { player?.volume = vol }
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
        if let d = duration, d.isFinite, d > 0 { currentDuration = d }

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
