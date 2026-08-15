import { promises as fs } from 'fs'
import { join } from 'path'
import { app, BrowserWindow } from 'electron'
import type { Album, Artist, Track } from '../shared/types'

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
let appVersion: string | null = null // web player build id, required on write calls

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

async function probe(url: string, timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': UA },
      signal: ctrl.signal
    })
    // Any HTTP response (even a redirect/4xx) means the host is reachable.
    return res.ok || res.status > 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fast reachability probe. In RU, SoundCloud is blocked by RKN (a network
 * block, not geo) → the request hangs / resets rather than returning a body.
 *
 * IMPORTANT: the website host (soundcloud.com / api) and the STREAMING CDN
 * (*.sndcdn.com) are blocked independently. A user can reach the API (so search
 * works) yet have the media CDN blocked (so nothing actually plays/downloads).
 * We therefore require BOTH the API host AND the media CDN to be reachable —
 * otherwise the smart picker would land on SC and every track would fail at
 * play time. Both probes race a short timeout; either failing = "not usable".
 */
export async function reachable(timeoutMs = 4000): Promise<boolean> {
  const [api, cdn] = await Promise.all([
    probe('https://api-v2.soundcloud.com/', timeoutMs),
    // A tiny known asset on the media CDN — HEADs aren't allowed, but a GET that
    // connects (even 4xx) proves the CDN host is not blocked.
    probe('https://cf-media.sndcdn.com/', timeoutMs)
  ])
  return api && cdn
}

