import { useEffect, useState } from 'react'
import { usePlayer } from '../store'
import { Logo } from './Logo'

// Random greeting shown on each launch — changes every time.
const TAGLINES: Record<'en' | 'ru', string[]> = {
  ru: [
    'рады видеть вас снова',
    'с возвращением',
    'звук уже греется',
    'продолжим с того же места',
    'тишина закончилась',
    'ваша волна ждёт',
    'давайте погромче',
    'набираем темп'
  ],
  en: [
    'good to see you again',
    'welcome back',
    'warming up the sound',
    'picking up where you left off',
    'the silence is over',
    'your wave is waiting',
    "let's turn it up",
    'getting up to speed'
  ]
}

/**
 * Launch animation. Covers the brief gap where the theme/palette/prefs load from
 * disk (so there's no flash of the default look), then glitches out. Deliberately
 * a touch long and "wow" per design: neon L, a glitched LATENCY wordmark, and a
 * random greeting. Self-removes via onDone after the exit finishes.
 */
export function Splash({ onDone }: { onDone: () => void }): JSX.Element {
  const lang = usePlayer((s) => s.lang)
  const [tagline] = useState(() => {
    const list = TAGLINES[lang] ?? TAGLINES.en
    return list[Math.floor(Math.random() * list.length)]
  })
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    // hold long enough to mask the prefs/theme load, then glitch-fade out
    const fade = setTimeout(() => setClosing(true), 1850)
    const done = setTimeout(onDone, 2500)
    return () => {
      clearTimeout(fade)
      clearTimeout(done)
    }
  }, [onDone])

  return (
    <div className={`splash ${closing ? 'closing' : ''}`} aria-hidden>
      <div className="splash-grain" />
      <div className="splash-stage">
        <div className="splash-logo">
          <Logo size={108} />
        </div>
        <div className="splash-word" data-text="LATENCY">
          LATENCY
        </div>
        <div className="splash-tagline">{tagline}</div>
      </div>
    </div>
  )
}
