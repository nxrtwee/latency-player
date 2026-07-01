// Lock-screen / OS media controls.
//
//   • iOS: the native LatencyAudio plugin (AVPlayer) owns the
//     MPRemoteCommandCenter. When the lock screen shows prev/next-track buttons
//     and the user taps them, the plugin fires `nextTrack`/`previousTrack` events
//     which we forward to the store here. The web navigator.mediaSession is NOT
//     used on iOS (it would conflict with the native plugin).
//   • Android: the embedded System WebView (unlike Chrome-the-app) does NOT
//     publish navigator.mediaSession to the system, so the lock screen and
//     notification shade stay empty even though audio keeps playing. We bridge to
//     a native MediaSession + media-style notification via the
//     @jofr/capacitor-media-session plugin (added in mobile/package.json,
//     registered by `cap sync`, called through the global Capacitor bridge so the
//     web bundle needs no import — same pattern as offline.ts / statusBar.ts).
//   • Browser (dev): the W3C Media Session API (navigator.mediaSession) works
//     in Chrome for OS media overlay.
//
// True background playback (audio continuing while locked / backgrounded) needs
// the native AVAudioSession on iOS (AppDelegate) and the plugin's foreground
// service on Android (manifest permissions added by scripts/patch-android.sh).
import { usePlayer } from '@renderer/store'
import { offlineArtForUri } from './offline'
import { getNativeAudio } from './nativeAudio'

// ---- native Android plugin (@jofr/capacitor-media-session) bridge types -------
interface MediaImage {
  src: string
  sizes?: string
  type?: string
}
interface NativeMediaSession {
  setMetadata(o: { title?: string; artist?: string; album?: string; artwork?: MediaImage[] }): Promise<void>
  setPlaybackState(o: { playbackState: 'none' | 'paused' | 'playing' }): Promise<void>
  setPositionState(o: { duration?: number; position?: number; playbackRate?: number }): Promise<void>
  setActionHandler(
    o: { action: string },
    handler: ((details: { action: string; seekTime?: number | null }) => void) | null
  ): Promise<void>
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
  // On iOS, the native LatencyAudio plugin owns the lock screen — just listen
  // for its prev/next events and forward to the store. No web MediaSession.
  if (getNativeAudio()) {
    installNativeIOS()
    return
  }
  installWeb()
}

// ---- iOS: native LatencyAudio plugin → store --------------------------------
function installNativeIOS(): void {
  const native = getNativeAudio()
  if (!native) return
  const get = usePlayer.getState

  // The plugin fires nextTrack/previousTrack when the user taps prev/next on
  // the lock screen. Forward to the store.
  native.on('nextTrack', () => get().next())
  native.on('previousTrack', () => get().prev())
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
