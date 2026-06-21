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

interface CapacitorHttpPlugin {
  request: (o: {
    url: string
    method: string
    responseType?: string
    headers?: Record<string, string>
  }) => Promise<{ data: unknown; status: number }>
}
interface CapGlobal {
  isNativePlatform?: () => boolean
  convertFileSrc?: (uri: string) => string
  Plugins?: { Filesystem?: FilesystemPlugin; CapacitorHttp?: CapacitorHttpPlugin }
}
interface FilesystemPlugin {
  // base64 `data` (no encoding) is written as binary; recursive creates folders
  writeFile: (o: { path: string; directory: string; data: string; recursive?: boolean }) => Promise<unknown>
  deleteFile: (o: { path: string; directory: string }) => Promise<void>
  getUri: (o: { path: string; directory: string }) => Promise<{ uri: string }>
  stat: (o: { path: string; directory: string }) => Promise<{ size?: number }>
}

const cap = (): CapGlobal | undefined => (window as unknown as { Capacitor?: CapGlobal }).Capacitor
const isNative = (): boolean => !!cap()?.isNativePlatform?.()
const fs = (): FilesystemPlugin | undefined => cap()?.Plugins?.Filesystem

// Download binary audio natively. CapacitorHttp follows the SoundCloud CDN
// redirects and returns the body base64-encoded (responseType 'blob') on both
// platforms — unlike the deprecated Filesystem.downloadFile, which didn't
// reliably save the file on Android.
async function fetchBinaryBase64(url: string): Promise<string> {
  const http = cap()?.Plugins?.CapacitorHttp
  if (!http) throw new Error('CapacitorHttp unavailable')
  const res = await http.request({ url, method: 'GET', responseType: 'blob' })
  if (res.status >= 400) throw new Error(`offline download failed (${res.status})`)
  if (typeof res.data !== 'string' || !res.data) throw new Error('offline download: empty body')
  return res.data
}

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
  if (isNative() && plugin) {
    const url = await resolveStream(track.uri) // resolve to a direct CDN mp3
    const base64 = await fetchBinaryBase64(url)
    await plugin.writeFile({ path: entry.path, directory: DIR, data: base64, recursive: true })
    // Verify the write produced a real file so a failed download surfaces in the
    // UI instead of being saved as a 0-byte "downloaded" track.
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

// Local playable URL for a track URI, or null to stream over the network.
export async function offlineSrcForUri(uri: string): Promise<string | null> {
  const c = cap()
  const plugin = fs()
  if (!isNative() || !plugin || !c?.convertFileSrc) return null
  const entry = load().find((e) => e.uriKey === uriKey(uri))
  if (!entry) return null
  try {
    const { uri: fileUri } = await plugin.getUri({ path: entry.path, directory: DIR })
    return c.convertFileSrc(fileUri)
  } catch {
    return null
  }
}
