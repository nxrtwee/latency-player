// Generic track-list detail view (Любимое, a playlist, Недавнее). Pushed over
// the tab content; reads its tracks from the shared store and plays through it.
import type { Track } from '@shared/types'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'
import { TrackRow } from '../components/TrackRow'

export function ListView({
  title,
  subtitle,
  tracks,
  onClose,
  onArtist
}: {
  title: string
  subtitle?: string
  tracks: Track[]
  onClose: () => void
  onArtist?: (track: Track) => void
}): JSX.Element {
  const playQueue = usePlayer((s) => s.playQueue)
  const t = useT()

  return (
    <div className="listview">
      <header className="lv-head">
        <button className="np-icon" aria-label="Назад" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="lv-titles">
          <div className="lv-title">{title}</div>
          {subtitle && <div className="lv-sub">{subtitle}</div>}
        </div>
      </header>

      {tracks.length > 0 ? (
        <button className="lv-play" onClick={() => playQueue(tracks, 0)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          {t('listen')}
        </button>
      ) : (
        <div className="empty">{t('empty')}</div>
      )}

      <ul className="track-list">
        {tracks.map((tr, i) => (
          <TrackRow key={tr.id + i} track={tr} onPlay={() => playQueue(tracks, i)} onArtist={onArtist} />
        ))}
      </ul>
    </div>
  )
}
