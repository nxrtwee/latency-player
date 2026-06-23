import { promises as fs } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { app, net } from 'electron'
import type { Track } from '../shared/types'
import * as soundcloud from './soundcloud'

// Offline cache for SoundCloud tracks. We download the resolved progressive MP3
// to userData/offline and remember it in an index keyed by track id. On desktop
// this is mostly a convenience/parity feature (mobile builds already have it).
//
// Only `progressive` streams are cached — HLS would require muxing segments,
// which isn't worth it here. The renderer falls back to streaming for those.

const dir = (): string => join(app.getPath('userData'), 'offline')
const indexFile = (): string => join(dir(), 'index.json')

interface OfflineEntry {
  track: Track
  file: string // absolute path to the downloaded audio
  size: number
  savedAt: number
}

let index: Record<string, OfflineEntry> = {}
let ready = false

async function ensureDir(): Promise<void> {
  if (ready) return
  await fs.mkdir(dir(), { recursive: true })
  ready = true
}

export async function init(): Promise<void> {
  try {
    const raw = await fs.readFile(indexFile(), 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, OfflineEntry>
    index = parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    index = {}
  }
  // Drop entries whose files vanished (manual deletion, etc.).
  let changed = false
  for (const [id, entry] of Object.entries(index)) {
    try {
      await fs.access(entry.file)
    } catch {
      delete index[id]
      changed = true
    }
  }
  if (changed) await persist()
}

async function persist(): Promise<void> {
  try {
    await ensureDir()
    await fs.writeFile(indexFile(), JSON.stringify(index), 'utf-8')
  } catch {
    /* best-effort */
  }
}

/** Track ids that are available offline. */
export function listIds(): string[] {
  return Object.keys(index)
}

/** Full offline track list (for an Offline view, if added later). */
export function listTracks(): Track[] {
  return Object.values(index)
    .sort((a, b) => b.savedAt - a.savedAt)
    .map((e) => e.track)
}

export function isCached(trackId: string): boolean {
  return !!index[trackId]
}

/** Local media:// URL for a cached track, or null when not downloaded. */
export function localUrl(trackId: string): string | null {
  const entry = index[trackId]
  if (!entry) return null
  return 'media://local/' + entry.file.replace(/\\/g, '/').replace(/^\//, '')
}

/**
 * Download a SoundCloud track for offline use. Resolves the transcoding to a CDN
 * URL, fetches the bytes (progressive only), and records it. Returns true on
 * success. Safe to call again — already-cached tracks short-circuit to true.
 */
export async function download(track: Track): Promise<boolean> {
  if (index[track.id]) return true
  if (track.providerId !== 'soundcloud') return false
  // HLS streams aren't downloadable as a single file here.
  if (track.uri.includes('/stream/hls')) return false
  try {
    await ensureDir()
    const streamUrl = await soundcloud.resolveStream(track.uri)
    const res = await net.fetch(streamUrl)
    if (!res.ok) return false
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) return false
    const name = createHash('sha1').update(track.id).digest('hex') + '.mp3'
    const file = join(dir(), name)
    await fs.writeFile(file, buf)
    index[track.id] = { track, file, size: buf.length, savedAt: Date.now() }
    await persist()
    return true
  } catch {
    return false
  }
}

/** Remove a cached track (deletes the file + index entry). */
export async function remove(trackId: string): Promise<void> {
  const entry = index[trackId]
  if (!entry) return
  try {
    await fs.unlink(entry.file)
  } catch {
    /* already gone */
  }
  delete index[trackId]
  await persist()
}

/** Delete every cached track. */
export async function clear(): Promise<void> {
  await Promise.all(Object.keys(index).map((id) => remove(id)))
}

/** Total bytes used by the offline cache. */
export function totalSize(): number {
  return Object.values(index).reduce((sum, e) => sum + (e.size || 0), 0)
}
