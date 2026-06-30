import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTotal } from '../util'
import { PlayIcon, ShuffleIcon, ClockIcon, RadioIcon } from './Icons'
import { TrackRow } from './TrackRow'
import { ProviderBadge } from './ProviderBadge'

function compact(n?: number): string {
  if (n == null) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function ArtistPage(): JSX.Element {
  const t = useT()
  const artist = usePlayer((s) => s.selectedArtist)
  const tracks = usePlayer((s) => s.artistTracks)
  const similar = usePlayer((s) => s.artistSimilar)
  const albums = usePlayer((s) => s.artistAlbums)
  const loading = usePlayer((s) => s.artistLoading)
  const playQueue = usePlayer((s) => s.playQueue)
  const openArtist = usePlayer((s) => s.openArtist)
  const openAlbum = usePlayer((s) => s.openAlbum)
  const shuffle = usePlayer((s) => s.shuffle)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)
  const startArtistRadioById = usePlayer((s) => s.startArtistRadioById)
  const ymAuth = usePlayer((s) => s.ymAuth)

  if (!artist) return <section className="tracklist" />

  function play(index: number): void {
    playQueue(tracks, index)
  }
  function shufflePlay(): void {
    if (!tracks.length) return
    if (!shuffle) toggleShuffle()
    play(Math.floor(Math.random() * tracks.length))
  }

  const totalSec = tracks.reduce((s, t) => s + (t.durationSec ?? 0), 0)
  // SoundCloud reports followers; Yandex reports monthly listeners.
  const isYm = artist.provider === 'yandex'
  const statText = compact(isYm ? artist.monthlyListeners : artist.followers)
  const statLabel = isYm ? t('listeners') : t('followers')
  // Per-track play counts (SoundCloud exposes them; Yandex's API doesn't).
  const hasPlays = tracks.some((tr) => tr.playCount != null)

  return (
    <section className="tracklist artist">
      <div className="ph-aurora" />

      <header className="ph artist-head">
        <div className="artist-avatar">
          {artist.avatar ? <img src={artist.avatar} alt="" /> : <span>{artist.name[0] ?? '?'}</span>}
        </div>
        <div className="ph-info">
          <span className="ph-label">
            <ProviderBadge provider={artist.provider} size={15} />
            <span>{t('artist')}</span>
          </span>
          <h1 className="ph-title">{artist.name}</h1>
          <div className="ph-meta">
            {statText && (
              <>
                <span>
                  {statText} {statLabel}
                </span>
                <span className="dot">•</span>
              </>
            )}
            <span>
              {tracks.length} {t('tracks')}
            </span>
            {totalSec > 0 && (
              <>
                <span className="dot">•</span>
                <span>{formatTotal(totalSec)}</span>
              </>
            )}
          </div>
          <div className="ph-actions">
            <button className="btn-play" onClick={() => play(0)} disabled={!tracks.length}>
              <PlayIcon size={18} />
              <span>{t('play')}</span>
            </button>
            <button
              className="btn-round"
              title="Shuffle"
              onClick={shufflePlay}
              disabled={!tracks.length}
            >
              <ShuffleIcon size={18} />
            </button>
            {isYm && ymAuth && (
              <button
                className="btn-round"
                title={t('waveByArtist')}
                onClick={() => void startArtistRadioById(artist.id, 'yandex', artist.name)}
              >
                <RadioIcon size={18} />
              </button>
            )}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="empty">{t('loadingTracks')}</div>
      ) : tracks.length === 0 ? (
        <div className="empty">{t('noArtistTracks')}</div>
      ) : (
        <>
          <div className={`tl-head ${hasPlays ? 'with-plays' : ''}`}>
            <span className="c-index">#</span>
            <span className="c-title">{t('title')}</span>
            <span className="c-artist">{t('artist')}</span>
            <span className="c-like" />
            {hasPlays && <span className="c-plays" />}
            <span className="c-time">
              <ClockIcon size={15} />
            </span>
            <span className="c-more" />
          </div>
          <div className="rows">
            {tracks.map((track, i) => (
              <TrackRow
                key={`${track.id}-${i}`}
                track={track}
                index={i}
                onPlay={play}
                plays={hasPlays ? track.playCount ?? 0 : undefined}
              />
            ))}
          </div>
        </>
      )}

      {albums.length > 0 && (
        <div className="similar">
          <h2 className="home-h2">{t('albums')}</h2>
          <div className="similar-row">
            {albums.map((al) => (
              <button
                key={`${al.provider}-${al.id}`}
                className="album-card"
                onClick={() => openAlbum(al)}
                title={al.title}
              >
                <div className="album-cover">
                  {al.cover ? <img src={al.cover} alt="" /> : <span>♪</span>}
                </div>
                <span className="album-title">{al.title}</span>
                {al.year != null && <span className="album-year">{al.year}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {similar.length > 0 && (
        <div className="similar">
          <h2 className="home-h2">{t('similarArtists')}</h2>
          <div className="similar-row">
            {similar.map((a) => (
              <button key={a.id} className="similar-card" onClick={() => openArtist(a)} title={a.name}>
                <div className="similar-av">
                  {a.avatar ? <img src={a.avatar} alt="" /> : <span>{a.name[0] ?? '?'}</span>}
                </div>
                <span className="similar-name">{a.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
