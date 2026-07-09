import { useMemo } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTotal } from '../util'
import { useCover } from '../cover'
import {
  HeartIcon,
  ClockIcon,
  FolderIcon,
  CompassIcon,
  DownloadIcon,
  PlayIcon,
  PauseIcon,
  ActivityIcon,
  YandexMusicIcon
} from './Icons'
import type { Track } from '@shared/types'
import type { Source } from '../store'

function greeting(t: ReturnType<typeof useT>): string {
  const h = new Date().getHours()
  if (h < 5) return t('greetNight')
  if (h < 12) return t('greetMorning')
  if (h < 18) return t('greetAfternoon')
  return t('greetEvening')
}

/**
 * postgen Home — a bento dashboard.
 *
 * Instead of the stacked hero + rows of oldgen/nextgen, this lays the home
 * surface out as a grid of variably-sized tiles: a large now-playing / hero
 * tile, quick-access chips, My Wave, a mixes strip, a jump-back grid and a
 * stats widget. Only rendered when `skin === 'postgen'` (HomePage gate); reuses
 * the exact same store data.
 */
export function HomeBento(): JSX.Element {
  const setSource = usePlayer((s) => s.setSource)
  const openMix = usePlayer((s) => s.openMix)
  const openPlaylist = usePlayer((s) => s.openPlaylist)
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed)
  const playlists = usePlayer((s) => s.playlists)
  const likes = usePlayer((s) => s.likes)
  const scLikes = usePlayer((s) => s.scLikes)
  const tracks = usePlayer((s) => s.tracks)
  const playQueue = usePlayer((s) => s.playQueue)
  const mixes = usePlayer((s) => s.mixes)
  const mixesReal = usePlayer((s) => s.mixesReal)
  const showHomeMixes = usePlayer((s) => s.showHomeMixes)
  const scAuth = usePlayer((s) => s.scAuth)
  const ymAuth = usePlayer((s) => s.ymAuth)
  const myWave = usePlayer((s) => s.myWave)
  const playMyWave = usePlayer((s) => s.playMyWave)
  const offlineCount = usePlayer((s) => s.offlineIds.length)
  const offlineTracks = usePlayer((s) => s.offlineTracks)
  const listenedSec = usePlayer((s) => s.listenedSec)

  // Now-playing for the hero tile.
  const queue = usePlayer((s) => s.queue)
  const currentIndex = usePlayer((s) => s.currentIndex)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const toggleLyrics = usePlayer((s) => s.toggleLyrics)
  const nowTrack = currentIndex >= 0 ? queue[currentIndex] : undefined
  const nowCover = useCover(nowTrack)

  const t = useT()

  const mixesPinnedOn = localStorage.getItem('lp.homeMixes') === '1'
  const mixesVisible = showHomeMixes && (scAuth != null || mixesPinnedOn)

  const likesCount = useMemo(
    () => new Set([...likes, ...scLikes].map((x) => x.id)).size,
    [likes, scLikes]
  )
  const { topArtist, topArtistArt } = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const tr of recentlyPlayed) {
      const a = (tr.artist || '').trim()
      if (a) counts[a] = (counts[a] || 0) + 1
    }
    let top = '—'
    let max = 0
    for (const [a, n] of Object.entries(counts)) {
      if (n > max) {
        max = n
        top = a
      }
    }
    // A cover from a track BY the top artist — the Activity tile's own signature
    // (not an echo of now-playing).
    const artCover = recentlyPlayed.find(
      (tr) => (tr.artist || '').trim() === top && tr.artwork
    )?.artwork
    return { topArtist: top, topArtistArt: artCover }
  }, [recentlyPlayed])

  const jumpBack = recentlyPlayed.slice(0, 6)

  // Representative cover per section — a strongly-blurred backdrop so each tile
  // carries the mood of what's inside it (heavier blur than the now-playing
  // hero, which stays legible). Each section gets a DISTINCT track so the tiles
  // don't all echo the now-playing cover:
  //   Likes     → most recently liked track
  //   Recent    → the 2nd-most-recent track (skip #0 = now playing)
  //   Downloaded/Local → their own list
  //   Explore   → a mix cover (discovery), else a deeper recent track
  //   Activity  → the top artist's artwork
  const art = (list: Track[], from = 0): string | undefined =>
    list.slice(from).find((x) => x.artwork)?.artwork
  // Local/global likes first (their covers are the user's own, reliably loaded);
  // SC likes only as a fallback (some SC artwork hosts can be slow/unreachable).
  const likedList = [...likes, ...scLikes]

  const likedArt = art(likedList)
  const recentArt = art(recentlyPlayed, 1)
  const exploreArt = mixes.find((m) => m.cover)?.cover ?? art(recentlyPlayed, 3)

  const quick: {
    key: Source
    label: string
    sub: string
    Icon: typeof HeartIcon
    cover?: string
  }[] = [
    { key: 'likes', label: t('yourLikes'), sub: `${likesCount}`, Icon: HeartIcon, cover: likedArt },
    {
      key: 'recent',
      label: t('recentlyPlayed'),
      sub: `${recentlyPlayed.length}`,
      Icon: ClockIcon,
      cover: recentArt
    },
    ymAuth
      ? {
          key: 'offline',
          label: t('downloaded'),
          sub: `${offlineCount}`,
          Icon: DownloadIcon,
          cover: art(offlineTracks)
        }
      : {
          key: 'local',
          label: t('localFiles'),
          sub: `${tracks.length}`,
          Icon: FolderIcon,
          cover: art(tracks)
        },
    { key: 'explore', label: t('explore'), sub: '', Icon: CompassIcon, cover: exploreArt }
  ]

  return (
    <section className="tracklist home pg-home">
      <div className="pg-bento">
        {/* Hero / now playing — spans two columns + two rows. */}
        <div className={`pg-tile pg-tile-hero ${nowTrack ? 'has-track' : ''}`}>
          {nowTrack && nowCover && (
            <div className="pg-hero-bg" style={{ backgroundImage: `url(${nowCover})` }} />
          )}
          <div className="pg-hero-inner">
            <span className="pg-hero-eyebrow">{greeting(t)}</span>
            {nowTrack ? (
              <>
                <h1 className="pg-hero-title">{nowTrack.title}</h1>
                <p className="pg-hero-sub">{nowTrack.artist || t('listen')}</p>
                <div className="pg-hero-actions">
                  <button className="pg-hero-play" onClick={togglePlay}>
                    {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
                    <span>{isPlaying ? t('pause') : t('play')}</span>
                  </button>
                  <button className="pg-hero-ghost" onClick={toggleLyrics}>
                    {t('openFullscreen')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h1 className="pg-hero-title">
                  {t('whatListen')} <span className="accent">{t('listen')}</span>?
                </h1>
                <p className="pg-hero-sub">{t('welcomeBlurb')}</p>
                <div className="pg-hero-actions">
                  <button className="pg-hero-play" onClick={() => setSource('explore')}>
                    <CompassIcon size={18} />
                    <span>{t('explore')}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Quick access — small tiles with a blurred section-artwork backdrop. */}
        {quick.map((q) => (
          <button key={q.key} className="pg-tile pg-tile-quick" onClick={() => setSource(q.key)}>
            {q.cover && (
              <div className="pg-tile-bg" style={{ backgroundImage: `url(${q.cover})` }} />
            )}
            <div className="pg-quick-icon">
              <q.Icon size={19} />
            </div>
            <span className="pg-quick-label">{q.label}</span>
            {q.sub && <span className="pg-quick-sub">{q.sub}</span>}
          </button>
        ))}

        {/* My Wave — wide tile (Yandex only). */}
        {ymAuth && myWave && (
          <div
            className="pg-tile pg-tile-wave"
            role="button"
            tabIndex={0}
            onClick={() => setSource('wave')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setSource('wave')
            }}
          >
            <span className="pg-wave-disc">
              <span className="wave-ring r1" />
              <span className="wave-ring r2" />
              <span className="pg-wave-core">
                <YandexMusicIcon size={30} />
              </span>
            </span>
            <span className="pg-wave-text">
              <span className="pg-wave-label">{t('yandexMusic')}</span>
              <span className="pg-wave-title">{t('myWave')}</span>
            </span>
            <button
              className="pg-wave-play"
              title={t('playWave')}
              onClick={(e) => {
                e.stopPropagation()
                playMyWave(0)
              }}
            >
              <PlayIcon size={18} />
            </button>
          </div>
        )}

        {/* Stats widget. */}
        <button className="pg-tile pg-tile-stats" onClick={() => setSource('activity')}>
          {topArtistArt && (
            <div className="pg-tile-bg" style={{ backgroundImage: `url(${topArtistArt})` }} />
          )}
          <div className="pg-stats-head">
            <ActivityIcon size={16} />
            <span>{t('activity')}</span>
          </div>
          <div className="pg-stats-rows">
            <div className="pg-stat">
              <span className="pg-stat-value">{formatTotal(listenedSec)}</span>
              <span className="pg-stat-key">{t('listened')}</span>
            </div>
            <div className="pg-stat">
              <span className="pg-stat-value pg-stat-artist">{topArtist}</span>
              <span className="pg-stat-key">{t('topArtist')}</span>
            </div>
          </div>
        </button>

        {/* Mixes strip. */}
        {mixesVisible && mixes.length > 0 && (
          <div className="pg-tile pg-tile-mixes">
            <div className="pg-tile-head">
              <h2>{t('yourMixes')}</h2>
              <button className="pg-see-all" onClick={() => setSource('explore')}>
                {t('explore')}
              </button>
            </div>
            <div className="pg-mix-row">
              {mixes.slice(0, 6).map((mix) => (
                <button
                  key={mix.id}
                  className="pg-mix-card"
                  onClick={() => openMix(mix)}
                  title={mix.title}
                >
                  <div className="pg-mix-art">
                    {mix.cover ? <img src={mix.cover} alt="" /> : <span>♪</span>}
                    <span className="pg-mix-badge">{mixesReal ? 'SC' : 'MIX'}</span>
                  </div>
                  <span className="pg-mix-title">{mix.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Jump back in. */}
        {jumpBack.length > 0 && (
          <div className="pg-tile pg-tile-jump">
            <div className="pg-tile-head">
              <h2>{t('jumpBackIn')}</h2>
            </div>
            <div className="pg-jump-grid">
              {jumpBack.map((tr: Track, i) => (
                <button
                  key={`${tr.id}-${i}`}
                  className="pg-jump-card"
                  onClick={() => playQueue(recentlyPlayed, i)}
                  title={`${tr.title} — ${tr.artist || ''}`}
                >
                  <div className="pg-jump-art">
                    {tr.artwork ? <img src={tr.artwork} alt="" /> : <span>♫</span>}
                  </div>
                  <span className="pg-jump-title">{tr.title}</span>
                  <span className="pg-jump-sub">{tr.artist || t('listen')}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Playlists strip. */}
        {playlists.length > 0 && (
          <div className="pg-tile pg-tile-jump">
            <div className="pg-tile-head">
              <h2>{t('yourPlaylists')}</h2>
            </div>
            <div className="pg-jump-grid">
              {playlists.slice(0, 6).map((pl) => (
                <button
                  key={pl.id}
                  className="pg-jump-card"
                  onClick={() => openPlaylist(pl.id)}
                  title={pl.name}
                >
                  <div className="pg-jump-art pl">
                    {pl.tracks.find((tr) => tr.artwork)?.artwork ? (
                      <img src={pl.tracks.find((tr) => tr.artwork)?.artwork} alt="" />
                    ) : (
                      <span>♪</span>
                    )}
                  </div>
                  <span className="pg-jump-title">{pl.name}</span>
                  <span className="pg-jump-sub">
                    {pl.tracks.length} {t('tracks')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
