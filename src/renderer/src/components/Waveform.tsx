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

  const containerRef = useRef<HTMLDivElement>(null)
  const reactRef = useRef(reactivity)
  reactRef.current = reactivity

  // Drive the bars imperatively (no React re-render per frame). One rAF loop runs
  // for the life of the component; each bar eases toward a target that comes from
  // live frequency energy when available, or a gentle synthetic breath otherwise.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const levels = new Float32Array(bars)
    const display = new Float32Array(bars)
    let raf = 0

    const tick = (): void => {
      const spans = el.children as HTMLCollectionOf<HTMLElement>
      const n = spans.length
      const playing = usePlayer.getState().isPlaying
      const live = playing && sampleLevels(levels)
      const now = performance.now() / 1000
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
            0.18 * (Math.sin(now * 2.1 + phase) * 0.5 + 0.5) +
            0.1 * (Math.sin(now * 5.3 + phase * 1.7) * 0.5 + 0.5)
        }
        // Rise quickly, fall slowly — reads as a soft pulse, never twitchy.
        const ease = target > display[i] ? 0.45 : 0.14
        display[i] += (target - display[i]) * ease
        spans[i].style.transform = `scaleY(${(1 + display[i] * reactRef.current).toFixed(3)})`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // Re-attach when the bar count changes (spans are recreated).
  }, [bars])

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
