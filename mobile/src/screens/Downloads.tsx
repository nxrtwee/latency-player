// Offline downloads hub. Lists tracks saved to the device, plays them (offline
// when available), and removes them. Reached from Home, Library and Liked.
import { useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'
import { TrackRow } from '../components/TrackRow'
import { downloadedTracks, offlineDiagnostics, removeAll, totalBytes } from '../api/offline'

function fmtSize(bytes: number): string {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
}

export function DownloadsScreen({
  onClose,
  onArtist
}: {
  onClose: () => void
  onArtist?: (track: Track) => void
}): JSX.Element {
  const playQueue = usePlayer((s) => s.playQueue)
  const t = useT()
  const [tick, setTick] = useState(0)
  const bump = (): void => setTick((n) => n + 1)
  const [diag, setDiag] = useState('')

  // re-read fresh each render (tick forces it after add/remove)
  void tick
  const tracks = downloadedTracks()
  const size = totalBytes()

  const sub = tracks.length > 0 ? [`${tracks.length}`, fmtSize(size)].filter(Boolean).join(' · ') : ''

  return (
    <div className="listview">
      <header className="lv-head">
        <button className="np-icon" aria-label="Назад" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="lv-titles">
          <div className="lv-title">{t('downloads')}</div>
          {sub && <div className="lv-sub">{sub}</div>}
        </div>
      </header>

      {tracks.length > 0 ? (
        <div className="lv-actions">
          <button className="lv-play" onClick={() => playQueue(tracks, 0)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            {t('listen')}
          </button>
          <button
            className="ghost-btn danger"
            onClick={async () => {
              await removeAll()
              bump()
            }}
          >
            {t('clearAll')}
          </button>
          <button className="ghost-btn" onClick={async () => setDiag(await offlineDiagnostics())}>
            Диагностика
          </button>
        </div>
      ) : (
        <div className="empty">{t('noDownloads')}</div>
      )}

      {diag && (
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            fontSize: 11,
            lineHeight: 1.5,
            margin: '0 16px 10px',
            padding: 10,
            borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--text-dim)'
          }}
          onClick={() => setDiag('')}
        >
          {diag}
        </pre>
      )}

      <ul className="track-list">
        {tracks.map((tr, i) => (
          <TrackRow
            key={tr.id + i}
            track={tr}
            onPlay={() => playQueue(tracks, i)}
            onArtist={onArtist}
            onOfflineChange={bump}
          />
        ))}
      </ul>
    </div>
  )
}