/** Scrape soundcloud.com's script bundles for the public client_id. */
async function discoverClientId(): Promise<string> {
  const home = await fetch('https://soundcloud.com/', { headers: { 'User-Agent': UA } })
  const html = await home.text()
  // The web player build id lives in the homepage; the site appends it as
  // `app_version` on every api-v2 call and write endpoints reject requests without it.
  const vm = html.match(/window\.__sc_version\s*=\s*"(\d+)"/)
  if (vm) appVersion = vm[1]
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

/** The web player's current build id, needed as `app_version` on write calls.
 *  Populated by discoverClientId; scraped on demand if the client_id was cached. */
async function getAppVersion(): Promise<string | null> {
  if (appVersion) return appVersion
  try {
    const html = await (await fetch('https://soundcloud.com/', { headers: { 'User-Agent': UA } })).text()
    const m = html.match(/window\.__sc_version\s*=\s*"(\d+)"/)
    if (m) appVersion = m[1]
  } catch {
    /* best-effort — the call may still work without it */
  }
  return appVersion
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
  playback_count?: number
  user?: { id?: number; username?: string; avatar_url?: string | null }
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
    artwork: sc.artwork_url ? sc.artwork_url.replace('-large', '-t500x500') : undefined,
    playCount: sc.playback_count
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

/**
 * Resolve a track's uploader straight from the track id (`/tracks/{id}`).
 * Used when a Track carries no artistId (tracks pulled from feeds/mixes/related
 * often omit the nested `user.id`). Resolving by track id is immune to fragile
 * username matching — e.g. profiles with symbols like `✶` that break user search.
 */
export async function getTrackArtist(trackId: string): Promise<Artist | null> {
  const res = await authedFetch(
    (id) => `${API}/tracks/${encodeURIComponent(trackId)}?client_id=${id}`
  )
  if (!res.ok) return null
  const t = (await res.json()) as ScTrack
  const u = t.user
  if (u?.id == null || !u.username) return null
  return {
    id: String(u.id),
    name: u.username,
    provider: 'soundcloud',
    avatar: u.avatar_url ? u.avatar_url.replace('-large', '-t200x200') : undefined
  }
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

/** Distinct uploaders behind a track's related tracks — our "fans also like" for
 *  SoundCloud (no real related-artists API). Carries avatars, unlike deriving from
 *  Track objects (which drop the user's avatar). */
export async function relatedArtists(trackId: string, limit = 12): Promise<Artist[]> {
  try {
    const res = await authedFetch(
      (id) => `${API}/tracks/${encodeURIComponent(trackId)}/related?limit=25&client_id=${id}`
    )
    if (!res.ok) return []
    const data = (await res.json()) as { collection?: ScTrack[] }
    const seen = new Set<string>()
    const out: Artist[] = []
    for (const t of data.collection || []) {
      const u = t.user
      if (u?.id != null && u.username && !seen.has(String(u.id))) {
        seen.add(String(u.id))
        out.push({
          id: String(u.id),
          name: u.username,
          provider: 'soundcloud',
          avatar: u.avatar_url ? u.avatar_url.replace('-large', '-t200x200') : undefined
        })
      }
    }
    return out.slice(0, limit)
  } catch {
    return []
  }
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

export async function getUserTracks(userId: string, max = 500): Promise<Track[]> {
  // Page through the artist's whole track list, not just the first 60. SC v2 uses
  // cursor pagination: `linked_partitioning=1` returns a `next_href` (already
  // carrying the client_id) that we follow until it runs out or we hit `max`.
  const first = await authedFetch(
    (id) =>
      `${API}/users/${encodeURIComponent(userId)}/tracks?limit=50&linked_partitioning=1&client_id=${id}`
  )
  if (!first.ok) throw new Error(`SoundCloud artist tracks failed (${first.status})`)
  let data = (await first.json()) as { collection?: ScTrack[]; next_href?: string | null }
  const raw: ScTrack[] = [...(data.collection || [])]
  let next = data.next_href || null
  while (next && raw.length < max) {
    try {
      const url = next.includes('client_id=')
        ? next
        : `${next}${next.includes('?') ? '&' : '?'}client_id=${await getClientId()}`
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) break
      data = (await res.json()) as { collection?: ScTrack[]; next_href?: string | null }
      raw.push(...(data.collection || []))
      next = data.next_href || null
    } catch {
      break
    }
  }
  return raw.map(toTrack).filter((t): t is Track => t !== null)
}

interface ScPlaylist {
  id: number
  title: string
  artwork_url?: string | null
  calculated_artwork_url?: string | null
  track_count?: number
  release_date?: string | null
  created_at?: string
  user?: { username?: string }
  tracks?: Array<{ id?: number } | number | ScTrack>
}

function toAlbum(p: ScPlaylist, kind: 'album' | 'playlist' = 'album'): Album {
  const date = p.release_date || p.created_at
  const year = date ? Number(date.slice(0, 4)) : NaN
  // SoundCloud albums frequently have a null artwork_url — fall back to the
  // derived cover, then to the first track's art that the listing includes.
  const trackArt = (p.tracks || [])
    .map((t) => (t && typeof t === 'object' ? (t as ScTrack).artwork_url : null))
    .find((a): a is string => !!a)
  const raw = p.artwork_url || p.calculated_artwork_url || trackArt || undefined
  return {
    id: String(p.id),
    provider: 'soundcloud',
    kind,
    title: p.title,
    artist: p.user?.username,
    cover: raw ? raw.replace('-large', '-t500x500') : undefined,
    year: Number.isFinite(year) ? year : undefined,
    trackCount: p.track_count
  }
}

/** Search SoundCloud albums. */
export async function searchAlbums(query: string, limit = 20): Promise<Album[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const res = await authedFetch(
      (id) => `${API}/search/albums?q=${encodeURIComponent(q)}&limit=${limit}&client_id=${id}`
    )
    if (!res.ok) return []
    const data = (await res.json()) as { collection?: ScPlaylist[] }
    return (data.collection || []).filter((p) => p && p.title).map((p) => toAlbum(p, 'album'))
  } catch {
    return []
  }
}

/** Search SoundCloud playlists (sets that aren't albums). */
export async function searchPlaylists(query: string, limit = 20): Promise<Album[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const res = await authedFetch(
      (id) =>
        `${API}/search/playlists_without_albums?q=${encodeURIComponent(q)}&limit=${limit}&client_id=${id}`
    )
    if (!res.ok) return []
    const data = (await res.json()) as { collection?: ScPlaylist[] }
    return (data.collection || []).filter((p) => p && p.title).map((p) => toAlbum(p, 'playlist'))
  } catch {
    return []
  }
}

/** Albums (and album-like sets) published by a SoundCloud user. */
export async function getUserAlbums(userId: string, limit = 30): Promise<Album[]> {
  try {
    const res = await authedFetch(
      (id) => `${API}/users/${encodeURIComponent(userId)}/albums?limit=${limit}&client_id=${id}`
    )
    if (!res.ok) return []
    const data = (await res.json()) as { collection?: ScPlaylist[] }
    return (data.collection || []).filter((p) => p && p.title).map((p) => toAlbum(p, 'album'))
  } catch {
    return []
  }
}

/** Full track list of an album/set (hydrates partial entries the API returns). */
export async function getAlbumTracks(albumId: string): Promise<Track[]> {
  const bare = albumId.replace(/^sc:/, '')
  const res = await authedFetch(
    (id) => `${API}/playlists/${encodeURIComponent(bare)}?client_id=${id}`
  )
  if (!res.ok) throw new Error(`SoundCloud album failed (${res.status})`)
  const data = (await res.json()) as ScPlaylist
  const ids: number[] = []
  const fulls: ScTrack[] = []
  for (const t of data.tracks || []) {
    if (typeof t === 'number') ids.push(t)
    else if (t && typeof t === 'object') {
      const o = t as ScTrack
      if (o.media?.transcodings?.length) fulls.push(o)
      else if (typeof o.id === 'number') ids.push(o.id)
    }
  }
  let tracks = fulls.map(toTrack).filter((t): t is Track => t !== null)
  if (ids.length) tracks = [...tracks, ...(await hydrateTrackIds(ids))]
  return tracks
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

// SoundCloud fronts its write endpoints with DataDome bot protection: a plain
// main-process fetch (even via the signed-in session) gets a 403 captcha
// interstitial because DataDome fingerprints the client, not just the cookie.
// To pass it we run the mutation as a same-origin `fetch` inside a real hidden
// Chromium page loaded on soundcloud.com — it inherits the genuine browser
// fingerprint and the DataDome clearance cookie the site itself is granted.
let writeWin: BrowserWindow | null = null
let writeWinReady: Promise<void> | null = null

async function getWriteContents(): Promise<Electron.WebContents> {
  if (writeWin && !writeWin.isDestroyed()) {
    if (writeWinReady) await writeWinReady
    return writeWin.webContents
  }
  const win = new BrowserWindow({
    show: false,
    webPreferences: { partition: 'persist:scauth', contextIsolation: true, sandbox: true }
  })
  writeWin = win
  win.on('closed', () => {
    if (writeWin === win) {
      writeWin = null
      writeWinReady = null
    }
  })
  writeWinReady = new Promise<void>((resolve) => {
    const done = (): void => resolve()
    win.webContents.once('did-finish-load', done)
    // Resolve on failure too — the DataDome cookie is set even if some subresource
    // fails, and the in-page fetch may still succeed.
    win.webContents.once('did-fail-load', done)
    setTimeout(done, 15000)
  })
  win.loadURL('https://soundcloud.com/discover')
  await writeWinReady
  return win.webContents
}

// When DataDome escalates (after a burst of writes) it stops auto-clearing and
// demands a real captcha, which a hidden, never-interacted page can't solve. We
// then surface the window on soundcloud.com so the user solves the challenge
// once; that refreshes the clearance cookie for the whole `persist:scauth`
// session and writes resume. Single-flighted so a batch export shows one window.
let solving: Promise<boolean> | null = null

/** Show the write window for a one-time manual DataDome captcha solve. `probe`
 *  re-issues the pending write; resolves true once it stops being challenged. */
async function passChallenge(probe: () => Promise<number>): Promise<boolean> {
  if (solving) return solving
  solving = (async (): Promise<boolean> => {
    const wc = await getWriteContents()
    if (!writeWin || writeWin.isDestroyed()) return false
    console.warn(
      '[sc.setLike] DataDome captcha — showing SoundCloud window for a one-time manual solve'
    )
    writeWin.setTitle('SoundCloud: подтвердите, что вы не робот, затем можно закрыть')
    writeWin.show()
    writeWin.focus()
    // Reloading a normal page makes DataDome render its captcha for the user.
    wc.loadURL('https://soundcloud.com/')
    const deadline = Date.now() + 150000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000))
      if (!writeWin || writeWin.isDestroyed()) return false
      const s = await probe()
      // 403 = still challenged; 0 = page mid-navigation, keep waiting.
      if (s !== 403 && s !== 0) {
        writeWin.hide()
        return s >= 200 && s < 300
      }
    }
    if (writeWin && !writeWin.isDestroyed()) writeWin.hide()
    return false
  })().finally(() => {
    solving = null
  })
  return solving
}

