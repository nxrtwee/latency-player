import { app, BrowserWindow, dialog, ipcMain, protocol, net } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { pathToFileURL } from 'url'
import * as library from './library'
import * as soundcloud from './soundcloud'
import * as yandex from './yandex'
import * as likes from './likes'
import * as playlists from './playlists'
import * as lyrics from './lyrics'
import * as discord from './discord'
import * as offline from './offline'
import type { Track } from '../shared/types'

// Branding: display name is "Latency", but pin userData to a stable path so the
// rename doesn't orphan existing data (likes, playlists, SoundCloud auth).
process.title = 'Latency'
app.setPath('userData', join(app.getPath('appData'), 'latency-player'))
app.setName('Latency')
// Identify the app to Windows so the system media overlay (SMTC) labels playback
// as "Latency" instead of "unknown application". Must match build.appId.
app.setAppUserModelId('com.latency.app')

// Small startup prefs file (read synchronously before the app is ready, which
// some Chromium switches require). Kept separate from the renderer's
// localStorage because those decisions must be made before any window exists.
const prefsPath = join(app.getPath('userData'), 'prefs.json')
function readPrefs(): { hwAccel?: boolean } {
  try {
    return JSON.parse(readFileSync(prefsPath, 'utf-8'))
  } catch {
    return {}
  }
}
// Hardware acceleration: default on. If the user turned it off (Settings →
// needs restart), disable Chromium's GPU compositor before ready — this stops
// the GPU from being driven every frame (cuts load / keeps weak cards from
// revving to max clocks), at the cost of more CPU for software compositing.
if (readPrefs().hwAccel === false) app.disableHardwareAcceleration()

// Dev-only: expose a CDP endpoint for screenshot/inspection tooling.
if (!app.isPackaged && process.env.LP_CDP) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.LP_CDP)
  app.commandLine.appendSwitch('remote-allow-origins', '*')
}

