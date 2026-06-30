import { promises as fs } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { app, BrowserWindow } from 'electron'
import type { Album, Artist, Track } from '../shared/types'

// Yandex Music has no open public API, so — like the SoundCloud module — we talk
// to the same private API its own apps use, authenticating with the user's own
// OAuth token captured from their real Yandex login. The token is stored only
// locally (userData/yandex.json) and never leaves the machine. Full-quality
// streams require the user's own Yandex Plus subscription; without it the API
// only returns 30-second previews, which we play as a graceful fallback.
//
// This is the legal path for Russian users: Yandex Music is a domestic service
// reachable without a VPN, and we stream strictly what the user's subscription
// entitles them to — no DRM stripping, no censorship-circumvention proxy.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const API = 'https://api.music.yandex.net'
// The client_id of Yandex's own music app — used for the implicit OAuth flow.
const OAUTH_CLIENT_ID = '23cabbbdc6cd418abb4b39c32c41195d'
const OAUTH_URL = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${OAUTH_CLIENT_ID}`
// Salt used to sign the final CDN stream URL (same constant Yandex's apps use).
const SIGN_SALT = 'XGRlBW9FXlekgbPrRHuSiA'

const idFile = (): string => join(app.getPath('userData'), 'yandex.json')

let oauthToken: string | null = null
let myUid: number | null = null

async function loadCache(): Promise<void> {
  try {
    const raw = await fs.readFile(idFile(), 'utf-8')
    const parsed = JSON.parse(raw) as { oauthToken?: string }
    if (parsed.oauthToken) oauthToken = parsed.oauthToken
  } catch {
    /* none cached yet */
  }
}

async function saveCache(): Promise<void> {
  try {
    await fs.writeFile(idFile(), JSON.stringify({ oauthToken }), 'utf-8')
  } catch {
    /* best-effort cache */
  }
}

/** Headers for API calls — adds the user's OAuth token when signed in. */
function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': UA,
    'X-Yandex-Music-Client': 'YandexMusicAndroid/24023621'
  }
  if (oauthToken) h['Authorization'] = `OAuth ${oauthToken}`
  return h
}

export function isAuthed(): boolean {
  return !!oauthToken
}

export async function init(): Promise<void> {
  await loadCache()
}

// ---------------- Mapping ----------------

interface YmArtistRef {
  id?: number | string
  name?: string
}
interface YmTrack {
  id?: number | string
  title?: string
  durationMs?: number
  coverUri?: string
  available?: boolean
  artists?: YmArtistRef[]
  albums?: { coverUri?: string }[]
  // EBU R128 loudness, when Yandex provides it: `i` = integrated loudness (LUFS),
  // `tp` = true peak (dBTP). Drives volume normalization.
  r128?: { i?: number; tp?: number }
}
interface YmArtist {
  id?: number | string
  name?: string
  cover?: { uri?: string }
  ogImage?: string
  counts?: { tracks?: number }
}

/** Build a full https cover URL from Yandex's `%%`-templated coverUri. */
function cover(uri: string | undefined, size: string): string | undefined {
  if (!uri) return undefined
  return 'https://' + uri.replace('%%', size)
}

function toTrack(t: YmTrack): Track | null {
  if (t.id == null || !t.title) return null
  const refs = (t.artists || []).filter((a) => a.name)
  const names = refs.map((a) => a.name) as string[]
  const firstArtistId = refs[0]?.id
  return {
    id: `ym:${t.id}`,
    providerId: 'yandex',
    uri: String(t.id), // bare track id; resolved to a signed CDN URL at play time
    title: t.title,
    artist: names.length ? names.join(', ') : undefined,
    artistId: firstArtistId != null ? String(firstArtistId) : undefined,
    artists: refs.length
      ? refs.map((a) => ({ id: a.id != null ? String(a.id) : undefined, name: a.name as string }))
      : undefined,
    durationSec: t.durationMs ? t.durationMs / 1000 : undefined,
    // Tracks carry the cover on the track itself or on their album — try both.
    artwork: cover(t.coverUri || t.albums?.[0]?.coverUri, '400x400'),
    // R128 loudness for volume normalization (tp is dBTP → linear peak).
    loudnessLufs: typeof t.r128?.i === 'number' ? t.r128.i : undefined,
    peak: typeof t.r128?.tp === 'number' ? Math.pow(10, t.r128.tp / 20) : undefined
  }
}

function toArtist(a: YmArtist): Artist {
  return {
    id: String(a.id),
    name: a.name || 'Unknown',
    provider: 'yandex',
    avatar: cover(a.cover?.uri || a.ogImage, '200x200'),
    trackCount: a.counts?.tracks
  }
}

// ---------------- Search ----------------

export async function search(query: string, limit = 30): Promise<Track[]> {
  const q = query.trim()
  if (!q) return []
  const url = `${API}/search?text=${encodeURIComponent(q)}&type=track&page=0&nocorrect=false`
  const res = await fetch(url, { headers: apiHeaders() })
  if (!res.ok) throw new Error(`Yandex search failed (${res.status})`)
  const data = (await res.json()) as { result?: { tracks?: { results?: YmTrack[] } } }
  const results = data.result?.tracks?.results || []
  return results
    .slice(0, limit)
    .map(toTrack)
    .filter((t): t is Track => t !== null)
}

export async function searchArtists(query: string, limit = 8): Promise<Artist[]> {
  const q = query.trim()
  if (!q) return []
  const url = `${API}/search?text=${encodeURIComponent(q)}&type=artist&page=0&nocorrect=false`
  const res = await fetch(url, { headers: apiHeaders() })
  if (!res.ok) throw new Error(`Yandex artist search failed (${res.status})`)
  const data = (await res.json()) as { result?: { artists?: { results?: YmArtist[] } } }
  const results = data.result?.artists?.results || []
  return results.slice(0, limit).map(toArtist)
}

export async function getArtist(artistId: string): Promise<Artist | null> {
  try {
    const res = await fetch(`${API}/artists/${encodeURIComponent(artistId)}/brief-info`, {
      headers: apiHeaders()
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      result?: { artist?: YmArtist; stats?: { lastMonthListeners?: number } }
    }
    if (!data.result?.artist) return null
    const artist = toArtist(data.result.artist)
    // Yandex exposes monthly listeners on the brief-info `stats`, not on the artist.
    artist.monthlyListeners = data.result.stats?.lastMonthListeners
    return artist
  } catch {
    return null
  }
}

/** Artists Yandex considers similar (from the artist's brief-info). */
export async function getSimilarArtists(artistId: string, limit = 12): Promise<Artist[]> {
  try {
    const res = await fetch(`${API}/artists/${encodeURIComponent(artistId)}/brief-info`, {
      headers: apiHeaders()
    })
    if (!res.ok) return []
    const data = (await res.json()) as { result?: { similarArtists?: YmArtist[] } }
    return (data.result?.similarArtists || []).slice(0, limit).map(toArtist)
  } catch {
    return []
  }
}

export async function getArtistTracks(artistId: string, limit = 50): Promise<Track[]> {
  const res = await fetch(
    `${API}/artists/${encodeURIComponent(artistId)}/tracks?page=0&page-size=${limit}`,
    { headers: apiHeaders() }
  )
  if (!res.ok) throw new Error(`Yandex artist tracks failed (${res.status})`)
  const data = (await res.json()) as { result?: { tracks?: YmTrack[] } }
  return (data.result?.tracks || []).map(toTrack).filter((t): t is Track => t !== null)
}

interface YmAlbum {
  id?: number | string
  title?: string
  coverUri?: string
  year?: number
  artists?: { name?: string }[]
  trackCount?: number
}

function toAlbum(a: YmAlbum): Album | null {
  if (a.id == null || !a.title) return null
  return {
    id: String(a.id),
    provider: 'yandex',
    kind: 'album',
    title: a.title,
    artist: (a.artists || []).map((ar) => ar.name).filter(Boolean).join(', ') || undefined,
    cover: cover(a.coverUri, '400x400'),
    year: a.year,
    trackCount: a.trackCount
  }
}

interface YmPlaylist {
  uid?: number | string
  kind?: number | string
  title?: string
  trackCount?: number
  cover?: { uri?: string }
  ogImage?: string
  owner?: { name?: string; login?: string }
}

function toPlaylist(p: YmPlaylist): Album | null {
  if (p.uid == null || p.kind == null || !p.title) return null
  return {
    id: `${p.uid}:${p.kind}`,
    provider: 'yandex',
    kind: 'playlist',
    title: p.title,
    artist: p.owner?.name || p.owner?.login,
    cover: cover(p.cover?.uri || p.ogImage, '400x400'),
    trackCount: p.trackCount
  }
}

/** Search Yandex albums. */
export async function searchAlbums(query: string, limit = 20): Promise<Album[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const url = `${API}/search?text=${encodeURIComponent(q)}&type=album&page=0&nocorrect=false`
    const res = await fetch(url, { headers: apiHeaders() })
    if (!res.ok) return []
    const data = (await res.json()) as { result?: { albums?: { results?: YmAlbum[] } } }
    return (data.result?.albums?.results || [])
      .slice(0, limit)
      .map(toAlbum)
      .filter((a): a is Album => a !== null)
  } catch {
    return []
  }
}

/** Search Yandex playlists. */
export async function searchPlaylists(query: string, limit = 20): Promise<Album[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const url = `${API}/search?text=${encodeURIComponent(q)}&type=playlist&page=0&nocorrect=false`
    const res = await fetch(url, { headers: apiHeaders() })
    if (!res.ok) return []
    const data = (await res.json()) as { result?: { playlists?: { results?: YmPlaylist[] } } }
    return (data.result?.playlists?.results || [])
      .slice(0, limit)
      .map(toPlaylist)
      .filter((a): a is Album => a !== null)
  } catch {
    return []
  }
}

/** Tracks of a Yandex playlist (`id` is `ownerUid:kind`). */
export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const [uid, kind] = playlistId.split(':')
  if (!uid || !kind) return []
  const res = await fetch(
    `${API}/users/${encodeURIComponent(uid)}/playlists/${encodeURIComponent(kind)}?rich-tracks=true`,
    { headers: apiHeaders() }
  )
  if (!res.ok) throw new Error(`Yandex playlist failed (${res.status})`)
  const data = (await res.json()) as {
    result?: { tracks?: { id?: number | string; track?: YmTrack }[] }
  }
  const rows = data.result?.tracks || []
  const out: Track[] = []
  const missing: string[] = []
  for (const r of rows) {
    const mapped = r.track ? toTrack(r.track) : null
    if (mapped) out.push(mapped)
    else if (r.id != null) missing.push(String(r.id))
  }
  if (missing.length) out.push(...(await hydrateTracks(missing)))
  return out
}

/** An artist's albums (from brief-info), newest first where possible. */
export async function getArtistAlbums(artistId: string, limit = 30): Promise<Album[]> {
  try {
    const res = await fetch(`${API}/artists/${encodeURIComponent(artistId)}/brief-info`, {
      headers: apiHeaders()
    })
    if (!res.ok) return []
    const data = (await res.json()) as { result?: { albums?: YmAlbum[] } }
    return (data.result?.albums || [])
      .slice(0, limit)
      .map(toAlbum)
      .filter((a): a is Album => a !== null)
  } catch {
    return []
  }
}

/** Full track list of an album (flattened across its volumes/discs). */
export async function getAlbumTracks(albumId: string): Promise<Track[]> {
  const bare = albumId.replace(/^ym:/, '')
  const res = await fetch(`${API}/albums/${encodeURIComponent(bare)}/with-tracks`, {
    headers: apiHeaders()
  })
  if (!res.ok) throw new Error(`Yandex album tracks failed (${res.status})`)
  const data = (await res.json()) as { result?: { volumes?: YmTrack[][] } }
  const flat = (data.result?.volumes || []).flat()
  return flat.map(toTrack).filter((t): t is Track => t !== null)
}

// ---------------- Auth ----------------

export async function getMe(): Promise<Artist | null> {
  if (!oauthToken) return null
  try {
    const res = await fetch(`${API}/account/status`, { headers: apiHeaders() })
    if (!res.ok) return null
    const data = (await res.json()) as {
      result?: {
        account?: { uid?: number; login?: string; fullName?: string; displayName?: string }
        plus?: { hasPlus?: boolean }
      }
    }
    const acc = data.result?.account
    if (!acc) return null
    if (acc.uid != null) myUid = acc.uid
    const name = acc.displayName || acc.fullName || acc.login || 'Yandex user'
    return {
      id: String(acc.uid ?? name),
      name,
      provider: 'yandex',
      // Reuse the Artist shape; Plus status rides along so the UI can hint it.
      followers: data.result?.plus?.hasPlus ? 1 : 0
    }
  } catch {
    return null
  }
}

export function logout(): void {
  oauthToken = null
  myUid = null
  void saveCache()
}

/** Open Yandex's real OAuth page and capture the implicit access token. */
export async function login(): Promise<Artist | null> {
  return new Promise((resolve) => {
    const authWin = new BrowserWindow({
      width: 520,
      height: 720,
      title: 'Sign in to Yandex Music',
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:ymauth',
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    let done = false
    const finish = (artist: Artist | null): void => {
      if (done) return
      done = true
      void saveCache()
      resolve(artist)
      if (!authWin.isDestroyed()) authWin.close()
    }

    // The implicit flow redirects to a music.yandex.ru URL with the token in the
    // fragment: #access_token=<token>&token_type=bearer&expires_in=...
    const tryCapture = (rawUrl: string): void => {
      if (oauthToken) return
      try {
        const u = new URL(rawUrl)
        const frag = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash
        const token = new URLSearchParams(frag).get('access_token')
        if (token) {
          oauthToken = token
          getMe()
            .then((u2) => finish(u2))
            .catch(() => finish(null))
        }
      } catch {
        /* not a parseable redirect yet */
      }
    }

    authWin.webContents.on('will-redirect', (_e, url) => tryCapture(url))
    authWin.webContents.on('will-navigate', (_e, url) => tryCapture(url))
    authWin.webContents.on('did-navigate', (_e, url) => tryCapture(url))
    authWin.webContents.on('did-navigate-in-page', (_e, url) => tryCapture(url))

    authWin.on('closed', () => {
      if (!done) {
        done = true
        resolve(null)
      }
    })
    authWin.loadURL(OAUTH_URL)
  })
}

// ---------------- Likes & personal radio ----------------

/** Hydrate bare track ids into full Track objects via the batch endpoint. */
async function hydrateTracks(ids: string[]): Promise<Track[]> {
  const out: Track[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    try {
      const res = await fetch(`${API}/tracks?track-ids=${chunk.join(',')}`, {
        headers: apiHeaders()
      })
      if (!res.ok) continue
      const data = (await res.json()) as { result?: YmTrack[] }
      // Preserve the requested order (the batch endpoint doesn't guarantee it).
      const byId = new Map<string, YmTrack>()
      for (const t of data.result || []) byId.set(String(t.id), t)
      for (const cid of chunk) {
        const sc = byId.get(cid)
        const mapped = sc ? toTrack(sc) : null
        if (mapped) out.push(mapped)
      }
    } catch {
      /* skip chunk */
    }
  }
  return out
}

/** The signed-in user's liked tracks (full Track objects), newest first. */
export async function getMyLikes(limit = 300): Promise<Track[]> {
  if (!oauthToken) return []
  if (myUid == null) await getMe()
  if (myUid == null) return []
  try {
    const res = await fetch(`${API}/users/${myUid}/likes/tracks`, { headers: apiHeaders() })
    if (!res.ok) return []
    const data = (await res.json()) as {
      result?: { library?: { tracks?: { id?: number | string }[] } }
    }
    const ids = (data.result?.library?.tracks || [])
      .map((t) => (t.id != null ? String(t.id) : ''))
      .filter(Boolean)
      .slice(0, limit)
    return hydrateTracks(ids)
  } catch {
    return []
  }
}

export interface YmWave {
  cover?: string
  tracks: Track[]
}

/** The personal "My Wave" station. Other stations: `artist:<id>`, `track:<id>`. */
export const MY_WAVE_STATION = 'user:onyourwave'

// Most-recent batch id PER station — trackStarted/trackFinished feedback must
// reference the right batch so the rotor attributes the signal correctly.
const stationBatchId = new Map<string, string>()

/** Best-effort rotor feedback (radioStarted/trackFinished/…) for a station.
 *  Fire-and-forget: it varies recommendations, but playback must not depend on it. */
async function stationFeedback(
  stationId: string,
  type: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  if (!oauthToken) return
  try {
    const batchId = stationBatchId.get(stationId)
    await fetch(`${API}/rotor/station/${encodeURIComponent(stationId)}/feedback`, {
      method: 'POST',
      headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        timestamp: new Date().toISOString(),
        ...(batchId ? { batchId } : {}),
        ...extra
      })
    })
  } catch {
    /* best-effort */
  }
}

/**
 * Per-track rotor feedback from the renderer. `trackStarted` when a station track
 * begins, `trackFinished` (with seconds played) when it ends or is skipped — this
 * is what teaches the station and keeps each run varied. `stationId` selects which
 * radio (My Wave / artist / track) the signal belongs to.
 */
export async function waveTrackFeedback(
  stationId: string,
  type: 'trackStarted' | 'trackFinished',
  trackId: string,
  totalPlayedSeconds = 0
): Promise<void> {
  const extra: Record<string, unknown> = { trackId: trackId.replace(/^ym:/, ''), from: 'desktop-latency' }
  if (type === 'trackFinished') extra.totalPlayedSeconds = totalPlayedSeconds
  await stationFeedback(stationId, type, extra)
}

/**
 * Tracks from any rotor station as a batch. Works for the personal wave
 * (`user:onyourwave`) and seeded stations (`artist:<id>`, `track:<id>`) — they
 * all share the same `/rotor/station/{id}/tracks` endpoint.
 *
 * `queueId` is the id of the last track already queued. Passing it makes the
 * rotor return the NEXT, non-repeating tracks — this is what keeps a station
 * endless (without it the endpoint keeps returning the same opening batch). On a
 * fresh start (no queueId) we send `radioStarted` feedback so each run is rotated.
 */
export async function getStationTracks(
  stationId: string,
  queueId?: string,
  limit = 40
): Promise<YmWave> {
  if (!oauthToken) return { tracks: [] }
  try {
    if (!queueId) await stationFeedback(stationId, 'radioStarted', { from: 'desktop-latency' })
    const bare = queueId ? queueId.replace(/^ym:/, '') : ''
    const url =
      `${API}/rotor/station/${encodeURIComponent(stationId)}/tracks?settings2=true` +
      (bare ? `&queue=${encodeURIComponent(bare)}` : '')
    const res = await fetch(url, { headers: apiHeaders() })
    if (!res.ok) return { tracks: [] }
    const data = (await res.json()) as {
      result?: { batchId?: string; sequence?: { track?: YmTrack }[] }
    }
    const batchId = data.result?.batchId
    if (batchId) stationBatchId.set(stationId, batchId)
    const tracks = (data.result?.sequence || [])
      .map((s) => (s.track ? toTrack(s.track) : null))
      .filter((t): t is Track => t !== null)
      .slice(0, limit)
    return { tracks, cover: tracks.find((t) => t.artwork)?.artwork }
  } catch {
    return { tracks: [] }
  }
}

/** Personal "My Wave" radio. */
export const getMyWave = (queueId?: string, limit = 40): Promise<YmWave> =>
  getStationTracks(MY_WAVE_STATION, queueId, limit)

/** Radio seeded from an artist (`artist:<id>`). */
export const getArtistWave = (artistId: string, queueId?: string, limit = 40): Promise<YmWave> =>
  getStationTracks(`artist:${String(artistId).replace(/^.*:/, '')}`, queueId, limit)

/** Radio seeded from a single track (`track:<id>`). */
export const getTrackWave = (trackId: string, queueId?: string, limit = 40): Promise<YmWave> =>
  getStationTracks(`track:${String(trackId).replace(/^ym:/, '')}`, queueId, limit)

// ---------------- Stream resolution ----------------

interface YmDownloadVariant {
  codec?: string
  bitrateInKbps?: number
  preview?: boolean
  downloadInfoUrl?: string
}
interface YmDownloadDetails {
  host?: string
  path?: string
  ts?: string
  s?: string
}

/** Parse the download details (JSON form) returned by a downloadInfoUrl. */
function parseDetails(text: string): YmDownloadDetails {
  try {
    return JSON.parse(text) as YmDownloadDetails
  } catch {
    // Fallback: the endpoint can answer with a flat XML document.
    const pick = (tag: string): string | undefined =>
      text.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1]
    return { host: pick('host'), path: pick('path'), ts: pick('ts'), s: pick('s') }
  }
}

/**
 * Resolve a Yandex track id into a playable progressive MP3 URL. Picks the best
 * non-preview mp3 variant (falling back to a preview when the user has no Plus),
 * then signs the CDN URL the way Yandex's apps do.
 */
export async function resolveStream(trackId: string): Promise<string> {
  const infoRes = await fetch(
    `${API}/tracks/${encodeURIComponent(trackId)}/download-info`,
    { headers: apiHeaders() }
  )
  if (!infoRes.ok) throw new Error(`Yandex download-info failed (${infoRes.status})`)
  const info = (await infoRes.json()) as { result?: YmDownloadVariant[] }
  const variants = (info.result || []).filter((v) => v.codec === 'mp3' && v.downloadInfoUrl)
  if (!variants.length) throw new Error('Yandex returned no playable variant')

  const byBitrate = (a: YmDownloadVariant, b: YmDownloadVariant): number =>
    (b.bitrateInKbps || 0) - (a.bitrateInKbps || 0)
  // Prefer a full (non-preview) stream; fall back to a preview if that's all we get.
  const chosen =
    variants.filter((v) => !v.preview).sort(byBitrate)[0] || variants.sort(byBitrate)[0]

  const detailsRes = await fetch(`${chosen.downloadInfoUrl}&format=json`, {
    headers: apiHeaders()
  })
  if (!detailsRes.ok) throw new Error(`Yandex stream details failed (${detailsRes.status})`)
  const { host, path, ts, s } = parseDetails(await detailsRes.text())
  if (!host || !path || ts == null || s == null) {
    throw new Error('Yandex returned incomplete stream details')
  }

  const sign = createHash('md5')
    .update(SIGN_SALT + path.slice(1) + s)
    .digest('hex')
  return `https://${host}/get-mp3/${sign}/${ts}${path}`
}
