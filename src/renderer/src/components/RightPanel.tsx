import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTime } from '../util'
import { Waveform } from './Waveform'
import { Slider } from './Slider'
import {
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
  ShuffleIcon,
  RepeatIcon,
  RepeatOneIcon,
  VolumeIcon,
  HeartIcon,
  HeartFilledIcon,
  ChevronDownIcon,
  LyricsIcon
} from './Icons'

export function RightPanel({ width }: { width?: number }): JSX.Element {
  const queue = usePlayer((s) => s.queue)
  const currentIndex = usePlayer((s) => s.currentIndex)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const positionSec = usePlayer((s) => s.positionSec)
  const durationSec = usePlayer((s) => s.durationSec)
  const volume = usePlayer((s) => s.volume)
  const repeat = usePlayer((s) => s.repeat)
  const shuffle = usePlayer((s) => s.shuffle)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const next = usePlayer((s) => s.next)
  const prev = usePlayer((s) => s.prev)
  const seek = usePlayer((s) => s.seek)
  const setVolume = usePlayer((s) => s.setVolume)
  const cycleRepeat = usePlayer((s) => s.cycleRepeat)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)
  const likes = usePlayer((s) => s.likes)
  const toggleLike = usePlayer((s) => s.toggleLike)
  const jumpTo = usePlayer((s) => s.jumpTo)
  const clearUpcoming = usePlayer((s) => s.clearUpcoming)
  const openArtistFromTrack = usePlayer((s) => s.openArtistFromTrack)
  const lyricsOpen = usePlayer((s) => s.lyricsOpen)
  const toggleLyrics = usePlayer((s) => s.toggleLyrics)

  const t = useT()
  const track = currentIndex >= 0 ? queue[currentIndex] : undefined
  const liked = track ? likes.some((t) => t.id === track.id) : false
  const upcoming = currentIndex >= 0 ? queue.slice(currentIndex + 1) : []

  return (
    <aside className="rightpanel" style={width ? { width, flex: '0 0 auto' } : undefined}>
      {/* width controlled by the resizable divider */}
      <div className="rp-card np">
        <div className="rp-head">
          <span>{t('nowPlaying')}</span>
          <ChevronDownIcon size={16} />
        </div>

        {track ? (
          <>
            <div className="np-art">
              {track.artwork ? <img src={track.artwork} alt="" /> : <span>♫</span>}
              <button
                className={`np-like ${liked ? 'liked' : ''}`}
                title={liked ? 'Unlike' : 'Like'}
                onClick={() => toggleLike(track)}
              >
                {liked ? <HeartFilledIcon size={18} /> : <HeartIcon size={18} />}
              </button>
            </div>

            <div className="np-title">{track.title}</div>
            <button className="np-artist artist-link" onClick={() => openArtistFromTrack(track)}>
              {track.artist || 'Unknown artist'}
            </button>

            <Waveform
              className="np-wave"
              seed={track.id}
              positionSec={positionSec}
              durationSec={durationSec}
              onSeek={seek}
              bars={64}
              reactivity={0.5}
            />
            <div className="np-times">
              <span>{formatTime(positionSec)}</span>
              <span>{formatTime(durationSec)}</span>
            </div>

            <div className="np-controls">
              <button
                className={`icon-btn ${shuffle ? 'on' : ''}`}
                title="Shuffle"
                onClick={toggleShuffle}
              >
                <ShuffleIcon size={18} />
              </button>
              <button className="icon-btn" title="Previous" onClick={prev}>
                <PrevIcon size={20} />
              </button>
              <button className="play-btn" title="Play/Pause" onClick={togglePlay}>
                {isPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
              </button>
              <button className="icon-btn" title="Next" onClick={next}>
                <NextIcon size={20} />
              </button>
              <button
                className={`icon-btn ${repeat !== 'off' ? 'on' : ''}`}
                title={`Repeat: ${repeat}`}
                onClick={cycleRepeat}
              >
                {repeat === 'one' ? <RepeatOneIcon size={18} /> : <RepeatIcon size={18} />}
              </button>
            </div>

            <div className="np-volume">
              <VolumeIcon size={18} />
              <Slider value={volume} max={1} step={0.01} onChange={setVolume} ariaLabel="Volume" />
              <button
                className={`icon-btn ${lyricsOpen ? 'on' : ''}`}
                title="Lyrics"
                onClick={toggleLyrics}
              >
                <LyricsIcon size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="np-empty">{t('nothingPlaying')}</div>
        )}
      </div>

      <div className="rp-card queue">
        <div className="rp-head">
          <span>{t('nextInQueue')}</span>
          {upcoming.length > 0 && (
            <button className="rp-clear" onClick={clearUpcoming}>
              {t('clear')}
            </button>
          )}
        </div>
        <div className="q-list">
          {upcoming.length === 0 && <div className="q-empty">{t('queueEmpty')}</div>}
          {upcoming.map((t, i) => (
            <button
              key={`${t.id}-${i}`}
              className="q-item"
              onClick={() => jumpTo(currentIndex + 1 + i)}
              title={`Play ${t.title}`}
            >
              <div className="q-thumb">
                {t.artwork ? <img src={t.artwork} alt="" /> : <span>♫</span>}
              </div>
              <div className="q-meta">
                <span className="q-title">{t.title}</span>
                <span className="q-artist">{t.artist || 'Unknown artist'}</span>
              </div>
              <span className="q-time">{formatTime(t.durationSec ?? 0)}</span>
            </button>
          ))}
        </div>
      </div>

    </aside>
  )
}
