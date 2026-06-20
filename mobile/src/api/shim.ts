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

import type { Artist, LibraryState, Playlist, Track } from '@shared/types'
import * as sc from './soundcloud'
import * as lyrics from './lyrics'

// The shared store derives initial volume from Number(localStorage['lp.volume']).
// Since Number(null) === 0 passes its 0..1 range check, a fresh install would
// start at volume 0 (silent) — there's no volume slider on mobile to recover.
// Seed a sane default here; this module is imported before the store evaluates.
try {
  if (localStorage.getItem('lp.volume') === null) localStorage.setItem('lp.volume', '0.85')
  // Default the mobile UI to Russian (the app shipped Russian); the store's own
  // default is 'en'. Seed before the store evaluates.
  if (localStorage.getItem('lp.lang') === null) localStorage.setItem('lp.lang', 'ru')
} catch {
  /* private mode — store falls back to its own default */
}

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

const EMPTY_LIBRARY: LibraryState = { folders: [], tracks: [] }

// --- the bridge ----------------------------------------------------------------
const api = {
  // library — local files need native file access (Step 2+); empty for now.
  getLibrary: async (): Promise<LibraryState> => EMPTY_LIBRARY,
  rescan: async (): Promise<LibraryState> => EMPTY_LIBRARY,
  addFolder: async (): Promise<LibraryState> => EMPTY_LIBRARY,
  removeFolder: async (): Promise<LibraryState> => EMPTY_LIBRARY,

  // SoundCloud — public endpoints are real (via the dev proxy / CapacitorHttp).
  scSearch: (query: string): Promise<Track[]> => sc.search(query),
  scSearchUsers: (query: string): Promise<Artist[]> => sc.searchUsers(query),
  scUser: (userId: string): Promise<Artist | null> => sc.getUser(userId),
  scUserTracks: (userId: string): Promise<Track[]> => sc.getUserTracks(userId),
  scRelated: (trackId: string): Promise<Track[]> => sc.relatedTracks(trackId),
  scResolveStream: (transcodingUrl: string): Promise<string> => sc.resolveStream(transcodingUrl),
  // Authenticated (OAuth web-session) features — driven by a user-pasted token
  // (auto-capture needs a native WKWebView; see ios-notes). Once the token is
  // set, the same store flows as desktop light up (real mixes, your likes).
  scSetToken: (token: string): void => sc.setToken(token),
  scLogin: async (): Promise<Artist | null> => sc.getMe(),
  scLogout: async (): Promise<void> => sc.logout(),
  scMe: (): Promise<Artist | null> => sc.getMe(),
  scIsAuthed: async (): Promise<boolean> => sc.isAuthed(),
  scMyLikes: (): Promise<Track[]> => sc.getMyLikes(),
  scPersonalMixes: (): Promise<
    { title: string; subtitle?: string; cover?: string; tracks: Track[] }[]
  > => sc.getPersonalMixes(),

  // likes / playlists — real, localStorage-backed.
  getLikes: async (): Promise<Track[]> => getLikes(),
  toggleLike: async (track: Track): Promise<Track[]> => toggleLike(track),
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

  // window chrome — desktop-only, no-ops on mobile.
  windowMinimize: (): void => undefined,
  windowToggleMaximize: (): void => undefined,
  windowClose: (): void => undefined,
  windowIsMaximized: async (): Promise<boolean> => false,
  onWindowMaximized: (_cb: (maximized: boolean) => void): (() => void) => () => undefined,

  // image picker — native picker comes later; null = "no image chosen".
  pickBackground: async (): Promise<string | null> => null,

  // lyrics — LRCLIB + Genius via the proxy / CapacitorHttp, cached locally.
  getLyrics: (title: string, artist: string, durationSec?: number, useGenius?: boolean) =>
    lyrics.fetchLyrics(title, artist, durationSec, useGenius),
  clearLyricsCache: async (): Promise<void> => lyrics.clearCache(),
  hasManualSync: async (title: string, artist: string, durationSec?: number): Promise<boolean> =>
    lyrics.hasManualSync(title, artist, durationSec),
  saveManualSync: async (
    title: string,
    artist: string,
    durationSec: number | undefined,
    lines: { timeSec: number; text: string }[]
  ): Promise<void> => lyrics.saveManualSync(title, artist, durationSec, lines),
  deleteManualSync: async (title: string, artist: string, durationSec?: number): Promise<void> =>
    lyrics.deleteManualSync(title, artist, durationSec),

  // startup toggle — meaningless on mobile.
  getLaunchAtStartup: async (): Promise<boolean> => false,
  setLaunchAtStartup: async (): Promise<void> => undefined
}

;(window as unknown as { api: typeof api }).api = api

export type MobileApi = typeof api
