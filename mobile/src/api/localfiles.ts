// Local files on mobile. There's no filesystem scan in a sandboxed WebView, so
// the user imports tracks via a file picker (see pickAudioFiles below, wired to
// window.api.addFolder in shim.ts — the desktop's "add music folder" button).
//
// Two layers, because a WebView loses everything on reload:
//   • session — the picked File's blob: URL, kept in a Map by track id. Same-origin,
//     so the Web Audio analyser (and the live waveform) works, unlike cross-origin
//     SoundCloud.
//   • device — on a native build the bytes are COPIED into Directory.Data/local,
//     so the library is still there (and still playable) after a restart. In a
//     desktop browser there is no Filesystem plugin: only the metadata persists and
//     the tracks come back flagged unavailable until re-imported.
import type { Track } from '@shared/types'
import {
  base64ToBlob,
  blobToBase64,
  DATA_DIR,
  fsPlugin,
  isNative,
  MAX_BRIDGE_BYTES,
  streamUrlFor
} from './capfs'
import { md5 } from './md5'
import { isNativeAudioAvailable } from './nativeAudio'
import { pickFiles } from './picker'

// id -> playable URL for this session: the object URL of a file picked now, or
// whatever resolveUrl() worked out for a copy already on disk (a local-server
// stream URL, or a blob read back from it).
const blobs = new Map<string, string>()

export function getBlobUrl(id: string): string | undefined {
  return blobs.get(id)
}

const META_KEY = 'lp.m.local'
const FOLDER = 'local'

/** Persisted, lightweight metadata (no blobs — those live for the session). */
interface LocalMeta {
  id: string
  title: string
  artist?: string
  durationSec?: number
  // Path under Directory.Data of the copied file, when the import ran on a native
  // build. Absent => session-only import (browser), so it dies with the reload.
  path?: string
  mime?: string
}

function readMeta(): LocalMeta[] {
  try {
    const raw = localStorage.getItem(META_KEY)
    return raw ? (JSON.parse(raw) as LocalMeta[]) : []
  } catch {
    return []
  }
}
function writeMeta(list: LocalMeta[]): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(list))
  } catch {
    /* non-fatal */
  }
}

/** Probe a media file's duration by loading its metadata off a temp element. */
function probeDuration(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const a = document.createElement('audio')
    a.preload = 'metadata'
    a.src = url
    const done = (v: number | undefined): void => {
      a.removeAttribute('src')
      resolve(v)
    }
    a.addEventListener('loadedmetadata', () => done(Number.isFinite(a.duration) ? a.duration : undefined))
    a.addEventListener('error', () => done(undefined))
    setTimeout(() => done(undefined), 4000)
  })
}

/** Strip an extension and tidy a filename into a display title. */
function titleFromName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim()
}

const AUDIO_RE = /\.(mp3|m4a|flac|wav|ogg|oga|aac|opus|weba)$/i

/** Extension of a filename, lowercased, without the dot ('mp3' by default). */
function extOf(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : 'mp3'
}

/**
 * Copy an imported file into app storage so it survives a restart. The track id
 * is not filename-safe (it embeds the original name), hence the md5.
 * Returns the path under Directory.Data, or undefined when there's no native
 * filesystem (desktop browser) or the write failed — the import still works for
 * the session in that case.
 */
async function persist(id: string, file: File): Promise<string | undefined> {
  const plugin = fsPlugin()
  if (!isNative() || !plugin) return undefined
  const path = `${FOLDER}/${md5(id)}.${extOf(file.name)}`
  try {
    try {
      await plugin.mkdir({ path: FOLDER, directory: DATA_DIR, recursive: true })
    } catch {
      /* already exists */
    }
    await plugin.writeFile({ path, directory: DATA_DIR, data: await blobToBase64(file), recursive: true })
    const st = await plugin.stat({ path, directory: DATA_DIR })
    if (!st.size) return undefined
    return path
  } catch {
    return undefined
  }
}

/**
 * Import picked files into the session. Returns Track objects ready for the
 * queue; their blob URLs are registered for the 'local' provider to resolve.
 */
