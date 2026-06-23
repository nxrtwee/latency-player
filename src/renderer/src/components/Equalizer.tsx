import { useState } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import {
  EQ_FREQUENCIES,
  EQ_BAND_COUNT,
  EQ_MAX_DB,
  getEqState,
  setEqGains,
  setEqEnabled
} from '../audio/analyser'
import { CloseIcon, SoundCloudIcon } from './Icons'
import { Toggle } from './Toggle'

// Presets are 10-band gain arrays aligned to EQ_FREQUENCIES
// (32 64 125 250 500 1k 2k 4k 8k 16k Hz).
const PRESETS: { key: string; gains: number[] }[] = [
  { key: 'eqFlat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { key: 'eqBassBoost', gains: [7, 6, 5, 3, 1, 0, 0, 0, 0, 0] },
  { key: 'eqTrebleBoost', gains: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7] },
  { key: 'eqVocal', gains: [-3, -2, 0, 2, 4, 4, 3, 1, 0, -1] },
  { key: 'eqElectronic', gains: [6, 5, 1, 0, -2, 1, 0, 2, 5, 6] },
  { key: 'eqRock', gains: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5] },
  { key: 'eqLoudness', gains: [6, 4, 0, 0, -2, 0, 1, 3, 5, 6] }
]

/** Short Hz label for a band frequency (e.g. 16000 → "16k"). */
function freqLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz)
}

function gainsEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export function Equalizer(): JSX.Element {
  const t = useT()
  const [closing, setClosing] = useState(false)
  const close = (): void => {
    setClosing(true)
    setTimeout(() => usePlayer.getState().setEqOpen(false), 200)
  }

  const initial = getEqState()
  const [gains, setGains] = useState<number[]>(initial.gains)
  const [enabled, setEnabled] = useState(initial.enabled)

  function updateBand(index: number, value: number): void {
    const next = gains.slice()
    next[index] = value
    setGains(next)
    setEqGains(next)
    if (!enabled) {
      // First touch implicitly enables the EQ.
      setEnabled(true)
      setEqEnabled(true)
    }
  }

  function applyPreset(p: number[]): void {
    setGains(p)
    setEqGains(p)
    if (!enabled) {
      setEnabled(true)
      setEqEnabled(true)
    }
  }

  function toggleEnabled(v: boolean): void {
    setEnabled(v)
    setEqEnabled(v)
  }

  const activePreset = PRESETS.find((p) => gainsEqual(p.gains, gains))?.key

  return (
    <div className={`modal-backdrop ${closing ? 'closing' : ''}`} onMouseDown={close}>
      <div className="modal eq-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="eq-header">
          <h2>{t('equalizer')}</h2>
          <button className="icon-btn" onClick={close} title={t('done')}>
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="eq-toprow">
          <label className="eq-enable">
            <Toggle checked={enabled} onChange={toggleEnabled} />
            <span>{t('eqEnabled')}</span>
          </label>
          <button
            className="eq-reset"
            onClick={() => applyPreset(new Array(EQ_BAND_COUNT).fill(0))}
          >
            {t('eqReset')}
          </button>
        </div>

        <div className={`eq-sliders ${enabled ? '' : 'disabled'}`}>
          {EQ_FREQUENCIES.map((hz, i) => (
            <div className="eq-band" key={hz}>
              <span className="eq-gain-val">
                {gains[i] > 0 ? '+' : ''}
                {gains[i]}
              </span>
              <input
                className="eq-slider"
                type="range"
                min={-EQ_MAX_DB}
                max={EQ_MAX_DB}
                step={1}
                value={gains[i]}
                onChange={(e) => updateBand(i, Number(e.target.value))}
                // vertical orientation via CSS writing-mode below
              />
              <span className="eq-freq">{freqLabel(hz)}</span>
            </div>
          ))}
        </div>

        <div className="eq-presets">
          <span className="eq-presets-label">{t('eqPreset')}</span>
          <div className="eq-presets-row">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                className={`eq-preset-chip ${activePreset === p.key ? 'active' : ''}`}
                onClick={() => applyPreset(p.gains)}
              >
                {t(p.key)}
              </button>
            ))}
          </div>
        </div>

        <div className="eq-note">
          <SoundCloudIcon size={14} />
          <span>{t('eqLocalOnly')}</span>
        </div>
      </div>
    </div>
  )
}
