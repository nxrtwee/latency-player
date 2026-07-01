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
  // On iOS, NEVER use navigator.mediaSession — WKWebView forces ±10s skip
  // buttons when it owns the media session. We use the native bridge instead.
  // Even if the bridge isn't installed yet (it installs in applicationDidBecomeActive),
  // we set up the JS side now and the bridge will pick up events when ready.
  if (cap?.isNativePlatform?.() && cap.getPlatform?.() === 'ios') {
    installNativeIOS()
    return
  }
  installWeb()
}

// ---- iOS: NativeAudioBridge → store + metadata push -------------------------
function installNativeIOS(): void {
  const get = usePlayer.getState

  // Set up the global event listener for the native bridge.
  // The bridge (installed in AppDelegate's applicationDidBecomeActive) will call
  // window.__nativeAudioEvent({ _event: 'nextTrack' }) etc. when the user taps
  // prev/next on the lock screen.
  const prev = (window as unknown as { __nativeAudioEvent?: (evt: Record<string, unknown>) => void }).__nativeAudioEvent
  ;(window as unknown as { __nativeAudioEvent: (evt: Record<string, unknown>) => void }).__nativeAudioEvent = (evt) => {
    // Chain to any previously-set handler
    if (prev) prev(evt)
    const name = evt._event as string | undefined
    if (name === 'nextTrack') get().next()
    else if (name === 'previousTrack') get().prev()
  }

  // Push track metadata to the native bridge for lock-screen display.
  // Uses postMessage directly — works even if the bridge isn't installed yet
  // (postMessage is a no-op on a non-existent handler; the bridge will pick up
  // metadata on next track change after it's installed).
  const sendToNative = (msg: Record<string, unknown>): void => {
    try {
      const handler = (window as unknown as { webkit?: { messageHandlers?: Record<string, { postMessage: (m: unknown) => void }> } })
        .webkit?.messageHandlers?.latencyAudio
      handler?.postMessage(msg)
    } catch { /* bridge not installed yet — will work on next track change */ }
  }

  let lastTrackId = ''
  let lastPlaying: boolean | null = null
  let lastPosWhole = -1
  usePlayer.subscribe((s) => {
    const track = s.queue[s.currentIndex]
    if (!track) { lastTrackId = ''; lastPlaying = null; return }
    if (track.id !== lastTrackId) {
      lastTrackId = track.id
      const art = offlineArtForUri(track.uri) || track.artwork
      sendToNative({
        action: 'setMetadata',
        title: track.title,
        artist: track.artist || 'SoundCloud',
        artwork: art || undefined,
        duration: track.durationSec
      })
      lastPlaying = null // force a playback-state push for the new track
    }
    // Push elapsed + rate to the lock screen so its progress bar animates. iOS
    // extrapolates between updates from the rate, so we only need to push on a
    // play/pause change or a seek (whole-second jump) — not every tick.
    const posWhole = Math.floor(s.positionSec)
    const seeked = Math.abs(posWhole - lastPosWhole) > 1
    if (s.isPlaying !== lastPlaying || seeked) {
      lastPlaying = s.isPlaying
      lastPosWhole = posWhole
      sendToNative({
        action: 'setPlaybackState',
        position: s.positionSec,
        playing: s.isPlaying,
        duration: s.durationSec || track.durationSec || 0
      })
    } else {
      lastPosWhole = posWhole
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