/**
 * Perform a track_likes mutation as an in-page fetch on soundcloud.com so it
 * clears DataDome. Returns the HTTP status (0 on transport failure). Retries
 * once after a short backoff on 403 — DataDome occasionally throttles a burst of
 * rapid writes, and a brief pause usually clears the challenge.
 */
async function scWriteInPage(url: string, method: string): Promise<number> {
  if (!oauthToken) return 0
  const wc = await getWriteContents()
  const js = `
    fetch(${JSON.stringify(url)}, {
      method: ${JSON.stringify(method)},
      headers: { Authorization: ${JSON.stringify('OAuth ' + oauthToken)} },
      credentials: 'include'
    }).then(async (r) => {
      let body = ''
      if (r.status < 200 || r.status >= 300) {
        try { body = (await r.text()).slice(0, 300) } catch (e) {}
      }
      return { status: r.status, body: body }
    }).catch((e) => ({ status: 0, body: String(e && e.message || e) }))
  `
  const run = async (log: boolean): Promise<{ status: number; body: string }> => {
    try {
      const r = (await wc.executeJavaScript(js)) as { status: number; body: string }
      if (log && r && r.body) {
        console.warn(`[sc.setLike] ${r.status} body: ${r.body.replace(/\s+/g, ' ')}`)
      }
      return r && typeof r.status === 'number' ? r : { status: 0, body: '' }
    } catch {
      return { status: 0, body: '' }
    }
  }
  let r = await run(true)
  // DataDome challenge (interstitial or hard captcha) — surface the window so the
  // user solves it once, then re-issue our own write on the cleared session.
  if (r.status === 403 && /captcha-delivery/.test(r.body)) {
    const cleared = await passChallenge(async () => (await run(false)).status)
    if (cleared) r = await run(true)
  } else if (r.status === 403) {
    // Non-captcha 403 (transient throttle) — brief backoff and one retry.
    await new Promise((res) => setTimeout(res, 1200))
    r = await run(true)
  }
  return r.status
}

