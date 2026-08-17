// Mobile 'local' playback provider. Overrides the desktop one.
//
// On iOS, uses the native NativeAudioBridge (AVPlayer) for playback — this gives
// proper prev/next-track on the lock screen. Blob: URLs are read into base64 and
// sent to Swift, which writes to /tmp and plays via AVPlayer.
//
// On Android/browser, falls back to <audio> + Web Audio analyser (real visualizer).
//
// The URL is resolved asynchronously: a track imported in an earlier session has
// no live blob: URL, only a copy on disk that localfiles.resolveUrl() reads back
// (see localfiles.ts). `createPlayback` is synchronous, so both handles below
// attach the source when it arrives and remember a play() that came in first.
import type { Track } from '@shared/types'
import type { PlaybackCallbacks, PlaybackHandle, PlaybackProvider } from '@renderer/providers/types'
import { registerProvider } from '@renderer/providers/registry'
import { connectElement, resumeAudio } from '@renderer/audio/analyser'
import { resolveUrl } from './localfiles'
import { getNativeAudio } from './nativeAudio'

const MISSING = 'Файл недоступен — переимпортируйте его в Библиотеке.'

const localProvider: PlaybackProvider = {
  id: 'local',
  name: 'Local files',

  createPlayback(track: Track, cb: PlaybackCallbacks): PlaybackHandle {
    const native = getNativeAudio()
    // A blob: uri on the track itself is this session's import — resolveUrl finds
    // it by id too, so it only matters for tracks built outside the library.
    const url = resolveUrl(track.id).then((u) => u || track.uri || null)
    if (native) return createNativeLocal(track, cb, native, url)
    return createWebLocal(cb, url)
  }
}

function createNativeLocal(
  track: Track,
  cb: PlaybackCallbacks,
  native: NonNullable<ReturnType<typeof getNativeAudio>>,
  url: Promise<string | null>
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
  void url.then((u) => {
    if (destroyed) return
    if (!u) return cb.onError(MISSING)
    native.load(u).then(() => { if (wantPlay && !destroyed) native.play() })
  })

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

function createWebLocal(cb: PlaybackCallbacks, url: Promise<string | null>): PlaybackHandle {
  const audio = new Audio()
  audio.preload = 'auto'
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

  let destroyed = false
  let wantPlay = false
  let pendingSeek: number | null = null
  void url.then((u) => {
    if (destroyed) return
    if (!u) return cb.onError(MISSING)
    audio.src = u
    if (pendingSeek != null) audio.currentTime = pendingSeek
    if (wantPlay) { resumeAudio(); void audio.play().catch((e) => cb.onError(String(e))) }
  })

  return {
    play: () => {
      wantPlay = true
      if (!audio.src) return // the source attaches itself below, then plays
      resumeAudio()
      void audio.play().catch((e) => cb.onError(String(e)))
    },
    pause: () => { wantPlay = false; audio.pause() },
    seek: (sec) => {
      if (audio.src) audio.currentTime = sec
      else pendingSeek = sec
    },
    setVolume: (v) => { audio.volume = Math.min(1, Math.max(0, v)) },
    setNormalization: (db) => audioCtl.setNormalization(db),
    setFade: (value, rampSec) => audioCtl.setFade(value, rampSec),
    destroy: () => {
      destroyed = true
      audioCtl.disconnect()
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
  }
}

registerProvider(localProvider)
