// Progressive MP3 playback through a MediaSource, so a stream whose CDN refuses
// CORS can still go through the Web Audio graph.
//
// The problem it solves: an <audio> element loading a cross-origin URL without
// Access-Control-Allow-Origin is tainted, and routing it through
// createMediaElementSource() then yields SILENCE rather than an error — so on
// Android the Yandex stream had to stay on the plain volume fader, with no
// equalizer, no loudness normalization and a fake visualizer (see graphAudio.ts).
// A MediaSource is same-origin whatever the bytes' origin was, which is exactly
// how the SoundCloud HLS path already gets the graph; the difference is that here
// there is no hls.js — a progressive MP3 has to be fetched and fed by hand.
//
// The fetching goes through rangeFetch.ts (native HTTP on device, the Vite proxy
// in dev), always in windows: nothing may pull a whole media file through the
// Capacitor bridge (capfs.MAX_BRIDGE_BYTES explains what that costs).
//
// MP3 carries no timestamps, so the byte stream format is "generate timestamps"
// and the SourceBuffer works in `sequence` mode: appended frames land at
// timestampOffset and run on from there. That is also what makes seeking work —
// map time to a byte with the file's average bitrate, align to a frame header,
// and declare where the appended run begins.
//
// iOS never comes here (playback there is a native AVPlayer with the EQ inside its
// audio tap), and neither does anything already same-origin: offline/imported
// tracks stream from Capacitor's local server and just attach the graph directly.
//
// Escape hatch: localStorage `lp.m.mse` = 'off' pins playback to the old plain-URL
// path, 'force' uses this feeder even for a source that would pass the CORS probe.

import { fetchRange, probeRanges } from './rangeFetch'

const MIME = 'audio/mpeg'

/** First read — small, so playback starts about as fast as a plain stream. */
const FIRST_BYTES = 128 * 1024
/**
 * Steady-state read size. Bounded on purpose: on Android the body comes back as a
 * base64 string and is copied several times on its way through the bridge, so a
 * read of this size peaks at a couple of megabytes of transient Java heap — well
 * inside capfs.MAX_BRIDGE_BYTES, which is the line that must not be crossed.
 */
const CHUNK_BYTES = 256 * 1024
/** Stop reading once this much audio is buffered ahead of the playhead. */
const AHEAD_SEC = 30
/** Per-chunk network retries before the feed gives up. */
const MAX_RETRY = 2
/** Buffer kept behind the playhead when evicting to satisfy a quota error. */
const KEEP_BEHIND_SEC = 10
/** How long to wait for the MediaSource to open before giving up on this path. */
const SOURCE_OPEN_MS = 5000

export interface Mp3Feed {
  destroy(): void
}

export interface Mp3FeedOptions {
  /** Track length from metadata — required, it is the time→byte mapping. */
  durationSec: number
  /** Reported when the feed dies mid-playback (the element cannot recover). */
  onError?: (message: string) => void
}

/** Read the `lp.m.mse` override; 'auto' unless the key says otherwise. */
export function mseMode(): 'auto' | 'off' | 'force' {
  try {
    const raw = localStorage.getItem('lp.m.mse')
    if (raw === 'off' || raw === 'force') return raw
  } catch {
    /* private mode — auto */
  }
  return 'auto'
}

/** Can this platform play MP3 through a MediaSource at all? */
function mp3MseSupported(): boolean {
  return (
    mseMode() !== 'off' &&
    typeof MediaSource !== 'undefined' &&
    typeof MediaSource.isTypeSupported === 'function' &&
    MediaSource.isTypeSupported(MIME)
  )
}

/**
 * Size of the leading ID3v2 tag, so it is excluded from the byte↔time mapping —
 * cover art alone can be hundreds of kilobytes, which would skew every seek.
 * The size field is sync-safe (7 bits per byte).
 */
function id3v2Size(b: Uint8Array): number {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0
  const size = (b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]
  const footer = (b[5] & 0x10) !== 0 ? 10 : 0
  return 10 + size + footer
}

/**
 * Offset of the first plausible MPEG frame header at or after `from`, or -1.
 *
 * A bare 11-bit sync word turns up in audio data too, so the fields that cannot
 * legally be zero (or reserved) are checked as well. Only the post-seek chunks
 * need this: the parser has to be handed a frame boundary, not the middle of one.
 */
