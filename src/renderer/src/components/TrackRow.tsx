import { usePlayer } from '../store'
import { formatTime } from '../util'
import { PlayIcon, HeartIcon, HeartFilledIcon, DownloadIcon, CheckIcon } from './Icons'
import { PlaylistMenu } from './PlaylistMenu'
import type { Track } from '@shared/types'

function Thumb({ track }: { track: Track }): JSX.Element {
  if (track.artwork) {
    return <img className="thumb" src={track.artwork} alt="" loading="lazy" />
  }
  return (
    <div className="thumb placeholder">{track.providerId === 'soundcloud' ? '☁' : '♫'}</div>
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
  const liked = usePlayer(
    (s) => s.likes.some((t) => t.id === track.id) || s.scLikes.some((t) => t.id === track.id)
  )
  const toggleLike = usePlayer((s) => s.toggleLike)
  const openArtistFromTrack = usePlayer((s) => s.openArtistFromTrack)
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
        {canOpenArtist ? (
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
