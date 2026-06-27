// Artist page — avatar, name, stats, their tracks, albums and similar artists.
// Driven by the shared store (openArtist / openArtistFromTrack load
// selectedArtist + artistTracks + artistAlbums + artistSimilar). Opened as a
// detail view; albums/similar push further detail levels.
import { useEffect } from 'react'
import type { Artist, Track } from '@shared/types'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'
import { TrackRow } from '../components/TrackRow'
import type { Detail } from '../MobileApp'

function compact(n?: number): string {
  if (n == null) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function ArtistScreen({
  from,
  onClose,
  onOpenDetail
}: {
  from: { track?: Track; artist?: Artist }
  onClose: () => void
  onOpenDetail: (d: Detail) => void
}): JSX.Element {
  const artist = usePlayer((s) => s.selectedArtist)
  const tracks = usePlayer((s) => s.artistTracks)
  const albums = usePlayer((s) => s.artistAlbums)
  const similar = usePlayer((s) => s.artistSimilar)
  const loading = usePlayer((s) => s.artistLoading)
  const playQueue = usePlayer((s) => s.playQueue)
  const openArtist = usePlayer((s) => s.openArtist)
  const openArtistFromTrack = usePlayer((s) => s.openArtistFromTrack)
  const t = useT()

  // Load the artist when this view mounts / its target changes.
  useEffect(() => {
    if (from.artist) void openArtist(from.artist)
    else if (from.track) void openArtistFromTrack(from.track)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.artist?.id, from.track?.id])

  const followers = compact(artist?.followers)
  const listeners = compact(artist?.monthlyListeners)

  return (
    <div className="view">
      <header className="lv-head">
        <button className="np-icon" aria-label="Назад" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>

      <div className="artist-hero">
        <div className="artist-avatar">
          {artist?.avatar ? <img src={artist.avatar} alt="" /> : <span>{artist?.name?.[0] ?? '?'}</span>}
        </div>
        <h1 className="artist-name">{artist?.name ?? from.track?.artist ?? '…'}</h1>
        <div className="artist-meta">
          {listeners && <span>{listeners} {t('listeners')}</span>}
          {listeners && followers && <span className="dot">•</span>}
          {followers && <span>{followers} {t('followers')}</span>}
          {(listeners || followers) && tracks.length > 0 && <span className="dot">•</span>}
          {tracks.length > 0 && <span>{tracks.length} {t('tracks')}</span>}
        </div>
        {tracks.length > 0 && (
          <button className="lv-play" onClick={() => playQueue(tracks, 0)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            {t('listen')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty"><span className="spinner" /></div>
      ) : tracks.length === 0 ? (
        <div className="empty">{t('empty')}</div>
      ) : (
        <ul className="track-list">
          {tracks.map((tr, i) => (
            <TrackRow key={tr.id + i} track={tr} onPlay={() => playQueue(tracks, i)} />
          ))}
        </ul>
      )}

      {albums.length > 0 && (
        <section>
          <div className="section-head"><h2>{t('albums')}</h2></div>
          <div className="card-row">
            {albums.map((al) => (
              <button key={al.id} className="sq-card" onClick={() => onOpenDetail({ kind: 'album', album: al })}>
                <div className="sq-cover">
                  {al.cover ? <img src={al.cover} alt="" loading="lazy" /> : <span>♪</span>}
                </div>
                <div className="sq-title">{al.title}</div>
                {al.year && <div className="sq-sub">{al.year}</div>}
              </button>
            ))}
          </div>
        </section>
      )}

      {similar.length > 0 && (
        <section>
          <div className="section-head"><h2>{t('similarArtists')}</h2></div>
          <div className="artist-grid">
            {similar.map((ar) => (
              <button key={ar.id} className="artist-cell" onClick={() => onOpenDetail({ kind: 'artist', artist: ar })}>
                <div className="artist-cell-av">
                  {ar.avatar ? <img src={ar.avatar} alt="" loading="lazy" /> : <span>{ar.name[0]}</span>}
                </div>
                <span className="artist-cell-name">{ar.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