function frameOffset(bytes: Uint8Array, from = 0): number {
  for (let i = Math.max(0, from); i + 3 < bytes.length; i++) {
    if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) continue
    const layer = (bytes[i + 1] >> 1) & 0x03
    const bitrate = (bytes[i + 2] >> 4) & 0x0f
    const rate = (bytes[i + 2] >> 2) & 0x03
    if (layer !== 0 && bitrate !== 0 && bitrate !== 0x0f && rate !== 0x03) return i
  }
  return -1
}

/** Resolve on the first of these events; reject on 'error'. */
function once(target: EventTarget, ok: string, fail = 'error'): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = (): void => {
      target.removeEventListener(ok, onOk)
      target.removeEventListener(fail, onFail)
      resolve()
    }
    const onFail = (): void => {
      target.removeEventListener(ok, onOk)
      target.removeEventListener(fail, onFail)
      reject(new Error(`${fail} while waiting for ${ok}`))
    }
    target.addEventListener(ok, onOk)
    target.addEventListener(fail, onFail)
  })
}

/** Is `t` inside a buffered range (with a little slack for frame rounding)? */
function buffered(ranges: TimeRanges, t: number, slack = 0.15): boolean {
  for (let i = 0; i < ranges.length; i++) {
    if (t >= ranges.start(i) - slack && t < ranges.end(i)) return true
  }
  return false
}

