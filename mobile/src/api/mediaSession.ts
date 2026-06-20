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
  ms.setActionHandler('seekto', (d) => {
    if (typeof d.seekTime === 'number') get().seek(d.seekTime)
  })
  // seek by offset (some platforms surface ±10s buttons)
  ms.setActionHandler('seekbackward', (d) => {
    const s = get()
    get().seek(Math.max(0, s.positionSec - (d.seekOffset || 10)))
  })
  ms.setActionHandler('seekforward', (d) => {
    const s = get()
    get().seek(Math.min(s.durationSec || s.positionSec, s.positionSec + (d.seekOffset || 10)))
  })

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
    // Keep the scrubber in sync (guard: invalid values throw).
    if (s.durationSec > 0 && Number.isFinite(s.positionSec)) {
      try {
        ms.setPositionState({
          duration: s.durationSec,
          position: Math.min(Math.max(0, s.positionSec), s.durationSec),
          playbackRate: 1
        })
      } catch {
        /* some engines reject mid-transition updates — ignore */
      }
    }
  })
}
