// Lock-screen / OS media controls.
//
//   • iOS + browser: the W3C Media Session API (navigator.mediaSession). iOS
//     WKWebView surfaces it to the lock screen / Control Center; Chrome shows its
//     OS media overlay.
//   • Android: the embedded System WebView (unlike Chrome-the-app) does NOT
//     publish navigator.mediaSession to the system, so the lock screen and
//     notification shade stay empty even though audio keeps playing. We bridge to
//     a native MediaSession + media-style notification via the
//     @jofr/capacitor-media-session plugin (added in mobile/package.json,
//     registered by `cap sync`, called through the global Capacitor bridge so the
//     web bundle needs no import — same pattern as offline.ts / statusBar.ts).
//
// True background playback (audio continuing while locked / backgrounded) needs
// the native AVAudioSession on iOS (AppDelegate) and the plugin's foreground
// service on Android (manifest permissions added by scripts/patch-android.sh).
import { usePlayer } from '@renderer/store'

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
  installWeb()
}

// ---- Android: native MediaSession + media notification ------------------------
function installAndroid(ms: NativeMediaSession): void {
  const get = usePlayer.getState

  // The plugin requires play/pause handlers to be set explicitly for the
  // notification controls to appear and work.
  void ms.setActionHandler({ action: 'play' }, () => {
    if (!get().isPlaying) get().togglePlay()
  })
  void ms.setActionHandler({ action: 'pause' }, () => {
    if (get().isPlaying) get().togglePlay()
  })
  void ms.setActionHandler({ action: 'previoustrack' }, () => get().prev())
  void ms.setActionHandler({ action: 'nexttrack' }, () => get().next())
  // Android happily shows a scrubber alongside the track buttons (no iOS ±10s
  // problem), so wire seeking too.
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
      void ms.setMetadata({
        title: track.title,
        artist: track.artist || 'SoundCloud',
        album: 'Latency',
        artwork: track.artwork ? [{ src: track.artwork, sizes: '512x512', type: 'image/jpeg' }] : []
      })
    }
    // Must be set to 'playing' for the notification to show.
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

// ---- iOS + browser: navigator.mediaSession -----------------------------------
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
  // Register NO seek handlers at all (no seekto / seekbackward / seekforward).
  // On iOS, any seek handler makes WKWebView treat the media as scrubbable and
  // surface the ±10s skip buttons on the lock screen instead of prev/next-track.
  // With only play/pause/prev/next registered, iOS shows the track buttons.
  // (The native AppDelegate additionally disables the skip commands as a backstop.)

  let lastTrackId = ''
  usePlayer.subscribe((s) => {
    const track = s.queue[s.currentIndex]
    if (!track) {
      ms.metadata = null
      ms.playbackState = 'none'
      lastTrackId = ''
      return
    }
    // Rebuild metadata only when the track actually changes.
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
    // NB: we intentionally do NOT call setPositionState. On the iOS lock screen,
    // providing a position state makes iOS render the ±10s skip buttons (long-form
    // scrubbing) instead of the previous/next-track buttons. Dropping it gives the
    // track-change buttons the user expects (at the cost of the lock-screen
    // scrubber, which web audio can't pair with track buttons on iOS).
  })
}