/** How much contiguous audio sits ahead of `t`, in seconds. */
function aheadOf(ranges: TimeRanges, t: number): number {
  for (let i = 0; i < ranges.length; i++) {
    if (t >= ranges.start(i) - 0.15 && t < ranges.end(i)) return ranges.end(i) - t
  }
  return 0
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Declare where the next appended run belongs in the track.
 *
 * The catch: an MPEG audio stream has no segment boundaries, so once anything has
 * been appended the parser sits in PARSING_MEDIA_SEGMENT forever — and there the
 * timestampOffset setter throws InvalidStateError (Chromium is explicit about it).
 * abort() resets the parser state, which is what makes the offset settable again;
 * without it a post-seek append silently lands at the end of the previous run
 * (Chromium keeps timestampOffset at the highest end timestamp in `sequence` mode).
 */
function setOffset(sb: SourceBuffer, seconds: number): void {
  try {
    sb.timestampOffset = seconds
  } catch {
    sb.abort()
    sb.timestampOffset = seconds
  }
}

/**
 * Feed `url` into `audio` through a MediaSource and keep feeding it as playback
 * moves. Returns null when that cannot be done at all (no MSE, no metadata
 * duration, no byte ranges, or the very first read failed) — the element is then
 * left as it was found and the caller should fall back to the plain URL.
 */
export async function feedMp3(
  audio: HTMLAudioElement,
  url: string,
  opts: Mp3FeedOptions
): Promise<Mp3Feed | null> {
  const duration = opts.durationSec
  if (!mp3MseSupported() || !(duration > 0)) return null

  // Ranges first: without them there is no seeking and, worse, a server that
  // ignores Range would answer a GET with the whole file — the exact thing that
  // must never cross the bridge.
  const probe = await probeRanges(url)
  if (!probe) return null

  let total = probe.total
  let audioStart = 0
  let nextByte = 0
  /** timestampOffset the next append has to declare (set after a seek). */
  let offsetAt: number | null = null
  /** The next chunk has to be cut back to a frame header before it is appended. */
  let alignNext = false
  /** A seek target the element is still owed data for. */
  let pendingSeek: number | null = null
  /** Bumped by every seek, so reads issued for the old position are dropped. */
  let gen = 0
  /** `gen` of the running feed loop, or null when none is running. */
  let pumpGen: number | null = null
  let ended = false
  let destroyed = false
  let reported = false
  let sb: SourceBuffer | null = null

  const ms = new MediaSource()
  const objectUrl = URL.createObjectURL(ms)

  /** Average-bitrate mapping — an MP3 offers nothing better short of a full scan. */
  const byteForTime = (t: number): number => {
    const span = Math.max(1, total - audioStart)
    return audioStart + Math.floor(span * Math.min(1, Math.max(0, t / duration)))
  }
  const timeForByte = (b: number): number =>
    (Math.max(0, b - audioStart) / Math.max(1, total - audioStart)) * duration

  const report = (msg: string): void => {
    if (reported) return
    reported = true
    opts.onError?.(msg)
  }

  /** Hand the element back untouched, so the caller can still play the URL. */
  const abandon = (): null => {
    destroyed = true
    try {
      URL.revokeObjectURL(objectUrl)
    } catch {
      /* already gone */
    }
    try {
      audio.removeAttribute('src')
      audio.load()
    } catch {
      /* nothing to reset */
    }
    return null
  }

  /** Drop what is well behind the playhead, to make room for a refused append. */
  async function evict(): Promise<boolean> {
    if (!sb || sb.buffered.length === 0) return false
    const from = sb.buffered.start(0)
    const cut = Math.max(0, audio.currentTime - KEEP_BEHIND_SEC)
    if (cut <= from + 0.5) return false
    try {
      sb.remove(from, cut)
      await once(sb, 'updateend')
      return true
    } catch {
      return false
    }
  }

  /** Append one chunk, evicting played-out audio if the buffer is full. */
  async function appendBytes(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    if (!sb || destroyed) return
    if (sb.updating) {
      // A racing seek may have left an append in flight; wait it out.
      await once(sb, 'updateend').catch(() => undefined)
      if (destroyed || !sb) return
    }
    for (let attempt = 0; ; attempt++) {
      try {
        if (offsetAt !== null) {
          setOffset(sb, offsetAt)
          offsetAt = null
        }
        sb.appendBuffer(bytes)
        await once(sb, 'updateend')
        return
      } catch (e) {
        const quota = e instanceof DOMException && e.name === 'QuotaExceededError'
        if (!quota || attempt >= 2 || !(await evict())) throw e
      }
    }
  }

  /** The buffered run that covers or follows `t` — where a fresh append landed. */
  function rangeAt(t: number): { start: number; end: number } | null {
    if (!sb) return null
    for (let i = 0; i < sb.buffered.length; i++) {
      if (sb.buffered.end(i) > t) return { start: sb.buffered.start(i), end: sb.buffered.end(i) }
    }
    return null
  }

  /** One ranged read, retried a couple of times; null when it kept failing. */
  async function read(start: number, end: number): Promise<Uint8Array<ArrayBuffer> | null> {
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        const res = await fetchRange(url, start, end)
        if (res.total && res.total !== total) total = res.total
        return res.bytes
      } catch {
        if (destroyed) return null
        await sleep(300 * (attempt + 1))
      }
    }
    return null
  }

  /**
   * Did the last append actually cover the seek target? The byte↔time mapping is
   * an average, so on a VBR file the appended run can start a little past where the
   * element is waiting — nudge the playhead into it rather than stall forever.
   * Undershooting needs nothing: the feed keeps running forward into the target.
   */
  function settleSeek(): void {
    if (pendingSeek === null || !sb) return
    const t = pendingSeek
    if (buffered(sb.buffered, t)) {
      pendingSeek = null
      return
    }
    const r = rangeAt(t)
    if (r && r.start > t + 0.05) {
      pendingSeek = null
      audio.currentTime = r.start + 0.02
    }
  }

  /** Feed ahead of the playhead until AHEAD_SEC is buffered, or the file ends. */
  async function pump(): Promise<void> {
    if (destroyed || !sb) return
    const mine = gen
    if (pumpGen === mine) return // already feeding this position
    pumpGen = mine
    try {
      while (!destroyed && gen === mine && !ended) {
        if (nextByte >= total) {
          ended = true
          try {
            if (ms.readyState === 'open') ms.endOfStream()
          } catch {
            /* raced with a seek */
          }
          break
        }
        if (pendingSeek === null && aheadOf(sb.buffered, audio.currentTime) >= AHEAD_SEC) break
        const bytes = await read(nextByte, Math.min(total - 1, nextByte + CHUNK_BYTES - 1))
        if (destroyed || gen !== mine) break
        if (!bytes || bytes.length === 0) {
          report('stream read failed')
          break
        }
        let chunk = bytes
        if (alignNext) {
          // Post-seek: the parser has to be handed a frame header, and the run has
          // to declare where in the track it belongs.
          const at = frameOffset(bytes)
          if (at < 0) {
            nextByte += bytes.length
            continue
          }
          chunk = bytes.subarray(at)
          offsetAt = timeForByte(nextByte + at)
          alignNext = false
        }
        nextByte += bytes.length
        await appendBytes(chunk)
        if (destroyed || gen !== mine) break
        settleSeek()
      }
    } catch {
      report('stream feed failed')
    } finally {
      if (pumpGen === mine) pumpGen = null
    }
  }

  /**
   * Restart the feed at `t`. Buffered runs from before the seek are left alone:
   * they only cost memory (the evictor handles that), and in `sequence` mode an
   * append that declares its own timestampOffset lands independently of them.
   */
  async function seekTo(t: number): Promise<void> {
    if (!sb) return
    const mine = ++gen
    try {
      if (sb.updating) sb.abort() // drop the append that was in flight
    } catch {
      /* nothing in flight, or the source is already closed */
    }
    if (ms.readyState === 'ended') {
      // endOfStream() locked the source, and only an append re-opens it — an empty
      // one does that without placing any audio.
      try {
        sb.appendBuffer(new Uint8Array(0))
        await once(sb, 'updateend')
      } catch {
        /* fall through; the append below will fail loudly enough */
      }
      if (destroyed || gen !== mine) return
    }
    // Reset the parser now, so the run appended after the seek is a fresh one and
    // its timestampOffset is settable (see setOffset).
    try {
      sb.abort()
    } catch {
      /* source no longer open */
    }
    ended = false
    alignNext = true
    offsetAt = null
    // Aim a little early: an average-bitrate estimate can land past the target.
    nextByte = Math.max(audioStart, byteForTime(Math.max(0, t - 0.5)))
    void pump()
  }

  const onSeeking = (): void => {
    if (destroyed || !sb) return
    const t = audio.currentTime
    if (buffered(sb.buffered, t)) return // already there; the element resumes itself
    pendingSeek = t
    void seekTo(t)
  }
  const onTick = (): void => {
    void pump()
  }

  // From here the element is ours. Pointing it at the MediaSource is what makes the
  // source open, which is the earliest anything can be appended.
  audio.src = objectUrl
  try {
    await Promise.race([
      once(ms, 'sourceopen', 'sourceclose'),
      sleep(SOURCE_OPEN_MS).then(() => Promise.reject(new Error('sourceopen timed out')))
    ])
    sb = ms.addSourceBuffer(MIME)
    sb.mode = 'sequence' // MPEG audio carries no timestamps of its own
  } catch {
    return abandon()
  }

  // The first read decides whether this whole path works, so it happens before the
  // caller is told anything: a failure here is indistinguishable from "no MSE".
  const first = await read(0, Math.min(FIRST_BYTES, total) - 1)
  if (destroyed || !first || first.length === 0) return abandon()
  audioStart = id3v2Size(first) // cover art must not skew the byte↔time mapping
  // Sanity check the bytes before handing the parser anything: the native bridge
  // reports a body as a base64 string, and if it ever decodes one as text instead
  // the result would be garbage. A clean fallback beats a stuck SourceBuffer.
  if (audioStart === 0 && frameOffset(first) !== 0) return abandon()
  try {
    await appendBytes(first)
  } catch {
    return abandon()
  }
  nextByte = first.length
  try {
    // Metadata length, so the seek bar is right from the first frame rather than
    // growing as data arrives (and so seeking past the buffer isn't clamped away).
    ms.duration = duration
  } catch {
    /* the element will report what it knows */
  }

  audio.addEventListener('seeking', onSeeking)
  audio.addEventListener('timeupdate', onTick)
  audio.addEventListener('waiting', onTick)
  void pump()

  return {
    destroy: () => {
      destroyed = true
      gen++
      audio.removeEventListener('seeking', onSeeking)
      audio.removeEventListener('timeupdate', onTick)
      audio.removeEventListener('waiting', onTick)
      try {
        if (sb?.updating) sb.abort()
      } catch {
        /* already closed */
      }
      try {
        URL.revokeObjectURL(objectUrl)
      } catch {
        /* already gone */
      }
    }
  }
}
