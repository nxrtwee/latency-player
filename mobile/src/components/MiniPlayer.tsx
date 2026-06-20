// Persistent mini-player above the tab bar, wired to the shared player store.
// Hidden when nothing is loaded.
import { usePlayer } from '@renderer/store'

export function MiniPlayer({ onExpand }: { onExpand: () => void }): JSX.Element | null {
  const track = usePlayer((s) => s.queue[s.currentIndex])
  const isPlaying = usePlayer((s) => s.isPlaying)
  const position = usePlayer((s) => s.positionSec)
  const duration = usePlayer((s) => s.durationSec)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const next = usePlayer((s) => s.next)
  const prev = usePlayer((s) => s.prev)
  const likes = usePlayer((s) => s.likes)
  const toggleLike = usePlayer((s) => s.toggleLike)

  if (!track) return null

  const liked = likes.some((t) => t.id === track.id)
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  return (
    <div className="miniplayer">
      <div className="mini-progress" style={{ width: `${pct}%` }} />
      <div className="mini-tap" onClick={onExpand}>
        <div className="mini-art">
          {track.artwork ? <img src={track.artwork} alt="" /> : null}
        </div>
        <div className="mini-meta">
          <div className="mini-title">{track.title}</div>
          <div className="mini-artist">{track.artist || 'SoundCloud'}</div>
        </div>
      </div>
      <button
        className={'mini-btn heart' + (liked ? ' on' : '')}
        aria-label="Нравится"
        onClick={() => void toggleLike(track)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill={liked ? 'currentColor' : 'none'}>
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button className="mini-btn skip" aria-label="Назад" onClick={prev}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M18 5.5v13l-9-6.5z" />
          <rect x="5.5" y="5.5" width="2.5" height="13" rx="1" />
        </svg>
      </button>
      <button className="mini-btn play" aria-label={isPlaying ? 'Пауза' : 'Играть'} onClick={togglePlay}>
        {isPlaying ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <rect x="7" y="6" width="3.5" height="12" rx="1" />
            <rect x="13.5" y="6" width="3.5" height="12" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            {/* centroid at x=12 so the triangle sits centred in its circle */}
            <path d="M9 6v12l9-6z" />
          </svg>
        )}
      </button>
      <button className="mini-btn skip" aria-label="Дальше" onClick={next}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M6 5.5v13l9-6.5z" />
          <rect x="16" y="5.5" width="2.5" height="13" rx="1" />
        </svg>
      </button>
    </div>
  )
}
