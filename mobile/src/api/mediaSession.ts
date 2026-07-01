// Lock-screen / OS media controls.
//
//   • iOS: the NativeAudioBridge (WKScriptMessageHandler in AppDelegate.swift)
//     owns the MPRemoteCommandCenter. When the lock screen shows prev/next-track
//     buttons and the user taps them, the bridge fires nextTrack/previousTrack
//     events via window.__nativeAudioEvent → store.prev()/next(). We also push
//     metadata (title/artist/artwork) to the bridge for lock-screen display.
//     Actual audio playback stays with <audio> (AVPlayer can't handle blob: URLs).
//   • Android: the embedded System WebView does NOT publish navigator.mediaSession
//     to the system. We bridge to a native MediaSession via the
//     @jofr/capacitor-media-session plugin.
//   • Browser (dev): the W3C Media Session API (navigator.mediaSession) works
//     in Chrome for OS media overlay.
import { usePlayer } from '@renderer/store'
import { offlineArtForUri } from './offline'
import { getNativeAudio } from './nativeAudio'

// ---- native Android plugin bridge types --------------------------------------
interface MediaImage { src: string; sizes?: string; type?: string }
interface NativeMediaSession {
  setMetadata(o: { title?: string; artist?: string; album?: string; artwork?: MediaImage[] }): Promise<void>
  setPlaybackState(o: { playbackState: 'none' | 'paused' | 'playing' }): Promise<void>
  setPositionState(o: { duration?: number; position?: number; playbackRate?: number }): Promise<void>
  setActionHandler(o: { action: string }, handler: ((details: { action: string; seekTime?: number | null }) => void) | null): Promise<void>
}
interface CapGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: { MediaSession?: NativeMediaSession }
}

export function installMediaSession(): void {
  const cap = (window as unknown as { Capacitor?: CapGlobal }).Capacitor
  const native = cap?.Plugins?.MediaSession
  if (cap?.isNativePlatform?.() && cap.getPlatform?.() === 'android' && native) {
    installAndroid(native)
    return
  }
  if (cap?.isNativePlatform?.() && cap.getPlatform?.() === 'ios') {
    installNativeIOS()
    return
  }
  installWeb()
}

// ---- iOS: NativeAudioBridge → store + metadata push -------------------------
function installNativeIOS(): void {
  const native = getNativeAudio()
  if (!native) return
  const get = usePlayer.getState

  // Forward lock-screen prev/next to the store.
  native.on('nextTrack', () => get().next())
  native.on('previousTrack', () => get().prev())

  // Push track metadata to the native bridge for lock-screen display.
  let lastTrackId = ''
  usePlayer.subscribe((s) => {
    const track = s.queue[s.currentIndex]
    if (!track) { lastTrackId = ''; return }
    if (track.id !== lastTrackId) {
      lastTrackId = track.id
      const art = offlineArtForUri(track.uri) || track.artwork
      native.setMetadata({
        title: track.title,
        artist: track.artist || 'SoundCloud',
        artwork: art || undefined
      })
    }
  })
}

// ---- Android: native MediaSession + media notification ------------------------
function installAndroid(ms: NativeMediaSession): void {
  const get = usePlayer.getState

  void ms.setActionHandler({ action: 'play' }, () => {
    if (!get().isPlaying) get().togglePlay()
  })
  void ms.setActionHandler({ action: 'pause' }, () => {
    if (get().isPlaying) get().togglePlay()
  })
  void ms.setActionHandler({ action: 'previoustrack' }, () => get().prev())
  void ms.setActionHandler({ action: 'nexttrack' }, () => get().next())
  void ms.setActionHandler({ action: 'seekto' }, (d) => {
    if (typeof d?.seekTime === 'number') get().seek(d.seekTime)
  })

  let lastTrackId = ''
  usePlayer.subscribe((s) => {
    const track = s.queue[s.currentIndex]
    if (!track) {
      void ms.setPlaybackState({ playbackState: 'none' })
      lastTrackId = ''
      return
    }
    if (track.id !== lastTrackId) {
      lastTrackId = track.id
      const art = offlineArtForUri(track.uri) || track.artwork
      void ms.setMetadata({
        title: track.title,
        artist: track.artist || 'SoundCloud',
        album: 'Latency',
        artwork: art ? [{ src: art, sizes: '512x512', type: 'image/jpeg' }] : []
      })
    }
    void ms.setPlaybackState({ playbackState: s.isPlaying ? 'playing' : 'paused' })
    if (s.durationSec > 0) {
      void ms.setPositionState({
        duration: s.durationSec,
        position: Math.min(s.positionSec, s.durationSec),
        playbackRate: 1
      })
    }
  })
}

// ---- Browser (dev): navigator.mediaSession -----------------------------------
function installWeb(): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  const get = usePlayer.getState

  ms.setActionHandler('play', () => {
    if (!get().isPlaying) get().togglePlay()
  })
  ms.setActionHandler('pause', () => {
    if (get().isPlaying) get().togglePlay()
  })
  ms.setActionHandler('previoustrack', () => get().prev())
  ms.setActionHandler('nexttrack', () => get().next())

  let lastTrackId = ''
  usePlayer.subscribe((s) => {
    const track = s.queue[s.currentIndex]
    if (!track) {
      ms.metadata = null
      ms.playbackState = 'none'
      lastTrackId = ''
      return
    }
    if (track.id !== lastTrackId) {
      lastTrackId = track.id
      ms.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || 'SoundCloud',
        album: 'Latency',
        artwork: track.artwork
          ? [
              { src: track.artwork, sizes: '512x512', type: 'image/jpeg' },
              { src: track.artwork, sizes: '256x256', type: 'image/jpeg' }
            ]
          : []
      })
    }
    ms.playbackState = s.isPlaying ? 'playing' : 'paused'
  })
}