/**
 * Like / unlike a track on the signed-in user's SoundCloud account.
 * `id` is the app-internal id (may carry the `sc:` prefix). Returns whether the
 * service confirmed the change. The `track_likes/{id}` path (PUT to like, DELETE
 * to unlike) matches the reads; the mutation is issued from an in-page fetch to
 * get past DataDome bot protection (see `scWriteInPage`).
 */
export async function setLike(id: string, liked: boolean): Promise<boolean> {
  if (!oauthToken) {
    console.warn('[sc.setLike] no oauth token — not signed in')
    return false
  }
  if (myUserId == null) await getMe()
  if (myUserId == null) {
    console.warn('[sc.setLike] no myUserId (getMe failed)')
    return false
  }
  const trackId = id.replace(/^sc:/, '')
  if (!/^\d+$/.test(trackId)) {
    console.warn('[sc.setLike] non-numeric track id:', id)
    return false
  }
  const clientId0 = await getClientId()
  const ver = await getAppVersion()
  // PUT to track_likes/{id} is the recognized like verb (POST 404s); the web app
  // also appends app_version + app_locale, and the write 403s without them.
  const params = new URLSearchParams({ client_id: clientId0, app_locale: 'en' })
  if (ver) params.set('app_version', ver)
  const url = `${API}/users/${myUserId}/track_likes/${trackId}?${params.toString()}`
  const method = liked ? 'PUT' : 'DELETE'
  try {
    // Issue the write from inside a real soundcloud.com page so it carries the
    // browser fingerprint + DataDome clearance; a main-process fetch gets 403'd.
    const status = await scWriteInPage(url, method)
    console.log(`[sc.setLike] ${method} track_likes/${trackId} (v=${ver ?? 'none'}) -> ${status}`)
    // 200/201 = done; unlike of an already-unliked track 404s, which is fine.
    return status >= 200 && status < 300 ? true : !liked && status === 404
  } catch (e) {
    console.warn(`[sc.setLike] ${method} failed:`, (e as Error)?.message)
    return false
  }
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
