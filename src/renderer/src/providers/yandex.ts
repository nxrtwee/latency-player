import type { Track } from '@shared/types'
import type { PlaybackCallbacks, PlaybackHandle, PlaybackProvider } from './types'
import { connectElement, resumeAudio } from '../audio/analyser'

/** Wrap a remote URL in our CORS-clean media:// proxy so Web Audio can tap it. */
function proxied(url: string): string {
  return `media://remote/${encodeURIComponent(url)}`
}

/**
 * Plays Yandex Music tracks. The main process resolves track.uri (a bare track
 * id) into a real, short-lived signed CDN URL. Yandex serves plain progressive
 * MP3, so — unlike SoundCloud — there's no HLS branch: we always route the
 * stream through the media:// proxy (CORS-clean) so the equalizer and the real
 * visualizer can tap it via Web Audio without the browser silencing it.
 */
export const yandexProvider: PlaybackProvider = {
  id: 'yandex',
  name: 'Yandex Music',

  createPlayback(track: Track, cb: PlaybackCallbacks): PlaybackHandle {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.crossOrigin = 'anonymous'
    let disconnect: (() => void) | null = null

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
        // Route progressive MP3 through our CORS-clean proxy so the EQ/analyser
        // can tap the element without the browser silencing cross-origin audio.
        audio.src = proxied(url)
        disconnect = connectElement(audio)
        ready = true
        tryPlay()
      })
      .catch((e) => cb.onError(`Yandex: ${e instanceof Error ? e.message : String(e)}`))

    return {
      play: () => {
        wantPlay = true
        resumeAudio()
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
        disconnect?.()
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
    }
  }
}
