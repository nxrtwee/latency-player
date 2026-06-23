import Hls from 'hls.js'
import type { Track } from '@shared/types'
import type { PlaybackCallbacks, PlaybackHandle, PlaybackProvider } from './types'
import { connectElement, resumeAudio } from '../audio/analyser'

/** Wrap a remote URL in our CORS-clean media:// proxy so Web Audio can tap it. */
function proxied(url: string): string {
  return `media://remote/${encodeURIComponent(url)}`
}

/**
 * Plays SoundCloud tracks. The main process resolves track.uri (a transcoding
 * URL) into a real, short-lived CDN URL. Progressive transcodings are plain MP3
 * the <audio> streams directly; HLS transcodings are played via hls.js + MSE.
 *
 * To make the equalizer and the real visualizer work, we route the audio through
 * Web Audio: progressive streams go via the media:// proxy (CORS-clean), and HLS
 * is fed through MSE (same-origin blob), so neither taints the analyser.
 */
export const soundcloudProvider: PlaybackProvider = {
  id: 'soundcloud',
  name: 'SoundCloud',

  createPlayback(track: Track, cb: PlaybackCallbacks): PlaybackHandle {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.crossOrigin = 'anonymous'
    const isHls = track.uri.includes('/stream/hls')
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

    let hls: Hls | null = null
    let wantPlay = false
    let ready = false
    let destroyed = false

    const tryPlay = (): void => {
      if (ready && wantPlay) audio.play().catch((e) => cb.onError(String(e)))
    }

    window.api
      .scResolveStream(track.uri)
      .then((url) => {
        if (destroyed) return
        if (isHls && Hls.isSupported()) {
          hls = new Hls({ enableWorker: true })
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (data.fatal) cb.onError(`HLS error: ${data.type} / ${data.details}`)
          })
          hls.loadSource(url)
          hls.attachMedia(audio)
        } else {
          // Route progressive MP3 through our CORS-clean proxy so the EQ/analyser
          // can tap the element without the browser silencing cross-origin audio.
          audio.src = proxied(url)
        }
        // Tap into the shared Web Audio graph (EQ + visualizer). HLS feeds via MSE
        // (same-origin blob) and progressive via the proxy — neither taints it.
        disconnect = connectElement(audio)
        ready = true
        tryPlay()
      })
      .catch((e) => cb.onError(`SoundCloud: ${e instanceof Error ? e.message : String(e)}`))

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
        if (hls) {
          hls.destroy()
          hls = null
        }
        audio.removeAttribute('src')
        audio.load()
      }
    }
  }
}
