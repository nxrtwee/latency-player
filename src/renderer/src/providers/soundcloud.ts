import Hls from 'hls.js'
import type { Track } from '@shared/types'
import type { PlaybackCallbacks, PlaybackHandle, PlaybackProvider } from './types'

/**
 * Plays SoundCloud tracks. The main process resolves track.uri (a transcoding
 * URL) into a real, short-lived CDN URL. Progressive transcodings are plain MP3
 * the <audio> streams directly; HLS transcodings are played via hls.js + MSE.
 */
export const soundcloudProvider: PlaybackProvider = {
  id: 'soundcloud',
  name: 'SoundCloud',

  createPlayback(track: Track, cb: PlaybackCallbacks): PlaybackHandle {
    const audio = new Audio()
    audio.preload = 'auto'
    // NB: SoundCloud streams from a cross-origin CDN with unreliable CORS, so we
    // deliberately do NOT route it through Web Audio (that would silence it).
    // The visualizer falls back to synthetic motion for SoundCloud tracks.
    const isHls = track.uri.includes('/stream/hls')

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
          audio.src = url
        }
        ready = true
        tryPlay()
      })
      .catch((e) => cb.onError(`SoundCloud: ${e instanceof Error ? e.message : String(e)}`))

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
