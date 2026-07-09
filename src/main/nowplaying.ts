import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { nativeImage, net } from 'electron'

// Publishes the current track to a fixed local file so external apps (e.g. the Rockstar Minecraft
// client's MusicInfo HUD) can read now-playing without going through the flaky Windows SMTC layer.
// Both sides agree on ~/.latency: nowplaying.json (metadata) + cover.png (artwork).

export interface NowPlaying {
  title: string
  artist?: string
  album?: string
  /** any artwork url the renderer has: http(s), data:, or media:// */
  artwork?: string
  positionSec: number
  durationSec: number
  playing: boolean
}

const dir = join(homedir(), '.latency')
const jsonFile = join(dir, 'nowplaying.json')
const coverFile = join(dir, 'cover.png')
let lastArtwork = ''

export async function update(np: NowPlaying | null): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true })

    if (!np || !np.title) {
      await fs.writeFile(jsonFile, JSON.stringify({ playing: false, updatedAt: Date.now() }), 'utf-8')
      return
    }

    // Re-render the cover to PNG only when the track's artwork actually changes.
    if (np.artwork && np.artwork !== lastArtwork) {
      const png = await resolveCoverPng(np.artwork)
      if (png) {
        await fs.writeFile(coverFile, png)
        lastArtwork = np.artwork
      }
    }

    await fs.writeFile(
      jsonFile,
      JSON.stringify({
        title: np.title,
        artist: np.artist ?? '',
        album: np.album ?? '',
        position: Math.max(0, Math.round(np.positionSec)),
        duration: Math.max(0, Math.round(np.durationSec)),
        playing: !!np.playing,
        cover: 'cover.png',
        // Consumers extrapolate the live position from this when playing.
        updatedAt: Date.now()
      }),
      'utf-8'
    )
  } catch {
    /* best-effort — never let now-playing publishing break playback */
  }
}

/** Fetch/decode arbitrary artwork and re-encode as PNG bytes (Windows-friendly for the reader). */
async function resolveCoverPng(url: string): Promise<Buffer | null> {
  try {
    let raw: Buffer | null = null

    if (url.startsWith('data:')) {
      raw = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
    } else if (/^https?:\/\//.test(url)) {
      raw = await fetchBytes(url)
    }
    // media:// and file paths are provider-internal; skip (reader falls back to a placeholder).

    if (!raw || raw.length === 0) return null
    const img = nativeImage.createFromBuffer(raw)
    if (img.isEmpty()) return null
    return img.toPNG()
  } catch {
    return null
  }
}

function fetchBytes(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    try {
      const request = net.request(url)
      const chunks: Buffer[] = []
      request.on('response', (response) => {
        response.on('data', (c) => chunks.push(Buffer.from(c)))
        response.on('end', () => resolve(Buffer.concat(chunks)))
        response.on('error', () => resolve(null))
      })
      request.on('error', () => resolve(null))
      request.end()
    } catch {
      resolve(null)
    }
  })
}
