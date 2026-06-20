import { promises as fs } from 'fs'
import { join, extname, basename } from 'path'
import { app } from 'electron'
import { pathToFileURL } from 'url'
import { createHash } from 'crypto'
import type { IPicture } from 'music-metadata'
import type { LibraryState, Track } from '../shared/types'

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.wma'
])

const stateFile = (): string => join(app.getPath('userData'), 'library.json')
const coversDir = (): string => join(app.getPath('userData'), 'covers')

let coversReady = false
async function ensureCoversDir(): Promise<void> {
  if (coversReady) return
  await fs.mkdir(coversDir(), { recursive: true })
  coversReady = true
}

/** Cache an embedded cover to disk (deduped by content hash) and return its media:// URL. */
async function cacheCover(pic: IPicture): Promise<string | undefined> {
  try {
    await ensureCoversDir()
    const data = Buffer.from(pic.data)
    const hash = createHash('sha1').update(data).digest('hex')
    const ext = pic.format?.includes('png') ? 'png' : pic.format?.includes('webp') ? 'webp' : 'jpg'
    const file = join(coversDir(), `${hash}.${ext}`)
    try {
      await fs.access(file)
    } catch {
      await fs.writeFile(file, data)
    }
    return toMediaUrl(file)
  } catch {
    return undefined
  }
}

let cache: LibraryState = { folders: [], tracks: [] }

export async function loadState(): Promise<LibraryState> {
  try {
    const raw = await fs.readFile(stateFile(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<LibraryState>
    cache = {
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      tracks: Array.isArray(parsed.tracks) ? parsed.tracks : []
    }
  } catch {
    cache = { folders: [], tracks: [] }
  }
  return cache
}

async function saveState(): Promise<void> {
  await fs.writeFile(stateFile(), JSON.stringify(cache), 'utf-8')
}

export function getState(): LibraryState {
  return cache
}

/** Build a media:// URL the renderer's <audio> can load through our protocol handler. */
function toMediaUrl(filePath: string): string {
  // pathToFileURL handles drive letters, spaces and unicode correctly; we just
  // swap the scheme so it routes through our registered `media` protocol.
  const fileUrl = pathToFileURL(filePath)
  return 'media://local/' + fileUrl.pathname.replace(/^\//, '')
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      yield full
    }
  }
}

async function parseTrack(filePath: string): Promise<Track> {
  const id = toMediaUrl(filePath) // stable + unique per file
  const fallbackTitle = basename(filePath, extname(filePath))
  try {
    // music-metadata is ESM-only; dynamic import keeps it happy in the CJS bundle.
    const { parseFile } = await import('music-metadata')
    const meta = await parseFile(filePath, { duration: true })
    const common = meta.common
    const picture = common.picture?.[0]
    const artwork = picture ? await cacheCover(picture) : undefined
    return {
      id,
      providerId: 'local',
      uri: toMediaUrl(filePath),
      title: common.title || fallbackTitle,
      artist: common.artist,
      album: common.album,
      durationSec: meta.format.duration,
      artwork
    }
  } catch {
    return {
      id,
      providerId: 'local',
      uri: toMediaUrl(filePath),
      title: fallbackTitle
    }
  }
}

/** Rescan all known folders and refresh the cached/persisted track list. */
export async function rescan(): Promise<LibraryState> {
  const tracks: Track[] = []
  const seen = new Set<string>()
  for (const folder of cache.folders) {
    for await (const file of walk(folder)) {
      if (seen.has(file)) continue
      seen.add(file)
      tracks.push(await parseTrack(file))
    }
  }
  tracks.sort((a, b) =>
    (a.artist || '').localeCompare(b.artist || '') ||
    (a.album || '').localeCompare(b.album || '') ||
    a.title.localeCompare(b.title)
  )
  cache.tracks = tracks
  await saveState()
  return cache
}

export async function addFolder(folder: string): Promise<LibraryState> {
  if (!cache.folders.includes(folder)) {
    cache.folders.push(folder)
  }
  return rescan()
}

export async function removeFolder(folder: string): Promise<LibraryState> {
  cache.folders = cache.folders.filter((f) => f !== folder)
  return rescan()
}
