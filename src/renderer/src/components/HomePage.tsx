import { useEffect, useState } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import {
  HeartIcon,
  ClockIcon,
  FolderIcon,
  CompassIcon,
  RefreshIcon,
  SoundCloudIcon,
  YandexMusicIcon,
  DownloadIcon,
  PlayIcon
} from './Icons'
import type { Track } from '@shared/types'
import type { Source } from '../store'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function Card({ track, onClick }: { track: Track; onClick: () => void }): JSX.Element {
  return (
    <button className="home-card" onClick={onClick} title={`${track.title} — ${track.artist || ''}`}>
      <div className="home-card-art">
        {track.artwork ? <img src={track.artwork} alt="" /> : <span>♫</span>}
      </div>
      <span className="home-card-title">{track.title}</span>
      <span className="home-card-sub">{track.artist || 'Unknown artist'}</span>
    </button>
  )
}

export function HomePage(): JSX.Element {
  const setSource = usePlayer((s) => s.setSource)
  const openPlaylist = usePlayer((s) => s.openPlaylist)
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed)
  const playlists = usePlayer((s) => s.playlists)
  const likes = usePlayer((s) => s.likes)
  const scLikes = usePlayer((s) => s.scLikes)
  const tracks = usePlayer((s) => s.tracks)
  const playQueue = usePlayer((s) => s.playQueue)
  const mixes = usePlayer((s) => s.mixes)
  const mixesLoading = usePlayer((s) => s.mixesLoading)
  const mixesReal = usePlayer((s) => s.mixesReal)
  const openMix = usePlayer((s) => s.openMix)
  const generateMixes = usePlayer((s) => s.generateMixes)
  const scAuth = usePlayer((s) => s.scAuth)
  const ymAuth = usePlayer((s) => s.ymAuth)
  const scConnecting = usePlayer((s) => s.scConnecting)
  const connectSoundCloud = usePlayer((s) => s.connectSoundCloud)
  const disconnectSoundCloud = usePlayer((s) => s.disconnectSoundCloud)
  const mixSource = usePlayer((s) => s.mixSource)
  const setMixSource = usePlayer((s) => s.setMixSource)
  const showHomeMixes = usePlayer((s) => s.showHomeMixes)
  const myWave = usePlayer((s) => s.myWave)
  const playMyWave = usePlayer((s) => s.playMyWave)
  const offlineCount = usePlayer((s) => s.offlineIds.length)
  const t = useT()

  const [firstRun] = useState(() => !localStorage.getItem('lp.visited'))
  useEffect(() => {
    localStorage.setItem('lp.visited', '1')
  }, [])

  const jumpBack = recentlyPlayed.slice(0, 8)

  const quick: { key: Source; label: string; sub: string; Icon: typeof HeartIcon }[] = [
    {
      key: 'likes',
      label: t('yourLikes'),
      sub: `${new Set([...likes, ...scLikes].map((x) => x.id)).size} ${t('tracks')}`,
      Icon: HeartIcon
    },
    {
      key: 'recent',
      label: t('recentlyPlayed'),
      sub: `${recentlyPlayed.length} ${t('tracks')}`,
      Icon: ClockIcon
    },
    // When signed in to Yandex, My Wave gets its own banner above the mixes, so
    // this slot becomes Downloaded (avoids duplicating the Wave tile).
    ymAuth
      ? { key: 'offline', label: t('downloaded'), sub: `${offlineCount} ${t('tracks')}`, Icon: DownloadIcon }
      : { key: 'local', label: t('localFiles'), sub: `${tracks.length} ${t('tracks')}`, Icon: FolderIcon },
    { key: 'explore', label: t('explore'), sub: 'SoundCloud', Icon: CompassIcon }
  ]

  return (
    <section className="tracklist home">
      <div className="ph-aurora" />

      <div className="home-hero">
        {firstRun ? (
          <>
            <span className="home-eyebrow">{t('welcome')}</span>
            <h1 className="home-greet">
              {t('thisIs')} <span className="accent">Latency</span>
            </h1>
            <p className="home-sub">{t('welcomeBlurb')}</p>
          </>
        ) : (
          <>
            <span className="home-eyebrow">{greeting()}</span>
            <h1 className="home-greet">
              {t('whatListen')} <span className="accent">{t('listen')}</span>?
            </h1>
          </>
        )}
      </div>

      <div className="home-quick">
        {quick.map((q) => (
          <button key={q.key} className="quick-tile" onClick={() => setSource(q.key)}>
            <div className="quick-icon">
              <q.Icon size={20} />
            </div>
            <div className="quick-text">
              <span className="quick-label">{q.label}</span>
              <span className="quick-sub">{q.sub}</span>
            </div>
          </button>
        ))}
      </div>

      {ymAuth && myWave && (
        <div
          className="home-wave"
          role="button"
          tabIndex={0}
          onClick={() => setSource('wave')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setSource('wave')
          }}
          title={t('myWave')}
        >
          <span className="home-wave-disc">
            <span className="wave-ring r1" />
            <span className="wave-ring r2" />
            <span className="home-wave-core">
              <YandexMusicIcon size={34} />
            </span>
          </span>
          <span className="home-wave-text">
            <span className="home-wave-label">{t('yandexMusic')}</span>
            <span className="home-wave-title">{t('myWave')}</span>
            <span className="home-wave-sub">{t('myWaveBannerSub')}</span>
          </span>
          <button
            className="home-wave-play"
            title={t('playWave')}
            onClick={(e) => {
              e.stopPropagation()
              playMyWave(0)
            }}
          >
            <PlayIcon size={20} />
          </button>
        </div>
      )}

      {showHomeMixes && (
      <div className="home-section">
        <div className="home-h2-row">
          <h2 className="home-h2">{t('yourMixes')}</h2>
          <span className="home-h2-sub">
            {scAuth ? (mixesReal ? t('realMixes') : t('fromScLikes')) : t('refreshedDaily')}
          </span>
          {scAuth ? (
            <div className="sc-account">
              <div className="mix-toggle">
                <button
                  className={mixSource === 'sc' ? 'active' : ''}
                  onClick={() => setMixSource('sc')}
                >
                  SoundCloud
                </button>
                <button
                  className={mixSource === 'generated' ? 'active' : ''}
                  onClick={() => setMixSource('generated')}
                >
                  Generated
                </button>
              </div>
              <span className="sc-chip" title={`Connected as ${scAuth.name}`}>
                {scAuth.avatar && <img src={scAuth.avatar} alt="" />}
                {scAuth.name}
              </span>
              <button
                className={`mix-refresh ${mixesLoading ? 'spinning' : ''}`}
                title="Refresh mixes"
                disabled={mixesLoading}
                onClick={() => generateMixes(true)}
              >
                <RefreshIcon size={15} />
              </button>
              <button className="sc-signout" onClick={() => disconnectSoundCloud()}>
                {t('signOut')}
              </button>
            </div>
          ) : (
            <button
              className={`mix-refresh ${mixesLoading ? 'spinning' : ''}`}
              title="Refresh mixes"
              disabled={mixesLoading}
              onClick={() => generateMixes(true)}
            >
              <RefreshIcon size={15} />
            </button>
          )}
        </div>

        <div className="mix-grid">
          {mixes.length === 0 && mixesLoading
            ? [0, 1, 2, 3, 4].map((i) => <div key={i} className="mix-card skeleton" />)
            : mixes.map((mix) => (
                <button
                  key={mix.id}
                  className="mix-card"
                  onClick={() => openMix(mix)}
                  title={mix.title}
                >
                  <div className="mix-art">
                    {mix.cover ? <img src={mix.cover} alt="" /> : <span>♪</span>}
                    <span className="mix-badge">{mixesReal ? 'SC' : 'MIX'}</span>
                  </div>
                  <span className="home-card-title">{mix.title}</span>
                  <span className="home-card-sub">{mix.subtitle}</span>
                </button>
              ))}

          {!scAuth && !mixesLoading && (
            <div className="mix-promo">
              <div className="mix-promo-icon">
                <SoundCloudIcon size={26} />
              </div>
              <div className="mix-promo-text">
                <span className="mix-promo-title">{t('wantRealMixes')}</span>
                <span className="mix-promo-sub">{t('promoSub')}</span>
              </div>
              <button
                className="btn-play sc-signin"
                disabled={scConnecting}
                onClick={() => connectSoundCloud()}
              >
                <SoundCloudIcon size={18} />
                <span>{scConnecting ? t('connecting') : t('signInSc')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {jumpBack.length > 0 && (
        <div className="home-section">
          <h2 className="home-h2">{t('jumpBackIn')}</h2>
          <div className="home-grid">
            {jumpBack.map((tr, i) => (
              <Card key={`${tr.id}-${i}`} track={tr} onClick={() => playQueue(recentlyPlayed, i)} />
            ))}
          </div>
        </div>
      )}

      {playlists.length > 0 && (
        <div className="home-section">
          <h2 className="home-h2">{t('yourPlaylists')}</h2>
          <div className="home-grid">
            {playlists.map((pl) => (
              <button
                key={pl.id}
                className="home-card"
                onClick={() => openPlaylist(pl.id)}
                title={pl.name}
              >
                <div className="home-card-art pl">
                  {pl.tracks.find((t) => t.artwork)?.artwork ? (
                    <img src={pl.tracks.find((t) => t.artwork)?.artwork} alt="" />
                  ) : (
                    <span>♪</span>
                  )}
                </div>
                <span className="home-card-title">{pl.name}</span>
                <span className="home-card-sub">
                  {pl.tracks.length} {t('tracks')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="home-foot">
        latency · local + streaming in one place
      </div>
    </section>
  )
}
