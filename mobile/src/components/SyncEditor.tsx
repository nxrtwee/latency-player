// Manual lyric sync (touch). Seeds line text from existing lyrics, the user taps
// a big button at the start of each line while it plays to stamp its time, then
// saves a manual sync (which fetchLyrics returns first afterwards).
import { useEffect, useRef, useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface Row {
  text: string
  time: number | null
}

export function SyncEditor({ track, onClose }: { track: Track; onClose: () => void }): JSX.Element {
  const position = usePlayer((s) => s.positionSec)
  const duration = usePlayer((s) => s.durationSec)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const seek = usePlayer((s) => s.seek)
  const t = useT()

  const [rows, setRows] = useState<Row[]>([])
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // seed line text from whatever lyrics we already have
  useEffect(() => {
    let alive = true
    window.api.getLyrics(track.title, track.artist || '', track.durationSec, true).then((r) => {
      if (!alive) return
      const src = r?.lines?.length ? r.lines.map((l) => l.text) : (r?.plain || '').split('\n')
      const seeded = src.map((s) => s.trim()).filter((s, i, a) => !(s === '' && a[i - 1] === ''))
      setRows(seeded.map((text) => ({ text, time: null })))
    })
    return () => {
      alive = false
    }
  }, [track.id, track.title, track.artist, track.durationSec])

  const stamp = (): void => {
    setRows((prev) => prev.map((r, j) => (j === cursor ? { ...r, time: position } : r)))
    setCursor((c) => Math.min(c + 1, rows.length))
  }
  const undo = (): void => {
    setCursor((c) => {
      const tIdx = Math.max(0, c - 1)
      setRows((prev) => prev.map((r, j) => (j === tIdx ? { ...r, time: null } : r)))
      return tIdx
    })
  }

  useEffect(() => {
    listRef.current?.querySelector('.se-line.cursor')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [cursor])

  const stamped = rows.filter((r) => r.time !== null && r.text.trim()).length

  const save = async (): Promise<void> => {
    const out = rows
      .filter((r) => r.time !== null && r.text.trim())
      .map((r) => ({ timeSec: r.time as number, text: r.text.trim() }))
    if (!out.length) return
    await window.api.saveManualSync(track.title, track.artist || '', track.durationSec, out)
    onClose()
  }
  const reset = async (): Promise<void> => {
    await window.api.deleteManualSync(track.title, track.artist || '', track.durationSec)
    setRows((prev) => prev.map((r) => ({ ...r, time: null })))
    setCursor(0)
  }

  return (
    <div className="se">
      <div className="se-top">
        <button className="np-icon" aria-label="Назад" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="se-titles">
          <div className="se-title">{t('manualSync')}</div>
          <div className="se-sub">{t('tapBeat')} · {stamped}/{rows.length}</div>
        </div>
        <button className="se-save" disabled={stamped < 1} onClick={save}>{t('save')}</button>
      </div>

      <div className="se-seek">
        <span>{fmt(position)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(position, duration || 0)}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span>{fmt(duration)}</span>
      </div>

      <div className="se-list" ref={listRef}>
        {rows.map((row, i) => (
          <div key={i} className={'se-line' + (i === cursor ? ' cursor' : '') + (row.time !== null ? ' stamped' : '')}>
            <button
              className="se-stamp"
              onClick={() => {
                if (row.time !== null) seek(row.time)
                setCursor(i)
              }}
            >
              {row.time !== null ? fmt(row.time) : '—'}
            </button>
            <input
              className="se-text"
              value={row.text}
              onFocus={() => setCursor(i)}
              onChange={(e) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, text: e.target.value } : r)))}
            />
          </div>
        ))}
        {rows.length === 0 && <div className="empty">{t('noLyrics')}</div>}
      </div>

      <div className="se-footer">
        <button className="se-ctl" onClick={undo} aria-label="Undo">⌫</button>
        <button className="se-ctl play" onClick={togglePlay}>
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button className="se-tap" onClick={stamp} disabled={cursor >= rows.length}>
          {t('tapBeat')} · {Math.min(cursor + 1, rows.length)}/{rows.length}
        </button>
        <button className="se-ctl" onClick={reset} aria-label="Reset">{t('reset')}</button>
      </div>
    </div>
  )
}
