// nativeAudio.ts — Bridge to NativeAudioBridge (WKScriptMessageHandler, iOS only).
//
// On iOS, a NativeAudioBridge is installed on the WKWebView by AppDelegate.
// JS communicates via window.webkit.messageHandlers.latencyAudio.postMessage().
// Events come back via window.__nativeAudioEvent().
//
// The bridge supports multiple concurrent AVPlayer instances (for crossfade)
// identified by handle ID (`id`), plus MPRemoteCommandCenter (lock screen).
// For blob: URLs (offline files), we read the bytes, send as base64 to Swift,
// which writes to /tmp and plays via AVPlayer.

export type ListenerCallback = (data?: Record<string, unknown>) => void

export interface NativeAudioHandle {
  readonly id: string
  /** Load a network URL or blob: URL for playback via native AVPlayer. */
  load(url: string): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  seek(time: number): Promise<void>
  setVolume(volume: number): Promise<void>
  /** Natively fade volume towards target (0..1) over rampSec seconds in Swift. */
  setFade(target: number, rampSec?: number): Promise<void>
  /** Push the 10-band EQ curve (dB per band) to the native tap filter. */
  setEq(gains: number[], enabled: boolean): Promise<void>
  /** Push the loudness-leveling config to the native tap (AGC + compressor). */
  setLeveler(enabled: boolean, target: number, strength: string): Promise<void>
  getPosition(): Promise<number>
  getDuration(): Promise<number>
  setMetadata(opts: { title: string; artist: string; artwork?: string; duration?: number }): Promise<void>
  setActive(): Promise<void>
  on(event: string, cb: ListenerCallback): () => void
  destroy(): void
}

function hasWKBridge(): boolean {
  try {
    const wh = (window as unknown as { webkit?: { messageHandlers?: unknown } }).webkit?.messageHandlers
    if (!wh) return false
    return typeof (wh as Record<string, unknown>).latencyAudio !== 'undefined'
  } catch { return false }
}

let _handleIdSeq = 0
const _handleListeners = new Map<string, Map<string, ListenerCallback[]>>()
const _globalListeners = new Map<string, ListenerCallback[]>()
let _bridgeWireInstalled = false

function ensureBridgeWire(): void {
  if (_bridgeWireInstalled) return
  _bridgeWireInstalled = true

  const existing = (window as unknown as { __nativeAudioEvent?: (evt: Record<string, unknown>) => void }).__nativeAudioEvent
  ;(window as unknown as { __nativeAudioEvent: (evt: Record<string, unknown>) => void }).__nativeAudioEvent = (evt) => {
    if (existing) existing(evt)
    const eventName = evt._event as string | undefined
    if (!eventName) return
    const id = evt._id as string | undefined

    if (id) {
      const handleMap = _handleListeners.get(id)
      const cbs = handleMap?.get(eventName)
      if (cbs) {
        for (const cb of cbs.slice()) cb(evt)
      }
    } else {
      const cbs = _globalListeners.get(eventName)
      if (cbs) {
        for (const cb of cbs.slice()) cb(evt)
      }
    }
  }
}

export function createNativeAudio(): NativeAudioHandle | null {
  if (!hasWKBridge()) return null
  ensureBridgeWire()

  const id = 'h_' + (++_handleIdSeq)
  const listeners = new Map<string, ListenerCallback[]>()
  _handleListeners.set(id, listeners)

  const bridge = (window as unknown as { webkit: { messageHandlers: { latencyAudio: { postMessage: (msg: unknown) => void } } } }).webkit.messageHandlers.latencyAudio
  const send = (msg: Record<string, unknown>): void => bridge.postMessage({ ...msg, id })

  let posResolve: ((v: number) => void) | null = null
  let durResolve: ((v: number) => void) | null = null
  listeners.set('positionResult', [(d) => { if (posResolve) { posResolve(d?.position as number ?? 0); posResolve = null } }])
  listeners.set('durationResult', [(d) => { if (durResolve) { durResolve(d?.duration as number ?? 0); durResolve = null } }])

  const requestNumber = (action: string, setter: (r: (v: number) => void) => void): Promise<number> => {
    return new Promise((resolve) => {
      setter(resolve)
      send({ action })
      setTimeout(() => { setter((v) => { resolve(v) }); resolve(0) }, 2000)
    })
  }

  let destroyed = false

  return {
    id,
    async load(url: string) {
      if (destroyed) return
      if (url.startsWith('blob:')) {
        try {
          const resp = await fetch(url)
          const blob = await resp.blob()
          const buf = await blob.arrayBuffer()
          const bytes = new Uint8Array(buf)
          let binary = ''
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
          const b64 = btoa(binary)
          send({ action: 'loadBase64', base64: b64, mimeType: blob.type || 'audio/mpeg' })
        } catch (e) {
          console.error('NativeAudio: failed to read blob', e)
        }
      } else {
        send({ action: 'load', url })
      }
    },
    async play() { if (!destroyed) send({ action: 'play' }) },
    async pause() { if (!destroyed) send({ action: 'pause' }) },
    async seek(time: number) { if (!destroyed) send({ action: 'seek', time }) },
    async setVolume(volume: number) { if (!destroyed) send({ action: 'setVolume', volume }) },
    async setFade(target: number, rampSec = 0) {
      if (!destroyed) send({ action: 'fade', target, duration: rampSec })
    },
    async setEq(gains: number[], enabled: boolean) { send({ action: 'setEq', gains, enabled }) },
    async setLeveler(enabled: boolean, target: number, strength: string) {
      send({ action: 'setLeveler', enabled, target, strength })
    },
    async getPosition() { return requestNumber('getPosition', (r) => { posResolve = r }) },
    async getDuration() { return requestNumber('getDuration', (r) => { durResolve = r }) },
    async setMetadata(opts) { send({ action: 'setMetadata', title: opts.title, artist: opts.artist, artwork: opts.artwork, duration: opts.duration }) },
    async setActive() { if (!destroyed) send({ action: 'setActive' }) },
    on(event: string, cb: ListenerCallback): () => void {
      const list = listeners.get(event) ?? []
      list.push(cb)
      listeners.set(event, list)
      return () => {
        const arr = listeners.get(event)
        if (arr) { const i = arr.indexOf(cb); if (i >= 0) arr.splice(i, 1) }
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      send({ action: 'destroy' })
      _handleListeners.delete(id)
      listeners.clear()
    }
  }
}

let _defaultInstance: NativeAudioHandle | null = null

export function getNativeAudio(): NativeAudioHandle | null {
  if (!hasWKBridge()) return null
  if (!_defaultInstance) _defaultInstance = createNativeAudio()
  return _defaultInstance
}

export function isNativeAudioAvailable(): boolean {
  return hasWKBridge()
}

