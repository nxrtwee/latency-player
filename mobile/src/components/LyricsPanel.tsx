// Karaoke lyrics panel for the fullscreen player. Fetches via window.api
// (LRCLIB synced → highlight + autoscroll + click-to-seek; plain text otherwise).
import { useEffect, useRef, useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'

interface Lyrics {
  synced: boolean
  manual?: boolean
  lines: { timeSec: number; text: string }[]
  plain: string | null
}

export function LyricsPanel({
  track,
  positionSec,
  onSeek,
  onSync
}: {
  track: Track
  positionSec: number
  onSeek: (sec: number) => void
  onSync?: () => void
}): JSX.Element {
  const t = useT()
  const setKaraokeImage = usePlayer((s) => s.setKaraokeImage)
  const resetKaraokeBg = usePlayer((s) => s.resetKaraokeBg)
  const karaokeBg = usePlayer((s) => s.karaokeBgs[track.id])
  const [data, setData] = useState<Lyrics | null>(null)
  const [loading, setLoading] = useState(true)
  const viewRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setData(null)
    window.api
      .getLyrics(track.title, track.artist || '', track.durationSec, true)
      .then((r) => {
        if (alive) {
          setData(r as Lyrics | null)
          setLoading(false)
        }
      })
      .catch(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [track.id, track.title, track.artist, track.durationSec])

  // index of the current synced line
  const lines = data?.synced ? data.lines : []
  let active = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeSec <= positionSec + 0.15) active = i
    else break
  }

  // autoscroll the active line to center
  useEffect(() => {
    const el = activeRef.current
    const view = viewRef.current
    if (el && view) {
      const top = el.offsetTop - view.clientHeight / 2 + el.clientHeight / 2
      view.scrollTo({ top, behavior: 'smooth' })
    }
  }, [active])

  return (
    <div className="lyr">
      <div className="lyr-head">
        <span>{t('lyrics')}</span>
        <div className="lyr-head-actions">
          <button
            className="lyr-sync-btn"
            onClick={() => (karaokeBg ? resetKaraokeBg(track.id) : void setKaraokeImage(track.id))}
          >
            {karaokeBg ? t('kbgReset') : t('trackBackground')}
          </button>
          {data && (
            <button className="lyr-sync-btn" onClick={onSync}>
              {data.manual ? t('editSync') : t('manualSync')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="lyr-msg"><span className="spinner" /></div>
      ) : !data ? (
        <div className="lyr-msg">{t('noLyrics')}</div>
      ) : data.synced ? (
        <div className="lyr-view" ref={viewRef}>
          {lines.map((l, i) => (
            <p
              key={i}
              ref={i === active ? activeRef : undefined}
              className={'lyr-line' + (i === active ? ' active' : '') + (i < active ? ' past' : '')}
              onClick={() => onSeek(l.timeSec)}
            >
              {l.text || '♪'}
            </p>
          ))}
        </div>
      ) : (
        <div className="lyr-view plain">
          {(data.plain || '').split('\n').map((line, i) => (
            <p key={i} className="lyr-line static">{line || ' '}</p>
          ))}
        </div>
      )}
    </div>
  )
}
