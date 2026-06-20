/**
 * One shared Web Audio graph for the whole app. Every playback element (local
 * <audio>, SoundCloud <audio>) routes its output through a single AnalyserNode
 * so the visualizers can read live frequency energy.
 *
 * Only one track plays at a time — providers connect their element on create and
 * disconnect on destroy, so there is never more than one live source.
 *
 * Note on cross-origin: routing an element through createMediaElementSource still
 * plays its audio, but if the media is cross-origin without CORS (SoundCloud's
 * CDN), the browser feeds the analyser silence for privacy. We detect that
 * (no signal) and let the visualizer fall back to synthetic motion.
 */

let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let freq: Uint8Array<ArrayBuffer> | null = null

// Avoid createMediaElementSource() throwing if the same element connects twice.
const sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()

function ensure(): AnalyserNode {
  if (analyser && ctx) return analyser
  ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  analyser = ctx.createAnalyser()
  // Small FFT + heavy smoothing → calm, musical motion rather than jittery spikes.
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.82
  analyser.connect(ctx.destination)
  freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
  return analyser
}

/**
 * Route an element through the analyser. Returns a disconnect fn for teardown.
 * If Web Audio setup fails for any reason, we degrade to a no-op so the element
 * keeps playing on its own direct output — never silence the player.
 */
export function connectElement(el: HTMLMediaElement): () => void {
  try {
    const node = ensure()
    let src = sources.get(el)
    if (!src) {
      src = ctx!.createMediaElementSource(el)
      sources.set(el, src)
    }
    src.connect(node)
    resumeAudio()
    return () => {
      try {
        src!.disconnect(node)
      } catch {
        /* already gone */
      }
    }
  } catch {
    return () => {}
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
export function sampleLevels(out: Float32Array): boolean {
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
