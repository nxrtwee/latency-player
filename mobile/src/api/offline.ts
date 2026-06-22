// Offline downloads. Saves a track's audio to device storage so it plays without
// network. Uses the @capacitor/filesystem native plugin via the global Capacitor
// bridge (no bundle import → no build-order coupling; the native plugin is added
// in mobile/package.json and registered by `cap sync`).
//
// Playback integration: the shared SoundCloud provider resolves a stream URL via
// window.api.scResolveStream(track.uri); the mobile shim first asks
// offlineSrcForUri() — if the track is downloaded, it returns a local file URL
// (Capacitor convertFileSrc) instead of hitting the network. Matching is by the
// track URI minus its query string, since the per-track auth token rotates.
//
// In a desktop browser there is no Filesystem plugin: download just records the
// entry (so the UI works) and playback keeps streaming. Real offline is on device.
import type { Track } from '@shared/types'
import { resolveStream } from './soundcloud'

const KEY = 'lp.m.offline'
const DIR = 'DATA' // Capacitor Directory.Data
const FOLDER = 'offline'

export interface OfflineEntry {
  track: Track // the full track, so it can be played back from the Downloads list
  uriKey: string // track.uri without the query string (stable match key)
  path: string // path under Directory.Data
  size: number // bytes (0 if unknown / browser)
}

interface FileTransferPlugin {
  // Downloads url -> an absolute file path (file:// from Filesystem.getUri),
  // streamed natively to disk, following redirects.
  downloadFile: (o: { url: string; path: string }) => Promise<{ path?: string }>
}
interface CapGlobal {
  isNativePlatform?: () => boolean
  convertFileSrc?: (uri: string) => string
  Plugins?: { Filesystem?: FilesystemPlugin; FileTransfer?: FileTransferPlugin }
}
interface FilesystemPlugin {
  mkdir: (o: { path: string; directory: string; recursive?: boolean }) => Promise<void>
  deleteFile: (o: { path: string; directory: string }) => Promise<void>
  getUri: (o: { path: string; directory: string }) => Promise<{ uri: string }>
  stat: (o: { path: string; directory: string }) => Promise<{ size?: number }>
  // no encoding => returns the file's bytes as a base64 string
  readFile: (o: { path: string; directory: string }) => Promise<{ data: string }>
}

const cap = (): CapGlobal | undefined => (window as unknown as { Capacitor?: CapGlobal }).Capacitor
const isNative = (): boolean => !!cap()?.isNativePlatform?.()
const fs = (): FilesystemPlugin | undefined => cap()?.Plugins?.Filesystem

// HLS tracks can't be saved for offline: resolveStream gives an .m3u8 playlist
// (not a self-contained file), and playback would still fetch segments over the
// network. Only progressive (mp3) transcodings are downloadable.
const isHlsUri = (uri: string): boolean => (uri || '').includes('/stream/hls')

function load(): OfflineEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as OfflineEntry[]
  } catch {
    return []
  }
}
function save(list: OfflineEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* quota — ignore */
  }
}
const uriKey = (uri: string): string => (uri || '').split('?')[0]

export function getDownloads(): OfflineEntry[] {
  return load()
}
export function downloadedTracks(): Track[] {
  return load().map((e) => e.track)
}
export function isDownloaded(id: string): boolean {
  return load().some((e) => e.track.id === id)
}
export function totalBytes(): number {
  return load().reduce((a, e) => a + (e.size || 0), 0)
}

export async function downloadTrack(track: Track): Promise<void> {
  if (!track?.id || isDownloaded(track.id)) return
  const entry: OfflineEntry = {
    track,
    uriKey: uriKey(track.uri),
    path: `${FOLDER}/${track.id}.mp3`,
    size: 0
  }
  const plugin = fs()
  const transfer = cap()?.Plugins?.FileTransfer
  if (isNative() && plugin && transfer) {
    if (isHlsUri(track.uri)) throw new Error('Offline is available for progressive tracks only')
    const url = await resolveStream(track.uri) // resolve to a direct CDN mp3
    // Ensure the offline/ folder exists, then stream the file straight to disk.
    try {
      await plugin.mkdir({ path: FOLDER, directory: DIR, recursive: true })
    } catch {
      /* already exists */
    }
    const { uri: dest } = await plugin.getUri({ path: entry.path, directory: DIR })
    await transfer.downloadFile({ url, path: dest })
    // Verify the download produced a real file so a failure surfaces in the UI
    // instead of being saved as a 0-byte "downloaded" track.
    const st = await plugin.stat({ path: entry.path, directory: DIR })
    entry.size = st.size || 0
    if (!entry.size) throw new Error('offline download produced an empty file')
  }
  save([...load().filter((e) => e.track.id !== track.id), entry])
}

