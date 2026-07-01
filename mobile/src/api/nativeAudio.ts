// nativeAudio.ts — Bridge to the NativeAudioBridge Swift handler (iOS only).
//
// On iOS, a WKScriptMessageHandler (NativeAudioBridge.swift) is installed on
// the WKWebView. JS communicates via postMessage() and receives events through
// a global callback. This bypasses Capacitor's plugin system entirely.
//
// On non-iOS platforms, returns null (providers fall back to <audio>).

type ListenerCallback = (data?: Record<string, unknown>) => void

interface NativeAudioHandle {
  load(url: string): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  seek(time: number): Promise<void>
  setVolume(volume: number): Promise<void>
  getPosition(): Promise<number>
  getDuration(): Promise<number>
  isPlaying(): Promise<boolean>
  setMetadata(opts: { title: string; artist: string; artwork?: string }): Promise<void>
  on(event: string, cb: ListenerCallback): () => void
  destroy(): void
}

function isIOS(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor
  return cap?.isNativePlatform?.() === true && cap.getPlatform?.() === 'ios'
}

function hasWKBridge(): boolean {
  return typeof (window as unknown as { webkit?: { messageHandlers?: unknown } }).webkit?.messageHandlers !== 'undefined'
    && typeof ((window as unknown as { webkit: { messageHandlers: Record<string, unknown> } }).webkit.messageHandlers).latencyAudio !== 'undefined'
}

function getPlugin(): NativeAudioHandle | null {
  if (!isIOS() || !hasWKBridge()) return null

  const bridge = (window as unknown as { webkit: { messageHandlers: { latencyAudio: { postMessage: (msg: unknown) => void } } } }).webkit.messageHandlers.latencyAudio

  const listeners = new Map<string, ListenerCallback[]>()

  // Global callback for events from Swift → JS
  ;(window as unknown as { __nativeAudioEvent?: (evt: Record<string, unknown>) => void }).__nativeAudioEvent = (evt: Record<string, unknown>) => {
    const eventName = evt._event as string | undefined
    if (!eventName) return
    const cbs = listeners.get(eventName)
    if (cbs) for (const cb of cbs) cb(evt)
  }

  const send = (msg: Record<string, unknown>): void => {
    bridge.postMessage(msg)
  }

  // Promise-based request/response for getPosition/getDuration
  let pendingResolve: ((v: number) => void) | null = null
  listeners.set('positionResult', [(d) => { if (pendingResolve) { pendingResolve(d?.position as number ?? 0); pendingResolve = null } }])
  listeners.set('durationResult', [(d) => { if (pendingResolve) { pendingResolve(d?.duration as number ?? 0); pendingResolve = null } }])

  const requestNumber = (action: string): Promise<number> => {
    return new Promise((resolve) => {
      pendingResolve = resolve
      send({ action })
      // Fallback timeout
      setTimeout(() => { if (pendingResolve === resolve) { resolve(0); pendingResolve = null } }, 2000)
    })
  }

  return {
    async load(url: string) { send({ action: 'load', url }) },
    async play() { send({ action: 'play' }) },
    async pause() { send({ action: 'pause' }) },
    async seek(time: number) { send({ action: 'seek', time }) },
    async setVolume(volume: number) { send({ action: 'setVolume', volume }) },
    async getPosition() { return requestNumber('getPosition') },
    async getDuration() { return requestNumber('getDuration') },
    async isPlaying() { return Promise.resolve(false) }, // Not needed in practice
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
    destroy() { listeners.clear() }
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
