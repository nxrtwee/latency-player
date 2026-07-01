/**
 * One shared Web Audio graph for the whole app. Every playback element (local
 * <audio>, SoundCloud <audio>) routes its output through a single AnalyserNode
 * so the visualizers can read live frequency energy.
 *
 * Each element gets its own two-node pre-chain before the shared EQ:
 *   source → fadeGain → normGain → EQ → analyser → destination
 * `fadeGain` drives crossfades (two elements can be live at once during a
 * transition); `normGain` applies the per-track loudness makeup gain. Usually
 * one track plays at a time; during a crossfade exactly two do.
 *
 * Note on cross-origin: routing an element through createMediaElementSource still
 * plays its audio, but if the media is cross-origin without CORS the browser feeds
 * the analyser silence for privacy. Both sources avoid this — local files via the
 * media:// protocol and SoundCloud via the media://remote proxy (both CORS-clean),
 * with HLS fed through MSE (same-origin). The synthetic-motion fallback remains for
 * any frame that still reports no signal.
 */

import { dbToLinear } from '@shared/loudness'

let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let freq: Uint8Array<ArrayBuffer> | null = null

// Avoid createMediaElementSource() throwing if the same element connects twice.
const sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()

// 10-band graphic EQ (peaking biquads). Sits between each source and the
// analyser, so the visualizer reads post-EQ signal and playback is shaped.
export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const EQ_BAND_COUNT = EQ_FREQUENCIES.length
export const EQ_MAX_DB = 12

let eqFilters: BiquadFilterNode[] = []
/** First node sources should connect into (EQ input when present, else analyser). */
let chainHead: AudioNode | null = null

const EQ_GAINS_KEY = 'lp.eqGains'
const EQ_ENABLED_KEY = 'lp.eqEnabled'

function loadEqGains(): number[] {
  try {
    const raw = localStorage.getItem(EQ_GAINS_KEY)
    const arr = raw ? (JSON.parse(raw) as number[]) : []
    if (Array.isArray(arr) && arr.length === EQ_BAND_COUNT) {
      return arr.map((v) => (Number.isFinite(v) ? Math.max(-EQ_MAX_DB, Math.min(EQ_MAX_DB, v)) : 0))
    }
  } catch {
    /* ignore */
  }
  return new Array(EQ_BAND_COUNT).fill(0)
}

let eqGains: number[] = loadEqGains()
let eqEnabled = localStorage.getItem(EQ_ENABLED_KEY) === '1'

function buildEqChain(context: AudioContext, output: AudioNode): void {
  eqFilters = EQ_FREQUENCIES.map((f, i) => {
    const node = context.createBiquadFilter()
    node.type = 'peaking'
    node.frequency.value = f
    node.Q.value = 1.1
    node.gain.value = eqEnabled ? eqGains[i] : 0
    return node
  })
  // Wire the filters in series, terminating into `output` (the analyser).
  for (let i = 0; i < eqFilters.length - 1; i++) eqFilters[i].connect(eqFilters[i + 1])
  eqFilters[eqFilters.length - 1].connect(output)
  chainHead = eqFilters[0]
}

function ensure(): AudioNode {
  if (chainHead && ctx) return chainHead
  ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  analyser = ctx.createAnalyser()
  // Small FFT + heavy smoothing → calm, musical motion rather than jittery spikes.
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.82
  analyser.connect(ctx.destination)
  freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
  buildEqChain(ctx, analyser)
  return chainHead as AudioNode
}

/** Apply the active gains to the live filters (0 dB on every band when disabled). */
function applyEqGains(): void {
  for (let i = 0; i < eqFilters.length; i++) {
    eqFilters[i].gain.value = eqEnabled ? eqGains[i] : 0
  }
}

/** Current EQ state (band gains in dB + enabled flag). */
export function getEqState(): { gains: number[]; enabled: boolean } {
  return { gains: [...eqGains], enabled: eqEnabled }
}

/** Set all band gains (length EQ_BAND_COUNT, clamped to ±EQ_MAX_DB dB). */
export function setEqGains(gains: number[]): void {
  eqGains = gains
    .slice(0, EQ_BAND_COUNT)
    .map((v) => (Number.isFinite(v) ? Math.max(-EQ_MAX_DB, Math.min(EQ_MAX_DB, v)) : 0))
  while (eqGains.length < EQ_BAND_COUNT) eqGains.push(0)
  applyEqGains()
  try {
    localStorage.setItem(EQ_GAINS_KEY, JSON.stringify(eqGains))
  } catch {
    /* ignore */
  }
}

