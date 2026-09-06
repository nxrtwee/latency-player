/**
 * Loudness leveling — the part the old "volume normalization" was missing.
 *
 * What was there before: a per-track makeup gain computed from metadata
 * (`@shared/loudness`, ReplayGain-style). It is exact when the metadata exists, but
 * SoundCloud ships none and most local files are untagged, so the gain came out 0 dB
 * and the feature did nothing for almost every track. And even with metadata it is
 * ONE number for the whole track, so a song that is quiet in the verse and loud in
 * the chorus stays that way.
 *
 * What this adds, in the shared part of the graph (so it costs one instance, not one
 * per element) and in this order:
 *
 *   1. AGC — measures the signal that is actually playing and moves a gain so the
 *      program sits at the target. This is what makes track-to-track levels match
 *      with no metadata at all, and what corrects wrong metadata.
 *   2. Compressor — pulls the loud passages down. Together with the AGC's makeup
 *      that is what lifts the quiet passages: the two ends of a track move toward
 *      each other instead of the whole track sliding up and down.
 *   3. Limiter — a brickwall so a boosted quiet-but-peaky track can't clip.
 *
 * The AGC is deliberately slow (a ~0.4s gain ramp fed by an envelope that rises fast
 * and falls slowly): fast enough to catch a section change, slow enough that it does
 * not chase individual beats, which is what makes a leveler audible as pumping.
 */

import { dbToLinear } from '@shared/loudness'

export type LevelerStrength = 'light' | 'medium' | 'strong'

export interface LevelerConfig {
  enabled: boolean
  /** Target program loudness, in the same units the Settings slider shows. */
  targetLufs: number
  strength: LevelerStrength
}

interface StrengthPreset {
  /** Compressor: where the loud parts start being held back. */
  threshold: number
  knee: number
  ratio: number
  attack: number
  release: number
  /** How far the AGC may boost / cut, in dB. */
  maxBoost: number
  maxCut: number
}

const PRESETS: Record<LevelerStrength, StrengthPreset> = {
  // Keeps the dynamics of the recording, only aligns tracks and softens the worst
  // jumps. Barely audible as processing.
  light: { threshold: -18, knee: 10, ratio: 2, attack: 0.02, release: 0.35, maxBoost: 9, maxCut: 12 },
  // The default: quiet verses come up noticeably, the track still breathes.
  medium: { threshold: -22, knee: 12, ratio: 3, attack: 0.012, release: 0.28, maxBoost: 12, maxCut: 15 },
  // Radio-style. Everything lands on one level; dynamics are mostly gone.
  strong: { threshold: -28, knee: 12, ratio: 5, attack: 0.008, release: 0.2, maxBoost: 15, maxCut: 18 }
}

/** Below this the signal is a gap, not music: hold the gain instead of boosting hiss. */
const GATE_DBFS = -55
/** How often the AGC looks at the signal. */
const TICK_MS = 100
/** Gain ramp constant — long enough that the ear reads it as level, not as movement. */
const GAIN_TAU = 0.4
/** Envelope rise/fall per tick. Up fast (a chorus starts NOW), down slow (a pause is
 *  not a level change), which makes the envelope track the loud reference. */
const ENV_UP = 0.3
const ENV_DOWN = 0.02

const linToDb = (lin: number): number => 20 * Math.log10(Math.max(lin, 1e-7))

/** RMS of a time-domain window, in dBFS. */
function windowDbfs(analyserNode: AnalyserNode, into: Float32Array<ArrayBuffer>): number {
  analyserNode.getFloatTimeDomainData(into)
  let sum = 0
  for (let i = 0; i < into.length; i++) sum += into[i] * into[i]
  return linToDb(Math.sqrt(sum / into.length))
}

/**
 * Gain the AGC should apply, in dB, for a measured level and a target.
 *
 * Exported for testability — it is the whole policy of the thing, and it is easier
 * to check as arithmetic than through a live audio graph.
 */
export function agcGainDb(measuredDbfs: number, targetLufs: number, strength: LevelerStrength): number {
  const { maxBoost, maxCut } = PRESETS[strength]
  // RMS stands in for program loudness here. It is not K-weighted, so it reads a
  // dB or two off a true LUFS meter — a constant offset, which the target slider
  // absorbs. What matters for leveling is that every track is measured the same way.
  const gain = targetLufs - measuredDbfs
  return Math.max(-maxCut, Math.min(maxBoost, gain))
}

export interface Leveler {
  setConfig: (cfg: LevelerConfig) => void
  /**
   * Forget the previous track's level. The envelope is asymmetric on purpose (rises
   * fast, falls slowly) so a quiet bar mid-song does not yank the gain up — but that
   * same slowness would carry a loud track's level into the quiet one that follows
   * it, and the new track would sit wrong for ten seconds. So on a track change the
   * envelope is re-seeded from the first measurement instead.
   */
  resetForTrack: () => void
  /** Current measured level, applied gain and compressor reduction — diagnostics. */
  readState: () => {
    measuredDbfs: number
    outputDbfs: number
    gainDb: number
    reductionDb: number
    active: boolean
  }
  destroy: () => void
}

/**
 * Insert a leveler AROUND the EQ.
 *
 * The AGC and the compressor go BEFORE the EQ, the limiter AFTER it. That split is
 * the fix for a real complaint: with everything downstream of the EQ, a bass boost
 * fed straight into both detectors — the AGC saw a louder program and turned the
 * whole track down, and the compressor's peak detector ducked on every kick, so the
 * bass "worked" only by pushing the vocal down. Ahead of the EQ neither detector can
 * see it, so the EQ is fully audible again; the limiter stays last, where it can
 * still catch what a boosted band does to the peaks.
 *
 * Always in the path, even when disabled: a bypass would have to re-route live nodes
 * (a click) or crossfade around them, and a compressor at ratio 1 with the gain at
 * unity is transparent anyway.
 */
