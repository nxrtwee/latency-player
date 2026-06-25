import { usePlayer } from '../store'
import { formatTime } from '../util'
import { PlayIcon, HeartIcon, HeartFilledIcon, DownloadIcon, CheckIcon } from './Icons'
import { PlaylistMenu } from './PlaylistMenu'
import { ProviderBadge } from './ProviderBadge'
import type { Track } from '@shared/types'

function Thumb({ track }: { track: Track }): JSX.Element {
  const glyph = track.providerId === 'soundcloud' ? '☁' : track.providerId === 'yandex' ? 'Я' : '♫'
  return (
    <div className="thumb-wrap">
      {track.artwork ? (
        <img className="thumb" src={track.artwork} alt="" loading="lazy" />
      ) : (
        <div className="thumb placeholder">{glyph}</div>
      )}
      <ProviderBadge provider={track.providerId} size={10} className="on-thumb" />
    </div>
  )
}

interface TrackRowProps {
  track: Track
  index: number
  onPlay: (index: number) => void
}

export function TrackRow({ track, index, onPlay }: TrackRowProps): JSX.Element {
  const currentTrackId = usePlayer((s) =>
    s.currentIndex >= 0 ? s.queue[s.currentIndex]?.id : undefined
  )
  const liked = usePlayer((s) => s.likedIds.has(track.id))
  const toggleLike = usePlayer((s) => s.toggleLike)
  const openArtistFromTrack = usePlayer((s) => s.openArtistFromTrack)
  const openArtist = usePlayer((s) => s.openArtist)
  const cached = usePlayer((s) => s.offlineIds.includes(track.id))
  const downloading = usePlayer((s) => s.downloading.includes(track.id))
  const downloadTrack = usePlayer((s) => s.downloadTrack)
  const removeOffline = usePlayer((s) => s.removeOffline)
  const playing = track.id === currentTrackId
  const canOpenArtist = track.artistId || track.artist
  const isSc = track.providerId === 'soundcloud'

  return (
    <div className={`trow ${playing ? 'active' : ''}`} onDoubleClick={() => onPlay(index)}>
      <div className="c-index">
        {playing ? (
          <span className="eq">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <>
            <span className="t-num">{index + 1}</span>
            <button className="t-play" title="Play" onClick={() => onPlay(index)}>
              <PlayIcon size={14} />
            </button>
          </>
        )}
      </div>
      <div className="c-title">
        <Thumb track={track} />
        <span className="t-title">{track.title}</span>
      </div>
      <span className="c-artist">
        {track.artists && track.artists.length > 0 ? (
          // Multiple credited artists — each name opens its own page.
          track.artists.map((a, idx) => (
            <span key={`${a.id ?? a.name}-${idx}`}>
              {idx > 0 && <span className="artist-sep">, </span>}
              <button
                className="artist-link"
                onClick={(e) => {
                  e.stopPropagation()
                  if (a.id) openArtist({ id: a.id, name: a.name, provider: track.providerId })
                  else openArtistFromTrack(track)
                }}
              >
                {a.name}
              </button>
            </span>
          ))
        ) : canOpenArtist ? (
          <button
            className="artist-link"
            onClick={(e) => {
              e.stopPropagation()
              openArtistFromTrack(track)
            }}
          >
            {track.artist || 'Unknown artist'}
          </button>
        ) : (
          track.artist || 'Unknown artist'
        )}
      </span>
      <button
        className={`c-like row-like ${liked ? 'liked' : ''}`}
        title={liked ? 'Remove from Your Likes' : 'Add to Your Likes'}
        onClick={() => toggleLike(track)}
      >
        {liked ? <HeartFilledIcon size={16} /> : <HeartIcon size={16} />}
      </button>
      <span className="c-time">{formatTime(track.durationSec ?? 0)}</span>
      <div className="c-more">
        {isSc && (
          <button
            className={`row-dl ${cached ? 'cached' : ''} ${downloading ? 'spin' : ''}`}
            title={cached ? 'Downloaded — click to remove' : downloading ? 'Downloading…' : 'Download for offline'}
            onClick={(e) => {
              e.stopPropagation()
              if (downloading) return
              if (cached) removeOffline(track.id)
              else downloadTrack(track)
            }}
          >
            {cached ? <CheckIcon size={15} /> : <DownloadIcon size={15} />}
          </button>
        )}
        <PlaylistMenu track={track} />
      </div>
    </div>
  )
}
