import { contextBridge, ipcRenderer } from 'electron'
import type { Artist, LibraryState, Playlist, Track } from '../shared/types'

const api = {
  getLibrary: (): Promise<LibraryState> => ipcRenderer.invoke('library:get'),
  rescan: (): Promise<LibraryState> => ipcRenderer.invoke('library:rescan'),
  addFolder: (): Promise<LibraryState> => ipcRenderer.invoke('library:addFolder'),
  removeFolder: (folder: string): Promise<LibraryState> =>
    ipcRenderer.invoke('library:removeFolder', folder),

  scSearch: (query: string): Promise<Track[]> => ipcRenderer.invoke('sc:search', query),
  scSearchUsers: (query: string): Promise<Artist[]> => ipcRenderer.invoke('sc:searchUsers', query),
  scUser: (userId: string): Promise<Artist | null> => ipcRenderer.invoke('sc:user', userId),
  scUserTracks: (userId: string): Promise<Track[]> => ipcRenderer.invoke('sc:userTracks', userId),
  scRelated: (trackId: string): Promise<Track[]> => ipcRenderer.invoke('sc:related', trackId),
  scLogin: (): Promise<Artist | null> => ipcRenderer.invoke('sc:login'),
  scLogout: (): Promise<void> => ipcRenderer.invoke('sc:logout'),
  scMe: (): Promise<Artist | null> => ipcRenderer.invoke('sc:me'),
  scIsAuthed: (): Promise<boolean> => ipcRenderer.invoke('sc:isAuthed'),
  scMyLikes: (): Promise<Track[]> => ipcRenderer.invoke('sc:myLikes'),
  scPersonalMixes: (): Promise<{ title: string; subtitle?: string; cover?: string; tracks: Track[] }[]> =>
    ipcRenderer.invoke('sc:personalMixes'),
  scResolveStream: (transcodingUrl: string): Promise<string> =>
    ipcRenderer.invoke('sc:resolveStream', transcodingUrl),

  getLikes: (): Promise<Track[]> => ipcRenderer.invoke('likes:get'),
  toggleLike: (track: Track): Promise<Track[]> => ipcRenderer.invoke('likes:toggle', track),

  // window controls (frameless)
  windowMinimize: (): void => ipcRenderer.send('window:minimize'),
  windowToggleMaximize: (): void => ipcRenderer.send('window:toggleMaximize'),
  windowClose: (): void => ipcRenderer.send('window:close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  pickBackground: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickImage'),
  onWindowMaximized: (cb: (maximized: boolean) => void): (() => void) => {
    const listener = (_e: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('window:maximized', listener)
    return () => ipcRenderer.removeListener('window:maximized', listener)
  },

  getLyrics: (
    title: string,
    artist: string,
    durationSec?: number,
    useGenius?: boolean
  ): Promise<{
    source: string
    synced: boolean
    manual?: boolean
    lines: { timeSec: number; text: string }[]
    plain: string | null
  } | null> => ipcRenderer.invoke('lyrics:get', title, artist, durationSec, useGenius),
  clearLyricsCache: (): Promise<void> => ipcRenderer.invoke('lyrics:clearCache'),
  getLaunchAtStartup: (): Promise<boolean> => ipcRenderer.invoke('settings:getLaunchAtStartup'),
  setLaunchAtStartup: (enable: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:setLaunchAtStartup', enable),
  hasManualSync: (title: string, artist: string, durationSec?: number): Promise<boolean> =>
    ipcRenderer.invoke('lyrics:hasManual', title, artist, durationSec),
  saveManualSync: (
    title: string,
    artist: string,
    durationSec: number | undefined,
    lines: { timeSec: number; text: string }[]
  ): Promise<void> => ipcRenderer.invoke('lyrics:saveManual', title, artist, durationSec, lines),
  deleteManualSync: (title: string, artist: string, durationSec?: number): Promise<void> =>
    ipcRenderer.invoke('lyrics:deleteManual', title, artist, durationSec),

  getPlaylists: (): Promise<Playlist[]> => ipcRenderer.invoke('playlists:get'),
  createPlaylist: (name: string): Promise<Playlist[]> => ipcRenderer.invoke('playlists:create', name),
  renamePlaylist: (id: string, name: string): Promise<Playlist[]> =>
    ipcRenderer.invoke('playlists:rename', id, name),
  removePlaylist: (id: string): Promise<Playlist[]> => ipcRenderer.invoke('playlists:remove', id),
  addToPlaylist: (id: string, track: Track): Promise<Playlist[]> =>
    ipcRenderer.invoke('playlists:addTrack', id, track),
  removeFromPlaylist: (id: string, trackId: string): Promise<Playlist[]> =>
    ipcRenderer.invoke('playlists:removeTrack', id, trackId)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