export function createLeveler(
  ctx: AudioContext,
  nodes: {
    /** Where every element mixes in, ahead of the EQ. */
    input: AudioNode
    /** Head of the EQ chain — the compressor feeds it. */
    eqIn: AudioNode
    /** Tail of the EQ chain — the limiter takes it. */
    eqOut: AudioNode
    destination: AudioNode
  }
): Leveler {
  const { input, eqIn, eqOut, destination } = nodes
  const gain = ctx.createGain()
  gain.gain.value = 1

  const comp = ctx.createDynamicsCompressor()
  const limiter = ctx.createDynamicsCompressor()

  // Measurement taps. The AGC's sits on the INPUT side: it has to see what arrives,
  // not what it has already done to it, or it would chase its own tail — and being
  // ahead of the EQ is what keeps the user's curve out of the measurement.
  //
  // K-weighting first (ITU-R BS.1770): a high-pass at ~38 Hz and a +4 dB shelf above
  // ~1.7 kHz, which is roughly how loud a band SOUNDS rather than how much energy it
  // carries. Without it bass dominates a plain RMS, so a bass-heavy track reads far
  // louder than it is and gets pushed down too far.
  const kHigh = ctx.createBiquadFilter()
  kHigh.type = 'highpass'
  kHigh.frequency.value = 38
  kHigh.Q.value = 0.5
  const kShelf = ctx.createBiquadFilter()
  kShelf.type = 'highshelf'
  kShelf.frequency.value = 1681
  kShelf.gain.value = 4
  const meter = ctx.createAnalyser()
  meter.fftSize = 2048
  // Explicit ArrayBuffer backing: getFloatTimeDomainData wants a view over a plain
  // ArrayBuffer (same reason analyser.ts builds its byte buffer this way).
  const buf = new Float32Array(new ArrayBuffer(meter.fftSize * 4))
  // The output meter is deliberately NOT weighted: it reports what actually leaves.
  const outMeter = ctx.createAnalyser()
  outMeter.fftSize = 2048
  const outBuf = new Float32Array(new ArrayBuffer(outMeter.fftSize * 4))

  input.connect(gain)
  gain.connect(comp)
  comp.connect(eqIn)
  eqOut.connect(limiter)
  limiter.connect(destination)
  limiter.connect(outMeter)
  input.connect(kHigh)
  kHigh.connect(kShelf)
  kShelf.connect(meter)

  let cfg: LevelerConfig = { enabled: false, targetLufs: -14, strength: 'medium' }
  let envDb = -30
  let gainDb = 0
  let measuredDbfs = -100
  let seedNext = true
  let timer: ReturnType<typeof setInterval> | null = null

  const applyStatic = (): void => {
    const p = PRESETS[cfg.strength]
    if (cfg.enabled) {
      comp.threshold.value = p.threshold
      comp.knee.value = p.knee
      comp.ratio.value = p.ratio
      comp.attack.value = p.attack
      comp.release.value = p.release
      // Brickwall just under 0 dBFS. The AGC can boost a quiet, peaky master past
      // full scale otherwise (dynamic recordings have a low RMS and high peaks).
      limiter.threshold.value = -1.5
      limiter.knee.value = 0
      limiter.ratio.value = 20
      limiter.attack.value = 0.003
      limiter.release.value = 0.1
    } else {
      // ratio 1 = no reduction at any level: the nodes stay wired but do nothing.
      for (const node of [comp, limiter]) {
        node.threshold.value = 0
        node.knee.value = 0
        node.ratio.value = 1
        node.attack.value = 0.003
        node.release.value = 0.25
      }
    }
  }

  const tick = (): void => {
    measuredDbfs = windowDbfs(meter, buf)
    // A gap holds the gain: boosting silence only raises the noise floor, and the
    // gain would then slam back down when the music returns.
    if (measuredDbfs < GATE_DBFS) return
    if (seedNext) {
      // First real measurement of a new track: start the envelope AT it, so the
      // level is right within one gain glide instead of creeping there.
      seedNext = false
      envDb = measuredDbfs
    } else {
      envDb += (measuredDbfs - envDb) * (measuredDbfs > envDb ? ENV_UP : ENV_DOWN)
    }
    gainDb = agcGainDb(envDb, cfg.targetLufs, cfg.strength)
    gain.gain.setTargetAtTime(dbToLinear(gainDb), ctx.currentTime, GAIN_TAU)
  }

  const stop = (): void => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return {
    setConfig: (next) => {
      const wasEnabled = cfg.enabled
      cfg = next
      applyStatic()
      if (!next.enabled) {
        stop()
        gainDb = 0
        gain.gain.setTargetAtTime(1, ctx.currentTime, GAIN_TAU)
        return
      }
      if (!wasEnabled) {
        // Start from the target rather than from the last envelope: the previous
        // track's level says nothing about this one.
        envDb = next.targetLufs
        gainDb = 0
        seedNext = true
      }
      if (!timer) timer = setInterval(tick, TICK_MS)
    },
    resetForTrack: () => {
      seedNext = true
    },
    readState: () => ({
      measuredDbfs,
      outputDbfs: windowDbfs(outMeter, outBuf),
      gainDb,
      // Web Audio reports compressor reduction in dB (0 = none, negative = ducking).
      reductionDb: comp.reduction,
      active: cfg.enabled
    }),
    destroy: () => {
      stop()
      try {
        input.disconnect(gain)
        input.disconnect(kHigh)
        eqOut.disconnect(limiter)
        limiter.disconnect()
      } catch {
        /* already gone */
      }
    }  }
}
