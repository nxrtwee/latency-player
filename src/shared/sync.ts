import type { Track } from './types'

/**
 * The player's own transfer format for liked tracks.
 *
 * There is no server behind Latency: likes live in `userData/likes.json` on the
 * desktop and in `localStorage['lp.m.likes']` on the phone, and the two never
 * meet. This module is the bridge — one plain JSON file, written by either
 * platform and read by the other, carrying the FULL like list **in order**.
 *
 * Both halves are pure functions with no platform imports on purpose: the same
 * code runs in the Electron renderer and in the Capacitor WebView, so an export
 * and an import can never disagree about the format.
 */

export const LIKES_FORMAT = 'latency.likes'
/** Bump only for a breaking change; a reader accepts anything ≤ its own. */
export const LIKES_VERSION = 1

export type SyncPlatform = 'desktop' | 'mobile'

export interface LikesBundle {
  /** Format marker — how we tell our file from any other .json. */
  format: typeof LIKES_FORMAT
  version: number
  /** ISO timestamp, informational (shown in the import summary). */
  exportedAt: string
  platform: SyncPlatform
  /** App version that wrote the file, informational. */
  app?: string
  /** `tracks.length`, so a truncated file is obvious without parsing it all. */
  count: number
  /** Liked tracks, newest-first — the exact order the exporting device had. */
  tracks: Track[]
}

/**
 * A like is portable only if the other device can actually play it. SoundCloud
 * carries a transcoding URL and Yandex a bare track id — both re-resolve to a
 * fresh stream at play time, on either platform. A local file's `uri` is a
 * `media://local/...` path into one machine's filesystem, so it is dropped and
 * counted instead (the UI reports "N local skipped").
 */
const PORTABLE: Track['providerId'][] = ['soundcloud', 'yandex']

export function isPortableLike(t: Track): boolean {
  return PORTABLE.includes(t.providerId)
}

/**
 * Dedupe key. Track ids are already provider-prefixed (`sc:123`, `ym:456`), so
 * the id alone would do — scoping by provider anyway costs nothing and keeps the
 * merge honest if a provider ever stops prefixing.
 */
function keyOf(t: Track): string {
  return `${t.providerId}:${t.id}`
}

/** Everything a Track needs to be playable; anything else is optional. */
function isTrack(v: unknown): v is Track {
  if (!v || typeof v !== 'object') return false
  const t = v as Partial<Track>
  return (
    typeof t.id === 'string' &&
    !!t.id &&
    typeof t.uri === 'string' &&
    !!t.uri &&
    typeof t.title === 'string' &&
    (t.providerId === 'local' || t.providerId === 'soundcloud' || t.providerId === 'yandex')
  )
}

/**
 * Pack the current likes for export. Returns the bundle plus how many likes were
 * left behind, so the caller can say so instead of silently shrinking the list.
 */
export function buildLikesBundle(
  likes: Track[],
  platform: SyncPlatform,
  app?: string
): { bundle: LikesBundle; skipped: number } {
  const tracks = likes.filter(isPortableLike)
  return {
    bundle: {
      format: LIKES_FORMAT,
      version: LIKES_VERSION,
      exportedAt: new Date().toISOString(),
      platform,
      app,
      count: tracks.length,
      tracks
    },
    skipped: likes.length - tracks.length
  }
}

/** `latency-likes-desktop-2026-08-17.json` — sortable, and says where it came from. */
export function likesBundleFilename(platform: SyncPlatform): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `latency-likes-${platform}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}

export type LikesParseError =
  | 'notJson' // not JSON at all
  | 'notBundle' // JSON, but not one of ours
  | 'tooNew' // written by a newer format than this build understands
  | 'empty' // ours, well-formed, but nothing playable inside

export type LikesParseResult =
  | { ok: true; bundle: LikesBundle }
  | { ok: false; error: LikesParseError }

/**
 * Read a bundle back. Deliberately forgiving about everything that isn't load-
 * bearing (a missing `count`, an unknown extra field, a stray non-track entry in
 * `tracks`) and strict about the two things that would corrupt the like list:
 * the format marker and a future version.
 */
export function parseLikesBundle(text: string): LikesParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'notJson' }
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'notBundle' }
  const b = raw as Partial<LikesBundle>
  if (b.format !== LIKES_FORMAT || !Array.isArray(b.tracks)) {
    return { ok: false, error: 'notBundle' }
  }
  const version = typeof b.version === 'number' ? b.version : 1
  if (version > LIKES_VERSION) return { ok: false, error: 'tooNew' }

  const tracks = b.tracks.filter(isTrack).filter(isPortableLike)
  if (!tracks.length) return { ok: false, error: 'empty' }

  return {
    ok: true,
    bundle: {
      format: LIKES_FORMAT,
      version,
      exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : '',
      platform: b.platform === 'mobile' ? 'mobile' : 'desktop',
      app: typeof b.app === 'string' ? b.app : undefined,
      count: tracks.length,
      tracks
    }
  }
}

/**
 * Fold an imported list into the local one.
 *
 * The imported ORDER wins — that is the whole point of the feature ("и
 * обязательно их порядок") — so the file's tracks come first, in their own
 * sequence, and local likes the file doesn't mention keep their relative order
 * behind them. A track present on both sides is kept once, at its imported
 * position, using the imported copy (its `uri`/artwork are at least as fresh).
 * Nothing is ever deleted: importing can only add.
 */
export function mergeLikes(
  current: Track[],
  incoming: Track[]
): { likes: Track[]; added: number; matched: number } {
  const have = new Map(current.map((t) => [keyOf(t), t]))
  const seen = new Set<string>()
  const merged: Track[] = []
  let matched = 0

  for (const t of incoming) {
    const k = keyOf(t)
    if (seen.has(k)) continue // duplicate inside the file itself
    seen.add(k)
    if (have.has(k)) matched++
    merged.push(t)
  }
  for (const t of current) {
    if (seen.has(keyOf(t))) continue
    merged.push(t)
  }
  return { likes: merged, added: seen.size - matched, matched }
}
