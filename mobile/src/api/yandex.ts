// Mobile Yandex Music client. Mirrors the desktop main/yandex.ts logic, but the
// network goes through `ymFetch` instead of Node's fetch:
//   - browser dev: the Vite `/__scfetch` middleware (server-side fetch, no CORS)
//   - on device: CapacitorHttp (native HTTP, no CORS)
// and the CDN stream URL is signed with a pure-JS MD5 (the WebView has no Node
// crypto and Web Crypto omits MD5).
//
// Like SoundCloud, this talks to the same private API Yandex's own apps use,
// authenticating with the user's own OAuth token. Desktop sniffs the token from
// an Electron login window; on mobile the user pastes it (auto-capture needs a
// native WebView — see ios-notes/android-notes). The token is stored only
// locally. Full-quality streams need the user's own Yandex Plus; without it the
// API returns 30-second previews, which we play as a graceful fallback.
//
// This is the legal path for Russian users: Yandex Music is a domestic service
// reachable without a VPN (SoundCloud is state-blocked in RU), and we stream
// strictly what the user's subscription entitles them to — no DRM stripping.

import type { Album, Artist, Track } from '@shared/types'
import { md5 } from './md5'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const API = 'https://api.music.yandex.net'
const OAUTH_CLIENT_ID = '23cabbbdc6cd418abb4b39c32c41195d'
// The same implicit-flow URL desktop opens; on mobile the user authorizes here
// in a browser and pastes back the resulting token (or the redirect URL).
export const OAUTH_URL = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${OAUTH_CLIENT_ID}`
const SIGN_SALT = 'XGRlBW9FXlekgbPrRHuSiA'

const TOKEN_KEY = 'lp.m.ym.token'

let oauthToken: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
})()
let myUid: number | null = null

/** Headers for API calls — adds the user's OAuth token when signed in. */
function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': UA,
    'X-Yandex-Music-Client': 'YandexMusicAndroid/24023621',
    ...(extra || {})
  }
  if (oauthToken) h['Authorization'] = `OAuth ${oauthToken}`
  return h
}

/**
 * Fetch a URL without tripping browser CORS (mirrors soundcloud.ts `scFetch`).
 *   - On device (Capacitor native): CapacitorHttp makes a real native request.
 *   - In browser dev: tunnel through the Vite `/__scfetch` middleware.
 * Supports GET and POST (rotor feedback). The native branch is dead code in the
 * browser, so this stays buildable without @capacitor/core installed.
 */
async function ymFetch(
  url: string,
  opts: { headers?: Record<string, string>; method?: string; body?: string } = {}
): Promise<Response> {
  const method = opts.method || 'GET'
  const headers = apiHeaders(opts.headers)
  const cap = (
    globalThis as {
      Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> }
    }
  ).Capacitor
  if (cap?.isNativePlatform?.() && cap.Plugins?.CapacitorHttp) {
    const http = cap.Plugins.CapacitorHttp as {
      request: (o: {
        url: string
        method: string
        headers?: Record<string, string>
        data?: unknown
      }) => Promise<{ data: unknown; status: number }>
    }
    const res = await http.request({
      url,
      method,
      headers,
      data: opts.body
    })
    const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    return new Response(body, { status: res.status })
  }
  // Browser dev: server-side proxy. Forward method/headers/body out-of-band so
  // the proxy can replay the upstream request faithfully.
  const proxied = '/__scfetch?url=' + encodeURIComponent(url)
  const init: RequestInit = {
    method: method === 'GET' ? 'GET' : 'POST',
    headers: {
      'x-sc-headers': JSON.stringify(headers),
      'x-sc-method': method,
      ...(opts.body ? { 'content-type': 'application/json' } : {})
    },
    body: method === 'GET' ? undefined : opts.body
  }
  return fetch(proxied, init)
}

export function isAuthed(): boolean {
  return !!oauthToken
}

export function setToken(raw: string): void {
  // Accept a bare token, an "OAuth <token>" header, or a full redirect URL that
  // carries the implicit-flow token in its fragment (#access_token=...).
  let token = (raw || '').trim()
  if (!token) {
    oauthToken = null
  } else {
    const frag = token.match(/access_token=([^&\s]+)/)
    if (frag) token = decodeURIComponent(frag[1])
    token = token.replace(/^OAuth\s+/i, '').trim()
    oauthToken = token || null
  }
  myUid = null
  try {
    if (oauthToken) localStorage.setItem(TOKEN_KEY, oauthToken)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* non-fatal */
  }
}

export function logout(): void {
  setToken('')
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
}
interface YmArtist {
  id?: number | string
  name?: string
  cover?: { uri?: string }
  ogImage?: string
  counts?: { tracks?: number }
}

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
    artwork: cover(t.coverUri || t.albums?.[0]?.coverUri, '400x400')
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

// ---------------- Search ----------------

export async function search(query: string, limit = 30): Promise<Track[]> {
  const q = query.trim()
  if (!q) return []
  const url = `${API}/search?text=${encodeURIComponent(q)}&type=track&page=0&nocorrect=false`
  const res = await ymFetch(url)
  if (!res.ok) throw new Error(`Yandex search failed (${res.status})`)
  const data = (await res.json()) as { result?: { tracks?: { results?: YmTrack[] } } }
  return (data.result?.tracks?.results || [])
    .slice(0, limit)
    .map(toTrack)
    .filter((t): t is Track => t !== null)
}

export async function searchArtists(query: string, limit = 8): Promise<Artist[]> {
  const q = query.trim()
  if (!q) return []
  const url = `${API}/search?text=${encodeURIComponent(q)}&type=artist&page=0&nocorrect=false`
  const res = await ymFetch(url)
  if (!res.ok) throw new Error(`Yandex artist search failed (${res.status})`)
  const data = (await res.json()) as { result?: { artists?: { results?: YmArtist[] } } }
  return (data.result?.artists?.results || []).slice(0, limit).map(toArtist)
}

export async function searchAlbums(query: string, limit = 20): Promise<Album[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const url = `${API}/search?text=${encodeURIComponent(q)}&type=album&page=0&nocorrect=false`
    const res = await ymFetch(url)
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

export async function searchPlaylists(query: string, limit = 20): Promise<Album[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const url = `${API}/search?text=${encodeURIComponent(q)}&type=playlist&page=0&nocorrect=false`
    const res = await ymFetch(url)
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

// ---------------- Artist / Album / Playlist ----------------

export async function getArtist(artistId: string): Promise<Artist | null> {
  try {
    const res = await ymFetch(`${API}/artists/${encodeURIComponent(artistId)}/brief-info`)
    if (!res.ok) return null
    const data = (await res.json()) as {
      result?: { artist?: YmArtist; stats?: { lastMonthListeners?: number } }
    }
    if (!data.result?.artist) return null
    const artist = toArtist(data.result.artist)
    artist.monthlyListeners = data.result.stats?.lastMonthListeners
    return artist
  } catch {
    return null
  }
}

export async function getSimilarArtists(artistId: string, limit = 12): Promise<Artist[]> {
  try {
    const res = await ymFetch(`${API}/artists/${encodeURIComponent(artistId)}/brief-info`)
    if (!res.ok) return []
    const data = (await res.json()) as { result?: { similarArtists?: YmArtist[] } }
    return (data.result?.similarArtists || []).slice(0, limit).map(toArtist)
  } catch {
    return []
  }
}

export async function getArtistTracks(artistId: string, limit = 50): Promise<Track[]> {
  const res = await ymFetch(
    `${API}/artists/${encodeURIComponent(artistId)}/tracks?page=0&page-size=${limit}`
  )
  if (!res.ok) throw new Error(`Yandex artist tracks failed (${res.status})`)
  const data = (await res.json()) as { result?: { tracks?: YmTrack[] } }
  return (data.result?.tracks || []).map(toTrack).filter((t): t is Track => t !== null)
}

export async function getArtistAlbums(artistId: string, limit = 30): Promise<Album[]> {
  try {
    const res = await ymFetch(`${API}/artists/${encodeURIComponent(artistId)}/brief-info`)
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

export async function getAlbumTracks(albumId: string): Promise<Track[]> {
  const bare = albumId.replace(/^ym:/, '')
  const res = await ymFetch(`${API}/albums/${encodeURIComponent(bare)}/with-tracks`)
  if (!res.ok) throw new Error(`Yandex album tracks failed (${res.status})`)
  const data = (await res.json()) as { result?: { volumes?: YmTrack[][] } }
  const flat = (data.result?.volumes || []).flat()
  return flat.map(toTrack).filter((t): t is Track => t !== null)
}

export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const [uid, kind] = playlistId.split(':')
  if (!uid || !kind) return []
  const res = await ymFetch(
    `${API}/users/${encodeURIComponent(uid)}/playlists/${encodeURIComponent(kind)}?rich-tracks=true`
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

// ---------------- Auth ----------------

export async function getMe(): Promise<Artist | null> {
  if (!oauthToken) return null
  try {
    const res = await ymFetch(`${API}/account/status`)
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
      followers: data.result?.plus?.hasPlus ? 1 : 0
    }
  } catch {
    return null
  }
}

// ---------------- Likes & personal radio ----------------

async function hydrateTracks(ids: string[]): Promise<Track[]> {
  const out: Track[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    try {
      const res = await ymFetch(`${API}/tracks?track-ids=${chunk.join(',')}`)
      if (!res.ok) continue
      const data = (await res.json()) as { result?: YmTrack[] }
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

export async function getMyLikes(limit = 300): Promise<Track[]> {
  if (!oauthToken) return []
  if (myUid == null) await getMe()
  if (myUid == null) return []
  try {
    const res = await ymFetch(`${API}/users/${myUid}/likes/tracks`)
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

let lastWaveBatchId: string | null = null

async function waveFeedback(type: string, extra: Record<string, unknown> = {}): Promise<void> {
  if (!oauthToken) return
  try {
    await ymFetch(`${API}/rotor/station/user:onyourwave/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        timestamp: new Date().toISOString(),
        ...(lastWaveBatchId ? { batchId: lastWaveBatchId } : {}),
        ...extra
      })
    })
  } catch {
    /* best-effort */
  }
}

