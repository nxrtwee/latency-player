// nativeAudio.ts — Bridge to NativeAudioBridge (WKScriptMessageHandler, iOS only).
//
// On iOS, a NativeAudioBridge is installed on the WKWebView by AppDelegate.
// JS communicates via window.webkit.messageHandlers.latencyAudio.postMessage().
// Events come back via window.__nativeAudioEvent().
//
// The bridge handles AVPlayer (native audio) + MPRemoteCommandCenter (lock screen).
// For blob: URLs (offline files), we read the bytes, send as base64 to Swift,
// which writes to /tmp and plays via AVPlayer — so WKWebView never plays audio.

type ListenerCallback = (data?: Record<string, unknown>) => void

interface NativeAudioHandle {
  /** Load a network URL or blob: URL for playback via native AVPlayer. */
  load(url: string): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  seek(time: number): Promise<void>
  setVolume(volume: number): Promise<void>
  getPosition(): Promise<number>
  getDuration(): Promise<number>
  setMetadata(opts: { title: string; artist: string; artwork?: string }): Promise<void>
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

function getPlugin(): NativeAudioHandle | null {
  if (!hasWKBridge()) return null

  const bridge = (window as unknown as { webkit: { messageHandlers: { latencyAudio: { postMessage: (msg: unknown) => void } } } }).webkit.messageHandlers.latencyAudio

  const listeners = new Map<string, ListenerCallback[]>()

  // Wire up global event callback (Swift → JS)
  const existing = (window as unknown as { __nativeAudioEvent?: (evt: Record<string, unknown>) => void }).__nativeAudioEvent
  ;(window as unknown as { __nativeAudioEvent: (evt: Record<string, unknown>) => void }).__nativeAudioEvent = (evt) => {
    if (existing) existing(evt)
    const eventName = evt._event as string | undefined
    if (!eventName) return
    const cbs = listeners.get(eventName)
    if (cbs) for (const cb of cbs) cb(evt)
  }

  const send = (msg: Record<string, unknown>): void => bridge.postMessage(msg)

  // Promise-based request/response for getPosition/getDuration
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

  return {
    async load(url: string) {
      // For blob: URLs, read bytes and send as base64 so Swift can write to /tmp
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
    async play() { send({ action: 'play' }) },
    async pause() { send({ action: 'pause' }) },
    async seek(time: number) { send({ action: 'seek', time }) },
    async setVolume(volume: number) { send({ action: 'setVolume', volume }) },
    async getPosition() { return requestNumber('getPosition', (r) => { posResolve = r }) },
    async getDuration() { return requestNumber('getDuration', (r) => { durResolve = r }) },
    async setMetadata(opts) { send({ action: 'setMetadata', title: opts.title, artist: opts.artist, artwork: opts.artwork }) },
    on(event: string, cb: ListenerCallback): () => void {
      const list = listeners.get(event) ?? []
      list.push(cb)
      listeners.set(event, list)
      return () => {
        const arr = listeners.get(event)
        if (arr) { const i = arr.indexOf(cb); if (i >= 0) arr.splice(i, 1) }
      }
    },
    // This handle wraps a process-lifetime SINGLETON bridge shared by every track.
    // Do NOT clear the shared listener map here — each playback handle already
    // removes its own listeners via the unsub returned from on(). Clearing it
    // would wipe the incoming track's listeners on a switch and the one-shot
    // position/duration responders. Just stop the native player.
    destroy() { send({ action: 'pause' }) }
  }
}

let _instance: NativeAudioHandle | null = null
let _checked = false

export function getNativeAudio(): NativeAudioHandle | null {
  if (!_checked) { _checked = true; _instance = getPlugin() }
  return _instance
}

export function isNativeAudioAvailable(): boolean {
  return getNativeAudio() !== null
}
