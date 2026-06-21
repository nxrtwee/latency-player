// Mobile SoundCloud client. Mirrors the desktop main/soundcloud.ts logic, but
// the network goes through `scFetch` instead of Node's fetch:
//   - browser dev: the Vite `/__scfetch` middleware (server-side fetch, no CORS)
//   - on device (later): CapacitorHttp (native HTTP, no CORS)
// Public, unauthenticated endpoints only for now (search / user / related /
// stream-resolve). The OAuth-session features (login, personal mixes, my likes)
// need a native WKWebView token capture and land in a later step.

import type { Artist, Track } from '@shared/types'

const API = 'https://api-v2.soundcloud.com'
const CID_KEY = 'lp.m.sc.clientId'

// SoundCloud serves a stripped-down page (without the script bundles that carry
// the public client_id) to non-browser User-Agents. The desktop build
// (main/soundcloud.ts) and the dev proxy (vite.config.ts) both present a desktop
// browser UA on every request; the on-device path must do the same, otherwise
// CapacitorHttp uses the platform HTTP client's default UA and client_id
// discovery fails with "Could not discover a SoundCloud client_id".
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

let clientId: string | null = (() => {
  try {
    return localStorage.getItem(CID_KEY)
  } catch {
    return null
  }
})()

/**
 * Fetch a URL without tripping browser CORS.
 *   - On device (Capacitor native): CapacitorHttp makes a real native request,
 *     no CORS, headers (incl. User-Agent) applied natively.
 *   - In browser dev: tunnel through the Vite `/__scfetch` middleware.
 * The native branch is dead code in the browser, so this stays buildable without
 * @capacitor/core installed (the global is only present on device).
 */
async function scFetch(url: string, headers?: Record<string, string>): Promise<Response> {
  // Always present a desktop browser UA (caller headers win on conflict).
  const merged: Record<string, string> = { 'User-Agent': UA, ...(headers || {}) }
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } })
    .Capacitor
  if (cap?.isNativePlatform?.() && cap.Plugins?.CapacitorHttp) {
    const http = cap.Plugins.CapacitorHttp as {
      request: (o: { url: string; method: string; headers?: Record<string, string> }) => Promise<{
        data: unknown
        status: number
      }>
    }
    const res = await http.request({ url, method: 'GET', headers: merged })
    const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    return new Response(body, { status: res.status })
  }
  // Browser dev: the proxy fetches server-side and already defaults the UA, but
  // forward the merged headers so any auth header (and the UA) are applied.
  const proxied = '/__scfetch?url=' + encodeURIComponent(url)
  const init: RequestInit = { headers: { 'x-sc-headers': JSON.stringify(merged) } }
  return fetch(proxied, init)
}

// ---- client_id discovery ------------------------------------------------------
async function discoverClientId(): Promise<string> {
  const home = await scFetch('https://soundcloud.com/')
  const html = await home.text()
  const scriptUrls = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => u.startsWith('https'))
    .reverse() // the bundle with client_id is usually near the end

  for (const url of scriptUrls) {
    try {
      const js = await (await scFetch(url)).text()
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
  try {
    localStorage.setItem(CID_KEY, clientId)
  } catch {
    /* non-fatal */
  }
  return clientId
}

/** Fetch with client_id appended; refresh the id once on a 401 and retry. */
async function authedFetch(buildUrl: (id: string) => string): Promise<Response> {
  let id = await getClientId()
  let res = await scFetch(buildUrl(id))
  if (res.status === 401) {
    id = await getClientId(true)
    res = await scFetch(buildUrl(id))
  }
  return res
}

// ---- shape mapping ------------------------------------------------------------
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
  // SoundCloud now gates stream resolution behind a per-track authorization
  // token returned alongside the track. Without it the resolve 404s.
  track_authorization?: string
  // Observed: AD_SUPPORTED tracks (re-uploads with ad monetization) 404 on
  // stream resolve with a public client_id; BLACKBOX ones resolve fine. We drop
  // the unplayable bucket at search time so the user never taps a dead track.
  monetization_model?: string
}
interface ScUser {
  id: number
  username: string
  avatar_url: string | null
  followers_count?: number
  track_count?: number
}

