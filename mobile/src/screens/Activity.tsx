// Activity — real listening stats derived from the shared store's history, plus
// a recent-activity feed. Mirrors desktop ActivityPage, reusing its util fns.
import { useMemo } from 'react'
import { usePlayer } from '@renderer/store'
import { formatTotal, relativeTime } from '@renderer/util'
import { useT } from '../i18n'

export function ActivityScreen({ onClose }: { onClose: () => void }): JSX.Element {
  const recent = usePlayer((s) => s.recentlyPlayed)
  const likes = usePlayer((s) => s.likes)
  // Real accumulated playback time (counts seconds actually played, not the full
  // length of every track touched). Falls back to summed durations if unset.
  const listenedSec = usePlayer((s) => s.listenedSec)
  const playQueue = usePlayer((s) => s.playQueue)
  const t = useT()

  const stats = useMemo(() => {
    const summed = recent.reduce((s, t) => s + (t.durationSec ?? 0), 0)
    const totalSec = listenedSec > 0 ? listenedSec : summed
    const counts = new Map<string, number>()
    let sc = 0
    let ym = 0
    let local = 0
    for (const t of recent) {
      const a = t.artist || 'Unknown'
      counts.set(a, (counts.get(a) ?? 0) + 1)
      if (t.providerId === 'soundcloud') sc++
      else if (t.providerId === 'yandex') ym++
      else local++
    }
    let topArtist = '—'
    let topN = 0
    for (const [a, n] of counts) {
      if (n > topN) {
        topN = n
        topArtist = a
      }
    }
    return { totalSec, topArtist, sc, ym, local }
  }, [recent, listenedSec])

  const now = Date.now()

  return (
    <div className="view">
      <header className="lv-head">
        <button className="np-icon" aria-label="Назад" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="lv-titles">
          <div className="lv-title">{t('activity')}</div>
          <div className="lv-sub">{t('yourStats')}</div>
        </div>
      </header>

      <div className="act-grid">
        <div className="act-card">
          <div className="act-value">{recent.length}</div>
          <div className="act-label">{t('played')}</div>
        </div>
        <div className="act-card">
          <div className="act-value">{formatTotal(stats.totalSec)}</div>
          <div className="act-label">{t('time')}</div>
        </div>
        <div className="act-card">
          <div className="act-value">{likes.length}</div>
          <div className="act-label">{t('likes')}</div>
        </div>
        <div className="act-card">
          <div className="act-value sm">{stats.topArtist}</div>
          <div className="act-label">{t('topArtist')}</div>
        </div>
      </div>

      <div className="act-split">
        {t('sources')}: <strong>{stats.local}</strong> {t('local')} · <strong>{stats.sc}</strong>{' '}
        SoundCloud · <strong>{stats.ym}</strong> Я.Музыка
      </div>

      <h2 style={{ marginTop: 26 }}>{t('recentActivity')}</h2>
      {recent.length === 0 ? (
        <div className="empty">{t('nothingPlayed')}</div>
      ) : (
        <ul className="track-list">
          {recent.map((tr, i) => (
            <li key={tr.id + i} className="track-row" onClick={() => playQueue(recent, i)}>
              <div className="track-cover">
                {tr.artwork ? <img src={tr.artwork} alt="" loading="lazy" /> : <span>♪</span>}
              </div>
              <div className="track-meta">
                <div className="track-title">{tr.title}</div>
                <div className="track-artist">{tr.artist || 'SoundCloud'}</div>
              </div>
              <div className="track-dur">{relativeTime(tr.playedAt, now)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
