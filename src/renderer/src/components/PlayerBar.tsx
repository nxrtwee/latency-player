import type { CSSProperties } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTime } from '../util'
import { useCover } from '../cover'
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
  AutopilotIcon,
  CommentIcon
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
  const autopilot = usePlayer((s) => s.autopilot)
  const autopilotLoading = usePlayer((s) => s.autopilotLoading)
  const toggleAutopilot = usePlayer((s) => s.toggleAutopilot)
  const setSource = usePlayer((s) => s.setSource)
  const openArtist = usePlayer((s) => s.openArtist)
  const openArtistFromTrack = usePlayer((s) => s.openArtistFromTrack)
  const skin = usePlayer((s) => s.skin)
  const playerBarWidth = usePlayer((s) => s.playerBarWidth)
  const playerBarHeight = usePlayer((s) => s.playerBarHeight)

  const t = useT()
  const track = currentIndex >= 0 ? queue[currentIndex] : undefined
  const cover = useCover(track)
  const liked = track
    ? likes.some((x) => x.id === track.id) || scLikes.some((x) => x.id === track.id)
    : false

  // The nextgen bar is a floating capsule whose width AND height the user can
  // tune; oldgen is the full-width docked bar (no override). --pb-h drives the
  // capsule height / art / visualizer sizing in skin-nextgen.css.
  const barStyle: CSSProperties | undefined =
    skin === 'nextgen'
      ? ({
          width: `${playerBarWidth}%`,
          maxWidth: 'none',
          ['--pb-h' as string]: playerBarHeight
        } as CSSProperties)
      : undefined
  // Below this height the visualizer is too cramped to read — swap it for a slim
  // progress bar (same look as the volume slider).
  const compactSeek = skin === 'nextgen' && playerBarHeight <= 72

  return (
    <footer className="playerbar" style={barStyle}>
      <div className="pb-now">
        {track ? (
          <>
            <div className="pb-art">
              {cover ? <img src={cover} alt="" /> : <span>♫</span>}
            </div>
            <div className="pb-meta">
              <span
                className="pb-title clickable"
                onClick={() => setSource('comments')}
                title={t('comments')}
              >
                {track.title}
              </span>
              <span className="pb-artist">
                {track.artists && track.artists.length > 0 ? (
                  // Each credited artist is its OWN link — not the whole line as a
                  // single click target.
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
                ) : track.artistId || track.artist ? (
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
        <div className={`pb-seek${compactSeek ? ' compact' : ''}`}>
          <span className="pb-time">{formatTime(positionSec)}</span>
          {compactSeek ? (
            <Slider
              className="pb-seek-slider"
              value={positionSec}
              max={durationSec || 1}
              step={0.1}
              onChange={seek}
              ariaLabel="Seek"
            />
          ) : (
            <Waveform
              className="pb-wave"
              seed={track?.id ?? 'latency'}
              positionSec={positionSec}
              durationSec={durationSec}
              onSeek={seek}
              bars={96}
              reactivity={0.75}
            />
          )}
          <span className="pb-time">{formatTime(durationSec)}</span>
        </div>
      </div>

      <div className="pb-right">
        <button
          className={`icon-btn ${autopilot ? 'on' : ''} ${autopilotLoading ? 'spin' : ''}`}
          title={
            autopilotLoading
              ? t('autopilotFinding')
              : autopilot
                ? t('autopilotOn')
                : t('autopilotOff')
          }
          onClick={toggleAutopilot}
        >
          <AutopilotIcon size={18} />
        </button>
        <button
          className="icon-btn"
          title={t('comments')}
          onClick={() => setSource('comments')}
          disabled={!track}
        >
          <CommentIcon size={18} />
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
