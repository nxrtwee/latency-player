import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTotal } from '../util'
import { PlayIcon, ShuffleIcon, ClockIcon } from './Icons'
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
  const loading = usePlayer((s) => s.artistLoading)
  const playQueue = usePlayer((s) => s.playQueue)
  const shuffle = usePlayer((s) => s.shuffle)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)

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
  const followers = compact(artist.followers)

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
            {followers && (
              <>
                <span>
                  {followers} {t('followers')}
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
          </div>
        </div>
      </header>

      {loading ? (
        <div className="empty">{t('loadingTracks')}</div>
      ) : tracks.length === 0 ? (
        <div className="empty">{t('noArtistTracks')}</div>
      ) : (
        <>
          <div className="tl-head">
            <span className="c-index">#</span>
            <span className="c-title">{t('title')}</span>
            <span className="c-artist">{t('artist')}</span>
            <span className="c-like" />
            <span className="c-time">
              <ClockIcon size={15} />
            </span>
            <span className="c-more" />
          </div>
          <div className="rows">
            {tracks.map((track, i) => (
              <TrackRow key={`${track.id}-${i}`} track={track} index={i} onPlay={play} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
