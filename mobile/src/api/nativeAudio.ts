// nativeAudio.ts — Bridge to the LatencyAudio Capacitor plugin (iOS only).
//
// Provides an interface similar to HTMLAudioElement so the mobile providers
// can swap between web <audio> and native AVPlayer with minimal changes.
// On non-iOS platforms, returns null (providers fall back to <audio>).

import { Capacitor } from '@capacitor/core'

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
  startLevelAnalysis(intervalMs?: number): Promise<void>
  stopLevelAnalysis(): Promise<void>
  on(event: string, cb: ListenerCallback): () => void
  destroy(): void
}

function getPlugin(): NativeAudioHandle | null {
  const cap = (window as unknown as { Capacitor?: typeof Capacitor }).Capacitor
  if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== 'ios') return null

  // Access the plugin through the global Capacitor bridge
  const plugins = (cap as unknown as { Plugins?: Record<string, unknown> }).Plugins
  const plugin = plugins?.LatencyAudio as Record<string, ((...args: unknown[]) => Promise<unknown>) & { addListener?: (event: string, cb: ListenerCallback) => { remove: () => void } }> | undefined
  if (!plugin) return null

  const listeners = new Map<string, { remove: () => void }[]>()

  return {
    async load(url: string) {
      await plugin.load({ url })
    },
    async play() {
      await plugin.play({})
    },
    async pause() {
      await plugin.pause({})
    },
    async seek(time: number) {
      await plugin.seek({ time })
    },
    async setVolume(volume: number) {
      await plugin.setVolume({ volume })
    },
    async getPosition() {
      const result = await plugin.getPosition({}) as { position: number }
      return result.position ?? 0
    },
    async getDuration() {
      const result = await plugin.getDuration({}) as { duration: number }
      return result.duration ?? 0
    },
    async isPlaying() {
      const result = await plugin.isPlaying({}) as { playing: boolean }
      return result.playing ?? false
    },
    async setMetadata(opts: { title: string; artist: string; artwork?: string }) {
      await plugin.setMetadata(opts)
    },
    async startLevelAnalysis(intervalMs = 50) {
      await plugin.startLevelAnalysis({ interval: intervalMs })
    },
    async stopLevelAnalysis() {
      await plugin.stopLevelAnalysis({})
    },
    on(event: string, cb: ListenerCallback): () => void {
      if (!plugin.addListener) return () => {}
      // Capacitor addListener returns a Promise<PluginListenerHandle>
      const handlePromise = plugin.addListener(event, cb)
      let removed = false
      const list = listeners.get(event) ?? []
      const marker = { removed }
      list.push(marker as unknown as { remove: () => void })
      listeners.set(event, list)
      return () => {
        if (removed) return
        removed = true
        marker.removed = true
        // PluginListenerHandle.remove() resolves asynchronously
        void handlePromise.then((h: unknown) => {
          if (h && typeof h === 'object' && 'remove' in h) (h as { remove: () => void }).remove()
        })
        const arr = listeners.get(event)
        if (arr) {
          const idx = arr.indexOf(marker as unknown as { remove: () => void })
          if (idx >= 0) arr.splice(idx, 1)
        }
      }
    },
    destroy() {
      for (const list of listeners.values()) {
        for (const h of list) h.remove()
      }
      listeners.clear()
    }
  }
}

// Singleton — created once, reused by providers
let _instance: NativeAudioHandle | null = null
let _checked = false

export function getNativeAudio(): NativeAudioHandle | null {
  if (!_checked) {
    _checked = true
    _instance = getPlugin()
  }
  return _instance
}

/** Check if native audio is available (iOS device). */
export function isNativeAudioAvailable(): boolean {
  return getNativeAudio() !== null
}
