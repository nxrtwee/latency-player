// Offline downloads. Saves a track's audio to device storage so it plays without
// network. Uses the @capacitor/filesystem native plugin via the global Capacitor
// bridge (no bundle import → no build-order coupling; the native plugin is added
// in mobile/package.json and registered by `cap sync`).
//
// Playback integration: the shared SoundCloud provider resolves a stream URL via
// window.api.scResolveStream(track.uri); the mobile shim first asks
// offlineSrcForUri() — if the track is downloaded, it returns a local URL (served
// by Capacitor's local file server, or a blob: on iOS — see that function)
// instead of hitting the network. Matching is by the track URI minus its query
// string, since the per-track auth token rotates.
//
// In a desktop browser there is no Filesystem plugin: download just records the
// entry (so the UI works) and playback keeps streaming. Real offline is on device.
import type { Track } from '@shared/types'
import { resolveStream as scResolveStream } from './soundcloud'
import { resolveStream as ymResolveStream } from './yandex'
import {
  base64ToBlob,
  convertSrc,
  DATA_DIR,
  fsPlugin,
  isNative,
  MAX_BRIDGE_BYTES,
  streamUrlFor,
  toFileUri,
  transferPlugin
} from './capfs'
import { isNativeAudioAvailable } from './nativeAudio'

/** Resolve a track's direct CDN URL using its provider's resolver. */
function resolveStream(track: Track): Promise<string> {
  return track.providerId === 'yandex'
    ? ymResolveStream(track.uri)
    : scResolveStream(track.uri)
}

const KEY = 'lp.m.offline'
const DIR = DATA_DIR // Capacitor Directory.Data
const FOLDER = 'offline'

export interface OfflineEntry {
  track: Track // the full track, so it can be played back from the Downloads list
  uriKey: string // track.uri without the query string (stable match key)
  path: string // path under Directory.Data
  size: number // bytes (0 if unknown / browser)
  // Local (convertFileSrc) URL of the cached cover, so a downloaded track shows
  // its artwork with no network — in the app, and on the lock screen (the OS is
  // pointed at the local copy; see offlineArtForUri / offlineArtFileForUri).
  artLocal?: string
}

const fs = fsPlugin

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
  const transfer = transferPlugin()
  if (isNative() && plugin && transfer) {
    if (isHlsUri(track.uri)) throw new Error('Offline is available for progressive tracks only')
    const url = await resolveStream(track) // resolve to a direct CDN mp3 (per provider)
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
    // Best-effort: cache the cover locally too, so both the media notification
    // and the in-app UI (Downloads list, Now Playing) show a cover offline —
    // fetching the remote artwork natively with no network crashes the app.
    const conv = convertSrc()
    if (track.artwork && conv) {
      try {
        const artPath = `${FOLDER}/${track.id}.jpg`
        const { uri: artDest } = await plugin.getUri({ path: artPath, directory: DIR })
        await transfer.downloadFile({ url: track.artwork, path: artDest })
        entry.artLocal = conv(artDest)
        // Point the stored track at the local cover so it renders without network.
        entry.track = { ...track, artwork: entry.artLocal }
      } catch {
        /* cover is optional */
      }
    }
  }
  save([...load().filter((e) => e.track.id !== track.id), entry])
}

export async function removeDownload(id: string): Promise<void> {
  const entry = load().find((e) => e.track.id === id)
  const plugin = fs()
  if (entry) forgetBlob(entry.uriKey)
  if (entry && isNative() && plugin) {
    try {
      await plugin.deleteFile({ path: entry.path, directory: DIR })
    } catch {
      /* already gone — ignore */
    }
    try {
      await plugin.deleteFile({ path: `${FOLDER}/${id}.jpg`, directory: DIR })
    } catch {
      /* no cover — ignore */
    }
  }
  save(load().filter((e) => e.track.id !== id))
}

export async function removeAll(): Promise<void> {
  for (const e of load()) await removeDownload(e.track.id)
}

