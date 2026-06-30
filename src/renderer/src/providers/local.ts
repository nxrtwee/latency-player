import type { Track } from '@shared/types'
import type { PlaybackCallbacks, PlaybackHandle, PlaybackProvider } from './types'
import { connectElement, resumeAudio } from '../audio/analyser'

/** Plays local files via a plain HTMLAudioElement against our media:// protocol. */
export const localProvider: PlaybackProvider = {
  id: 'local',
  name: 'Local files',

  createPlayback(track: Track, cb: PlaybackCallbacks): PlaybackHandle {
    const audio = new Audio()
    audio.preload = 'auto'
    // CORS-clean (paired with Access-Control-Allow-Origin on the media:// handler)
    // so Web Audio doesn't silence the output when we tap it for the visualizer.
    audio.crossOrigin = 'anonymous'
    audio.src = track.uri
    const audioCtl = connectElement(audio)

    audio.addEventListener('timeupdate', () => cb.onTime(audio.currentTime))
    audio.addEventListener('durationchange', () => {
      if (Number.isFinite(audio.duration)) cb.onDuration(audio.duration)
    })
    audio.addEventListener('play', () => cb.onPlayingChange(true))
    audio.addEventListener('pause', () => cb.onPlayingChange(false))
    audio.addEventListener('ended', () => cb.onEnded())
    audio.addEventListener('error', () =>
      cb.onError(audio.error ? `audio error (code ${audio.error.code})` : 'unknown audio error')
    )

    return {
      play: () => {
        resumeAudio()
        void audio.play().catch((e) => cb.onError(String(e)))
      },
      pause: () => audio.pause(),
      seek: (sec) => {
        audio.currentTime = sec
      },
      setVolume: (v) => {
        audio.volume = Math.min(1, Math.max(0, v))
      },
      setNormalization: (db) => audioCtl.setNormalization(db),
      setFade: (value, rampSec) => audioCtl.setFade(value, rampSec),
      destroy: () => {
        audioCtl.disconnect()
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
    }
  }
}
