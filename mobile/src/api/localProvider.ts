// Mobile 'local' playback provider. Overrides the desktop one (which streams via
// the Electron media:// protocol) with blob: URLs from imported files. Blobs are
// same-origin, so we route them through the Web Audio analyser — the live
// waveform reacts to actual local audio (SoundCloud can't, being cross-origin).
import type { Track } from '@shared/types'
import type { PlaybackCallbacks, PlaybackHandle, PlaybackProvider } from '@renderer/providers/types'
import { registerProvider } from '@renderer/providers/registry'
import { connectElement, resumeAudio } from '@renderer/audio/analyser'
import { getBlobUrl } from './localfiles'

const localProvider: PlaybackProvider = {
  id: 'local',
  name: 'Local files',

  createPlayback(track: Track, cb: PlaybackCallbacks): PlaybackHandle {
    const audio = new Audio()
    audio.preload = 'auto'
    // Prefer the live session blob; fall back to whatever uri the track carries.
    const url = getBlobUrl(track.id) || track.uri
    if (!url) {
      cb.onError('Файл недоступен — переимпортируйте его в Библиотеке.')
      return { play: () => {}, pause: () => {}, seek: () => {}, setVolume: () => {}, destroy: () => {} }
    }
    audio.src = url
    const disconnect = connectElement(audio)

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
      destroy: () => {
        disconnect()
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
    }
  }
}

// Registering with the same id replaces the desktop local provider.
registerProvider(localProvider)
