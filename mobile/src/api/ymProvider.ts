// Mobile 'yandex' playback provider. Overrides the desktop one, which routes the
// signed CDN MP3 through the Electron media:// proxy (for Web Audio / the EQ).
// That scheme does not exist on mobile, so we play the resolved URL directly.
//
// Yandex serves plain progressive MP3 (no HLS branch). Offline downloads resolve
// to a same-origin blob: URL; online to a short-lived signed CDN URL. Both play
// through a plain <audio>; cross-origin CDN audio isn't tapped by Web Audio, so
// the visualizer uses synthetic motion (the accepted mobile behavior).
//
// On iOS, we use the native LatencyAudio plugin (AVPlayer) instead of <audio>,
// which gives us proper prev/next-track buttons on the lock screen.
import type { Track } from '@shared/types'
import type { PlaybackCallbacks, PlaybackHandle, PlaybackProvider } from '@renderer/providers/types'
import { registerProvider } from '@renderer/providers/registry'
import { makeVolumeFader } from './volumeFade'
import { getNativeAudio } from './nativeAudio'

const ymProvider: PlaybackProvider = {
  id: 'yandex',
  name: 'Yandex Music',

  createPlayback(track: Track, cb: PlaybackCallbacks): PlaybackHandle {
    const native = getNativeAudio()
    if (native) return createNativeYM(track, cb, native)
    return createWebYM(track, cb)
  }
}

// ---- Native audio (iOS) — AVPlayer via Capacitor plugin ---------------------
function createNativeYM(
  track: Track,
  cb: PlaybackCallbacks,
  native: NonNullable<ReturnType<typeof getNativeAudio>>
): PlaybackHandle {
  let destroyed = false
  const unsubs: (() => void)[] = []

  unsubs.push(native.on('timeUpdate', (d) => {
    if (destroyed) return
    const pos = d?.position as number | undefined
    if (typeof pos === 'number' && pos >= 0) cb.onTime(pos)
    const dur = d?.duration as number | undefined
    if (typeof dur === 'number' && dur > 0) cb.onDuration(dur)
  }))
  unsubs.push(native.on('ended', () => { if (!destroyed) cb.onEnded() }))
  unsubs.push(native.on('playingChange', (d) => {
    if (!destroyed) cb.onPlayingChange(d?.playing === true)
  }))
  unsubs.push(native.on('error', (d) => {
    if (!destroyed) cb.onError(String(d?.message ?? 'native audio error'))
  }))

  // Set metadata for lock screen
  void native.setMetadata({
    title: track.title,
    artist: track.artist || 'Yandex Music',
    artwork: track.artwork
  })

  let wantPlay = false

  window.api
    .ymResolveStream(track.uri)
    .then((url) => {
      if (destroyed) return
      void native.load(url).then(() => {
        if (wantPlay) void native.play()
      })
    })
    .catch((e) => cb.onError(`Yandex: ${e instanceof Error ? e.message : String(e)}`))

  return {
    play: () => { wantPlay = true; void native.play() },
    pause: () => { wantPlay = false; void native.pause() },
    seek: (sec) => { void native.seek(sec) },
    setVolume: (v) => { void native.setVolume(v) },
    setNormalization: () => {},
    setFade: () => {},
    destroy: () => {
      destroyed = true
      for (const u of unsubs) u()
      native.destroy()
    }
  }
}

// ---- Web audio (<audio> element) — Android + browser -------------------------
function createWebYM(track: Track, cb: PlaybackCallbacks): PlaybackHandle {
  const audio = new Audio()
  audio.preload = 'auto'
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
    play: () => { wantPlay = true; tryPlay() },
    pause: () => { wantPlay = false; audio.pause() },
    seek: (sec) => { if (ready) audio.currentTime = sec },
    setVolume: (v) => fader.setVolume(v),
    setNormalization: () => {},
    setFade: (value, rampSec) => fader.setFade(value, rampSec),
    destroy: () => {
      destroyed = true
      fader.destroy()
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
  }
}

// Registering with the same id replaces the desktop Yandex provider.
registerProvider(ymProvider)
