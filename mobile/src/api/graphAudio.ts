// graphAudio.ts — per-track audio controls for the mobile <audio> path, with an
// opportunistic upgrade into the Web Audio graph.
//
// Why this exists: a cross-origin media element routed through
// createMediaElementSource() is tainted, and Web Audio answers with SILENCE rather
// than an error — so mobile streams historically avoided the graph entirely and
// faded by riding `audio.volume` (volumeFade.ts). The cost of staying out of the
// graph is that the equalizer, loudness normalization and the real visualizer are
// all missing.
//
// So we check first, then upgrade. `blob:` (offline downloads) and MediaSource
// (hls.js) sources are same-origin by construction and always safe. A remote URL is
// safe only if its host answers with Access-Control-Allow-Origin: one cheap GET
// settles it, and the verdict is cached per host. SoundCloud's progressive CDN does
// send it, so online SC streams get the full graph; hosts that don't (Yandex's
// storage, at the time of writing) simply stay on the volume fader — the previous
// behaviour, unchanged.
//
// iOS never gets here: there playback is a native AVPlayer and the EQ lives in the
// audio tap (see nativeEq.ts).

import { connectElement, type ElementAudio } from '@renderer/audio/analyser'
import { makeVolumeFader } from './volumeFade'

/** Volume/fade/normalization for one playing element. */
export interface TrackAudio {
  setVolume: (v: number) => void
  setFade: (value: number, rampSec?: number) => void
  /** Loudness makeup gain in dB. Only effective on the graph path. */
  setNormalization: (db: number) => void
  /** Route through Web Audio unconditionally (same-origin / MediaSource sources). */
  useGraph: () => void
  /**
   * Route through Web Audio if `url`'s host allows CORS. Sets `crossOrigin` on the
   * element, so it must be awaited BEFORE assigning `src`.
   */
  useGraphIfAllowed: (url: string) => Promise<void>
  destroy: () => void
}

const VERDICT_KEY = 'lp.m.corsHosts'
const PROBE_TIMEOUT_MS = 2500

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function readVerdicts(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(VERDICT_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function writeVerdict(host: string, ok: boolean): void {
  try {
    const all = readVerdicts()
    all[host] = ok
    localStorage.setItem(VERDICT_KEY, JSON.stringify(all))
  } catch {
    /* private mode / quota — we just re-probe next time */
  }
}

function forgetVerdict(host: string): void {
  try {
    const all = readVerdicts()
    delete all[host]
    localStorage.setItem(VERDICT_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

/**
 * Does this host serve CORS? A plain GET with no custom headers needs no preflight;
 * if the response carries no Access-Control-Allow-Origin the fetch rejects, which is
 * exactly the verdict we want. We abort as soon as the headers land — the body is of
 * no interest.
 */
async function probeCors(url: string): Promise<boolean> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: 'GET', mode: 'cors', signal: ctl.signal })
    return res.ok || res.status === 206
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    ctl.abort()
  }
}

export function makeTrackAudio(audio: HTMLAudioElement): TrackAudio {
  const fader = makeVolumeFader(audio)
  let graph: ElementAudio | null = null
  let vol = 1
  let fade = 1
  let norm = 0

  /** Switch the live controls over to the graph, carrying the current state across. */
  const attach = (): void => {
    if (graph) return
    graph = connectElement(audio)
    // The fader multiplied volume × fade into audio.volume; on the graph the fade is
    // a gain node, so the element goes back to carrying volume alone.
    fader.destroy()
    audio.volume = clamp01(vol)
    graph.setFade(fade)
    graph.setNormalization(norm)
  }

  return {
    setVolume: (v) => {
      vol = v
      if (graph) audio.volume = clamp01(v)
      else fader.setVolume(v)
    },
    setFade: (value, rampSec = 0) => {
      fade = clamp01(value)
      if (graph) graph.setFade(fade, rampSec)
      else fader.setFade(fade, rampSec)
    },
    setNormalization: (db) => {
      norm = Number.isFinite(db) ? db : 0
      graph?.setNormalization(norm)
    },
    useGraph: attach,
    useGraphIfAllowed: async (url) => {
      if (graph) return
      let parsed: URL
      try {
        parsed = new URL(url, location.href)
      } catch {
        return
      }
      // blob:/data: and our own origin carry no taint.
      if (parsed.protocol === 'blob:' || parsed.protocol === 'data:' || parsed.origin === location.origin) {
        attach()
        return
      }
      const host = parsed.host
      const cached = readVerdicts()[host]
      const ok = typeof cached === 'boolean' ? cached : await probeCors(url)
      if (typeof cached !== 'boolean') writeVerdict(host, ok)
      if (!ok) return

      audio.crossOrigin = 'anonymous'
      attach()
      // Safety net: if the CDN turns out to refuse the CORS media request after all,
      // the element errors instead of playing. Drop the verdict so the next track
      // takes the plain path (this one is already lost — the provider surfaces the
      // error and the user can retry).
      audio.addEventListener(
        'error',
        () => {
          forgetVerdict(host)
        },
        { once: true }
      )
    },
    destroy: () => {
      fader.destroy()
      graph?.disconnect()
    }
  }
}
