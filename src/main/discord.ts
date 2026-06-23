import net from 'net'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// Minimal, dependency-free Discord Rich Presence client. Talks the documented
// local IPC protocol over Discord's named pipe (Windows) / unix socket. Needs a
// Discord Application ID (created at https://discord.com/developers) — the app's
// name and uploaded assets are what show up in the user's profile.

const OP_HANDSHAKE = 0
const OP_FRAME = 1
const OP_CLOSE = 2

export interface DiscordActivity {
  title: string
  artist?: string
  album?: string
  /** http(s) cover art URL to show as the large image (data: URLs are ignored) */
  artwork?: string
  /** epoch ms when playback started (for the elapsed timer); omit when paused */
  startedAt?: number
  playing: boolean
}

interface DiscordConfig {
  enabled: boolean
  clientId: string
}

let socket: net.Socket | null = null
let connected = false
let connecting = false
let config: DiscordConfig = { enabled: false, clientId: '' }
let lastActivity: DiscordActivity | null = null

const configFile = (): string => join(app.getPath('userData'), 'discord.json')

export async function init(): Promise<void> {
  try {
    const raw = await fs.readFile(configFile(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<DiscordConfig>
    config = { enabled: !!parsed.enabled, clientId: parsed.clientId || '' }
  } catch {
    /* none saved yet */
  }
  if (config.enabled && config.clientId) void connect()
}

async function saveConfig(): Promise<void> {
  try {
    await fs.writeFile(configFile(), JSON.stringify(config), 'utf-8')
  } catch {
    /* best-effort */
  }
}

function ipcPath(id: number): string {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${id}`
  const base =
    process.env['XDG_RUNTIME_DIR'] ||
    process.env['TMPDIR'] ||
    process.env['TMP'] ||
    process.env['TEMP'] ||
    '/tmp'
  return `${base.replace(/\/$/, '')}/discord-ipc-${id}`
}

function encode(op: number, data: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(data))
  const buf = Buffer.alloc(8 + json.length)
  buf.writeInt32LE(op, 0)
  buf.writeInt32LE(json.length, 4)
  json.copy(buf, 8)
  return buf
}

/** Try to open the Discord IPC socket (ids 0..9), returning the connected socket. */
function openSocket(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    let id = 0
    const tryNext = (): void => {
      if (id > 9) {
        reject(new Error('Discord not running'))
        return
      }
      const path = ipcPath(id)
      const s = net.createConnection(path)
      const onError = (): void => {
        s.removeAllListeners()
        s.destroy()
        id++
        tryNext()
      }
      s.once('error', onError)
      s.once('connect', () => {
        s.removeListener('error', onError)
        resolve(s)
      })
    }
    tryNext()
  })
}

async function connect(): Promise<void> {
  if (connected || connecting || !config.clientId) return
  connecting = true
  try {
    const s = await openSocket()
    socket = s
    // Parse incoming frames; we only care that the handshake yields READY.
    let buffer = Buffer.alloc(0)
    s.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 8) {
        const len = buffer.readInt32LE(4)
        if (buffer.length < 8 + len) break
        const op = buffer.readInt32LE(0)
        buffer = buffer.subarray(8 + len)
        if (op === OP_FRAME && !connected) {
          connected = true
          if (lastActivity) pushActivity(lastActivity)
        } else if (op === OP_CLOSE) {
          cleanup()
        }
      }
    })
    s.on('close', cleanup)
    s.on('error', cleanup)
    s.write(encode(OP_HANDSHAKE, { v: 1, client_id: config.clientId }))
  } catch {
    cleanup()
  } finally {
    connecting = false
  }
}

function cleanup(): void {
  connected = false
  if (socket) {
    socket.removeAllListeners()
    try {
      socket.destroy()
    } catch {
      /* ignore */
    }
    socket = null
  }
}

function pushActivity(a: DiscordActivity): void {
  if (!socket || !connected) return
  // Discord accepts an external https URL for the large image (it proxies it).
  // Use the track cover when available; fall back to the app's 'logo' asset.
  const largeImage = a.artwork && /^https?:\/\//.test(a.artwork) ? a.artwork : 'logo'
  const activity: Record<string, unknown> = {
    type: 2, // Listening
    details: a.title.slice(0, 128) || 'Listening',
    state: a.artist ? `by ${a.artist}`.slice(0, 128) : undefined,
    assets: {
      large_image: largeImage,
      small_image: a.playing ? 'play' : 'pause',
      small_text: a.playing ? 'Playing' : 'Paused'
    }
  }
  if (a.playing && a.startedAt) activity.timestamps = { start: Math.round(a.startedAt) }
  try {
    socket.write(
      encode(OP_FRAME, {
        cmd: 'SET_ACTIVITY',
        nonce: randomUUID(),
        args: { pid: process.pid, activity }
      })
    )
  } catch {
    cleanup()
  }
}

function clearActivity(): void {
  if (!socket || !connected) return
  try {
    socket.write(
      encode(OP_FRAME, {
        cmd: 'SET_ACTIVITY',
        nonce: randomUUID(),
        args: { pid: process.pid, activity: null }
      })
    )
  } catch {
    cleanup()
  }
}

// ---------------- Public API (called from IPC handlers) ----------------

export function getConfig(): DiscordConfig {
  return { ...config }
}

export async function setConfig(enabled: boolean, clientId: string): Promise<void> {
  config = { enabled, clientId: clientId.trim() }
  await saveConfig()
  if (enabled && config.clientId) {
    if (!connected) await connect()
    else if (lastActivity) pushActivity(lastActivity)
  } else {
    clearActivity()
    cleanup()
  }
}

/** Update (or clear with null) the presence. No-op unless enabled + connected. */
export function update(activity: DiscordActivity | null): void {
  lastActivity = activity
  if (!config.enabled || !config.clientId) return
  if (!connected) {
    void connect()
    return
  }
  if (activity) pushActivity(activity)
  else clearActivity()
}