export async function waveTrackFeedback(
  type: 'trackStarted' | 'trackFinished',
  trackId: string,
  totalPlayedSeconds = 0
): Promise<void> {
  const extra: Record<string, unknown> = {
    trackId: trackId.replace(/^ym:/, ''),
    from: 'mobile-latency'
  }
  if (type === 'trackFinished') extra.totalPlayedSeconds = totalPlayedSeconds
  await waveFeedback(type, extra)
}

export async function getMyWave(queueId?: string, limit = 40): Promise<YmWave> {
  if (!oauthToken) return { tracks: [] }
  try {
    if (!queueId) await waveFeedback('radioStarted', { from: 'mobile-latency' })
    const bare = queueId ? queueId.replace(/^ym:/, '') : ''
    const url =
      `${API}/rotor/station/user:onyourwave/tracks?settings2=true` +
      (bare ? `&queue=${encodeURIComponent(bare)}` : '')
    const res = await ymFetch(url)
    if (!res.ok) return { tracks: [] }
    const data = (await res.json()) as {
      result?: { batchId?: string; sequence?: { track?: YmTrack }[] }
    }
    lastWaveBatchId = data.result?.batchId ?? lastWaveBatchId
    const tracks = (data.result?.sequence || [])
      .map((s) => (s.track ? toTrack(s.track) : null))
      .filter((t): t is Track => t !== null)
      .slice(0, limit)
    return { tracks, cover: tracks.find((t) => t.artwork)?.artwork }
  } catch {
    return { tracks: [] }
  }
}

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

