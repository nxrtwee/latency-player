// Lock-screen / OS media controls via the Media Session API. Works in the
// browser (Chrome's OS media overlay) and in iOS WKWebView (lock screen +
// Control Center). Bridges navigator.mediaSession <-> the shared player store.
//
// True background playback (audio continuing while the screen is locked / app
// backgrounded) additionally needs the native AVAudioSession 'playback' category
// + UIBackgroundModes=audio in Info.plist — wired during the iOS build (Step 5).
import { usePlayer } from '@renderer/store'

export function installMediaSession(): void {
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
