// Mobile 'soundcloud' playback provider. Overrides the desktop one.
//
// On iOS, uses the native NativeAudioBridge (AVPlayer) for playback — this gives
// proper prev/next-track on the lock screen. Blob: URLs (offline) are read into
// base64 and sent to Swift, which writes to /tmp and plays via AVPlayer.
//
// On Android/browser, falls back to <audio> (same as before).
import Hls from 'hls.js'
import type { Track } from '@shared/types'
import type { PlaybackCallbacks, PlaybackHandle, PlaybackProvider } from '@renderer/providers/types'
import { registerProvider } from '@renderer/providers/registry'
import { makeVolumeFader } from './volumeFade'
import { getNativeAudio } from './nativeAudio'

const scProvider: PlaybackProvider = {
  id: 'soundcloud',
  name: 'SoundCloud',

  createPlayback(track: Track, cb: PlaybackCallbacks): PlaybackHandle {
    const native = getNativeAudio()
    if (native) return createNative(track, cb, native)
    return createWeb(track, cb)
  }
}

// ---- Native (iOS) — AVPlayer via WKScriptMessageHandler ----------------------
function createNative(
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

  // Seed duration from the track metadata immediately: iOS AVPlayerItem.duration
  // stays `indefinite` (NaN) for progressive MP3, so the native timeUpdate never
  // carries a real duration → the seek bar/time would read "-:--". The search
  // result already knows the length.
  if (typeof track.durationSec === 'number' && track.durationSec > 0) {
    cb.onDuration(track.durationSec)
  }

  // Set metadata for lock screen
  const art = track.artwork || undefined
  native.setMetadata({ title: track.title, artist: track.artist || 'SoundCloud', artwork: art })

  let wantPlay = false

  window.api
    .scResolveStream(track.uri)
    .then((url) => {
      if (destroyed) return
      // load() handles both network URLs and blob: URLs (converts blob to base64)
      native.load(url).then(() => {
        if (wantPlay) native.play()
      })
    })
    .catch((e) => cb.onError(`SoundCloud: ${e instanceof Error ? e.message : String(e)}`))

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

// ---- Web (<audio>) — Android + browser --------------------------------------
function createWeb(track: Track, cb: PlaybackCallbacks): PlaybackHandle {
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
    play: () => { wantPlay = true; tryPlay() },
    pause: () => { wantPlay = false; audio.pause() },
    seek: (sec) => { if (ready) audio.currentTime = sec },
    setVolume: (v) => fader.setVolume(v),
    setNormalization: () => {},
    setFade: (value, rampSec) => fader.setFade(value, rampSec),
    destroy: () => {
      destroyed = true; fader.destroy(); audio.pause()
      if (hls) { hls.destroy(); hls = null }
      audio.removeAttribute('src'); audio.load()
    }
  }
}

registerProvider(scProvider)
