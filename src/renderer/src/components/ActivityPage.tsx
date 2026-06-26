import { useMemo } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTotal, relativeTime } from '../util'
import { ActivityIcon, ClockIcon, HeartIcon, SoundCloudIcon } from './Icons'

export function ActivityPage(): JSX.Element {
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed)
  const likes = usePlayer((s) => s.likes)
  const playQueue = usePlayer((s) => s.playQueue)
  const listenedSec = usePlayer((s) => s.listenedSec)
  const t = useT()

  const stats = useMemo(() => {
    const artistCount = new Map<string, number>()
    let sc = 0
    let local = 0
    for (const t of recentlyPlayed) {
      const a = t.artist || 'Unknown artist'
      artistCount.set(a, (artistCount.get(a) ?? 0) + 1)
      if (t.providerId === 'soundcloud') sc++
      else local++
    }
    let topArtist = '—'
    let topN = 0
    for (const [a, n] of artistCount) {
      if (n > topN) {
        topN = n
        topArtist = a
      }
    }
    return { topArtist, sc, local }
  }, [recentlyPlayed])

  const now = Date.now()

  return (
    <section className="tracklist activity">
      <div className="ph-aurora" />

      <header className="act-header">
        <span className="ph-label">{t('yourStats')}</span>
        <h1 className="ph-title">{t('activity')}</h1>
      </header>

      <div className="act-stats">
        <div className="stat-card">
          <div className="stat-icon">
            <ActivityIcon size={20} />
          </div>
          <span className="stat-value">{recentlyPlayed.length}</span>
          <span className="stat-label">{t('tracksPlayed')}</span>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <ClockIcon size={20} />
          </div>
          <span className="stat-value">{formatTotal(listenedSec)}</span>
          <span className="stat-label">{t('listeningTime')}</span>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <HeartIcon size={20} />
          </div>
          <span className="stat-value">{likes.length}</span>
          <span className="stat-label">{t('likedTracks')}</span>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <SoundCloudIcon size={20} />
          </div>
          <span className="stat-value stat-value-sm">{stats.topArtist}</span>
          <span className="stat-label">{t('topArtist')}</span>
        </div>
      </div>

      <div className="act-split">
        <span>
          {t('sourcesLabel')}: <strong>{stats.local}</strong> {t('local')} ·{' '}
          <strong>{stats.sc}</strong> SoundCloud
        </span>
      </div>

      <h2 className="home-h2">{t('recentActivity')}</h2>
      {recentlyPlayed.length === 0 ? (
        <div className="empty">{t('noActivity')}</div>
      ) : (
        <div className="act-feed">
          {recentlyPlayed.map((tr, i) => (
            <button
              key={`${tr.id}-${i}`}
              className="feed-item"
              onClick={() => playQueue(recentlyPlayed, i)}
            >
              <div className="feed-thumb">
                {tr.artwork ? <img src={tr.artwork} alt="" /> : <span>♫</span>}
              </div>
              <div className="feed-meta">
                <span className="feed-title">
                  {tr.title}
                  <span className="feed-verb"> {t('played')}</span>
                </span>
                <span className="feed-artist">{tr.artist || 'Unknown artist'}</span>
              </div>
              <span className="feed-time">{relativeTime(tr.playedAt, now)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
