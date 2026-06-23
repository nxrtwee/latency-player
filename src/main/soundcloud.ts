import { promises as fs } from 'fs'
import { join } from 'path'
import { app, BrowserWindow } from 'electron'
import type { Artist, Track } from '../shared/types'

// SoundCloud has no open API registration anymore, so we discover the public
// web player's client_id (the same one the website uses). Network lives in the
// main process to sidestep renderer CORS. Only `progressive` transcodings are
// surfaced — they're plain MP3 streams a normal <audio> element can play.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const API = 'https://api-v2.soundcloud.com'
const idFile = (): string => join(app.getPath('userData'), 'soundcloud.json')

let clientId: string | null = null
let oauthToken: string | null = null // user's web-session OAuth token (when signed in)
let myUserId: number | null = null // signed-in user's numeric id

async function loadCache(): Promise<void> {
  try {
    const raw = await fs.readFile(idFile(), 'utf-8')
    const parsed = JSON.parse(raw) as { clientId?: string; oauthToken?: string }
    if (parsed.clientId) clientId = parsed.clientId
    if (parsed.oauthToken) oauthToken = parsed.oauthToken
  } catch {
    /* none cached yet */
  }
}

async function saveCache(): Promise<void> {
  try {
    await fs.writeFile(idFile(), JSON.stringify({ clientId, oauthToken }), 'utf-8')
  } catch {
    /* best-effort cache */
  }
}

/** Headers for authenticated calls — adds the user's OAuth token when present. */
function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': UA }
  if (oauthToken) h['Authorization'] = `OAuth ${oauthToken}`
  return h
}

export function isAuthed(): boolean {
  return !!oauthToken
}

/** Scrape soundcloud.com's script bundles for the public client_id. */
async function discoverClientId(): Promise<string> {
  const home = await fetch('https://soundcloud.com/', { headers: { 'User-Agent': UA } })
  const html = await home.text()
  const scriptUrls = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => u.startsWith('https'))
    .reverse() // the bundle with client_id is usually among the last ones

  for (const url of scriptUrls) {
    try {
      const js = await (await fetch(url)).text()
      const m = js.match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{20,})"/)
      if (m) return m[1]
    } catch {
      /* try next script */
    }
  }
  throw new Error('Could not discover a SoundCloud client_id')
}

async function getClientId(forceRefresh = false): Promise<string> {
  if (clientId && !forceRefresh) return clientId
  clientId = await discoverClientId()
  await saveCache()
  return clientId
}

/** Run a fetch with the client_id appended; refresh the id once on 401. */
async function authedFetch(buildUrl: (id: string) => string): Promise<Response> {
  let id = await getClientId()
  let res = await fetch(buildUrl(id), { headers: { 'User-Agent': UA } })
  if (res.status === 401) {
    id = await getClientId(true)
    res = await fetch(buildUrl(id), { headers: { 'User-Agent': UA } })
  }
  return res
}

interface ScTranscoding {
  url: string
  format?: { protocol?: string; mime_type?: string }
}
interface ScTrack {
  id: number
  title: string
  duration: number
  artwork_url: string | null
  user?: { id?: number; username?: string }
  media?: { transcodings?: ScTranscoding[] }
}
interface ScUser {
  id: number
  username: string
  avatar_url: string | null
  followers_count?: number
  track_count?: number
}

function toTrack(sc: ScTrack): Track | null {
  const transcodings = sc.media?.transcodings || []
  // Prefer progressive (plain MP3 in <audio>); fall back to HLS (played via hls.js).
  const chosen =
    transcodings.find((t) => t.format?.protocol === 'progressive') ||
    transcodings.find((t) => t.format?.protocol === 'hls')
  if (!chosen) return null
  return {
    id: `sc:${sc.id}`,
    providerId: 'soundcloud',
    uri: chosen.url, // resolved to a real stream URL (mp3 or m3u8) at play time
    title: sc.title,
    artist: sc.user?.username,
    artistId: sc.user?.id != null ? String(sc.user.id) : undefined,
    durationSec: sc.duration ? sc.duration / 1000 : undefined,
    // -large is 100px; -t500x500 is crisp for the big now-playing art (downscales fine for thumbs).
    artwork: sc.artwork_url ? sc.artwork_url.replace('-large', '-t500x500') : undefined
  }
}

function toArtist(u: ScUser): Artist {
  return {
    id: String(u.id),
    name: u.username,
    provider: 'soundcloud',
    avatar: u.avatar_url ? u.avatar_url.replace('-large', '-t200x200') : undefined,
    followers: u.followers_count,
    trackCount: u.track_count
  }
}

export async function init(): Promise<void> {
  await loadCache()
}

export async function search(query: string, limit = 30): Promise<Track[]> {
  const q = query.trim()
  if (!q) return []
  const res = await authedFetch(
    (id) => `${API}/search/tracks?q=${encodeURIComponent(q)}&limit=${limit}&client_id=${id}`
  )
  if (!res.ok) throw new Error(`SoundCloud search failed (${res.status})`)
  const data = (await res.json()) as { collection?: ScTrack[] }
  return (data.collection || []).map(toTrack).filter((t): t is Track => t !== null)
}

