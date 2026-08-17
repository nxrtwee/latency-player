// Mobile implementation of the `window.api` bridge the shared renderer expects.
//
// On desktop this surface is backed by Electron's main process (filesystem,
// SoundCloud networking, JSON persistence). On mobile we reimplement it here:
//   - Step 1 (now): SoundCloud calls are stubbed; likes/playlists use
//     localStorage; window-chrome / native-only calls are no-ops.
//   - Step 2: SoundCloud becomes real via a dev proxy (browser) / CapacitorHttp
//     (device), and lyrics/library get mobile-appropriate backends.
//
// Keeping the exact same shape as the desktop preload means the shared store and
// providers run unchanged.

import type { Album, Artist, LibraryState, Playlist, Track } from '@shared/types'
// Type-only (erased at build time — it must never pull `electron` into the phone
// bundle): the desktop preload's own inferred surface, used for the contract
// assertion at the bottom of this file.
import type { Api } from '../../../src/preload'
import * as sc from './soundcloud'
import * as ym from './yandex'
import * as lyrics from './lyrics'
import * as offline from './offline'
import { offlineSrcForUri } from './offline'
import { clearLocal, getKnownLocal, importFiles, pickAudioFiles } from './localfiles'
import { pickFile } from './picker'
import { openJsonFile, saveJsonFile } from './jsonfile'
import { pickVideoFile } from './wallpaper'
import { requestToken } from './tokenRequest'
import { getFreshResolve, putResolve } from './resolveCache'

// The store's own pref seeding (volume, language, visual, …) lives in
// mobile/src/defaults.ts, which main.tsx imports before this module — the store
// reads every pref at module evaluation and this file pulls it in transitively
// (via ./resolveCache), so seeding here would already be too late.

// --- tiny localStorage helpers -------------------------------------------------
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / private mode — ignore */
  }
}

const LIKES_KEY = 'lp.m.likes'
const PLAYLISTS_KEY = 'lp.m.playlists'

/**
 * Open a native file dialog and resolve to a data: URL for the chosen image
 * (null if cancelled). data: (not blob:) so the chosen cover/background survives
 * a reload — an image is small enough for localStorage, unlike a video, which
 * goes to app storage instead (see wallpaper.ts). Mirrors the desktop
 * dialog:pickImage IPC the shared store calls.
 */
