import { useEffect, useMemo, useRef } from 'react'
import { usePlayer } from '../store'
import { sampleLevels } from '../audio/analyser'

/** Deterministic pseudo-waveform bar heights from a seed string — the static shape. */
function seededBars(seed: string, count: number): number[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const bars: number[] = []
  for (let i = 0; i < count; i++) {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    h >>>= 0
    const noise = (h % 1000) / 1000
    const envelope = 0.4 + 0.6 * Math.abs(Math.sin(i * 0.38))
    bars.push(0.14 + noise * 0.86 * envelope)
  }
  return bars
}

interface WaveformProps {
  seed: string
  positionSec: number
  durationSec: number
  onSeek: (sec: number) => void
  bars?: number
  /** How far the bars stretch with the music. ~0.3 = barely, ~0.6 = lively. */
  reactivity?: number
  className?: string
}

export function Waveform({
  seed,
  positionSec,
  durationSec,
  onSeek,
  bars = 72,
  reactivity = 0.5,
  className
}: WaveformProps): JSX.Element {
  const heights = useMemo(() => seededBars(seed || 'latency', bars), [seed, bars])
  const frac = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0
  const graphics = usePlayer((s) => s.graphics)
  const hwAccel = usePlayer((s) => s.hwAccel)

  const containerRef = useRef<HTMLDivElement>(null)
  const reactRef = useRef(reactivity)
  reactRef.current = reactivity

  // Drive the bars imperatively (no React re-render per frame). One rAF loop runs
  // for the life of the component; each bar eases toward a target that comes from
  // live frequency energy when available, or a gentle synthetic breath otherwise.
  // Graphics presets gate this loop — it's the dominant, skin-independent GPU cost
  // (a constant rAF on ~90 bars), so 'performance' freezes it outright and the
  // eco tiers stop it on pause / throttle it to ~30fps.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Freeze the visualizer — no animation loop at all — on the performance
    // preset, or whenever HW acceleration is off (software compositing makes a
    // per-frame transform on ~90 bars far too costly). Bars rest at their static
    // seeded heights (transform cleared); the played fraction still updates via
    // React. Eliminates the always-on compositing.
    if (graphics === 'performance' || !hwAccel) {
      const spans = el.children as HTMLCollectionOf<HTMLElement>
      for (let i = 0; i < spans.length; i++) spans[i].style.transform = ''
      return
    }

    const levels = new Float32Array(bars)
    const display = new Float32Array(bars)
    let raf = 0
    let idle: ReturnType<typeof setTimeout> | undefined
    let deadFrames = 0
    let lastWrite = 0

    const tick = (): void => {
      const st = usePlayer.getState()
      const playing = st.isPlaying
      const eco = st.graphics !== 'standard'
      const now = performance.now()

      // Frame-rate cap (Settings slider). rAF still wakes, but skipping the
      // transform writes leaves the compositor idle between frames. 120 = off.
      const cap = st.fpsLimit
      if (cap > 0 && cap < 120 && now - lastWrite < 1000 / cap - 1) {
        raf = requestAnimationFrame(tick)
        return
      }

      const spans = el.children as HTMLCollectionOf<HTMLElement>
      const n = spans.length
      const hasSignal = playing && sampleLevels(levels)
      // Cross-origin media (SoundCloud's CDN) feeds the analyser silence, but on
      // some platforms it reports a faint near-constant instead of a clean zero —
      // which would leave the bars almost static. Sum the energy and treat a
      // sustained low signal as "no signal", falling back to synthetic motion.
      let energy = 0
      if (hasSignal) for (let i = 0; i < levels.length; i++) energy += levels[i]
      deadFrames = energy > 0.5 ? 0 : Math.min(deadFrames + 1, 999)
      const live = hasSignal && deadFrames < 10
      const nowSec = now / 1000
      let moving = 0
      for (let i = 0; i < n; i++) {
        let target: number
        if (!playing) {
          target = 0
        } else if (live) {
          // Lift the floor a touch so even quiet bars keep a little life.
          target = 0.08 + levels[i]
        } else {
          // No analyser signal (cross-origin CDN / SoundCloud): keep the bars
          // softly alive with two detuned sine waves phased per bar.
          const phase = i * 0.5
          target =
            0.2 +
            0.18 * (Math.sin(nowSec * 2.1 + phase) * 0.5 + 0.5) +
            0.1 * (Math.sin(nowSec * 5.3 + phase * 1.7) * 0.5 + 0.5)
        }
        // Rise quickly, fall slowly — reads as a soft pulse, never twitchy.
        const ease = target > display[i] ? 0.45 : 0.14
        display[i] += (target - display[i]) * ease
        if (display[i] > 0.002) moving++
        spans[i].style.transform = `scaleY(${(1 + display[i] * reactRef.current).toFixed(3)})`
      }
      lastWrite = now

      // Eco presets: once paused and fully settled at rest, idle the loop on a
      // slow heartbeat instead of rAF every frame — zero GPU work while paused.
      // Playback resuming is picked up within one heartbeat (~200ms).
      if (eco && !playing && moving === 0) {
        idle = setTimeout(tick, 200)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (idle) clearTimeout(idle)
    }
    // Re-attach when the bar count, graphics preset, or HW-accel state changes.
  }, [bars, graphics, hwAccel])

  function handleClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (durationSec <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    onSeek(Math.max(0, Math.min(1, x)) * durationSec)
  }

  return (
    <div ref={containerRef} className={`wave ${className ?? ''}`} onClick={handleClick}>
      {heights.map((h, i) => (
        <span
          key={i}
          className={`wave-bar ${i / bars <= frac ? 'played' : ''}`}
          style={{ height: `${Math.round(h * 100)}%` }}
        />
      ))}
    </div>
  )
}
