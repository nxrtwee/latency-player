// Album / playlist detail. Loads the album's tracks through the shared store
// (openAlbum handles both Yandex albums/playlists and SoundCloud sets), then
// plays them through the shared player. Opened as a detail view.
import { useEffect } from 'react'
import type { Album, Track } from '@shared/types'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'
import { TrackRow } from '../components/TrackRow'

export function AlbumScreen({
  album,
  onClose,
  onArtist
}: {
  album: Album
  onClose: () => void
  onArtist?: (track: Track) => void
}): JSX.Element {
  const selected = usePlayer((s) => s.selectedAlbum)
  const tracks = usePlayer((s) => s.albumTracks)
  const loading = usePlayer((s) => s.albumLoading)
  const playQueue = usePlayer((s) => s.playQueue)
  const openAlbum = usePlayer((s) => s.openAlbum)
  const t = useT()

  useEffect(() => {
    void openAlbum(album)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album.id])

  const a = selected?.id === album.id ? selected : album
  const meta = [a.kind === 'playlist' ? t('playlistsSec') : t('albums'), a.year, a.artist]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="view">
      <header className="lv-head">
        <button className="np-icon" aria-label="Назад" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>

      <div className="album-hero">
        <div className="album-cover">
          {a.cover ? <img src={a.cover} alt="" /> : <span>♪</span>}
        </div>
        <h1 className="album-title">{a.title}</h1>
        <div className="artist-meta">{meta}</div>
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
            <TrackRow key={tr.id + i} track={tr} onPlay={() => playQueue(tracks, i)} onArtist={onArtist} />
          ))}
        </ul>
      )}
    </div>
  )
}