// Local (convertFileSrc) cover URL for a downloaded track, or null. Used by the
// WebView — the in-app UI and the iOS lock screen, which gets the artwork through
// the WKWebView-hosted bridge.
export function offlineArtForUri(uri: string): string | null {
  const entry = load().find((e) => e.uriKey === uriKey(uri))
  return entry?.artLocal || null
}

/**
 * The same cover as a `file://` URI, for code that loads it OUTSIDE the WebView —
 * Android's media notification is drawn by a native plugin, which cannot reach the
 * local-server form (see capfs.toFileUri).
 */
export function offlineArtFileForUri(uri: string): string | null {
  const art = offlineArtForUri(uri)
  return art ? toFileUri(art) : null
}

// base64 -> Blob and the Capacitor plumbing live in capfs.ts (shared with the
// imported-tracks store in localfiles.ts).

// Blob URLs handed out for downloaded files, by uriKey. A few are kept alive on
// purpose: the neighbour prefetch (resolveCache.ts) resolves other downloaded
// tracks while one is playing, and revoking a single "last" URL there is what
// pulled the source out from under the playing track. Replaying a track reuses
// its URL instead of reading the file again.
const blobUrls = new Map<string, string>()
const MAX_BLOBS = 3

function rememberBlob(key: string, url: string): string {
  blobUrls.set(key, url)
  while (blobUrls.size > MAX_BLOBS) {
    const oldest = blobUrls.keys().next().value
    if (oldest === undefined) break
    const stale = blobUrls.get(oldest)
    blobUrls.delete(oldest)
    if (stale) {
      try {
        URL.revokeObjectURL(stale)
      } catch {
        /* ignore */
      }
    }
  }
  return url
}

function forgetBlob(key: string): void {
  const url = blobUrls.get(key)
  blobUrls.delete(key)
  if (url) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* ignore */
    }
  }
}

// Local playable URL for a track URI, or null to stream over the network.
//
// Two ways to play a file that is already on the device:
//   • stream it from Capacitor's own local server (streamUrlFor) — the bytes go
//     straight into the media stack, nothing crosses the JS bridge. This is the
//     path Android takes: reading a whole MP3 through the bridge cost tens of
//     megabytes of Java heap and killed the WebView (see MAX_BRIDGE_BYTES), which
//     is the crash this function used to cause on every launch once the restored
//     session pointed at a downloaded track.
//   • read the bytes and hand back a `blob:` URL. iOS needs this: playback there
//     is a native AVPlayer that gets the audio as base64 (nativeAudio.ts) and
//     cannot reach a WKWebView-internal URL scheme. It is also the fallback if the
//     local server turns out not to serve files — capped at MAX_BRIDGE_BYTES,
//     because failing to play is recoverable and crashing is not.
// Either URL is same-origin, so the Web Audio graph (equalizer, visualizer) still
// attaches to it.
export async function offlineSrcForUri(uri: string): Promise<string | null> {
  const plugin = fs()
  if (!isNative() || !plugin) return null
  // HLS uris never have a usable local file (older builds may have saved a bare
  // .m3u8); fall through to a network stream.
  if (isHlsUri(uri)) return null
  const key = uriKey(uri)
  const entry = load().find((e) => e.uriKey === key)
  if (!entry) return null

  // iOS hands the audio to a native AVPlayer as base64, so there the bytes have to
  // come through no matter their size. Everything else plays through <audio> and
  // streams instead — and only falls back to a read for a file small enough to be
  // safe (see MAX_BRIDGE_BYTES).
  const needsBytes = isNativeAudioAvailable()
  if (!needsBytes) {
    const streamed = await streamUrlFor(entry.path)
    if (streamed) return streamed
  }

  const cached = blobUrls.get(key)
  if (cached) return cached
  if (!needsBytes && entry.size > MAX_BRIDGE_BYTES) return null
  try {
    const { data } = await plugin.readFile({ path: entry.path, directory: DIR })
    if (data) return rememberBlob(key, URL.createObjectURL(base64ToBlob(data, 'audio/mpeg')))
  } catch {
    /* unreadable — fall through to the network */
  }
  return null
}