function toTrack(sc: ScTrack): Track | null {
  // Unplayable with a public client_id — skip so it never reaches the queue.
  if (sc.monetization_model === 'AD_SUPPORTED') return null
  const transcodings = sc.media?.transcodings || []
  const chosen =
    transcodings.find((t) => t.format?.protocol === 'progressive') ||
    transcodings.find((t) => t.format?.protocol === 'hls')
  if (!chosen) return null
  // Carry the per-track authorization on the transcoding URL so resolveStream
  // can present it later (keeps the shared Track type unchanged).
  const ta = sc.track_authorization ? `?track_authorization=${sc.track_authorization}` : ''
  return {
    id: `sc:${sc.id}`,
    providerId: 'soundcloud',
    uri: chosen.url + ta, // resolved to a real CDN stream URL at play time
    title: sc.title,
    artist: sc.user?.username,
    artistId: sc.user?.id != null ? String(sc.user.id) : undefined,
    durationSec: sc.duration ? sc.duration / 1000 : undefined,
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

// ---- public API ---------------------------------------------------------------
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
  const res = await authedFetch((id) => `${API}/users/${encodeURIComponent(userId)}?client_id=${id}`)
  if (!res.ok) return null
  return toArtist((await res.json()) as ScUser)
}

export async function getUserTracks(userId: string, limit = 60): Promise<Track[]> {
  const res = await authedFetch(
    (id) => `${API}/users/${encodeURIComponent(userId)}/tracks?limit=${limit}&client_id=${id}`
  )
  if (!res.ok) throw new Error(`SoundCloud artist tracks failed (${res.status})`)
  const data = (await res.json()) as { collection?: ScTrack[] }
  return (data.collection || []).map(toTrack).filter((t): t is Track => t !== null)
}

export async function relatedTracks(trackId: string, limit = 25): Promise<Track[]> {
  const res = await authedFetch(
    (id) => `${API}/tracks/${encodeURIComponent(trackId)}/related?limit=${limit}&client_id=${id}`
  )
  if (!res.ok) throw new Error(`SoundCloud related failed (${res.status})`)
  const data = (await res.json()) as { collection?: ScTrack[] }
  return (data.collection || []).map(toTrack).filter((t): t is Track => t !== null)
}

/** Resolve a transcoding URL into a real, playable CDN stream URL. */
export async function resolveStream(transcodingUrl: string): Promise<string> {
  // The uri may already carry ?track_authorization=… — append client_id with
  // the correct separator.
  const sep = transcodingUrl.includes('?') ? '&' : '?'
  const res = await authedFetch((id) => `${transcodingUrl}${sep}client_id=${id}`)
  if (!res.ok) throw new Error(`SoundCloud stream resolve failed (${res.status})`)
  const data = (await res.json()) as { url?: string }
  if (!data.url) throw new Error('SoundCloud returned no stream URL')
  return data.url
}

// ---- authenticated (user OAuth token) ----------------------------------------
// New API registration is closed, so personal content needs the user's own
// web-session OAuth token. Desktop sniffs it from an Electron login window; on
// mobile the user pastes it (auto-capture needs a native WKWebView — ios-notes).
// Same gray-area stance; the token is stored only locally.

const TOKEN_KEY = 'lp.m.sc.token'
let oauthToken: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
})()
let myUserId: number | null = null

export function setToken(token: string): void {
  oauthToken = token ? token.replace(/^OAuth\s+/i, '').trim() : null
  myUserId = null
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
export function isAuthed(): boolean {
  return !!oauthToken
}
function authHeaders(): Record<string, string> {
  return oauthToken ? { Authorization: `OAuth ${oauthToken}` } : {}
}

export async function getMe(): Promise<Artist | null> {
  if (!oauthToken) return null
  try {
    const id = await getClientId()
    const res = await scFetch(`${API}/me?client_id=${id}`, authHeaders())
    if (!res.ok) return null
    const u = (await res.json()) as ScUser
    myUserId = u.id
    return toArtist(u)
  } catch {
    return null
  }
}

export async function getMyLikes(limit = 50): Promise<Track[]> {
  if (!oauthToken) return []
  if (myUserId == null) await getMe()
  if (myUserId == null) return []
  const id = await getClientId()
  const candidates = [
    `${API}/users/${myUserId}/track_likes?limit=${limit}&client_id=${id}`,
    `${API}/users/${myUserId}/likes/tracks?limit=${limit}&client_id=${id}`
  ]
  for (const url of candidates) {
    try {
      const res = await scFetch(url, authHeaders())
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

/** Hydrate id-only track stubs (from mix selections) into full Tracks. */
async function hydrateTrackIds(ids: number[]): Promise<Track[]> {
  if (!ids.length) return []
  const out: Track[] = []
  const id = await getClientId()
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40)
    try {
      const res = await scFetch(`${API}/tracks?ids=${chunk.join(',')}&client_id=${id}`, authHeaders())
      if (!res.ok) continue
      const arr = (await res.json()) as ScTrack[]
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

export interface ScMix {
  title: string
  subtitle?: string
  cover?: string
  tracks: Track[]
}

// Only genuine personalized selections (not charts/trending). Display priority.
const MIX_SELECTIONS = [
  { match: 'your-moods', label: 'Your moods' },
  { match: 'artist-stations', label: 'Artist station' }
]

export async function getPersonalMixes(): Promise<ScMix[]> {
  if (!oauthToken) return []
  try {
    const id = await getClientId()
    const res = await scFetch(`${API}/mixed-selections?client_id=${id}`, authHeaders())
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
        for (const tr of rawTracks) {
          if (typeof tr === 'number') ids.push(tr)
          else if (tr && typeof tr === 'object') {
            const o = tr as ScTrack
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
