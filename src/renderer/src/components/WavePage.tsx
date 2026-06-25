import { usePlayer } from '../store'
import { useT } from '../i18n'
import { PlayIcon, ShuffleIcon, RefreshIcon, YandexMusicIcon } from './Icons'

/**
 * "My Wave" — Yandex's endless personal radio. It's a stream, not a tracklist
 * (only a handful of tracks are ever queued ahead), so this is a branded hero
 * rather than a list: a big animated disc, blurb, and a play button. Playback
 * runs through playMyWave so the queue keeps refilling itself near the end.
 */
export function WavePage(): JSX.Element {
  const t = useT()
  const myWave = usePlayer((s) => s.myWave)
  const playMyWave = usePlayer((s) => s.playMyWave)
  const loadMyWave = usePlayer((s) => s.loadMyWave)
  const shuffle = usePlayer((s) => s.shuffle)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)

  const tracks = myWave?.tracks ?? []
  const upcoming = tracks.slice(0, 3)

  function shufflePlay(): void {
    if (!tracks.length) return
    if (!shuffle) toggleShuffle()
    playMyWave(Math.floor(Math.random() * tracks.length))
  }

  return (
    <section className="tracklist wave">
      <div className="ph-aurora wave-aurora" />

      <div className="wave-hero">
        <div className="wave-disc" aria-hidden="true">
          <span className="wave-ring r1" />
          <span className="wave-ring r2" />
          <span className="wave-ring r3" />
          <span className="wave-disc-core">
            <YandexMusicIcon size={64} />
          </span>
        </div>

        <span className="ph-label wave-label">{t('yandexMusic')}</span>
        <h1 className="wave-title">{t('myWave')}</h1>
        <p className="wave-headline">{t('myWaveHeadline')}</p>
        <p className="wave-blurb">{t('myWaveBlurb')}</p>

        <div className="wave-chips">
          <span className="wave-chip">{t('waveTagMood')}</span>
          <span className="wave-chip">{t('waveTagCharacter')}</span>
          <span className="wave-chip">{t('waveTagLanguage')}</span>
        </div>

        <div className="wave-actions">
          <button className="btn-play wave-play" onClick={() => playMyWave(0)} disabled={!tracks.length}>
            <PlayIcon size={20} />
            <span>{t('playWave')}</span>
          </button>
          <button className="btn-round" title="Shuffle" onClick={shufflePlay} disabled={!tracks.length}>
            <ShuffleIcon size={18} />
          </button>
          <button className="btn-round" title="Refresh" onClick={() => loadMyWave()}>
            <RefreshIcon size={18} />
          </button>
        </div>

        {upcoming.length > 0 && (
          <div className="wave-upnext">
            <span className="wave-upnext-label">{t('waveNowPlaying')}</span>
            {upcoming.map((tr, i) => (
              <span key={`${tr.id}-${i}`} className="wave-upnext-item">
                {tr.title}
                {tr.artist ? ` — ${tr.artist}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