/** Toggle the EQ on/off (off flattens all bands to 0 dB without losing the values). */
export function setEqEnabled(enabled: boolean): void {
  eqEnabled = enabled
  applyEqGains()
  try {
    localStorage.setItem(EQ_ENABLED_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Per-element audio controls returned by {@link connectElement}. */
export interface ElementAudio {
  /** Detach this element's nodes from the graph (teardown). */
  disconnect: () => void
  /** Crossfade gain 0..1, optionally ramped over `rampSec` seconds. */
  setFade: (value: number, rampSec?: number) => void
  /** Per-track loudness makeup gain, in dB (0 = untouched). */
  setNormalization: (db: number) => void
}

const noopElementAudio: ElementAudio = {
  disconnect: () => {},
  setFade: () => {},
  setNormalization: () => {}
}

/**
 * Route an element through the graph: source → fadeGain → normGain → EQ → analyser.
 * Returns per-element controls (fade + normalization) and a disconnect fn. If Web
 * Audio setup fails for any reason, we degrade to no-ops so the element keeps
 * playing on its own direct output — never silence the player.
 */
export function connectElement(el: HTMLMediaElement): ElementAudio {
  try {
    const context = ctx ?? (ensure(), ctx!)
    const head = chainHead as AudioNode
    let src = sources.get(el)
    if (!src) {
      src = context.createMediaElementSource(el)
      sources.set(el, src)
    }
    const fadeGain = context.createGain()
    fadeGain.gain.value = 1
    const normGain = context.createGain()
    normGain.gain.value = 1
    src.connect(fadeGain)
    fadeGain.connect(normGain)
    normGain.connect(head)
    resumeAudio()
    // Track the intended fade level ourselves — reading AudioParam.value right
    // after scheduling is unreliable, and cancelScheduledValues() would wipe a
    // just-set start point, so we anchor each ramp at this known value instead.
    let currentFade = 1
    return {
      disconnect: () => {
        try {
          src!.disconnect(fadeGain)
        } catch {
          /* already gone */
        }
        try {
          fadeGain.disconnect()
        } catch {
          /* already gone */
        }
        try {
          normGain.disconnect()
        } catch {
          /* already gone */
        }
      },
      setFade: (value, rampSec = 0) => {
        const v = Math.max(0, Math.min(1, value))
        const p = fadeGain.gain
        const now = context.currentTime
        p.cancelScheduledValues(now)
        p.setValueAtTime(currentFade, now)
        if (rampSec > 0) p.linearRampToValueAtTime(v, now + rampSec)
        else p.setValueAtTime(v, now)
        currentFade = v
      },
      setNormalization: (db) => {
        normGain.gain.value = dbToLinear(Number.isFinite(db) ? db : 0)
      }
    }
  } catch {
    return noopElementAudio
  }
}

/** Resume the context after a user gesture (autoplay policy). Safe to call often. */
export function resumeAudio(): void {
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

/**
 * Fill `out` (length N) with smoothed 0..1 energy per bar and report whether the
 * source actually produced signal this frame. When there is no analyser yet, or
 * the source is silent/cross-origin-tainted, returns false and leaves `out` at 0.
 */
// An optional external level source. On mobile iOS, playback goes through a native
// AVPlayer (outside Web Audio), so the analyser sees nothing for streamed tracks —
// the platform feeds real per-band levels in here instead (via a native audio tap).
// Returns true if it filled `out` with a live frame this call. Desktop never sets
// this, so behaviour there is unchanged.
let externalSampler: ((out: Float32Array) => boolean) | null = null
export function setExternalLevelSource(fn: ((out: Float32Array) => boolean) | null): void {
  externalSampler = fn
}

export function sampleLevels(out: Float32Array): boolean {
  // Prefer a live external (native) frame when present; fall back to the Web Audio
  // analyser (used by same-origin sources: local files, downloaded tracks).
  if (externalSampler && externalSampler(out)) return true
  if (!analyser || !freq) return false
  analyser.getByteFrequencyData(freq)

  // Use the lower ~70% of bins — the top end is mostly empty air for music and
  // would leave the right-hand bars dead.
  const usable = Math.floor(freq.length * 0.7)
  const n = out.length
  let total = 0
  for (let i = 0; i < n; i++) {
    const start = Math.floor((i / n) * usable)
    const end = Math.max(start + 1, Math.floor(((i + 1) / n) * usable))
    let sum = 0
    for (let j = start; j < end; j++) sum += freq[j]
    const v = sum / (end - start) / 255
    out[i] = v
    total += v
  }
  return total > 0.01
}
