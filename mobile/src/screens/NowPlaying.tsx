// Fullscreen "Now Playing" — big artwork, a clean seek bar, transport controls
// and the queue. Wired to the shared player store; opens by tapping the
// mini-player, closes with a slide-down animation.
import { useEffect, useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayer } from '@renderer/store'
import { Waveform } from '@renderer/components/Waveform'
import { useT } from '../i18n'
import { LyricsPanel } from '../components/LyricsPanel'
import { SyncEditor } from '../components/SyncEditor'
import { downloadTrack, isDownloaded, removeDownload } from '../api/offline'

function fmt(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function NowPlaying({
  onClose,
  onArtist
}: {
  onClose: () => void
  onArtist?: (track: Track) => void
}): JSX.Element | null {
  const track = usePlayer((s) => s.queue[s.currentIndex])
  const queue = usePlayer((s) => s.queue)
  const currentIndex = usePlayer((s) => s.currentIndex)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const position = usePlayer((s) => s.positionSec)
  const duration = usePlayer((s) => s.durationSec)
  const repeat = usePlayer((s) => s.repeat)
  const shuffle = usePlayer((s) => s.shuffle)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const next = usePlayer((s) => s.next)
  const prev = usePlayer((s) => s.prev)
  const seek = usePlayer((s) => s.seek)
  const jumpTo = usePlayer((s) => s.jumpTo)
  const cycleRepeat = usePlayer((s) => s.cycleRepeat)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)
  const likes = usePlayer((s) => s.likes)
  const toggleLike = usePlayer((s) => s.toggleLike)
  const tr = useT()

  const [closing, setClosing] = useState(false)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [dl, setDl] = useState<'idle' | 'busy' | 'done'>(() =>
    track && isDownloaded(track.id) ? 'done' : 'idle'
  )
  useEffect(() => {
    setDl(track && isDownloaded(track.id) ? 'done' : 'idle')
  }, [track?.id])

  const toggleDownload = async (): Promise<void> => {
    if (!track || dl === 'busy') return
    if (dl === 'done') {
      await removeDownload(track.id)
      setDl('idle')
      return
    }
    setDl('busy')
    try {
      await downloadTrack(track)
      setDl('done')
    } catch {
      setDl('idle')
    }
  }

  if (!track) return null

  const liked = likes.some((t) => t.id === track.id)
  const upNext = queue.slice(currentIndex + 1)

  const requestClose = (): void => {
    setClosing(true)
    setTimeout(onClose, 300)
  }

  return (
    <div className={'np' + (closing ? ' closing' : '')}>
      <div
        className="np-bg"
        style={track.artwork ? { backgroundImage: `url(${track.artwork})` } : undefined}
      />
      <div className="np-scrim" />

      <div className="np-scroll">
      <header className="np-head">
        <button className="np-icon" aria-label="Свернуть" onClick={requestClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="np-eyebrow">{tr('nowPlaying')}</span>
        <button
          className={'np-icon' + (lyricsOpen ? ' on' : '')}
          aria-label={tr('lyrics')}
          onClick={() => setLyricsOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h12M4 18h9" />
          </svg>
        </button>
        <button
          className={'np-icon' + (dl === 'done' ? ' on' : '')}
          aria-label={tr('downloads')}
          onClick={toggleDownload}
        >
          {dl === 'busy' ? (
            <span className="row-dl-spin" />
          ) : dl === 'done' ? (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5 9-11" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
            </svg>
          )}
        </button>
        <button
          className={'np-icon' + (liked ? ' on' : '')}
          aria-label="Нравится"
          onClick={() => void toggleLike(track)}
        >
          <svg viewBox="0 0 24 24" width="23" height="23" fill={liked ? 'currentColor' : 'none'}>
            <path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      {lyricsOpen ? (
        <LyricsPanel
          track={track}
          positionSec={position}
          onSeek={seek}
          onSync={() => setSyncOpen(true)}
        />
      ) : (
        <div className="np-art">
          {track.artwork ? <img src={track.artwork} alt="" /> : <div className="np-art-ph">♪</div>}
        </div>
      )}

      <div className="np-info">
        <h1 className="np-title">{track.title}</h1>
        {track.artist && onArtist ? (
          <button className="np-artist np-artist-link" onClick={() => onArtist(track)}>
            {track.artist}
          </button>
        ) : (
          <div className="np-artist">{track.artist || 'SoundCloud'}</div>
        )}
      </div>

      <Waveform
        className="np-wave"
        seed={track.id}
        positionSec={position}
        durationSec={duration}
        onSeek={seek}
        bars={56}
        reactivity={0.7}
      />
      <div className="np-times">
        <span>{fmt(position)}</span>
        <span>{fmt(duration)}</span>
      </div>

      <div className="np-controls">
        <button
          className={'np-ctrl small' + (shuffle ? ' active' : '')}
          aria-label="Перемешать"
          onClick={toggleShuffle}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3h5v5M21 3l-7 7M4 20l6-6M4 4l5 5M16 21h5v-5M21 21l-5-5" />
          </svg>
        </button>
        <button className="np-ctrl" aria-label="Назад" onClick={prev}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
            <path d="M18 6v12l-8.5-6zM7 6h2v12H7z" />
          </svg>
        </button>
        <button className="np-ctrl play" aria-label={isPlaying ? 'Пауза' : 'Играть'} onClick={togglePlay}>
          {isPlaying ? (
            <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
              <rect x="7" y="5" width="3.6" height="14" rx="1" />
              <rect x="13.4" y="5" width="3.6" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button className="np-ctrl" aria-label="Дальше" onClick={next}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
            <path d="M6 6v12l8.5-6zM15 6h2v12h-2z" />
          </svg>
        </button>
        <button
          className={'np-ctrl small' + (repeat !== 'off' ? ' active' : '')}
          aria-label="Повтор"
          onClick={cycleRepeat}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          {repeat === 'one' && <span className="np-repeat-one">1</span>}
        </button>
      </div>

      {upNext.length > 0 && (
        <div className="np-queue">
          <div className="np-queue-head">{tr('queue')}</div>
          <ul>
            {upNext.slice(0, 30).map((t, i) => (
              <li key={t.id + i} className="np-q-item" onClick={() => jumpTo(currentIndex + 1 + i)}>
                <div className="np-q-cover">
                  {t.artwork ? <img src={t.artwork} alt="" loading="lazy" /> : <span>♪</span>}
                </div>
                <div className="np-q-meta">
                  <div className="np-q-title">{t.title}</div>
                  <div className="np-q-artist">{t.artist || 'SoundCloud'}</div>
                </div>
                <div className="np-q-dur">{fmt(t.durationSec || 0)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>

      {syncOpen && <SyncEditor track={track} onClose={() => setSyncOpen(false)} />}
    </div>
  )
}
