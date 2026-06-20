import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayer } from '../store'
import { formatTime } from '../util'
import { Slider } from './Slider'
import { PlayIcon, PauseIcon, PlusIcon, CloseIcon } from './Icons'
import type { Track } from '@shared/types'

interface SyncEditorProps {
  track: Track
  seedText: string
  onClose: () => void
  onSaved: () => void
}

interface Row {
  text: string
  time: number | null
}

/**
 * Manual lyric sync + text editor. The user can fix the text of each line, add
 * or remove lines, and tap (Space) on each line at the right moment while the
 * track plays to stamp its time. Saves a real LRC.
 */
export function SyncEditor({ track, seedText, onClose, onSaved }: SyncEditorProps): JSX.Element {
  const positionSec = usePlayer((s) => s.positionSec)
  const durationSec = usePlayer((s) => s.durationSec)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const seek = usePlayer((s) => s.seek)

  const [rows, setRows] = useState<Row[]>(() =>
    seedText
      .split('\n')
      .map((l) => l.trim())
      .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
      .map((text) => ({ text, time: null }))
  )
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const setText = (i: number, text: string): void =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, text } : r)))
  const removeRow = (i: number): void => {
    setRows((prev) => prev.filter((_, j) => j !== i))
    setCursor((c) => (c > i ? c - 1 : c))
  }
  const addRow = (i: number): void => {
    setRows((prev) => [...prev.slice(0, i + 1), { text: '', time: null }, ...prev.slice(i + 1)])
  }

  const stampCurrent = useCallback(() => {
    setRows((prev) => {
      if (cursor >= prev.length) return prev
      return prev.map((r, j) => (j === cursor ? { ...r, time: positionSec } : r))
    })
    setCursor((c) => Math.min(c + 1, rows.length))
  }, [cursor, positionSec, rows.length])

  const undo = useCallback(() => {
    setCursor((c) => {
      const t = Math.max(0, c - 1)
      setRows((prev) => prev.map((r, j) => (j === t ? { ...r, time: null } : r)))
      return t
    })
  }, [])

  // keyboard shortcuts only when not typing in an input
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        stampCurrent()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        undo()
      } else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stampCurrent, undo, onClose])

  useEffect(() => {
    const el = listRef.current?.querySelector('.sync-line.cursor') as HTMLElement | null
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [cursor])

  const stamped = rows.filter((r) => r.time !== null && r.text.trim()).length
  const canSave = stamped >= 1

  async function save(): Promise<void> {
    const out = rows
      .filter((r) => r.time !== null && r.text.trim())
      .map((r) => ({ timeSec: r.time as number, text: r.text.trim() }))
    if (!out.length) return
    await window.api.saveManualSync(track.title, track.artist || '', track.durationSec, out)
    onSaved()
  }

  return (
    <div className="sync-editor">
      <div className="sync-head">
        <div>
          <div className="sync-title">Sync &amp; edit lyrics</div>
          <div className="sync-sub">
            Tap <kbd>Space</kbd> on each line while it plays · <kbd>⌫</kbd> undo · edit text inline ·{' '}
            {stamped}/{rows.length} stamped
          </div>
        </div>
        <div className="sync-actions">
          <button className="btn-round" title="Play/Pause" onClick={togglePlay}>
            {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
          </button>
          <span className="sync-time">{formatTime(positionSec)}</span>
          <button className="sync-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="sync-btn primary" disabled={!canSave} onClick={save}>
            Save sync
          </button>
        </div>
      </div>

      <div className="sync-seek">
        <span className="sync-time">{formatTime(positionSec)}</span>
        <Slider
          value={Math.min(positionSec, durationSec || 0)}
          max={durationSec || 0}
          step={0.1}
          onChange={seek}
          ariaLabel="Seek"
        />
        <span className="sync-time">{formatTime(durationSec)}</span>
      </div>

      <div className="sync-list" ref={listRef}>
        {rows.map((row, i) => (
          <div key={i} className={`sync-line ${i === cursor ? 'cursor' : ''} ${row.time !== null ? 'stamped' : ''}`}>
            <button
              className="sync-stamp"
              title={row.time !== null ? 'Jump to this time' : 'Not stamped'}
              onClick={() => {
                if (row.time !== null) seek(row.time)
                setCursor(i)
              }}
            >
              {row.time !== null ? formatTime(row.time) : '—'}
            </button>
            <div className="sync-row-ctrls">
              <button className="sync-row-btn" title="Add line below" onClick={() => addRow(i)}>
                <PlusIcon size={14} />
              </button>
              <button className="sync-row-btn" title="Delete line" onClick={() => removeRow(i)}>
                <CloseIcon size={14} />
              </button>
            </div>
            <input
              className="sync-text-input"
              value={row.text}
              placeholder="(empty line)"
              onFocus={() => setCursor(i)}
              onChange={(e) => setText(i, e.target.value)}
            />
          </div>
        ))}
        {rows.length === 0 && (
          <button className="sync-btn ghost" onClick={() => addRow(-1)}>
            + Add first line
          </button>
        )}
      </div>

      <div className="sync-footer">
        <button className="sync-tap" onClick={stampCurrent} disabled={cursor >= rows.length}>
          Tap line {Math.min(cursor + 1, rows.length)} / {rows.length}
        </button>
      </div>
    </div>
  )
}
