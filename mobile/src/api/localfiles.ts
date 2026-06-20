// Local files on mobile. There's no filesystem scan in a sandboxed WebView, so
// the user imports tracks via a file picker. We keep the File objects in memory
// (per session) keyed by a stable id, read tags lazily, and hand the player a
// blob: URL — which is same-origin, so the Web Audio analyser (and thus the live
// waveform) works for local playback, unlike cross-origin SoundCloud.
import type { Track } from '@shared/types'

// id -> object URL for the current session's imported files
const blobs = new Map<string, string>()

export function getBlobUrl(id: string): string | undefined {
  return blobs.get(id)
}

const META_KEY = 'lp.m.local'

/** Persisted, lightweight metadata (no blobs — those live for the session). */
interface LocalMeta {
  id: string
  title: string
  artist?: string
  durationSec?: number
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

/**
 * Import picked files into the session. Returns Track objects ready for the
 * queue; their blob URLs are registered for the 'local' provider to resolve.
 */
export async function importFiles(files: FileList | File[]): Promise<Track[]> {
  const out: Track[] = []
  const meta = readMeta()
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('audio') && !/\.(mp3|m4a|flac|wav|ogg|aac|opus)$/i.test(file.name)) {
      continue
    }
    const id = `local:${file.name}:${file.size}`
    const url = URL.createObjectURL(file)
    blobs.set(id, url)
    const durationSec = await probeDuration(url)
    // dashes/parens are common "Artist - Title" separators in filenames
    const base = titleFromName(file.name)
    let title = base
    let artist: string | undefined
    const m = base.match(/^(.+?)\s*[-–—]\s*(.+)$/)
    if (m) {
      artist = m[1].trim()
      title = m[2].trim()
    }
    out.push({ id, providerId: 'local', uri: url, title, artist, durationSec })
    if (!meta.some((x) => x.id === id)) meta.push({ id, title, artist, durationSec })
  }
  writeMeta(meta)
  return out
}

/**
 * Tracks known from previous sessions. Their blobs are gone after a reload, so
 * they're returned flagged unavailable (the UI prompts a re-import). We surface
 * them so the user sees their library isn't empty.
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

export function isAvailable(id: string): boolean {
  return blobs.has(id)
}

export function clearLocal(): void {
  for (const url of blobs.values()) URL.revokeObjectURL(url)
  blobs.clear()
  localStorage.removeItem(META_KEY)
}