export async function importFiles(files: FileList | File[]): Promise<Track[]> {
  const out: Track[] = []
  const meta = readMeta()
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('audio') && !AUDIO_RE.test(file.name)) continue
    const id = `local:${file.name}:${file.size}`
    const url = URL.createObjectURL(file)
    blobs.set(id, url)
    const durationSec = await probeDuration(url)
    // "Artist - Title" is the common filename convention; the spaces around the
    // dash are required, so a hyphenated name ("no-artist-here") stays a title.
    // There is no tag reader on this path — the desktop's scanner is Node-only.
    const base = titleFromName(file.name)
    let title = base
    let artist: string | undefined
    const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/)
    if (m) {
      artist = m[1].trim()
      title = m[2].trim()
    }
    out.push({ id, providerId: 'local', uri: url, title, artist, durationSec })
    const path = await persist(id, file)
    const row: LocalMeta = { id, title, artist, durationSec, path, mime: file.type || undefined }
    const at = meta.findIndex((x) => x.id === id)
    if (at >= 0) meta[at] = row
    else meta.push(row)
  }
  writeMeta(meta)
  return out
}

/**
 * Tracks known from previous sessions. On a native build their bytes are still on
 * disk, so they play straight away (resolveUrl reads them lazily); in a browser
 * the blobs are gone after a reload, so they come back unavailable and the player
 * prompts a re-import. Either way we surface them, so the user's library doesn't
 * look empty.
 */
export function getKnownLocal(): Track[] {
  return readMeta().map((m) => ({
    id: m.id,
    providerId: 'local',
    uri: blobs.get(m.id) ?? '',
    title: m.title,
    artist: m.artist,
    durationSec: m.durationSec
  }))
}

/**
 * A playable URL for an imported track: the session blob if it's still live,
 * otherwise the persisted copy. Preferably streamed from Capacitor's local file
 * server (nothing crosses the JS bridge — reading a whole media file through it
 * takes the Android WebView down, see capfs.MAX_BRIDGE_BYTES); a blob read is the
 * fallback, and the only option on iOS, where the native AVPlayer needs the bytes.
 * Null when the file is gone.
 */
export async function resolveUrl(id: string): Promise<string | null> {
  const live = blobs.get(id)
  if (live) return live
  const entry = readMeta().find((m) => m.id === id)
  const plugin = fsPlugin()
  if (!entry?.path || !plugin) return null
  // iOS plays through a native AVPlayer that needs the bytes whatever their size;
  // everything else streams, and only reads a file small enough to be safe.
  const needsBytes = isNativeAudioAvailable()
  if (!needsBytes) {
    const streamed = await streamUrlFor(entry.path)
    // Cached like a blob URL: it stays valid for the session, and re-resolving
    // would re-probe the server on every replay.
    if (streamed) {
      blobs.set(id, streamed)
      return streamed
    }
  }
  try {
    if (!needsBytes) {
      const st = await plugin.stat({ path: entry.path, directory: DATA_DIR }).catch(() => null)
      if (st?.size && st.size > MAX_BRIDGE_BYTES) return null
    }
    const { data } = await plugin.readFile({ path: entry.path, directory: DATA_DIR })
    if (!data) return null
    const url = URL.createObjectURL(base64ToBlob(data, entry.mime || 'audio/mpeg'))
    // Cache it for the session: re-reading a whole file through the bridge on
    // every replay is expensive, and the URL stays valid until the page reloads.
    blobs.set(id, url)
    return url
  } catch {
    return null
  }
}

/** Forget one imported track (and delete its copy on disk). */
export async function removeLocal(id: string): Promise<void> {
  const entry = readMeta().find((m) => m.id === id)
  const url = blobs.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    blobs.delete(id)
  }
  const plugin = fsPlugin()
  if (entry?.path && plugin) {
    try {
      await plugin.deleteFile({ path: entry.path, directory: DATA_DIR })
    } catch {
      /* already gone */
    }
  }
  writeMeta(readMeta().filter((m) => m.id !== id))
}

export async function clearLocal(): Promise<void> {
  for (const m of readMeta()) await removeLocal(m.id)
  for (const url of blobs.values()) URL.revokeObjectURL(url)
  blobs.clear()
  localStorage.removeItem(META_KEY)
}

/**
 * Open the system file picker and resolve with the audio files the user chose
 * (empty when they cancel). See picker.ts for why a hidden input is the only
 * option here and how a cancel is detected.
 */
export function pickAudioFiles(): Promise<File[]> {
  return pickFiles('audio/*', true)
}