function parseDetails(text: string): YmDownloadDetails {
  try {
    return JSON.parse(text) as YmDownloadDetails
  } catch {
    const pick = (tag: string): string | undefined =>
      text.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1]
    return { host: pick('host'), path: pick('path'), ts: pick('ts'), s: pick('s') }
  }
}

/**
 * Resolve a Yandex track id into a playable progressive MP3 URL. Picks the best
 * non-preview mp3 variant (falling back to a preview without Plus), then signs
 * the CDN URL the way Yandex's apps do (MD5 over SALT + path + s).
 */
export async function resolveStream(trackId: string): Promise<string> {
  const bare = trackId.replace(/^ym:/, '')
  const infoRes = await ymFetch(`${API}/tracks/${encodeURIComponent(bare)}/download-info`)
  if (!infoRes.ok) throw new Error(`Yandex download-info failed (${infoRes.status})`)
  const info = (await infoRes.json()) as { result?: YmDownloadVariant[] }
  const variants = (info.result || []).filter((v) => v.codec === 'mp3' && v.downloadInfoUrl)
  if (!variants.length) throw new Error('Yandex returned no playable variant')

  const byBitrate = (a: YmDownloadVariant, b: YmDownloadVariant): number =>
    (b.bitrateInKbps || 0) - (a.bitrateInKbps || 0)
  const chosen =
    variants.filter((v) => !v.preview).sort(byBitrate)[0] || variants.sort(byBitrate)[0]

  const detailsRes = await ymFetch(`${chosen.downloadInfoUrl}&format=json`)
  if (!detailsRes.ok) throw new Error(`Yandex stream details failed (${detailsRes.status})`)
  const { host, path, ts, s } = parseDetails(await detailsRes.text())
  if (!host || !path || ts == null || s == null) {
    throw new Error('Yandex returned incomplete stream details')
  }

  const sign = md5(SIGN_SALT + path.slice(1) + s)
  return `https://${host}/get-mp3/${sign}/${ts}${path}`
}