export async function removeDownload(id: string): Promise<void> {
  const entry = load().find((e) => e.track.id === id)
  const plugin = fs()
  if (entry && isNative() && plugin) {
    try {
      await plugin.deleteFile({ path: entry.path, directory: DIR })
    } catch {
      /* already gone — ignore */
    }
  }
  save(load().filter((e) => e.track.id !== id))
}

export async function removeAll(): Promise<void> {
  for (const e of load()) await removeDownload(e.track.id)
}

// base64 -> Blob (chunked to avoid building a huge argument list).
function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

// One live object URL at a time; revoke the previous when a new track resolves.
let lastBlobUrl: string | null = null

// Local playable URL for a track URI, or null to stream over the network.
//
// We read the file's bytes and hand back a `blob:` URL rather than a
// convertFileSrc('http(s)://localhost/_capacitor_file_/…') URL. The latter
// depends on Capacitor's local web server and the app's scheme; on Android it
// silently failed to feed <audio> (so playback fell through to the network and
// only worked online). A blob URL is same-origin, server-independent, plays
// offline reliably — and lets the Web Audio analyser drive a real visualizer.
export async function offlineSrcForUri(uri: string): Promise<string | null> {
  const plugin = fs()
  if (!isNative() || !plugin) return null
  // HLS uris never have a usable local file (older builds may have saved a bare
  // .m3u8); fall through to a network stream.
  if (isHlsUri(uri)) return null
  const entry = load().find((e) => e.uriKey === uriKey(uri))
  if (!entry) return null
  // Primary: blob URL from the file bytes (server/scheme-independent).
  try {
    const { data } = await plugin.readFile({ path: entry.path, directory: DIR })
    if (data) {
      if (lastBlobUrl) {
        try {
          URL.revokeObjectURL(lastBlobUrl)
        } catch {
          /* ignore */
        }
      }
      lastBlobUrl = URL.createObjectURL(base64ToBlob(data, 'audio/mpeg'))
      return lastBlobUrl
    }
  } catch {
    /* fall through to convertFileSrc */
  }
  // Fallback: convertFileSrc via Capacitor's local web server.
  try {
    const conv = cap()?.convertFileSrc
    if (!conv) return null
    const { uri: fileUri } = await plugin.getUri({ path: entry.path, directory: DIR })
    return conv(fileUri)
  } catch {
    return null
  }
}

// Try to actually load a URL in an <audio> element and report whether this
// device's WebView can play it. Resolves to 'OK', 'err code=N', or 'timeout'.
function probeUrl(url: string): Promise<string> {
  return new Promise((resolve) => {
    const a = new Audio()
    let done = false
    const finish = (s: string): void => {
      if (done) return
      done = true
      try {
        a.removeAttribute('src')
        a.load()
      } catch {
        /* ignore */
      }
      resolve(s)
    }
    const to = setTimeout(() => finish('timeout'), 5000)
    a.addEventListener('canplay', () => {
      clearTimeout(to)
      finish('OK')
    })
    a.addEventListener('error', () => {
      clearTimeout(to)
      finish(`err code=${a.error?.code ?? '?'}`)
    })
    try {
      a.src = url
      a.load()
    } catch (e) {
      clearTimeout(to)
      finish(`throw ${String(e).slice(0, 30)}`)
    }
  })
}

// Human-readable status of the offline pipeline for the first downloaded track —
// surfaced in the Downloads screen so on-device issues are diagnosable without a
// debugger. Walks the same steps playback uses AND probes whether the WebView can
// actually play each candidate URL form (blob vs convertFileSrc).
export async function offlineDiagnostics(): Promise<string> {
  const c = cap()
  const plugin = fs()
  const out: string[] = []
  out.push(`native=${isNative()} fs=${!!plugin} ft=${!!c?.Plugins?.FileTransfer} cfs=${!!c?.convertFileSrc}`)
  const entries = load()
  out.push(`entries=${entries.length}`)
  const e = entries[0]
  if (!e || !plugin) return out.join('\n')
  out.push(`isHls=${isHlsUri(e.track.uri)} size=${e.size}`)

  // blob path
  try {
    const { data } = await plugin.readFile({ path: e.path, directory: DIR })
    out.push(`readFile.len=${data ? data.length : 0}`)
    if (data) {
      const burl = URL.createObjectURL(base64ToBlob(data, 'audio/mpeg'))
      out.push(`blob play: ${await probeUrl(burl)}`)
      URL.revokeObjectURL(burl)
    }
  } catch (err) {
    out.push(`readFile ERR: ${String(err).slice(0, 60)}`)
  }

  // convertFileSrc path
  try {
    const conv = c?.convertFileSrc
    if (conv) {
      const { uri } = await plugin.getUri({ path: e.path, directory: DIR })
      const curl = conv(uri)
      out.push(`cfs=${curl.slice(0, 30)}`)
      out.push(`cfs play: ${await probeUrl(curl)}`)
    }
  } catch (err) {
    out.push(`cfs ERR: ${String(err).slice(0, 60)}`)
  }
  return out.join('\n')
}
