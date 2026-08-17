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
import { resolveStream as scResolveStream } from './soundcloud'
import { resolveStream as ymResolveStream } from './yandex'
import { base64ToBlob, convertSrc, DATA_DIR, fsPlugin, isNative, transferPlugin } from './capfs'

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
  // Local (convertFileSrc) URL of the cached cover. Used for the media
  // notification when offline — loading the remote artwork natively with no
  // network crashes the app, so downloaded tracks point the OS at the local copy.
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

// Local (convertFileSrc) cover URL for a downloaded track, or null. The media
// notification uses this when available so the OS never fetches the remote
// artwork (a native load with no network crashes the app).
export function offlineArtForUri(uri: string): string | null {
  const entry = load().find((e) => e.uriKey === uriKey(uri))
  return entry?.artLocal || null
}

// base64 -> Blob and the Capacitor plumbing live in capfs.ts (shared with the
// imported-tracks store in localfiles.ts).

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
    const conv = convertSrc()
    if (!conv) return null
    const { uri: fileUri } = await plugin.getUri({ path: entry.path, directory: DIR })
    return conv(fileUri)
  } catch {
    return null
  }
}
