/**
 * Personal radio — an endless queue built from what the user actually likes, with no
 * one service behind it.
 *
 * Why this exists next to the per-track "station": that one seeds from ONE track and
 * SoundCloud's related endpoint is deterministic, so it handed back the same tracks in
 * the same order on every start. Here the seeds are a slice of the likes, several of
 * them are expanded per batch, and what has been served recently is remembered — so
 * two runs are different without the result reading as a shuffle.
 *
 * The functions that decide WHAT plays live here rather than in the store because they
 * are the interesting part, and they are testable on their own: given seeds and a
 * config they are ordinary data in, data out.
 */

import type { Track } from '@shared/types'

export type RadioScope = 'all' | 'soundcloud' | 'yandex'
/** Which slice of the likes to build from — or a hand-picked set. */
export type RadioSeedMode = 'last10' | 'last50' | 'all' | 'manual'

export interface RadioConfig {
  seedMode: RadioSeedMode
  /** Track ids chosen by hand; only used when seedMode is 'manual'. */
  seedTrackIds: string[]
  scope: RadioScope
}

export const DEFAULT_RADIO_CONFIG: RadioConfig = {
  seedMode: 'last50',
  seedTrackIds: [],
  scope: 'all'
}

/** How many seeds one batch expands. More = more variety per batch, more requests. */
const FANOUT = 4
/** Tracks served recently, so a later batch can avoid repeating them straight away. */
const SEEN_CAP = 400
const SEEN_KEY = 'lp.radioSeen'

export function parseRadioConfig(raw: string | null): RadioConfig | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<RadioConfig>
    const seedMode: RadioSeedMode =
      v.seedMode === 'last10' || v.seedMode === 'all' || v.seedMode === 'manual'
        ? v.seedMode
        : 'last50'
    const scope: RadioScope =
      v.scope === 'soundcloud' || v.scope === 'yandex' ? v.scope : 'all'
    return {
      seedMode,
      scope,
      seedTrackIds: Array.isArray(v.seedTrackIds) ? v.seedTrackIds.filter((s) => typeof s === 'string') : []
    }
  } catch {
    return null
  }
}

export function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

export function rememberSeen(ids: string[]): void {
  try {
    const merged = [...readSeen(), ...ids]
    // Keep the tail: the most recently served ids are the ones worth avoiding.
    localStorage.setItem(SEEN_KEY, JSON.stringify(merged.slice(-SEEN_CAP)))
  } catch {
    /* non-fatal */
  }
}

/** The liked tracks a config points at. `likes` arrives newest-first. */
export function resolveSeeds(cfg: RadioConfig, likes: Track[]): Track[] {
  if (cfg.seedMode === 'manual') {
    const want = new Set(cfg.seedTrackIds)
    return likes.filter((t) => want.has(t.id))
  }
  const n = cfg.seedMode === 'last10' ? 10 : cfg.seedMode === 'last50' ? 50 : likes.length
  return likes.slice(0, Math.max(1, n))
}

/** Does this track's service match the chosen scope? Local files never do. */
export function inScope(track: Track, scope: RadioScope): boolean {
  if (track.providerId === 'local') return false
  if (scope === 'all') return track.providerId === 'soundcloud' || track.providerId === 'yandex'
  return track.providerId === scope
}

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Turn a candidate pool into a running order.
 *
 * Not a plain shuffle: a shuffle of a related-tracks pool puts four tracks by the same
 * uploader in a row often enough to notice, which is what makes a "radio" feel like a
 * folder on random. Each pick is random among the candidates whose artist is not one of
 * the last two played, and only falls back to any track when nothing else is left.
 */
export function arrangeRadio(pool: Track[], first?: Track): Track[] {
  const rest = shuffled(pool.filter((t) => !first || t.id !== first.id))
  const out: Track[] = first ? [first] : []
  const recentArtists: string[] = first ? [(first.artist || '').toLowerCase()] : []
  while (rest.length) {
    let idx = rest.findIndex((t) => !recentArtists.includes((t.artist || '').toLowerCase()))
    if (idx < 0) idx = 0
    const [pick] = rest.splice(idx, 1)
    out.push(pick)
    recentArtists.push((pick.artist || '').toLowerCase())
    if (recentArtists.length > 2) recentArtists.shift()
  }
  return out
}

/** The api surface the gatherer needs — the shim implements the same names on mobile. */
interface RadioApi {
  scRelated: (trackId: string) => Promise<Track[]>
  scTrackArtist?: (trackId: string) => Promise<{ id: string } | null>
  scUserTracks?: (userId: string) => Promise<Track[]>
  ymTrackWave?: (trackId: string) => Promise<{ tracks: Track[] }>
  ymArtistWave?: (artistId: string) => Promise<{ tracks: Track[] }>
}

/**
 * One batch of candidates around `seeds`.
 *
 * Each expansion is per-seed and per-service: SoundCloud has related-tracks (plus, half
 * the time, more of that uploader's own catalogue), Yandex has its rotor, which is
 * already a personalized neighbourhood. Picking the seeds at random is what makes two
 * batches differ; asking for the artist as well as the track is what keeps the result
 * from being only the exact tracks that were chosen.
 */
export async function gatherCandidates(
  seeds: Track[],
  cfg: RadioConfig,
  api: RadioApi,
  ymAvailable: boolean
): Promise<Track[]> {
  const usable = seeds.filter((t) => inScope(t, cfg.scope) && (t.providerId !== 'yandex' || ymAvailable))
  if (!usable.length) return []

  const chosen = shuffled(usable).slice(0, FANOUT)
  const batches = await Promise.all(
    chosen.map(async (seed) => {
      try {
        if (seed.providerId === 'soundcloud' && seed.id.startsWith('sc:')) {
          const bare = seed.id.slice(3)
          const related = await api.scRelated(bare)
          // Sometimes follow the uploader instead of only the track's neighbours.
          if (Math.random() < 0.5 && api.scTrackArtist && api.scUserTracks) {
            const artist = seed.artistId
              ? { id: seed.artistId }
              : await api.scTrackArtist(bare).catch(() => null)
            if (artist?.id) {
              const own = await api.scUserTracks(artist.id).catch(() => [])
              return [...related, ...shuffled(own).slice(0, 10)]
            }
          }
          return related
        }
        if (seed.providerId === 'yandex') {
          const bare = String(seed.uri || seed.id).replace(/^ym:/, '')
          if (Math.random() < 0.4 && seed.artistId && api.ymArtistWave) {
            const wave = await api.ymArtistWave(seed.artistId)
            if (wave?.tracks?.length) return wave.tracks
          }
          if (api.ymTrackWave) {
            const wave = await api.ymTrackWave(bare)
            return wave?.tracks ?? []
          }
        }
      } catch {
        /* one seed failing must not empty the batch */
      }
      return [] as Track[]
    })
  )

  const seen = readSeen()
  const byId = new Map<string, Track>()
  for (const t of batches.flat()) {
    if (!t?.id || byId.has(t.id)) continue
    if (!inScope(t, cfg.scope)) continue
    if (seen.has(t.id)) continue
    byId.set(t.id, t)
  }
  return [...byId.values()]
}
