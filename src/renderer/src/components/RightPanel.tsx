import { useRef, useState } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTime } from '../util'
import { useVirtualRows } from '../useVirtualRows'
import { Waveform } from './Waveform'
import { Slider } from './Slider'
import { OverlayScrollbar } from './OverlayScrollbar'
import { grabScroll } from '../grabScroll'
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
  LyricsIcon,
  SearchIcon,
  CloseIcon,
  EqualizerIcon
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
  const reorderQueue = usePlayer((s) => s.reorderQueue)
  const removeFromQueue = usePlayer((s) => s.removeFromQueue)
  const openArtistFromTrack = usePlayer((s) => s.openArtistFromTrack)
  const openArtist = usePlayer((s) => s.openArtist)
  const lyricsOpen = usePlayer((s) => s.lyricsOpen)
  const toggleLyrics = usePlayer((s) => s.toggleLyrics)
  const eqOpen = usePlayer((s) => s.eqOpen)
  const setEqOpen = usePlayer((s) => s.setEqOpen)
  const setSource = usePlayer((s) => s.setSource)

  const t = useT()
  const track = currentIndex >= 0 ? queue[currentIndex] : undefined
  const liked = track ? likes.some((t) => t.id === track.id) : false

  const [queueFilter, setQueueFilter] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const qListRef = useRef<HTMLDivElement>(null)

  // Upcoming tracks carry their absolute queue index so reorder/remove stay correct.
  const upcoming = (currentIndex >= 0 ? queue.slice(currentIndex + 1) : []).map((tr, i) => ({
    track: tr,
    absIndex: currentIndex + 1 + i
  }))
  const fq = queueFilter.trim().toLowerCase()
  const filteredUpcoming = fq
    ? upcoming.filter(
        ({ track: tr }) =>
          tr.title.toLowerCase().includes(fq) || (tr.artist || '').toLowerCase().includes(fq)
      )
    : upcoming
  // Drag-reorder is only meaningful on the unfiltered list.
  const dragEnabled = !fq

  // Windowing: a 300-track queue would otherwise mount 300 rows. Stride = q-item
  // height + its 2px bottom margin (see styles.css .q-item / .q-window), 50+2
  // normal / 46+2 compact.
  const compact = usePlayer((s) => s.compact)
  const Q_ROW = compact ? 48 : 52
  const { containerRef: qRef, win: qWin } = useVirtualRows(
    filteredUpcoming.length,
    Q_ROW,
    '.q-list'
  )

  function handleDrop(targetAbs: number): void {
    if (dragIndex !== null && dragIndex !== targetAbs) reorderQueue(dragIndex, targetAbs)
    setDragIndex(null)
    setOverIndex(null)
  }

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

            <div
              className="np-title clickable"
              onClick={() => setSource('comments')}
              title={t('comments')}
            >
              {track.title}
            </div>
            <div className="np-artist">
              {track.artists && track.artists.length > 0 ? (
                track.artists.map((a, idx) => (
                  <span key={`${a.id ?? a.name}-${idx}`}>
                    {idx > 0 && <span className="artist-sep">, </span>}
                    <button
                      className="artist-link"
                      onClick={() =>
                        a.id
                          ? openArtist({ id: a.id, name: a.name, provider: track.providerId })
                          : openArtistFromTrack(track)
                      }
                    >
                      {a.name}
                    </button>
                  </span>
                ))
              ) : (
                <button className="artist-link" onClick={() => openArtistFromTrack(track)}>
                  {track.artist || 'Unknown artist'}
                </button>
              )}
            </div>

            <Waveform
              className="np-wave"
              seed={track.id}
              positionSec={positionSec}
              durationSec={durationSec}
              onSeek={seek}
              bars={64}
              reactivity={0.42}
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
                className={`icon-btn ${eqOpen ? 'on' : ''}`}
                title={t('equalizer')}
                onClick={() => setEqOpen(true)}
              >
                <EqualizerIcon size={18} />
              </button>
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

        {upcoming.length > 0 && (
          <div className="q-filter">
            <SearchIcon size={14} />
            <input
              value={queueFilter}
              placeholder={t('filterQueue')}
              onChange={(e) => setQueueFilter(e.target.value)}
            />
            {queueFilter && (
              <button className="q-filter-clear" onClick={() => setQueueFilter('')} title={t('clear')}>
                <CloseIcon size={12} />
              </button>
            )}
          </div>
        )}

        <div className="q-list" ref={qListRef} onMouseDown={grabScroll}>
          {upcoming.length === 0 && <div className="q-empty">{t('queueEmpty')}</div>}
          {upcoming.length > 0 && filteredUpcoming.length === 0 && (
            <div className="q-empty">{t('noQueueMatch')}</div>
          )}
          {filteredUpcoming.length > 0 && (
          <div className="q-window" ref={qRef}>
          {qWin.start > 0 && <div style={{ height: qWin.start * Q_ROW, flexShrink: 0 }} />}
          {filteredUpcoming.slice(qWin.start, qWin.end).map(({ track: tr, absIndex }) => (
            <div
              key={`${tr.id}-${absIndex}`}
              className={`q-item ${dragEnabled ? 'draggable' : ''} ${
                overIndex === absIndex ? 'drag-over' : ''
              } ${dragIndex === absIndex ? 'dragging' : ''}`}
              draggable={dragEnabled}
              onDragStart={() => dragEnabled && setDragIndex(absIndex)}
              onDragOver={(e) => {
                if (!dragEnabled) return
                e.preventDefault()
                setOverIndex(absIndex)
              }}
              onDragEnd={() => {
                setDragIndex(null)
                setOverIndex(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                handleDrop(absIndex)
              }}
              onClick={() => jumpTo(absIndex)}
              title={`Play ${tr.title}`}
            >
              <div className="q-thumb">
                {tr.artwork ? <img src={tr.artwork} alt="" /> : <span>♫</span>}
              </div>
              <div className="q-meta">
                <span className="q-title">{tr.title}</span>
                <span className="q-artist">{tr.artist || 'Unknown artist'}</span>
              </div>
              <span className="q-time">{formatTime(tr.durationSec ?? 0)}</span>
              <button
                className="q-remove"
                title={t('removeFromQueue')}
                onClick={(e) => {
                  e.stopPropagation()
                  removeFromQueue(absIndex)
                }}
              >
                <CloseIcon size={13} />
              </button>
            </div>
          ))}
          {qWin.end < filteredUpcoming.length && (
            <div style={{ height: (filteredUpcoming.length - qWin.end) * Q_ROW, flexShrink: 0 }} />
          )}
          </div>
          )}
        </div>
        <OverlayScrollbar scrollRef={qListRef} />
      </div>

    </aside>
  )
}
