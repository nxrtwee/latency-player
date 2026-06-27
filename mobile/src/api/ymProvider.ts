// Mobile 'yandex' playback provider. Overrides the desktop one, which routes the
// signed CDN MP3 through the Electron media:// proxy (for Web Audio / the EQ).
// That scheme does not exist on mobile, so we play the resolved URL directly.
//
// Yandex serves plain progressive MP3 (no HLS branch). Offline downloads resolve
// to a same-origin blob: URL; online to a short-lived signed CDN URL. Both play
// through a plain <audio>; cross-origin CDN audio isn't tapped by Web Audio, so
// the visualizer uses synthetic motion (the accepted mobile behavior).
import type { Track } from '@shared/types'
import type { PlaybackCallbacks, PlaybackHandle, PlaybackProvider } from '@renderer/providers/types'
import { registerProvider } from '@renderer/providers/registry'

const ymProvider: PlaybackProvider = {
  id: 'yandex',
  name: 'Yandex Music',

  createPlayback(track: Track, cb: PlaybackCallbacks): PlaybackHandle {
    const audio = new Audio()
    audio.preload = 'auto'

    audio.addEventListener('timeupdate', () => cb.onTime(audio.currentTime))
    audio.addEventListener('durationchange', () => {
      if (Number.isFinite(audio.duration)) cb.onDuration(audio.duration)
    })
    audio.addEventListener('play', () => cb.onPlayingChange(true))
    audio.addEventListener('pause', () => cb.onPlayingChange(false))
    audio.addEventListener('ended', () => cb.onEnded())
    audio.addEventListener('error', () =>
      cb.onError(audio.error ? `stream error (code ${audio.error.code})` : 'unknown stream error')
    )

    let wantPlay = false
    let ready = false
    let destroyed = false

    const tryPlay = (): void => {
      if (ready && wantPlay) audio.play().catch((e) => cb.onError(String(e)))
    }

    window.api
      .ymResolveStream(track.uri)
      .then((url) => {
        if (destroyed) return
        audio.src = url
        ready = true
        tryPlay()
      })
      .catch((e) => cb.onError(`Yandex: ${e instanceof Error ? e.message : String(e)}`))

    return {
      play: () => {
        wantPlay = true
        tryPlay()
      },
      pause: () => {
        wantPlay = false
        audio.pause()
      },
      seek: (sec) => {
        if (ready) audio.currentTime = sec
      },
      setVolume: (v) => {
        audio.volume = Math.min(1, Math.max(0, v))
      },
      destroy: () => {
        destroyed = true
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
    }
  }
}

// Registering with the same id replaces the desktop Yandex provider.
registerProvider(ymProvider)
