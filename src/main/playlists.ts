import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { Playlist, Track } from '../shared/types'

// User playlists, persisted as full Track objects (same rationale as likes:
// SoundCloud entries remain playable, local entries survive folder removal).

const file = (): string => join(app.getPath('userData'), 'playlists.json')

let playlists: Playlist[] = []

export async function init(): Promise<void> {
  try {
    const raw = await fs.readFile(file(), 'utf-8')
    const parsed = JSON.parse(raw) as Playlist[]
    playlists = Array.isArray(parsed) ? parsed : []
  } catch {
    playlists = []
  }
}

async function persist(): Promise<void> {
  await fs.writeFile(file(), JSON.stringify(playlists), 'utf-8')
}

export function getAll(): Playlist[] {
  return playlists
}

function newId(): string {
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export async function create(name: string): Promise<Playlist[]> {
  const playlist: Playlist = { id: newId(), name: name.trim() || 'New Playlist', tracks: [] }
  playlists = [...playlists, playlist]
  await persist()
  return playlists
}

export async function rename(id: string, name: string): Promise<Playlist[]> {
  playlists = playlists.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p))
  await persist()
  return playlists
}

export async function remove(id: string): Promise<Playlist[]> {
  playlists = playlists.filter((p) => p.id !== id)
  await persist()
  return playlists
}

export async function addTrack(id: string, track: Track): Promise<Playlist[]> {
  playlists = playlists.map((p) =>
    p.id === id && !p.tracks.some((t) => t.id === track.id)
      ? { ...p, tracks: [...p.tracks, track] }
      : p
  )
  await persist()
  return playlists
}

export async function removeTrack(id: string, trackId: string): Promise<Playlist[]> {
  playlists = playlists.map((p) =>
    p.id === id ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p
  )
  await persist()
  return playlists
}