// Register our media scheme as privileged BEFORE the app is ready, so the
// renderer can fetch/stream local files through it with fetch + range support.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
])

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1500,
    height: 900,
    // Floor sized so the three-column layout + resizers never overlap.
    minWidth: 1280,
    minHeight: 800,
    title: 'Latency',
    // Windows: multi-size .ico so the taskbar / Alt-Tab gets a crisp 16/24/32 px
    // bitmap instead of badly downscaling the 1030px PNG (see build/make-ico.cjs).
    // Linux: .ico isn't a valid window icon — feed the PNG directly. (macOS ignores
    // this and uses the bundle's .icns.)
    icon: join(__dirname, process.platform === 'linux' ? '../../build/icon.png' : '../../build/icon.ico'),
    backgroundColor: '#080b0a',
    autoHideMenuBar: true,
    frame: false, // custom title bar / window controls in the renderer
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  const sendMaximized = (): void =>
    win.webContents.send('window:maximized', win.isMaximized())
  win.on('maximize', sendMaximized)
  win.on('unmaximize', sendMaximized)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerMediaProtocol(): void {
  // Two forms, distinguished by host:
  //   media://local/C:/path/to/song.mp3        -> file:///C:/path/to/song.mp3
  //   media://remote/<encodeURIComponent(url)>  -> proxied https stream (SoundCloud CDN)
  // Both are CORS-cleaned so the renderer can route playback through a Web Audio
  // MediaElementSource (EQ + visualizer) without the browser silencing the output
  // as cross-origin. Bodies stream through as-is, so Range requests / seeking work.
  protocol.handle('media', async (request) => {
    const url = new URL(request.url)
    let target: string
    if (url.host === 'remote') {
      // The full https URL is percent-encoded into the path.
      target = decodeURIComponent(url.pathname.replace(/^\//, ''))
    } else {
      const rawPath = decodeURIComponent(url.pathname).replace(/^\//, '')
      target = pathToFileURL(rawPath).toString()
    }
    const res = await net.fetch(target, { headers: request.headers })
    const headers = new Headers(res.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Access-Control-Expose-Headers', '*')
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers
    })
  })
}

function registerIpc(): void {
  ipcMain.handle('library:get', () => library.getState())

  ipcMain.handle('library:rescan', () => library.rescan())

  ipcMain.handle('library:addFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Add music folder',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return library.getState()
    }
    return library.addFolder(result.filePaths[0])
  })

  ipcMain.handle('library:removeFolder', (_e, folder: string) => library.removeFolder(folder))

  ipcMain.handle('sc:search', (_e, query: string) => soundcloud.search(query))
  ipcMain.handle('sc:searchUsers', (_e, query: string) => soundcloud.searchUsers(query))
  ipcMain.handle('sc:searchAlbums', (_e, query: string) => soundcloud.searchAlbums(query))
  ipcMain.handle('sc:searchPlaylists', (_e, query: string) => soundcloud.searchPlaylists(query))
  ipcMain.handle('sc:user', (_e, userId: string) => soundcloud.getUser(userId))
  ipcMain.handle('sc:userTracks', (_e, userId: string) => soundcloud.getUserTracks(userId))
  ipcMain.handle('sc:userAlbums', (_e, userId: string) => soundcloud.getUserAlbums(userId))
  ipcMain.handle('sc:albumTracks', (_e, albumId: string) => soundcloud.getAlbumTracks(albumId))
  ipcMain.handle('sc:related', (_e, trackId: string) => soundcloud.relatedTracks(trackId))
  ipcMain.handle('sc:relatedArtists', (_e, trackId: string) => soundcloud.relatedArtists(trackId))
  ipcMain.handle('sc:comments', (_e, trackId: string) => soundcloud.getComments(trackId))
  ipcMain.handle('sc:login', () => soundcloud.login())
  ipcMain.handle('sc:logout', () => soundcloud.logout())
  ipcMain.handle('sc:me', () => soundcloud.getMe())
  ipcMain.handle('sc:isAuthed', () => soundcloud.isAuthed())
  ipcMain.handle('sc:myLikes', () => soundcloud.getMyLikes())
  ipcMain.handle('sc:personalMixes', () => soundcloud.getPersonalMixes())
  ipcMain.handle('sc:resolveStream', (_e, transcodingUrl: string) =>
    soundcloud.resolveStream(transcodingUrl)
  )

  ipcMain.handle('ym:search', (_e, query: string) => yandex.search(query))
  ipcMain.handle('ym:searchArtists', (_e, query: string) => yandex.searchArtists(query))
  ipcMain.handle('ym:searchAlbums', (_e, query: string) => yandex.searchAlbums(query))
  ipcMain.handle('ym:searchPlaylists', (_e, query: string) => yandex.searchPlaylists(query))
  ipcMain.handle('ym:playlistTracks', (_e, playlistId: string) =>
    yandex.getPlaylistTracks(playlistId)
  )
  ipcMain.handle('ym:artist', (_e, artistId: string) => yandex.getArtist(artistId))
  ipcMain.handle('ym:artistTracks', (_e, artistId: string) => yandex.getArtistTracks(artistId))
  ipcMain.handle('ym:similarArtists', (_e, artistId: string) => yandex.getSimilarArtists(artistId))
  ipcMain.handle('ym:artistAlbums', (_e, artistId: string) => yandex.getArtistAlbums(artistId))
  ipcMain.handle('ym:albumTracks', (_e, albumId: string) => yandex.getAlbumTracks(albumId))
  ipcMain.handle('ym:login', () => yandex.login())
  ipcMain.handle('ym:logout', () => yandex.logout())
  ipcMain.handle('ym:me', () => yandex.getMe())
  ipcMain.handle('ym:isAuthed', () => yandex.isAuthed())
  ipcMain.handle('ym:resolveStream', (_e, trackId: string) => yandex.resolveStream(trackId))
  ipcMain.handle('ym:myLikes', () => yandex.getMyLikes())
  ipcMain.handle('ym:myWave', (_e, queueId?: string) => yandex.getMyWave(queueId))
  ipcMain.handle('ym:stationWave', (_e, stationId: string, queueId?: string) =>
    yandex.getStationTracks(stationId, queueId)
  )
  ipcMain.handle('ym:artistWave', (_e, artistId: string, queueId?: string) =>
    yandex.getArtistWave(artistId, queueId)
  )
  ipcMain.handle('ym:trackWave', (_e, trackId: string, queueId?: string) =>
    yandex.getTrackWave(trackId, queueId)
  )
  ipcMain.handle(
    'ym:waveFeedback',
    (_e, stationId: string, type: 'trackStarted' | 'trackFinished', trackId: string, seconds?: number) =>
      yandex.waveTrackFeedback(stationId, type, trackId, seconds)
  )

  ipcMain.handle('likes:get', () => likes.getLikes())
  ipcMain.handle('likes:toggle', (_e, track: Track) => likes.toggle(track))
  ipcMain.handle('likes:addMany', (_e, tracks: Track[]) => likes.addMany(tracks))
  ipcMain.handle('likes:removeProvider', (_e, providerId: Track['providerId']) =>
    likes.removeByProvider(providerId)
  )

  ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window:toggleMaximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.handle('window:isMaximized', (e) =>
    BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  )

  ipcMain.handle('settings:getLaunchAtStartup', () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle('settings:setLaunchAtStartup', (_e, enable: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enable })
  })

  ipcMain.handle('settings:getHardwareAcceleration', () => readPrefs().hwAccel !== false)
  ipcMain.handle('settings:setHardwareAcceleration', (_e, enable: boolean) => {
    const prefs = readPrefs()
    prefs.hwAccel = enable
    try {
      writeFileSync(prefsPath, JSON.stringify(prefs))
    } catch {
      /* ignore */
    }
  })
  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })
  ipcMain.handle('lyrics:clearCache', () => lyrics.clearCache())
  ipcMain.handle('lyrics:search', (_e, query: string) => lyrics.searchByLyrics(query))

  ipcMain.handle('dialog:pickImage', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Choose background image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const fileUrl = pathToFileURL(r.filePaths[0])
    return 'media://local/' + fileUrl.pathname.replace(/^\//, '')
  })

  ipcMain.handle('dialog:pickVideo', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Choose background video',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'mkv', 'm4v'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const fileUrl = pathToFileURL(r.filePaths[0])
    return 'media://local/' + fileUrl.pathname.replace(/^\//, '')
  })

  ipcMain.handle(
    'lyrics:get',
    (_e, title: string, artist: string, durationSec?: number, useGenius?: boolean, force?: boolean) =>
      lyrics.fetchLyrics(title, artist, durationSec, useGenius, force)
  )
  ipcMain.handle(
    'lyrics:hasManual',
    (_e, title: string, artist: string, durationSec?: number) =>
      lyrics.hasManualSync(title, artist, durationSec)
  )
  ipcMain.handle(
    'lyrics:saveManual',
    (_e, title: string, artist: string, durationSec: number | undefined, lines) =>
      lyrics.saveManualSync(title, artist, durationSec, lines)
  )
  ipcMain.handle(
    'lyrics:deleteManual',
    (_e, title: string, artist: string, durationSec?: number) =>
      lyrics.deleteManualSync(title, artist, durationSec)
  )

  ipcMain.handle('offline:list', () => offline.listIds())
  ipcMain.handle('offline:tracks', () => offline.listTracks())
  ipcMain.handle('offline:download', (_e, track: Track) => offline.download(track))
  ipcMain.handle('offline:remove', (_e, trackId: string) => offline.remove(trackId))
  ipcMain.handle('offline:clear', () => offline.clear())
  ipcMain.handle('offline:size', () => offline.totalSize())
  ipcMain.handle('offline:localUrl', (_e, trackId: string) => offline.localUrl(trackId))

  ipcMain.handle('discord:getConfig', () => discord.getConfig())
  ipcMain.handle('discord:setConfig', (_e, enabled: boolean, clientId: string) =>
    discord.setConfig(enabled, clientId)
  )
  ipcMain.on('discord:update', (_e, activity: discord.DiscordActivity | null) =>
    discord.update(activity)
  )

  ipcMain.handle('playlists:get', () => playlists.getAll())
  ipcMain.handle('playlists:create', (_e, name: string) => playlists.create(name))
  ipcMain.handle('playlists:rename', (_e, id: string, name: string) => playlists.rename(id, name))
  ipcMain.handle('playlists:remove', (_e, id: string) => playlists.remove(id))
  ipcMain.handle('playlists:addTrack', (_e, id: string, track: Track) =>
    playlists.addTrack(id, track)
  )
  ipcMain.handle('playlists:addTracks', (_e, id: string, tracks: Track[]) =>
    playlists.addTracks(id, tracks)
  )
  ipcMain.handle('playlists:removeTrack', (_e, id: string, trackId: string) =>
    playlists.removeTrack(id, trackId)
  )
}

app.whenReady().then(async () => {
  registerMediaProtocol()
  registerIpc()
  await library.loadState()
  await soundcloud.init()
  await yandex.init()
  await likes.init()
  await playlists.init()
  await discord.init()
  await offline.init()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
