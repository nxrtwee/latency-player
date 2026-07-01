// Mobile 'yandex' playback provider. Overrides the desktop one.
//
// On iOS, uses the native NativeAudioBridge (AVPlayer) for playback — this gives
// proper prev/next-track on the lock screen. Blob: URLs (offline) are read into
// base64 and sent to Swift, which writes to /tmp and plays via AVPlayer.
//
// On Android/browser, falls back to <audio> (same as before).
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
  unsubs.push(native.on('nativeError', (d) => {
    if (!destroyed) cb.onError(`iOS audio: ${d?.message ?? 'playback failed'}`)
  }))

  native.setMetadata({ title: track.title, artist: track.artist || 'Yandex Music', artwork: track.artwork || undefined })

  let wantPlay = false

  window.api
    .ymResolveStream(track.uri)
    .then((url) => {
      if (destroyed) return
      native.load(url).then(() => { if (wantPlay) native.play() })
    })
    .catch((e) => cb.onError(`Yandex: ${e instanceof Error ? e.message : String(e)}`))

  return {
    play: () => { wantPlay = true; native.play() },
    pause: () => { wantPlay = false; native.pause() },
    seek: (sec) => native.seek(sec),
    setVolume: (v) => native.setVolume(v),
    setNormalization: () => {},
    setFade: () => {},
    destroy: () => { destroyed = true; for (const u of unsubs) u(); native.destroy() }
  }
}

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
    .then((url) => { if (!destroyed) { audio.src = url; ready = true; tryPlay() } })
    .catch((e) => cb.onError(`Yandex: ${e instanceof Error ? e.message : String(e)}`))

  return {
    play: () => { wantPlay = true; tryPlay() },
    pause: () => { wantPlay = false; audio.pause() },
    seek: (sec) => { if (ready) audio.currentTime = sec },
    setVolume: (v) => fader.setVolume(v),
    setNormalization: () => {},
    setFade: (value, rampSec) => fader.setFade(value, rampSec),
    destroy: () => { destroyed = true; fader.destroy(); audio.pause(); audio.removeAttribute('src'); audio.load() }
  }
}

registerProvider(ymProvider)
