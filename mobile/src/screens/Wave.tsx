// My Wave — Yandex Music's personal radio. "Play wave" starts an endless,
// rotating stream (playMyWave pulls a fresh rotor batch); tapping a track plays
// the currently cached batch as-is (playWaveTrack — no re-fetch, so the right
// track plays). Gated on a signed-in Yandex account.
import { useEffect } from 'react'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'
import { TrackRow } from '../components/TrackRow'

export function WaveScreen({
  onClose,
  onArtist
}: {
  onClose: () => void
  onArtist?: (track: import('@shared/types').Track) => void
}): JSX.Element {
  const myWave = usePlayer((s) => s.myWave)
  const ymAuth = usePlayer((s) => s.ymAuth)
  const loadMyWave = usePlayer((s) => s.loadMyWave)
  const playMyWave = usePlayer((s) => s.playMyWave)
  const playWaveTrack = usePlayer((s) => s.playWaveTrack)
  const t = useT()

  // Populate a batch if we don't have one yet (e.g. opened straight after login).
  useEffect(() => {
    if (ymAuth && !myWave) void loadMyWave()
  }, [ymAuth, myWave, loadMyWave])

  const tracks = myWave?.tracks ?? []

  return (
    <div className="listview">
      <header className="lv-head">
        <button className="np-icon" aria-label="Назад" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="lv-titles">
          <div className="lv-title">{t('myWave')}</div>
          <div className="lv-sub">{t('waveSub')}</div>
        </div>
      </header>

      <div className="wave-hero">
        <div className="wave-disc">
          <span className="wave-ring" />
          <span className="wave-ring r2" />
          <button className="wave-play" onClick={() => void playMyWave(0)} aria-label={t('playWave')}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
              <path d="M9 6v12l9-6z" />
            </svg>
          </button>
        </div>
        <button className="lv-play wave-cta" onClick={() => void playMyWave(0)}>
          {t('playWave')}
        </button>
      </div>

      {tracks.length === 0 ? (
        <div className="empty">{t('empty')}</div>
      ) : (
        <ul className="track-list">
          {tracks.map((tr, i) => (
            <TrackRow key={tr.id + i} track={tr} onPlay={() => playWaveTrack(i)} onArtist={onArtist} />
          ))}
        </ul>
      )}
    </div>
  )
}
