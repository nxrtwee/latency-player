import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTotal } from '../util'
import { PlayIcon, ShuffleIcon, ClockIcon } from './Icons'
import { TrackRow } from './TrackRow'

export function MixPage(): JSX.Element {
  const t = useT()
  const mix = usePlayer((s) => s.selectedMix)
  const playQueue = usePlayer((s) => s.playQueue)
  const shuffle = usePlayer((s) => s.shuffle)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)

  if (!mix) return <section className="tracklist" />

  const tracks = mix.tracks
  const totalSec = tracks.reduce((s, t) => s + (t.durationSec ?? 0), 0)

  function play(index: number): void {
    playQueue(tracks, index)
  }
  function shufflePlay(): void {
    if (!tracks.length) return
    if (!shuffle) toggleShuffle()
    play(Math.floor(Math.random() * tracks.length))
  }

  return (
    <section className="tracklist mix">
      <div className="ph-aurora" />

      <header className="ph">
        <div className="ph-cover mix-cover">
          {mix.cover ? <img src={mix.cover} alt="" /> : <span className="ph-cover-glyph">♪</span>}
        </div>
        <div className="ph-info">
          <span className="ph-label">{t('dailyMix')}</span>
          <h1 className="ph-title">{mix.title}</h1>
          <div className="ph-meta">
            <span>
              {tracks.length} {t('tracks')}
            </span>
            {totalSec > 0 && (
              <>
                <span className="dot">•</span>
                <span>{formatTotal(totalSec)}</span>
              </>
            )}
          </div>
          <p className="ph-desc">{mix.subtitle}</p>
          <div className="ph-actions">
            <button className="btn-play" onClick={() => play(0)} disabled={!tracks.length}>
              <PlayIcon size={18} />
              <span>{t('play')}</span>
            </button>
            <button className="btn-round" title="Shuffle" onClick={shufflePlay} disabled={!tracks.length}>
              <ShuffleIcon size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="tl-head">
        <span className="c-index">#</span>
        <span className="c-title">{t('title')}</span>
        <span className="c-artist">{t('artist')}</span>
        <span className="c-like" />
        <span className="c-time">
          <ClockIcon size={15} />
        </span>
        <span className="c-more" />
      </div>
      <div className="rows">
        {tracks.map((track, i) => (
          <TrackRow key={`${track.id}-${i}`} track={track} index={i} onPlay={play} />
        ))}
      </div>
    </section>
  )
}
