import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { Track } from '../shared/types'

// Liked tracks are stored as full Track objects (not just ids) so that liked
// SoundCloud tracks remain playable without re-searching, and local tracks
// survive even if a folder is later removed.

const likesFile = (): string => join(app.getPath('userData'), 'likes.json')

let likes: Track[] = []

export async function init(): Promise<void> {
  try {
    const raw = await fs.readFile(likesFile(), 'utf-8')
    const parsed = JSON.parse(raw) as Track[]
    likes = Array.isArray(parsed) ? parsed : []
  } catch {
    likes = []
  }
}

async function persist(): Promise<void> {
  await fs.writeFile(likesFile(), JSON.stringify(likes), 'utf-8')
}

export function getLikes(): Track[] {
  return likes
}

/** Toggle a track's liked state; returns the updated list (newest first). */
export async function toggle(track: Track): Promise<Track[]> {
  const exists = likes.some((t) => t.id === track.id)
  likes = exists ? likes.filter((t) => t.id !== track.id) : [track, ...likes]
  await persist()
  return likes
}

/** Bulk-add tracks not already liked (used to import likes from a service). */
export async function addMany(tracks: Track[]): Promise<Track[]> {
  const have = new Set(likes.map((t) => t.id))
  const fresh = tracks.filter((t) => t.id && !have.has(t.id))
  if (fresh.length) {
    likes = [...fresh, ...likes]
    await persist()
  }
  return likes
}

/** Drop all liked tracks from a given provider (undo an import). */
export async function removeByProvider(providerId: Track['providerId']): Promise<Track[]> {
  const next = likes.filter((t) => t.providerId !== providerId)
  if (next.length !== likes.length) {
    likes = next
    await persist()
  }
  return likes
}