export async function searchUsers(query: string, limit = 8): Promise<Artist[]> {
  const q = query.trim()
  if (!q) return []
  const res = await authedFetch(
    (id) => `${API}/search/users?q=${encodeURIComponent(q)}&limit=${limit}&client_id=${id}`
  )
  if (!res.ok) throw new Error(`SoundCloud user search failed (${res.status})`)
  const data = (await res.json()) as { collection?: ScUser[] }
  return (data.collection || []).map(toArtist)
}

export async function getUser(userId: string): Promise<Artist | null> {
  const res = await authedFetch(
    (id) => `${API}/users/${encodeURIComponent(userId)}?client_id=${id}`
  )
  if (!res.ok) return null
  const u = (await res.json()) as ScUser
  return toArtist(u)
}

/** Tracks SoundCloud considers related to a given track id (numeric, no `sc:`). */
export async function relatedTracks(trackId: string, limit = 25): Promise<Track[]> {
  const res = await authedFetch(
    (id) => `${API}/tracks/${encodeURIComponent(trackId)}/related?limit=${limit}&client_id=${id}`
  )
  if (!res.ok) throw new Error(`SoundCloud related failed (${res.status})`)
  const data = (await res.json()) as { collection?: ScTrack[] }
  return (data.collection || []).map(toTrack).filter((t): t is Track => t !== null)
}

export interface ScComment {
  timeSec: number
  body: string
  user: string
  avatar?: string
}

interface ScRawComment {
  timestamp?: number | null // ms into the track (null = general comment)
  body?: string
  user?: { username?: string; avatar_url?: string | null }
}

/** Timed comments on a track (for the floating-comments overlay). */
export async function getComments(trackId: string, limit = 100): Promise<ScComment[]> {
  const res = await authedFetch(
    (id) =>
      `${API}/tracks/${encodeURIComponent(trackId)}/comments?threaded=0&filter_replies=1&limit=${limit}&client_id=${id}`
  )
  if (!res.ok) return []
  const data = (await res.json()) as { collection?: ScRawComment[] }
  return (data.collection || [])
    .filter((c) => typeof c.timestamp === 'number' && c.timestamp! >= 0 && c.body)
    .map((c) => ({
      timeSec: (c.timestamp as number) / 1000,
      body: (c.body as string).trim(),
      user: c.user?.username || 'someone',
      avatar: c.user?.avatar_url ? c.user.avatar_url.replace('-large', '-t50x50') : undefined
    }))
    .sort((a, b) => a.timeSec - b.timeSec)
}

export async function getUserTracks(userId: string, limit = 60): Promise<Track[]> {
  const res = await authedFetch(
    (id) => `${API}/users/${encodeURIComponent(userId)}/tracks?limit=${limit}&client_id=${id}`
  )
  if (!res.ok) throw new Error(`SoundCloud artist tracks failed (${res.status})`)
  const data = (await res.json()) as { collection?: ScTrack[] }
  return (data.collection || []).map(toTrack).filter((t): t is Track => t !== null)
}

// ---------------- Authenticated (user web-session) ----------------
// New API app registration is closed, so to reach the user's real personalized
// content we capture the OAuth token from their own soundcloud.com login (the
// same token the website uses). It's a ToS gray area, stored only locally.

export async function getMe(): Promise<Artist | null> {
  if (!oauthToken) return null
  try {
    const id = await getClientId()
    const res = await fetch(`${API}/me?client_id=${id}`, { headers: authHeaders() })
    if (!res.ok) return null
    const u = (await res.json()) as ScUser
    myUserId = u.id
    return toArtist(u)
  } catch {
    return null
  }
}

export function logout(): void {
  oauthToken = null
  void saveCache()
}

/** Open SoundCloud's real sign-in page and capture the session OAuth token. */
export async function login(): Promise<Artist | null> {
  try {
    await getClientId()
  } catch {
    /* continue; calls will retry */
  }
  return new Promise((resolve) => {
    const authWin = new BrowserWindow({
      width: 480,
      height: 700,
      title: 'Sign in to SoundCloud',
      autoHideMenuBar: true,
      webPreferences: { partition: 'persist:scauth', nodeIntegration: false, contextIsolation: true }
    })
    let done = false
    const finish = (artist: Artist | null): void => {
      if (done) return
      done = true
      void saveCache()
      resolve(artist)
      if (!authWin.isDestroyed()) authWin.close()
    }
    authWin.webContents.session.webRequest.onBeforeSendHeaders(
      { urls: ['https://api-v2.soundcloud.com/*', 'https://api.soundcloud.com/*'] },
      (details, cb) => {
        const auth = (details.requestHeaders['Authorization'] ||
          details.requestHeaders['authorization']) as string | undefined
        if (!oauthToken && auth && /^OAuth\s+/i.test(auth)) {
          oauthToken = auth.replace(/^OAuth\s+/i, '').trim()
          getMe()
            .then((u) => finish(u))
            .catch(() => finish(null))
        }
        cb({ requestHeaders: details.requestHeaders })
      }
    )
    authWin.on('closed', () => {
      if (!done) {
        done = true
        resolve(null)
      }
    })
    authWin.loadURL('https://soundcloud.com/signin')
  })
}

