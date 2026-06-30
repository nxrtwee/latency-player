// Settings — functional, not a mockup. Accent theming (persisted, live), resume
// playback (shared store), data management (clears real localStorage keys), and
// about. SoundCloud sign-in is shown as pending native support.
import { useRef, useState } from 'react'
import { usePlayer } from '@renderer/store'
import { ACCENTS, applyAccent, getSavedAccent, saveAccent } from '../theme'
import { useT, type TKey } from '../i18n'
import { ConnectSC } from '../components/ConnectSC'
import { ConnectYandex } from '../components/ConnectYandex'
import { FramingModal, type Framing } from '../components/FramingModal'
import { WALLPAPERS } from '../wallpapers'

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button className={'toggle' + (on ? ' on' : '')} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="toggle-knob" />
    </button>
  )
}

export function SettingsScreen({
  customBg,
  onChangeBg,
  bgFrame,
  onChangeBgFrame
}: {
  customBg: string | null
  onChangeBg: (url: string | null) => void
  bgFrame: Framing
  onChangeBgFrame: (f: Framing) => void
}): JSX.Element {
  const resumeSession = usePlayer((s) => s.resumeSession)
  const setResumeSession = usePlayer((s) => s.setResumeSession)
  const normalizeVolume = usePlayer((s) => s.normalizeVolume)
  const setNormalizeVolume = usePlayer((s) => s.setNormalizeVolume)
  const crossfadeSec = usePlayer((s) => s.crossfadeSec)
  const setCrossfadeSec = usePlayer((s) => s.setCrossfadeSec)
  const showHomeMixes = usePlayer((s) => s.showHomeMixes)
  const setShowHomeMixes = usePlayer((s) => s.setShowHomeMixes)
  const lang = usePlayer((s) => s.lang)
  const setLang = usePlayer((s) => s.setLang)
  const scAuth = usePlayer((s) => s.scAuth)
  const disconnectSC = usePlayer((s) => s.disconnectSoundCloud)
  const ymAuth = usePlayer((s) => s.ymAuth)
  const disconnectYandex = usePlayer((s) => s.disconnectYandex)
  const [ymConnectOpen, setYmConnectOpen] = useState(false)
  const t = useT()

  const [accentId, setAccentId] = useState(() => getSavedAccent().id)
  const [cleared, setCleared] = useState<string | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [cropBg, setCropBg] = useState(false)
  const bgInput = useRef<HTMLInputElement>(null)

  const onBgPick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onChangeBg(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const pickAccent = (a: (typeof ACCENTS)[number]): void => {
    applyAccent(a.accent, a.accent2)
    saveAccent({ id: a.id, accent: a.accent, accent2: a.accent2 })
    setAccentId(a.id)
  }

  const flash = (id: string): void => {
    setCleared(id)
    setTimeout(() => setCleared(null), 1500)
  }
  const clearRecent = (): void => {
    localStorage.removeItem('lp.recent')
    usePlayer.setState({ recentlyPlayed: [] })
    flash('recent')
  }
  const clearQueue = (): void => {
    localStorage.removeItem('lp.queue')
    flash('queue')
  }

  return (
    <div className="view">
      <h1 className="display sm">{t('settings')}</h1>

      <section className="set-block">
        <div className="set-label">{t('appearance')}</div>

        <div className="set-row">
          <span className="set-row-title">{t('language')}</span>
          <div className="seg">
            <button className={'seg-btn' + (lang === 'ru' ? ' active' : '')} onClick={() => setLang('ru')}>
              Рус
            </button>
            <button className={'seg-btn' + (lang === 'en' ? ' active' : '')} onClick={() => setLang('en')}>
              Eng
            </button>
          </div>
        </div>

        <div className="set-row col">
          <span className="set-row-title">{t('accent')}</span>
          <div className="accent-row">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className={'accent-chip' + (accentId === a.id ? ' active' : '')}
                onClick={() => pickAccent(a)}
              >
                <span
                  className="accent-dot"
                  style={{ background: `linear-gradient(135deg, ${a.accent}, ${a.accent2})` }}
                />
                {t(`acc_${a.id}` as TKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="set-row col">
          <span className="set-row-title">{t('appBg')}</span>
          <input ref={bgInput} type="file" accept="image/*" hidden onChange={onBgPick} />
          {customBg && (
            <div className="bg-preview" style={{ backgroundImage: `url(${customBg})` }} />
          )}
          <div className="wp-grid">
            {WALLPAPERS.map((url, i) => (
              <button
                key={i}
                className={'wp-thumb' + (customBg === url ? ' on' : '')}
                style={{ backgroundImage: `url(${url})` }}
                aria-label={`${t('presets')} ${i + 1}`}
                onClick={() => onChangeBg(url)}
              />
            ))}
          </div>
          <div className="set-account">
            <button className="ghost-btn" onClick={() => bgInput.current?.click()}>
              {customBg ? t('replace') : t('choose')}
            </button>
            {customBg && (
              <button className="ghost-btn" onClick={() => setCropBg(true)}>
                {t('crop')}
              </button>
            )}
            {customBg && (
              <button className="ghost-btn danger" onClick={() => onChangeBg(null)}>
                {t('remove')}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="set-block">
        <div className="set-label">{t('playback')}</div>
        <div className="set-row">
          <div>
            <span className="set-row-title">{t('resumeSession')}</span>
            <span className="set-row-sub">{t('resumeSub')}</span>
          </div>
          <Toggle on={resumeSession} onChange={setResumeSession} />
        </div>
        <div className="set-row">
          <div>
            <span className="set-row-title">{t('hideScMixes')}</span>
            <span className="set-row-sub">{t('hideScMixesSub')}</span>
          </div>
          <Toggle on={!showHomeMixes} onChange={(v) => setShowHomeMixes(!v)} />
        </div>
      </section>

      <section className="set-block">
        <div className="set-label">{t('soundSection')}</div>
        <div className="set-row">
          <div>
            <span className="set-row-title">{t('normalizeVolume')}</span>
            <span className="set-row-sub">{t('normalizeVolumeHint')}</span>
          </div>
          <Toggle on={normalizeVolume} onChange={setNormalizeVolume} />
        </div>
        <div className="set-row col">
          <div>
            <span className="set-row-title">{t('crossfade')}</span>
            <span className="set-row-sub">{t('crossfadeHint')}</span>
          </div>
          <div className="set-slider">
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={crossfadeSec}
              onChange={(e) => setCrossfadeSec(Number(e.target.value))}
            />
            <span className="set-slider-val">
              {crossfadeSec === 0 ? t('off') : `${crossfadeSec} ${t('seconds')}`}
            </span>
          </div>
        </div>
      </section>

      <section className="set-block">
        <div className="set-label">{t('scAccount')}</div>
        {scAuth ? (
          <div className="sc-account-row">
            <div className="sc-account-chip">
              {scAuth.avatar && <img src={scAuth.avatar} alt="" />}
              <span>{scAuth.name}</span>
            </div>
            <button className="ghost-btn" onClick={() => void disconnectSC()}>{t('disconnect')}</button>
          </div>
        ) : (
          <>
            <button className="sc-connect" onClick={() => setConnectOpen(true)}>{t('connectSC')}</button>
            <div className="set-hint">{t('scSub')}</div>
          </>
        )}
      </section>

      <section className="set-block">
        <div className="set-label">{t('ymAccount')}</div>
        {ymAuth ? (
          <div className="sc-account-row">
            <div className="sc-account-chip">
              {ymAuth.avatar && <img src={ymAuth.avatar} alt="" />}
              <span>{ymAuth.name}</span>
            </div>
            <button className="ghost-btn" onClick={() => void disconnectYandex()}>{t('disconnect')}</button>
          </div>
        ) : (
          <>
            <button className="sc-connect" onClick={() => setYmConnectOpen(true)}>{t('connectYM')}</button>
            <div className="set-hint">{t('ymSub')}</div>
          </>
        )}
      </section>

      <section className="set-block">
        <div className="set-label">{t('data')}</div>
        <div className="set-row">
          <span className="set-row-title">{t('recent')}</span>
          <button className="ghost-btn" onClick={clearRecent}>
            {cleared === 'recent' ? t('cleared') : t('clear')}
          </button>
        </div>
        <div className="set-row">
          <span className="set-row-title">{t('savedQueue')}</span>
          <button className="ghost-btn" onClick={clearQueue}>
            {cleared === 'queue' ? t('cleared') : t('clear')}
          </button>
        </div>
      </section>

      <section className="set-block">
        <div className="set-label">{t('about')}</div>
        <p className="set-hint">{t('aboutText')}</p>
        <p className="set-devs">
          {t('developers')}: <strong>icountedtheblink</strong> &amp; <strong>Claude</strong>
        </p>
      </section>

      {connectOpen && <ConnectSC onClose={() => setConnectOpen(false)} />}
      {ymConnectOpen && <ConnectYandex onClose={() => setYmConnectOpen(false)} />}
      {cropBg && customBg && (
        <FramingModal
          image={customBg}
          aspect={0.52}
          initial={bgFrame}
          onSave={(f) => {
            onChangeBgFrame(f)
            setCropBg(false)
          }}
          onClose={() => setCropBg(false)}
        />
      )}
    </div>
  )
}
