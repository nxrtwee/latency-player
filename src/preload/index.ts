import { contextBridge, ipcRenderer } from 'electron'
import type { Album, Artist, LibraryState, Playlist, Track } from '../shared/types'

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
  scUserAlbums: (userId: string): Promise<Album[]> => ipcRenderer.invoke('sc:userAlbums', userId),
  scAlbumTracks: (albumId: string): Promise<Track[]> =>
    ipcRenderer.invoke('sc:albumTracks', albumId),
  scSearchAlbums: (query: string): Promise<Album[]> =>
    ipcRenderer.invoke('sc:searchAlbums', query),
  scSearchPlaylists: (query: string): Promise<Album[]> =>
    ipcRenderer.invoke('sc:searchPlaylists', query),
  scRelated: (trackId: string): Promise<Track[]> => ipcRenderer.invoke('sc:related', trackId),
  scRelatedArtists: (trackId: string): Promise<Artist[]> =>
    ipcRenderer.invoke('sc:relatedArtists', trackId),
  scComments: (
    trackId: string
  ): Promise<{ timeSec: number; body: string; user: string; avatar?: string }[]> =>
    ipcRenderer.invoke('sc:comments', trackId),
  scLogin: (): Promise<Artist | null> => ipcRenderer.invoke('sc:login'),
  scLogout: (): Promise<void> => ipcRenderer.invoke('sc:logout'),
  scMe: (): Promise<Artist | null> => ipcRenderer.invoke('sc:me'),
  scIsAuthed: (): Promise<boolean> => ipcRenderer.invoke('sc:isAuthed'),
  scMyLikes: (): Promise<Track[]> => ipcRenderer.invoke('sc:myLikes'),
  scPersonalMixes: (): Promise<{ title: string; subtitle?: string; cover?: string; tracks: Track[] }[]> =>
    ipcRenderer.invoke('sc:personalMixes'),
  scResolveStream: (transcodingUrl: string): Promise<string> =>
    ipcRenderer.invoke('sc:resolveStream', transcodingUrl),

  ymSearch: (query: string): Promise<Track[]> => ipcRenderer.invoke('ym:search', query),
  ymSearchArtists: (query: string): Promise<Artist[]> =>
    ipcRenderer.invoke('ym:searchArtists', query),
  ymArtist: (artistId: string): Promise<Artist | null> =>
    ipcRenderer.invoke('ym:artist', artistId),
  ymArtistTracks: (artistId: string): Promise<Track[]> =>
    ipcRenderer.invoke('ym:artistTracks', artistId),
  ymSimilarArtists: (artistId: string): Promise<Artist[]> =>
    ipcRenderer.invoke('ym:similarArtists', artistId),
  ymArtistAlbums: (artistId: string): Promise<Album[]> =>
    ipcRenderer.invoke('ym:artistAlbums', artistId),
  ymAlbumTracks: (albumId: string): Promise<Track[]> =>
    ipcRenderer.invoke('ym:albumTracks', albumId),
  ymSearchAlbums: (query: string): Promise<Album[]> =>
    ipcRenderer.invoke('ym:searchAlbums', query),
  ymSearchPlaylists: (query: string): Promise<Album[]> =>
    ipcRenderer.invoke('ym:searchPlaylists', query),
  ymPlaylistTracks: (playlistId: string): Promise<Track[]> =>
    ipcRenderer.invoke('ym:playlistTracks', playlistId),
  ymLogin: (): Promise<Artist | null> => ipcRenderer.invoke('ym:login'),
  ymLogout: (): Promise<void> => ipcRenderer.invoke('ym:logout'),
  ymMe: (): Promise<Artist | null> => ipcRenderer.invoke('ym:me'),
  ymIsAuthed: (): Promise<boolean> => ipcRenderer.invoke('ym:isAuthed'),
  ymResolveStream: (trackId: string): Promise<string> =>
    ipcRenderer.invoke('ym:resolveStream', trackId),
  ymMyLikes: (): Promise<Track[]> => ipcRenderer.invoke('ym:myLikes'),
  ymMyWave: (queueId?: string): Promise<{ cover?: string; tracks: Track[] }> =>
    ipcRenderer.invoke('ym:myWave', queueId),
  ymWaveFeedback: (
    type: 'trackStarted' | 'trackFinished',
    trackId: string,
    seconds?: number
  ): Promise<void> => ipcRenderer.invoke('ym:waveFeedback', type, trackId, seconds),

  getLikes: (): Promise<Track[]> => ipcRenderer.invoke('likes:get'),
  toggleLike: (track: Track): Promise<Track[]> => ipcRenderer.invoke('likes:toggle', track),
  addManyLikes: (tracks: Track[]): Promise<Track[]> =>
    ipcRenderer.invoke('likes:addMany', tracks),
  removeProviderLikes: (providerId: Track['providerId']): Promise<Track[]> =>
    ipcRenderer.invoke('likes:removeProvider', providerId),

  // window controls (frameless)
  windowMinimize: (): void => ipcRenderer.send('window:minimize'),
  windowToggleMaximize: (): void => ipcRenderer.send('window:toggleMaximize'),
  windowClose: (): void => ipcRenderer.send('window:close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  pickBackground: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickImage'),
  pickVideo: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickVideo'),
  onWindowMaximized: (cb: (maximized: boolean) => void): (() => void) => {
    const listener = (_e: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('window:maximized', listener)
    return () => ipcRenderer.removeListener('window:maximized', listener)
  },

  getLyrics: (
    title: string,
    artist: string,
    durationSec?: number,
    useGenius?: boolean,
    force?: boolean
  ): Promise<{
    source: string
    synced: boolean
    manual?: boolean
    lines: { timeSec: number; text: string }[]
    plain: string | null
  } | null> => ipcRenderer.invoke('lyrics:get', title, artist, durationSec, useGenius, force),
  clearLyricsCache: (): Promise<void> => ipcRenderer.invoke('lyrics:clearCache'),
  searchByLyrics: (
    query: string
  ): Promise<
    { title: string; artist: string; thumbnail?: string; snippet?: string; url: string }[]
  > => ipcRenderer.invoke('lyrics:search', query),
  getLaunchAtStartup: (): Promise<boolean> => ipcRenderer.invoke('settings:getLaunchAtStartup'),
  setLaunchAtStartup: (enable: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:setLaunchAtStartup', enable),
  getHardwareAcceleration: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:getHardwareAcceleration'),
  setHardwareAcceleration: (enable: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:setHardwareAcceleration', enable),
  relaunchApp: (): Promise<void> => ipcRenderer.invoke('app:relaunch'),
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

  offlineList: (): Promise<string[]> => ipcRenderer.invoke('offline:list'),
  offlineTracks: (): Promise<Track[]> => ipcRenderer.invoke('offline:tracks'),
  offlineDownload: (track: Track): Promise<boolean> =>
    ipcRenderer.invoke('offline:download', track),
  offlineRemove: (trackId: string): Promise<void> => ipcRenderer.invoke('offline:remove', trackId),
  offlineClear: (): Promise<void> => ipcRenderer.invoke('offline:clear'),
  offlineSize: (): Promise<number> => ipcRenderer.invoke('offline:size'),
  offlineLocalUrl: (trackId: string): Promise<string | null> =>
    ipcRenderer.invoke('offline:localUrl', trackId),

  discordGetConfig: (): Promise<{ enabled: boolean; clientId: string }> =>
    ipcRenderer.invoke('discord:getConfig'),
  discordSetConfig: (enabled: boolean, clientId: string): Promise<void> =>
    ipcRenderer.invoke('discord:setConfig', enabled, clientId),
  discordUpdate: (
    activity: {
      title: string
      artist?: string
      album?: string
      artwork?: string
      startedAt?: number
      playing: boolean
    } | null
  ): void => ipcRenderer.send('discord:update', activity),

  getPlaylists: (): Promise<Playlist[]> => ipcRenderer.invoke('playlists:get'),
  createPlaylist: (name: string): Promise<Playlist[]> => ipcRenderer.invoke('playlists:create', name),
  renamePlaylist: (id: string, name: string): Promise<Playlist[]> =>
    ipcRenderer.invoke('playlists:rename', id, name),
  removePlaylist: (id: string): Promise<Playlist[]> => ipcRenderer.invoke('playlists:remove', id),
  addToPlaylist: (id: string, track: Track): Promise<Playlist[]> =>
    ipcRenderer.invoke('playlists:addTrack', id, track),
  addTracksToPlaylist: (id: string, tracks: Track[]): Promise<Playlist[]> =>
    ipcRenderer.invoke('playlists:addTracks', id, tracks),
  removeFromPlaylist: (id: string, trackId: string): Promise<Playlist[]> =>
    ipcRenderer.invoke('playlists:removeTrack', id, trackId)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
