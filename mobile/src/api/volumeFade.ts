// Crossfade for mobile cross-origin streams (SoundCloud / Yandex), which can't go
// through Web Audio — so there's no gain node to ramp. We instead ride the plain
// <audio> element's `volume`, composing the user volume with a fade factor and
// stepping the fade over a short JS interval. (Loudness normalization needs Web
// Audio to boost, so it stays a no-op for these sources — the accepted mobile
// degradation; local files still normalize via the Web Audio path.)

export interface VolumeFader {
  setVolume: (v: number) => void
  setFade: (value: number, rampSec?: number) => void
  destroy: () => void
}

export function makeVolumeFader(audio: HTMLAudioElement): VolumeFader {
  let vol = 1
  let fade = 1
  let timer: ReturnType<typeof setInterval> | null = null

  const apply = (): void => {
    audio.volume = Math.min(1, Math.max(0, vol * fade))
  }
  const stop = (): void => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return {
    setVolume: (v) => {
      vol = v
      apply()
    },
    setFade: (value, rampSec = 0) => {
      const target = Math.max(0, Math.min(1, value))
      stop()
      if (rampSec <= 0) {
        fade = target
        apply()
        return
      }
      const stepMs = 50
      const steps = Math.max(1, Math.round((rampSec * 1000) / stepMs))
      const start = fade
      let i = 0
      timer = setInterval(() => {
        i++
        fade = start + (target - start) * (i / steps)
        apply()
        if (i >= steps) {
          fade = target
          apply()
          stop()
        }
      }, stepMs)
    },
    destroy: stop
  }
}