async function pickImage(): Promise<string | null> {
  const file = await pickFile('image/*')
  if (!file) return null
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

// --- likes ---------------------------------------------------------------------
function getLikes(): Track[] {
  return read<Track[]>(LIKES_KEY, [])
}
function toggleLike(track: Track): Track[] {
  const likes = getLikes()
  const i = likes.findIndex((t) => t.id === track.id)
  if (i >= 0) likes.splice(i, 1)
  else likes.unshift(track)
  write(LIKES_KEY, likes)
  return likes
}
/** Merge tracks into likes (dedup by id, newest first) — used by likes import. */
function addManyLikes(tracks: Track[]): Track[] {
  const likes = getLikes()
  const have = new Set(likes.map((t) => t.id))
  const fresh = tracks.filter((t) => !have.has(t.id))
  const next = [...fresh, ...likes]
  write(LIKES_KEY, next)
  return next
}
/** Drop every like that came from a given provider — undoes an import. */
function removeProviderLikes(provider: string): Track[] {
  const next = getLikes().filter((t) => t.providerId !== provider)
  write(LIKES_KEY, next)
  return next
}
/**
 * Replace the whole list, order included — the import half of the cross-platform
 * sync (shared/sync.ts) has to reproduce the exporting device's exact order, which
 * `addManyLikes` (prepend-only) cannot do. Dedupe here is belt-and-braces; the
 * merge already did it.
 */
function setLikes(tracks: Track[]): Track[] {
  const seen = new Set<string>()
  const next = tracks.filter((t) => {
    if (!t?.id || seen.has(t.id)) return false
    seen.add(t.id)
    return true
  })
  write(LIKES_KEY, next)
  return next
}

// --- playlists -----------------------------------------------------------------
function getPlaylists(): Playlist[] {
  return read<Playlist[]>(PLAYLISTS_KEY, [])
}
function savePlaylists(pls: Playlist[]): Playlist[] {
  write(PLAYLISTS_KEY, pls)
  return pls
}
function newId(): string {
  // No Math.random reliance needed elsewhere, but fine in app runtime.
  return 'pl_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)
}

// A WebView can't walk the filesystem, so "the library" is whatever the user has
// imported through the picker (see localfiles.ts). `folders` stays empty — there
// is nothing to watch or rescan — and the Sidebar's touch branch renders an
// "import tracks" button in place of the folder list.
const localLibrary = (): LibraryState => ({ folders: [], tracks: getKnownLocal() })

/** Sentinel `removeFolder` argument for "forget every imported track". */
const CLEAR_LOCAL = '*'

// --- the bridge ----------------------------------------------------------------
const api = {
  // library — imported files (no folder scan on a phone; see localLibrary above).
  getLibrary: async (): Promise<LibraryState> => localLibrary(),
  rescan: async (): Promise<LibraryState> => localLibrary(),
  addFolder: async (): Promise<LibraryState> => {
    const files = await pickAudioFiles()
    if (files.length) await importFiles(files)
    return localLibrary()
  },
  removeFolder: async (folder: string): Promise<LibraryState> => {
    if (folder === CLEAR_LOCAL) await clearLocal()
    return localLibrary()
  },

  // SoundCloud — public endpoints are real (via the dev proxy / CapacitorHttp).
  scSearch: (query: string): Promise<Track[]> => sc.search(query),
  scSearchUsers: (query: string): Promise<Artist[]> => sc.searchUsers(query),
  scSearchAlbums: (query: string): Promise<Album[]> => sc.searchAlbums(query),
  scSearchPlaylists: (query: string): Promise<Album[]> => sc.searchPlaylists(query),
  scUser: (userId: string): Promise<Artist | null> => sc.getUser(userId),
  scTrackArtist: (trackId: string): Promise<Artist | null> => sc.getTrackArtist(trackId),
  scRelatedArtists: (trackId: string): Promise<Artist[]> => sc.relatedArtists(trackId),
  scUserTracks: (userId: string): Promise<Track[]> => sc.getUserTracks(userId),
  scUserAlbums: (userId: string): Promise<Album[]> => sc.getUserAlbums(userId),
  scAlbumTracks: (albumId: string): Promise<Track[]> => sc.getAlbumTracks(albumId),
  scRelated: (trackId: string): Promise<Track[]> => sc.relatedTracks(trackId),
  scComments: (
    trackId: string
  ): Promise<{ timeSec: number; body: string; user: string; avatar?: string }[]> =>
    sc.getComments(trackId),
  scResolveStream: async (transcodingUrl: string): Promise<string> => {
    // A pre-resolved (prefetched) URL is returned synchronously — this is what
    // makes a lock-screen skip work: no background network from the throttled
    // WKWebView. See resolveCache.ts.
    const cached = getFreshResolve(transcodingUrl)
    if (cached) return cached
    // Prefer a downloaded copy (offline) over the network stream.
    const local = await offlineSrcForUri(transcodingUrl)
    if (local) return local
    const url = await sc.resolveStream(transcodingUrl)
    putResolve(transcodingUrl, url)
    return url
  },
  // Authenticated (OAuth web-session) features. Desktop opens an Electron OAuth
  // window; a phone can't, so `scLogin` asks the user to paste a web-session
  // token (shell/TokenSheet.tsx) and then resolves the same `Artist | null` the
  // desktop contract promises — so the shared ProfilePage connect button works
  // unchanged. Once the token is set, the same store flows as desktop light up
  // (real mixes, your likes).
  scSetToken: (token: string): void => sc.setToken(token),
  scLogin: async (): Promise<Artist | null> => {
    if (sc.isAuthed()) {
      const known = await sc.getMe()
      if (known) return known
      sc.setToken('') // stored token went stale — fall through and re-ask
    }
    const accepted = await requestToken('sc', async (raw) => {
      sc.setToken(raw)
      if (await sc.getMe()) return true
      sc.setToken('') // keep isAuthed() honest after a bad paste
      return false
    })
    return accepted ? sc.getMe() : null
  },
  scLogout: async (): Promise<void> => sc.logout(),
  scMe: (): Promise<Artist | null> => sc.getMe(),
  scIsAuthed: async (): Promise<boolean> => sc.isAuthed(),
  // Reachability probe (desktop smart-availability). On mobile both backends go
  // through CapacitorHttp / the dev proxy, so assume reachable.
  scReachable: async (): Promise<boolean> => true,
  scMyLikes: (): Promise<Track[]> => sc.getMyLikes(),
  // Mirror a like/unlike back to the SoundCloud account (writes ride the same
  // OAuth token). SC fronts writes with DataDome bot-protection we can't defeat
  // on mobile, so this may 403 — the store treats it as fire-and-forget.
  scSetLike: (id: string, liked: boolean): Promise<boolean> => sc.setLike(id, liked),
  scPersonalMixes: (): Promise<
    { title: string; subtitle?: string; cover?: string; tracks: Track[] }[]
  > => sc.getPersonalMixes(),

  // Yandex Music — public endpoints (search / artist / album / playlist) are
  // real; auth (likes / My Wave) is driven by a user-pasted OAuth token. Stream
  // resolution signs the CDN URL with a pure-JS MD5 (see yandex.ts / md5.ts).
  ymSearch: (query: string): Promise<Track[]> => ym.search(query),
  ymSearchArtists: (query: string): Promise<Artist[]> => ym.searchArtists(query),
  ymSearchAlbums: (query: string): Promise<Album[]> => ym.searchAlbums(query),
  ymSearchPlaylists: (query: string): Promise<Album[]> => ym.searchPlaylists(query),
  ymArtist: (artistId: string): Promise<Artist | null> => ym.getArtist(artistId),
  ymArtistTracks: (artistId: string): Promise<Track[]> => ym.getArtistTracks(artistId),
  ymSimilarArtists: (artistId: string): Promise<Artist[]> => ym.getSimilarArtists(artistId),
  ymArtistAlbums: (artistId: string): Promise<Album[]> => ym.getArtistAlbums(artistId),
  ymAlbumTracks: (albumId: string): Promise<Track[]> => ym.getAlbumTracks(albumId),
  ymPlaylistTracks: (playlistId: string): Promise<Track[]> => ym.getPlaylistTracks(playlistId),
  ymResolveStream: async (trackId: string): Promise<string> => {
    const cached = getFreshResolve(trackId)
    if (cached) return cached
    // Prefer a downloaded copy (offline) over the network stream.
    const local = await offlineSrcForUri(trackId)
    if (local) return local
    const url = await ym.resolveStream(trackId)
    putResolve(trackId, url)
    return url
  },
  // Auth — same paste-a-token flow as SoundCloud above (yandex.setToken also
  // accepts a full redirect URL carrying #access_token=…, which is what the
  // sheet's "open sign-in page" link produces).
  ymSetToken: (token: string): void => ym.setToken(token),
  ymLogin: async (): Promise<Artist | null> => {
    if (ym.isAuthed()) {
      const known = await ym.getMe()
      if (known) return known
      ym.setToken('')
    }
    const accepted = await requestToken('ym', async (raw) => {
      ym.setToken(raw)
      if (await ym.getMe()) return true
      ym.setToken('')
      return false
    })
    return accepted ? ym.getMe() : null
  },
  ymLogout: async (): Promise<void> => ym.logout(),
  ymMe: (): Promise<Artist | null> => ym.getMe(),
  ymIsAuthed: async (): Promise<boolean> => ym.isAuthed(),
  ymReachable: async (): Promise<boolean> => true,
  ymMyLikes: (): Promise<Track[]> => ym.getMyLikes(),
  // Mirror a like/unlike back to the Yandex account (authorized POST, no bot
  // protection — reliable, unlike SC).
  ymSetLike: (id: string, liked: boolean): Promise<boolean> => ym.setLike(id, liked),
  ymMyWave: (queueId?: string): Promise<{ cover?: string; tracks: Track[] }> =>
    ym.getMyWave(queueId),
  ymStationWave: (
    stationId: string,
    queueId?: string
  ): Promise<{ cover?: string; tracks: Track[] }> => ym.getStationTracks(stationId, queueId),
  ymArtistWave: (
    artistId: string,
    queueId?: string
  ): Promise<{ cover?: string; tracks: Track[] }> => ym.getArtistWave(artistId, queueId),
  ymTrackWave: (
    trackId: string,
    queueId?: string
  ): Promise<{ cover?: string; tracks: Track[] }> => ym.getTrackWave(trackId, queueId),
  ymWaveFeedback: (
    stationId: string,
    type: 'trackStarted' | 'trackFinished',
    trackId: string,
    seconds?: number
  ): Promise<void> => ym.waveTrackFeedback(stationId, type, trackId, seconds),

  // likes / playlists — real, localStorage-backed.
  getLikes: async (): Promise<Track[]> => getLikes(),
  toggleLike: async (track: Track): Promise<Track[]> => toggleLike(track),
  addManyLikes: async (tracks: Track[]): Promise<Track[]> => addManyLikes(tracks),
  setLikes: async (tracks: Track[]): Promise<Track[]> => setLikes(tracks),
  removeProviderLikes: async (provider: string): Promise<Track[]> => removeProviderLikes(provider),
  getPlaylists: async (): Promise<Playlist[]> => getPlaylists(),
  createPlaylist: async (name: string): Promise<Playlist[]> =>
    savePlaylists([...getPlaylists(), { id: newId(), name, tracks: [] }]),
  renamePlaylist: async (id: string, name: string): Promise<Playlist[]> =>
    savePlaylists(getPlaylists().map((p) => (p.id === id ? { ...p, name } : p))),
  removePlaylist: async (id: string): Promise<Playlist[]> =>
    savePlaylists(getPlaylists().filter((p) => p.id !== id)),
  addToPlaylist: async (id: string, track: Track): Promise<Playlist[]> =>
    savePlaylists(
      getPlaylists().map((p) =>
        p.id === id && !p.tracks.some((t) => t.id === track.id)
          ? { ...p, tracks: [...p.tracks, track] }
          : p
      )
    ),
  removeFromPlaylist: async (id: string, trackId: string): Promise<Playlist[]> =>
    savePlaylists(
      getPlaylists().map((p) =>
        p.id === id ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p
      )
    ),
  addTracksToPlaylist: async (id: string, tracks: Track[]): Promise<Playlist[]> =>
    savePlaylists(
      getPlaylists().map((p) => {
        if (p.id !== id) return p
        const have = new Set(p.tracks.map((t) => t.id))
        return { ...p, tracks: [...p.tracks, ...tracks.filter((t) => !have.has(t.id))] }
      })
    ),

  // offline downloads — the store owns the UI state (offlineIds/offlineTracks)
  // and reaches for it through these five; ./offline.ts owns the files.
  offlineList: async (): Promise<string[]> => offline.getDownloads().map((e) => e.track.id),
  offlineTracks: async (): Promise<Track[]> => offline.downloadedTracks(),
  offlineDownload: async (track: Track): Promise<Track | null> => {
    await offline.downloadTrack(track)
    return offline.getDownloads().find((e) => e.track.id === track.id)?.track ?? null
  },
  offlineRemove: (trackId: string): Promise<void> => offline.removeDownload(trackId),
  offlineClear: (): Promise<void> => offline.removeAll(),
  offlineSize: async (): Promise<number> => offline.totalBytes(),
  // Deliberately null: on desktop this is a media:// URL the local provider
  // plays instead of streaming. Mobile does the same swap one level lower — the
  // sc/ym resolvers already return a local blob: URL for a downloaded track (see
  // offlineSrcForUri above) — so handing the store a URL here would route
  // playback through the local provider for no gain.
  offlineLocalUrl: async (): Promise<string | null> => null,

  // window chrome — desktop-only, no-ops on mobile.
  windowMinimize: (): void => undefined,
  windowMaximize: (): void => undefined,
  windowToggleMaximize: (): void => undefined,
  windowClose: (): void => undefined,
  windowIsMaximized: async (): Promise<boolean> => false,
  onWindowMaximized: (_cb: (maximized: boolean) => void): (() => void) => () => undefined,

  // Desktop integrations with no phone counterpart. Discord RPC and the
  // ~/.latency now-playing file are Electron-main features, but the store pushes
  // to both on every track change (store.ts `updatePresence`), so they have to
  // exist as no-ops. Their *config* pair (discordGetConfig/discordSetConfig) is
  // deliberately absent instead — Settings gates the whole Discord block on it,
  // which is how the phone hides a section it cannot implement. Same trick for
  // the System block (launch-at-startup / hardware acceleration / relaunch): see
  // `DesktopOnly` at the bottom of this file.
  discordUpdate: (): void => undefined,
  nowPlayingUpdate: (): void => undefined,

  // image picker — opens a file dialog and returns a data: URL (so it survives
  // reloads, unlike a blob:). Unlocks the shared cover/background actions
  // (setTrackCover / setCustomBg / setKaraokeImage). null = "no image chosen".
  pickBackground: (): Promise<string | null> => pickImage(),
  // video wallpapers — the picked clip is copied into app storage and played from
  // the app's own local server, so it survives a restart without stuffing tens of
  // megabytes of base64 into localStorage (see wallpaper.ts).
  pickVideo: (): Promise<string | null> => pickVideoFile(),
  // likes-sync file (shared/sync.ts): written into a user-reachable directory
  // instead of a save dialog, read back through the same picker as everything
  // else — see jsonfile.ts.
  saveJsonFile: (suggestedName: string, text: string): Promise<string | null> =>
    saveJsonFile(suggestedName, text),
  openJsonFile: (): Promise<{ name: string; text: string } | null> => openJsonFile(),

  // lyrics — LRCLIB + Genius via the proxy / CapacitorHttp, cached locally.
  getLyrics: (title: string, artist: string, durationSec?: number, useGenius?: boolean) =>
    lyrics.fetchLyrics(title, artist, durationSec, useGenius),
  clearLyricsCache: async (): Promise<void> => lyrics.clearCache(),
  searchByLyrics: (query: string): Promise<lyrics.LyricSearchHit[]> => lyrics.searchByLyrics(query),
  hasManualSync: async (title: string, artist: string, durationSec?: number): Promise<boolean> =>
    lyrics.hasManualSync(title, artist, durationSec),
  saveManualSync: async (
    title: string,
    artist: string,
    durationSec: number | undefined,
    lines: { timeSec: number; text: string }[]
  ): Promise<void> => lyrics.saveManualSync(title, artist, durationSec, lines),
  deleteManualSync: async (title: string, artist: string, durationSec?: number): Promise<void> =>
    lyrics.deleteManualSync(title, artist, durationSec)
}

;(window as unknown as { api: typeof api }).api = api

/**
 * Compile-time proof that this bridge still covers the desktop contract.
 *
 * `window.api` is installed by a cast (there is no Electron preload here), so
 * nothing would otherwise notice a desktop method that never got a mobile
 * counterpart — which is exactly how a missing `discordGetConfig` shipped as a
 * runtime crash inside the shared Settings component. Assigning to
 * `Omit<Api, DesktopOnly>` makes tsc list every gap instead.
 *
 * Every key below is absent ON PURPOSE: each one gates a desktop-only Settings
 * section via `typeof window.api?.x === 'function'`, so implementing one here
 * would make that section appear on a phone. Add to this union only together
 * with such a gate.
 */
type DesktopOnly =
  | 'discordGetConfig' // Discord RPC block (Settings)
  | 'discordSetConfig'
  | 'getLaunchAtStartup' // System block (Settings): OS login item…
  | 'setLaunchAtStartup'
  | 'getHardwareAcceleration' // …Chromium switch…
  | 'setHardwareAcceleration'
  | 'relaunchApp' // …and the relaunch that block gates on
  | 'setGlobalHotkeys' // Hotkeys block (Settings) + App.tsx's global listener
  | 'onHotkeyTrigger'

const contract: Omit<Api, DesktopOnly> = api
void contract

export type MobileApi = typeof api
