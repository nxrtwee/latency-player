// Generic track-list detail view (Любимое, a playlist, Недавнее). Pushed over
// the tab content; reads its tracks from the shared store and plays through it.
import { useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'
import { TrackRow } from '../components/TrackRow'
import { ListMenu } from '../components/ListMenu'
import { downloadTrack, isDownloaded } from '../api/offline'

export function ListView({
  title,
  subtitle,
  tracks,
  onClose,
  onArtist,
  coverKey
}: {
  title: string
  subtitle?: string
  tracks: Track[]
  onClose: () => void
  onArtist?: (track: Track) => void
  // When set, the header shows a custom cover image (user-pickable), falling back
  // to the first track's artwork. Key = source name / playlist id.
  coverKey?: string
}): JSX.Element {
  const playQueue = usePlayer((s) => s.playQueue)
  const customTabCovers = usePlayer((s) => s.customTabCovers)
  const setTabCover = usePlayer((s) => s.setTabCover)
  const resetTabCover = usePlayer((s) => s.resetTabCover)
  const t = useT()
  const [dlAll, setDlAll] = useState<'idle' | 'busy' | 'done'>('idle')
  const [menuOpen, setMenuOpen] = useState(false)

  const customCover = coverKey ? customTabCovers[coverKey] : undefined
  const headerCover = customCover ?? tracks.find((tr) => tr.artwork)?.artwork

  const downloadAll = async (): Promise<void> => {
    if (dlAll === 'busy') return
    setDlAll('busy')
    for (const tr of tracks) {
      if (!isDownloaded(tr.id)) {
        try {
          await downloadTrack(tr)
        } catch {
          /* skip failed track */
        }
      }
    }
    setDlAll('done')
  }

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

      {coverKey && (
        <div className="lv-cover-row">
          <div className="lv-cover">
            {headerCover ? <img src={headerCover} alt="" /> : <span className="lv-cover-glyph">♪</span>}
          </div>
          <div className="lv-cover-actions">
            <button className="ghost-btn" onClick={() => setTabCover(coverKey)}>
              {t('changeCover')}
            </button>
            {customCover && (
              <button className="ghost-btn" onClick={() => resetTabCover(coverKey)}>
                {t('resetCover')}
              </button>
            )}
          </div>
        </div>
      )}

      {tracks.length > 0 ? (
        <div className="lv-actions">
          <button className="lv-play" onClick={() => playQueue(tracks, 0)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            {t('listen')}
          </button>
          <button className="ghost-btn" onClick={downloadAll} disabled={dlAll === 'busy'}>
            {dlAll === 'busy' ? t('downloading') : dlAll === 'done' ? t('downloaded') : t('downloadAll')}
          </button>
          <button className="ghost-btn icon-only" aria-label={t('moreActions')} onClick={() => setMenuOpen(true)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="empty">{t('empty')}</div>
      )}

      {menuOpen && <ListMenu tracks={tracks} onClose={() => setMenuOpen(false)} />}

      <ul className="track-list">
        {tracks.map((tr, i) => (
          <TrackRow key={tr.id + i} track={tr} onPlay={() => playQueue(tracks, i)} onArtist={onArtist} />
        ))}
      </ul>
    </div>
  )
}
