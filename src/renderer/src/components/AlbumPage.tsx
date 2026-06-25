import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTotal } from '../util'
import { PlayIcon, ShuffleIcon, ClockIcon } from './Icons'
import { TrackRow } from './TrackRow'
import { ProviderBadge } from './ProviderBadge'

export function AlbumPage(): JSX.Element {
  const t = useT()
  const album = usePlayer((s) => s.selectedAlbum)
  const tracks = usePlayer((s) => s.albumTracks)
  const loading = usePlayer((s) => s.albumLoading)
  const playQueue = usePlayer((s) => s.playQueue)
  const shuffle = usePlayer((s) => s.shuffle)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)

  if (!album) return <section className="tracklist" />

  function play(index: number): void {
    playQueue(tracks, index)
  }
  function shufflePlay(): void {
    if (!tracks.length) return
    if (!shuffle) toggleShuffle()
    play(Math.floor(Math.random() * tracks.length))
  }

  const totalSec = tracks.reduce((s, tr) => s + (tr.durationSec ?? 0), 0)
  // SoundCloud albums often lack their own cover — fall back to a track's art.
  const cover = album.cover || tracks.find((tr) => tr.artwork)?.artwork

  return (
    <section className="tracklist album">
      <div className="ph-aurora" />

      <header className="ph">
        <div className="ph-cover">
          {cover ? <img src={cover} alt="" /> : <span className="ph-cover-glyph">♪</span>}
        </div>
        <div className="ph-info">
          <span className="ph-label">
            <ProviderBadge provider={album.provider} size={15} />
            <span>{album.kind === 'playlist' ? t('playlist') : t('album')}</span>
          </span>
          <h1 className="ph-title">{album.title}</h1>
          <div className="ph-meta">
            {album.artist && (
              <>
                <span>{album.artist}</span>
                <span className="dot">•</span>
              </>
            )}
            {album.year != null && (
              <>
                <span>{album.year}</span>
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
