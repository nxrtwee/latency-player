import { useMemo, useState } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { DEFAULT_RADIO_CONFIG, type RadioScope, type RadioSeedMode } from '../radio'
import { CloseIcon, RadioIcon, SoundCloudIcon, YandexMusicIcon } from './Icons'
import { useCover } from '../cover'
import type { Track } from '@shared/types'

/**
 * The setup sheet for the personal radio: what to build it from, and where it may look.
 *
 * It is a sheet rather than a Settings section because it is also the FIRST run — the
 * home tile opens this before the radio has ever played, so it has to explain itself in
 * one screen and end in a button that starts the music.
 */

function SeedRow({
  track,
  checked,
  onToggle
}: {
  track: Track
  checked: boolean
  onToggle: () => void
}): JSX.Element {
  const cover = useCover(track)
  return (
    <button className={`radio-seed ${checked ? 'on' : ''}`} onClick={onToggle} title={track.title}>
      <span className="radio-seed-art">
        {cover ? <img src={cover} alt="" loading="lazy" /> : <span>♫</span>}
      </span>
      <span className="radio-seed-text">
        <span className="radio-seed-title">{track.title}</span>
        <span className="radio-seed-artist">{track.artist || '—'}</span>
      </span>
      <span className="radio-seed-mark" />
    </button>
  )
}

export function RadioSetup(): JSX.Element {
  const t = useT()
  const likes = usePlayer((s) => s.likes)
  const scLikes = usePlayer((s) => s.scLikes)
  const saved = usePlayer((s) => s.radioConfig)
  const saveRadioConfig = usePlayer((s) => s.saveRadioConfig)
  const closeRadioSetup = usePlayer((s) => s.closeRadioSetup)
  const radioLoading = usePlayer((s) => s.radioLoading)

  const [closing, setClosing] = useState(false)
  const close = (): void => {
    setClosing(true)
    setTimeout(() => closeRadioSetup(), 200)
  }

  const [seedMode, setSeedMode] = useState<RadioSeedMode>(saved?.seedMode ?? DEFAULT_RADIO_CONFIG.seedMode)
  const [scope, setScope] = useState<RadioScope>(saved?.scope ?? DEFAULT_RADIO_CONFIG.scope)
  const [picked, setPicked] = useState<string[]>(saved?.seedTrackIds ?? [])
  const [query, setQuery] = useState('')

  // Both like lists, newest first, deduped — the same pool the radio itself uses.
  const pool = useMemo(() => {
    const out: Track[] = []
    const seen = new Set<string>()
    for (const tr of [...likes, ...scLikes]) {
      if (tr?.id && !seen.has(tr.id)) {
        seen.add(tr.id)
        out.push(tr)
      }
    }
    return out
  }, [likes, scLikes])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? pool.filter(
          (tr) =>
            tr.title.toLowerCase().includes(q) || (tr.artist || '').toLowerCase().includes(q)
        )
      : pool
    // A long like list would build thousands of rows; the search narrows it instead.
    return list.slice(0, 120)
  }, [pool, query])

  const canStart = pool.length > 0 && (seedMode !== 'manual' || picked.length > 0)

  const seedOptions: { key: RadioSeedMode; label: string }[] = [
    { key: 'last10', label: t('radioSeedLast10') },
    { key: 'last50', label: t('radioSeedLast50') },
    { key: 'all', label: t('radioSeedAll') },
    { key: 'manual', label: t('radioSeedManual') }
  ]
  const scopeOptions: { key: RadioScope; label: string; icon?: JSX.Element }[] = [
    { key: 'all', label: t('radioSourceAll'), icon: <RadioIcon size={15} /> },
    { key: 'soundcloud', label: 'SoundCloud', icon: <SoundCloudIcon size={15} /> },
    { key: 'yandex', label: t('yandexMusic'), icon: <YandexMusicIcon size={15} /> }
  ]

  return (
    <div className={`modal-backdrop radio-backdrop ${closing ? 'closing' : ''}`} onMouseDown={close}>
      <div className="modal radio-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="radio-head">
          <span className="radio-head-icon">
            <RadioIcon size={22} />
          </span>
          <div className="radio-head-text">
            <h2>{t('radioSetupTitle')}</h2>
            <span className="radio-head-sub">{t('radioSetupIntro')}</span>
          </div>
          <button className="icon-btn" onClick={close} title={t('done')}>
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="radio-body">
          {pool.length === 0 && <div className="radio-warn">{t('radioNeedLikes')}</div>}

          <div className="radio-section">
            <div className="radio-q">{t('radioSeedQuestion')}</div>
            <div className="radio-opts">
              {seedOptions.map((o) => (
                <button
                  key={o.key}
                  className={`radio-opt ${seedMode === o.key ? 'on' : ''}`}
                  onClick={() => setSeedMode(o.key)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {seedMode === 'manual' && (
            <div className="radio-section">
              <div className="radio-q-row">
                <span className="radio-hint">{t('radioPickHint')}</span>
                <span className="radio-count">
                  {picked.length} {t('radioSelected')}
                </span>
              </div>
              <input
                className="radio-search"
                placeholder={t('radioPickSearch')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="radio-seeds">
                {shown.map((tr) => (
                  <SeedRow
                    key={tr.id}
                    track={tr}
                    checked={picked.includes(tr.id)}
                    onToggle={() =>
                      setPicked((prev) =>
                        prev.includes(tr.id) ? prev.filter((id) => id !== tr.id) : [...prev, tr.id]
                      )
                    }
                  />
                ))}
              </div>
            </div>
          )}

          <div className="radio-section">
            <div className="radio-q">{t('radioSourceQuestion')}</div>
            <div className="radio-opts">
              {scopeOptions.map((o) => (
                <button
                  key={o.key}
                  className={`radio-opt ${scope === o.key ? 'on' : ''}`}
                  onClick={() => setScope(o.key)}
                >
                  {o.icon}
                  <span>{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="radio-foot">
          <button
            className="btn-play radio-go"
            disabled={!canStart || radioLoading}
            onClick={() => void saveRadioConfig({ seedMode, seedTrackIds: picked, scope }, true)}
          >
            <RadioIcon size={17} />
            <span>{radioLoading ? '…' : t('radioStart')}</span>
          </button>
          <button
            className="sync-btn ghost"
            disabled={!canStart}
            onClick={() => void saveRadioConfig({ seedMode, seedTrackIds: picked, scope }, false)}
          >
            {t('radioSave')}
          </button>
          <button
            type="button"
            className="sync-btn ghost"
            onClick={close}
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
