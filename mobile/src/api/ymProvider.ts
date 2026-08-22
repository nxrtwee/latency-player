// Mobile 'yandex' playback provider. Overrides the desktop one.
//
// On iOS, uses the native NativeAudioBridge (AVPlayer) for playback — this gives
// proper prev/next-track on the lock screen. Blob: URLs (offline) are read into
// base64 and sent to Swift, which writes to /tmp and plays via AVPlayer.
//
// On Android/browser, plays through <audio>: either straight from the URL, or —
// because Yandex's storage sends no CORS headers and a tainted element would make
// the Web Audio graph play silence — by feeding ranged reads into a MediaSource
// (mp3Mse.ts), which is what gets Android the equalizer.
import type { Track } from '@shared/types'
import type { PlaybackCallbacks, PlaybackHandle, PlaybackProvider } from '@renderer/providers/types'
import { registerProvider } from '@renderer/providers/registry'
import { makeTrackAudio } from './graphAudio'
import { feedMp3, mseMode, type Mp3Feed } from './mp3Mse'
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

  // See scProvider: for an OFFLINE track (local /tmp MP3) AVPlayer's computed
  // duration can be wrong for VBR files (→ "random" lock-screen length). When the
  // search result already knows the length, trust it and ignore AVPlayer's.
  const hasMetaDuration = typeof track.durationSec === 'number' && track.durationSec > 0

  unsubs.push(native.on('timeUpdate', (d) => {
    if (destroyed) return
    const pos = d?.position as number | undefined
    if (typeof pos === 'number' && pos >= 0) cb.onTime(pos)
    if (hasMetaDuration) return
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

  // Seed duration from metadata — iOS AVPlayerItem.duration is NaN for progressive
  // MP3, so without this the seek bar/time reads "-:--". (See scProvider.)
  if (typeof track.durationSec === 'number' && track.durationSec > 0) {
    cb.onDuration(track.durationSec)
  }

  native.setMetadata({ title: track.title, artist: track.artist || 'Yandex Music', artwork: track.artwork || undefined, duration: track.durationSec })

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
  // Offline (blob:) plays through the Web Audio graph — equalizer included. An
  // online Yandex stream joins it either because their storage host answers with
  // CORS, or, since it doesn't, by being fed into a MediaSource by hand (mp3Mse.ts);
  // only if that fails too does this fall back to the plain volume fader.
  const ctl = makeTrackAudio(audio)

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
  let feed: Mp3Feed | null = null

  const tryPlay = (): void => {
    if (ready && wantPlay) audio.play().catch((e) => cb.onError(String(e)))
  }

  window.api
    .ymResolveStream(track.uri)
    .then(async (url) => {
      if (destroyed) return
      // Before src: this may set crossOrigin, which only applies to a later load.
      // ('force' skips the probe to exercise the feeder against a CORS-clean host,
      // but never against something already same-origin — that needs no help.)
      const local = /^(blob:|data:)/i.test(url) || url.startsWith(location.origin + '/')
      const graphed = mseMode() === 'force' && !local ? false : await ctl.useGraphIfAllowed(url)
      if (destroyed) return
      if (!graphed) {
        // CORS refused: routing this element through the graph would play silence,
        // so feed the bytes into a MediaSource instead — same-origin by
        // construction, equalizer and all. feedMp3 assigns src itself.
        feed = await feedMp3(audio, url, {
          durationSec: track.durationSec || 0,
          onError: (m) => cb.onError(`Yandex: ${m}`)
        })
        if (destroyed) {
          feed?.destroy()
          return
        }
        if (feed) {
          ctl.useGraph()
          ready = true
          tryPlay()
          return
        }
        // No MediaSource, no byte ranges, or the first read failed — play the URL
        // straight, on the volume fader, exactly as before.
      }
      audio.src = url
      ready = true
      tryPlay()
    })
    .catch((e) => cb.onError(`Yandex: ${e instanceof Error ? e.message : String(e)}`))

  return {
    play: () => { wantPlay = true; tryPlay() },
    pause: () => { wantPlay = false; audio.pause() },
    seek: (sec) => { if (ready) audio.currentTime = sec },
    setVolume: (v) => ctl.setVolume(v),
    setNormalization: (db) => ctl.setNormalization(db),
    setFade: (value, rampSec) => ctl.setFade(value, rampSec),
    destroy: () => {
      destroyed = true
      feed?.destroy()
      ctl.destroy()
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
  }
}

registerProvider(ymProvider)