/** The signed-in user's real liked tracks — a strong taste signal for mixes. */
export async function getMyLikes(limit = 50): Promise<Track[]> {
  if (!oauthToken) return []
  if (myUserId == null) await getMe()
  if (myUserId == null) return []
  const id = await getClientId()
  const candidates = [
    `${API}/users/${myUserId}/track_likes?limit=${limit}&client_id=${id}`,
    `${API}/users/${myUserId}/likes/tracks?limit=${limit}&client_id=${id}`,
    `${API}/users/${myUserId}/likes?limit=${limit}&client_id=${id}`
  ]
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: authHeaders() })
      if (!res.ok) continue
      const data = (await res.json()) as { collection?: Array<ScTrack | { track?: ScTrack }> }
      const out: Track[] = []
      for (const item of data.collection || []) {
        const raw = (item as { track?: ScTrack }).track ?? (item as ScTrack)
        const mapped = toTrack(raw)
        if (mapped) out.push(mapped)
      }
      if (out.length) return out
    } catch {
      /* try next endpoint */
    }
  }
  return []
}

export interface ScMix {
  title: string
  subtitle?: string
  cover?: string
  tracks: Track[]
}

/** Hydrate track stubs (id-only) into full Track objects via the batch endpoint. */
async function hydrateTrackIds(ids: number[]): Promise<Track[]> {
  if (ids.length === 0) return []
  const out: Track[] = []
  const clientId0 = await getClientId()
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40)
    try {
      const res = await fetch(`${API}/tracks?ids=${chunk.join(',')}&client_id=${clientId0}`, {
        headers: authHeaders()
      })
      if (!res.ok) continue
      const arr = (await res.json()) as ScTrack[]
      // /tracks?ids preserves no order guarantee; map by id to keep playlist order
      const byId = new Map<number, ScTrack>()
      for (const t of arr) byId.set(t.id, t)
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

// Only these selections are genuine personalized mixes (not charts/trending/recent).
// Listed in display priority.
const MIX_SELECTIONS = [
  { match: 'your-moods', label: 'Your moods' },
  { match: 'artist-stations', label: 'Artist station' }
]

/** Fetch SoundCloud's real personalized mixes (Made For You / mood mixes / stations). */
export async function getPersonalMixes(): Promise<ScMix[]> {
  if (!oauthToken) return []
  try {
    const id = await getClientId()
    const res = await fetch(`${API}/mixed-selections?client_id=${id}`, { headers: authHeaders() })
    if (!res.ok) return []
    const data = (await res.json()) as { collection?: unknown[] }
    const selections = (data.collection || []) as Array<Record<string, unknown>>

    const mixes: ScMix[] = []
    for (const pick of MIX_SELECTIONS) {
      const sel = selections.find((s) => String(s.urn || '').includes(pick.match))
      if (!sel) continue
      const isStation = pick.match === 'artist-stations'
      const items = (sel.items as { collection?: Array<Record<string, unknown>> })?.collection || []
      for (const pl of items) {
        const rawTracks = (pl.tracks as Array<{ id?: number } | number>) || []
        const ids: number[] = []
        const fulls: ScTrack[] = []
        for (const t of rawTracks) {
          if (typeof t === 'number') ids.push(t)
          else if (t && typeof t === 'object') {
            const o = t as ScTrack
            if (o.media?.transcodings?.length) fulls.push(o)
            else if (typeof o.id === 'number') ids.push(o.id)
          }
        }
        let tracks = fulls.map(toTrack).filter((t): t is Track => t !== null)
        if (tracks.length < 4 && ids.length) {
          tracks = [...tracks, ...(await hydrateTrackIds(ids.slice(0, 30)))]
        }
        if (tracks.length < 4) continue
        const art = (pl.artwork_url as string) || (pl.calculated_artwork_url as string) || ''
        const name = (pl.title as string) || pick.label
        mixes.push({
          title: isStation ? `${name} Station` : name,
          subtitle: pick.label,
          cover: art ? art.replace('-large', '-t500x500') : tracks.find((t) => t.artwork)?.artwork,
          tracks
        })
      }
    }
    return mixes.slice(0, 10)
  } catch {
    return []
  }
}

/** Resolve a progressive transcoding URL into a playable CDN stream URL. */
export async function resolveStream(transcodingUrl: string): Promise<string> {
  const res = await authedFetch((id) => `${transcodingUrl}?client_id=${id}`)
  if (!res.ok) throw new Error(`SoundCloud stream resolve failed (${res.status})`)
  const data = (await res.json()) as { url?: string }
  if (!data.url) throw new Error('SoundCloud returned no stream URL')
  return data.url
}
