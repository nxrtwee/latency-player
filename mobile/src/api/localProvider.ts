// Mobile 'local' playback provider. Overrides the desktop one.
//
// On iOS, uses the native NativeAudioBridge (AVPlayer) for playback — this gives
// proper prev/next-track on the lock screen. Blob: URLs are read into base64 and
// sent to Swift, which writes to /tmp and plays via AVPlayer.
//
// On Android/browser, falls back to <audio> + Web Audio analyser (real visualizer).
import type { Track } from '@shared/types'
import type { PlaybackCallbacks, PlaybackHandle, PlaybackProvider } from '@renderer/providers/types'
import { registerProvider } from '@renderer/providers/registry'
import { connectElement, resumeAudio } from '@renderer/audio/analyser'
import { getBlobUrl } from './localfiles'
import { getNativeAudio } from './nativeAudio'

const localProvider: PlaybackProvider = {
  id: 'local',
  name: 'Local files',

  createPlayback(track: Track, cb: PlaybackCallbacks): PlaybackHandle {
    const native = getNativeAudio()
    const url = getBlobUrl(track.id) || track.uri
    if (!url) {
      cb.onError('Файл недоступен — переимпортируйте его в Библиотеке.')
      return { play: () => {}, pause: () => {}, seek: () => {}, setVolume: () => {}, setNormalization: () => {}, setFade: () => {}, destroy: () => {} }
    }
    if (native) return createNativeLocal(track, cb, native, url)
    return createWebLocal(track, cb, url)
  }
}

function createNativeLocal(
  track: Track,
  cb: PlaybackCallbacks,
  native: NonNullable<ReturnType<typeof getNativeAudio>>,
  url: string
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

  native.setMetadata({ title: track.title, artist: track.artist || 'Local', artwork: track.artwork || undefined })

  let wantPlay = false
  native.load(url).then(() => { if (wantPlay) native.play() })

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

function createWebLocal(
  track: Track,
  cb: PlaybackCallbacks,
  url: string
): PlaybackHandle {
  const audio = new Audio()
  audio.preload = 'auto'
  audio.src = url
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
    play: () => { resumeAudio(); void audio.play().catch((e) => cb.onError(String(e))) },
    pause: () => audio.pause(),
    seek: (sec) => { audio.currentTime = sec },
    setVolume: (v) => { audio.volume = Math.min(1, Math.max(0, v)) },
    setNormalization: (db) => audioCtl.setNormalization(db),
    setFade: (value, rampSec) => audioCtl.setFade(value, rampSec),
    destroy: () => { audioCtl.disconnect(); audio.pause(); audio.removeAttribute('src'); audio.load() }
  }
}

registerProvider(localProvider)
