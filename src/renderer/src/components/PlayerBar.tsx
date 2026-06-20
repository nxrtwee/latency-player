import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTime } from '../util'
import { Slider } from './Slider'
import { Waveform } from './Waveform'
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
  QueueIcon,
  ExpandIcon,
  LyricsIcon
} from './Icons'

export function PlayerBar(): JSX.Element {
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
  const scLikes = usePlayer((s) => s.scLikes)
  const toggleLike = usePlayer((s) => s.toggleLike)
  const toggleRightPanel = usePlayer((s) => s.toggleRightPanel)
  const rightOpen = usePlayer((s) => s.rightOpen)
  const toggleLyrics = usePlayer((s) => s.toggleLyrics)
  const lyricsOpen = usePlayer((s) => s.lyricsOpen)

  const t = useT()
  const track = currentIndex >= 0 ? queue[currentIndex] : undefined
  const liked = track
    ? likes.some((x) => x.id === track.id) || scLikes.some((x) => x.id === track.id)
    : false

  return (
    <footer className="playerbar">
      <div className="pb-now">
        {track ? (
          <>
            <div className="pb-art">
              {track.artwork ? <img src={track.artwork} alt="" /> : <span>♫</span>}
            </div>
            <div className="pb-meta">
              <span className="pb-title">{track.title}</span>
              <span className="pb-artist">{track.artist || 'Unknown artist'}</span>
            </div>
            <button
              className={`icon-btn pb-like ${liked ? 'liked' : ''}`}
              title={liked ? 'Unlike' : 'Like'}
              onClick={() => toggleLike(track)}
            >
              {liked ? <HeartFilledIcon size={16} /> : <HeartIcon size={16} />}
            </button>
          </>
        ) : (
          <span className="muted">{t('nothingPlaying')}</span>
        )}
      </div>

      <div className="pb-center">
        <div className="pb-controls">
          <button className={`icon-btn ${shuffle ? 'on' : ''}`} title="Shuffle" onClick={toggleShuffle}>
            <ShuffleIcon size={18} />
          </button>
          <button className="icon-btn" title="Previous" onClick={prev}>
            <PrevIcon size={20} />
          </button>
          <button className="play-btn" title="Play/Pause" onClick={togglePlay}>
            {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
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
        <div className="pb-seek">
          <span className="pb-time">{formatTime(positionSec)}</span>
          <Waveform
            className="pb-wave"
            seed={track?.id ?? 'latency'}
            positionSec={positionSec}
            durationSec={durationSec}
            onSeek={seek}
            bars={96}
            reactivity={0.75}
          />
          <span className="pb-time">{formatTime(durationSec)}</span>
        </div>
      </div>

      <div className="pb-right">
        <button
          className={`icon-btn ${lyricsOpen ? 'on' : ''}`}
          title="Lyrics"
          onClick={toggleLyrics}
          disabled={!track}
        >
          <LyricsIcon size={18} />
        </button>
        <button
          className={`icon-btn ${rightOpen ? 'on' : ''}`}
          title="Toggle queue panel"
          onClick={toggleRightPanel}
        >
          <QueueIcon size={18} />
        </button>
        <div className="pb-volume">
          <VolumeIcon size={18} />
          <Slider value={volume} max={1} step={0.01} onChange={setVolume} ariaLabel="Volume" />
        </div>
        <button className="icon-btn" title="Fullscreen player" onClick={toggleLyrics} disabled={!track}>
          <ExpandIcon size={18} />
        </button>
      </div>
    </footer>
  )
}
