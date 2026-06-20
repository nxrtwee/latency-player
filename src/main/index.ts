import { app, BrowserWindow, dialog, ipcMain, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import * as library from './library'
import * as soundcloud from './soundcloud'
import * as likes from './likes'
import * as playlists from './playlists'
import * as lyrics from './lyrics'
import type { Track } from '../shared/types'

// Branding: display name is "Latency", but pin userData to a stable path so the
// rename doesn't orphan existing data (likes, playlists, SoundCloud auth).
process.title = 'Latency'
app.setPath('userData', join(app.getPath('appData'), 'latency-player'))
app.setName('Latency')

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
    icon: join(__dirname, '../../build/icon.png'),
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
  // media://local/C:/path/to/song.mp3  ->  file:///C:/path/to/song.mp3
  protocol.handle('media', async (request) => {
    const url = new URL(request.url)
    const rawPath = decodeURIComponent(url.pathname).replace(/^\//, '')
    const fileUrl = pathToFileURL(rawPath).toString()
    const res = await net.fetch(fileUrl, { headers: request.headers })
    // CORS-clean the response so the renderer can route playback through a
    // Web Audio MediaElementSource (for the visualizer) without the browser
    // silencing the output as cross-origin. Body is streamed through as-is, so
    // Range requests / seeking keep working.
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
  ipcMain.handle('sc:user', (_e, userId: string) => soundcloud.getUser(userId))
  ipcMain.handle('sc:userTracks', (_e, userId: string) => soundcloud.getUserTracks(userId))
  ipcMain.handle('sc:related', (_e, trackId: string) => soundcloud.relatedTracks(trackId))
  ipcMain.handle('sc:login', () => soundcloud.login())
  ipcMain.handle('sc:logout', () => soundcloud.logout())
  ipcMain.handle('sc:me', () => soundcloud.getMe())
  ipcMain.handle('sc:isAuthed', () => soundcloud.isAuthed())
  ipcMain.handle('sc:myLikes', () => soundcloud.getMyLikes())
  ipcMain.handle('sc:personalMixes', () => soundcloud.getPersonalMixes())
  ipcMain.handle('sc:resolveStream', (_e, transcodingUrl: string) =>
    soundcloud.resolveStream(transcodingUrl)
  )

  ipcMain.handle('likes:get', () => likes.getLikes())
  ipcMain.handle('likes:toggle', (_e, track: Track) => likes.toggle(track))

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
  ipcMain.handle('lyrics:clearCache', () => lyrics.clearCache())

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

  ipcMain.handle(
    'lyrics:get',
    (_e, title: string, artist: string, durationSec?: number, useGenius?: boolean) =>
      lyrics.fetchLyrics(title, artist, durationSec, useGenius)
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

  ipcMain.handle('playlists:get', () => playlists.getAll())
  ipcMain.handle('playlists:create', (_e, name: string) => playlists.create(name))
  ipcMain.handle('playlists:rename', (_e, id: string, name: string) => playlists.rename(id, name))
  ipcMain.handle('playlists:remove', (_e, id: string) => playlists.remove(id))
  ipcMain.handle('playlists:addTrack', (_e, id: string, track: Track) =>
    playlists.addTrack(id, track)
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
  await likes.init()
  await playlists.init()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
