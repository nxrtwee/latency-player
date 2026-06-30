// Mobile 'soundcloud' playback provider. Overrides the desktop one, which (since
// v0.2.0, for the equalizer) routes the stream through the Electron media://
// proxy so Web Audio can tap it. That scheme does not exist on mobile, so the
// shared provider's `audio.src = media://…` would break ALL SoundCloud playback.
//
// Here we play the resolved CDN URL directly, exactly like the mobile 0.1.0
// build did: cross-origin CDN audio plays fine through a plain <audio> element;
// we just don't tap Web Audio (cross-origin would silence it), so the visualizer
// falls back to synthetic motion — the accepted mobile behavior.
import Hls from 'hls.js'
import type { Track } from '@shared/types'
import type { PlaybackCallbacks, PlaybackHandle, PlaybackProvider } from '@renderer/providers/types'
import { registerProvider } from '@renderer/providers/registry'
import { makeVolumeFader } from './volumeFade'

const scProvider: PlaybackProvider = {
  id: 'soundcloud',
  name: 'SoundCloud',

  createPlayback(track: Track, cb: PlaybackCallbacks): PlaybackHandle {
    const audio = new Audio()
    audio.preload = 'auto'
    const isHls = track.uri.includes('/stream/hls')
    const fader = makeVolumeFader(audio)

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
        // Offline downloads resolve to a same-origin blob: URL — always play it
        // directly (HLS is never downloaded). Otherwise honor the HLS branch.
        if (isHls && !url.startsWith('blob:') && Hls.isSupported()) {
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
      setVolume: (v) => fader.setVolume(v),
      // Cross-origin stream: no Web Audio, so no loudness boost on mobile.
      setNormalization: () => {},
      setFade: (value, rampSec) => fader.setFade(value, rampSec),
      destroy: () => {
        destroyed = true
        fader.destroy()
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

// Registering with the same id replaces the desktop SoundCloud provider.
registerProvider(scProvider)
