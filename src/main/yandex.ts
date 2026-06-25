import { promises as fs } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { app, BrowserWindow } from 'electron'
import type { Artist, Track } from '../shared/types'

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
    const data = (await res.json()) as { result?: { artist?: YmArtist } }
    return data.result?.artist ? toArtist(data.result.artist) : null
  } catch {
    return null
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

/** Yandex's personal radio ("Моя волна" / My Wave) as a batch of tracks. */
export async function getMyWave(limit = 40): Promise<YmWave> {
  if (!oauthToken) return { tracks: [] }
  try {
    const res = await fetch(`${API}/rotor/station/user:onyourwave/tracks?settings2=true`, {
      headers: apiHeaders()
    })
    if (!res.ok) return { tracks: [] }
    const data = (await res.json()) as { result?: { sequence?: { track?: YmTrack }[] } }
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
