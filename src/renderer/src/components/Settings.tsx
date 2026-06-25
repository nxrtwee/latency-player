import { useEffect, useState } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { Toggle } from './Toggle'
import { ColorPicker } from './ColorPicker'
import { CloseIcon, RealSoundCloudIcon, RealYandexMusicIcon } from './Icons'

const THEMES = [
  { id: 'green', label: 'Green', color: '#1ed760' },
  { id: 'purple', label: 'Purple', color: '#8b5cff' },
  { id: 'blue', label: 'Blue', color: '#3aa0ff' },
  { id: 'pink', label: 'Pink', color: '#ff48d0' }
]

export function Settings(): JSX.Element {
  const [closing, setClosing] = useState(false)
  const close = (): void => {
    setClosing(true)
    setTimeout(() => usePlayer.getState().setSettingsOpen(false), 200)
  }

  const scAuth = usePlayer((s) => s.scAuth)
  const scConnecting = usePlayer((s) => s.scConnecting)
  const connectSoundCloud = usePlayer((s) => s.connectSoundCloud)
  const disconnectSoundCloud = usePlayer((s) => s.disconnectSoundCloud)
  const ymAuth = usePlayer((s) => s.ymAuth)
  const ymConnecting = usePlayer((s) => s.ymConnecting)
  const connectYandex = usePlayer((s) => s.connectYandex)
  const disconnectYandex = usePlayer((s) => s.disconnectYandex)
  const importYandexLikes = usePlayer((s) => s.importYandexLikes)
  const importSoundcloudLikes = usePlayer((s) => s.importSoundcloudLikes)
  const removeImportedLikes = usePlayer((s) => s.removeImportedLikes)
  const mixSource = usePlayer((s) => s.mixSource)
  const setMixSource = usePlayer((s) => s.setMixSource)

  // Import / remove-imported button state: 'idle' | 'busy' | a result message.
  const [scImport, setScImport] = useState<'idle' | 'busy' | string>('idle')
  const [ymImport, setYmImport] = useState<'idle' | 'busy' | string>('idle')
  const [scRemove, setScRemove] = useState<'idle' | 'busy' | string>('idle')
  const [ymRemove, setYmRemove] = useState<'idle' | 'busy' | string>('idle')
  const t2 = useT()
  async function runImport(
    fn: () => Promise<number>,
    setState: (v: 'idle' | 'busy' | string) => void
  ): Promise<void> {
    setState('busy')
    const n = await fn()
    setState(n > 0 ? `${t2('imported')} ${n}` : t2('importedNone'))
    setTimeout(() => setState('idle'), 4000)
  }
  async function runRemove(
    provider: 'soundcloud' | 'yandex',
    setState: (v: 'idle' | 'busy' | string) => void
  ): Promise<void> {
    setState('busy')
    const n = await removeImportedLikes(provider)
    setState(n > 0 ? `${t2('removed')} ${n}` : t2('removedNone'))
    setTimeout(() => setState('idle'), 4000)
  }
  const importLabel = (s: 'idle' | 'busy' | string): string =>
    s === 'busy' ? t2('importing') : s === 'idle' ? t2('importLikes') : s
  const removeLabel = (s: 'idle' | 'busy' | string): string =>
    s === 'busy' ? t2('removing') : s === 'idle' ? t2('removeImported') : s

  const theme = usePlayer((s) => s.theme)
  const setTheme = usePlayer((s) => s.setTheme)
  const customAccent = usePlayer((s) => s.customAccent)
  const setCustomAccent = usePlayer((s) => s.setCustomAccent)
  const customBg = usePlayer((s) => s.customBg)
  const pickBackground = usePlayer((s) => s.pickBackground)
  const clearBackground = usePlayer((s) => s.clearBackground)
  const openFraming = usePlayer((s) => s.openFraming)
  const bgScope = usePlayer((s) => s.bgScope)
  const setBgScope = usePlayer((s) => s.setBgScope)
  const compact = usePlayer((s) => s.compact)
  const setCompact = usePlayer((s) => s.setCompact)
  const lyricsSize = usePlayer((s) => s.lyricsSize)
  const setLyricsSize = usePlayer((s) => s.setLyricsSize)
  const resumeSession = usePlayer((s) => s.resumeSession)
  const setResumeSession = usePlayer((s) => s.setResumeSession)
  const geniusFallback = usePlayer((s) => s.geniusFallback)
  const setGeniusFallback = usePlayer((s) => s.setGeniusFallback)
  const launchAtStartup = usePlayer((s) => s.launchAtStartup)
  const setLaunchAtStartup = usePlayer((s) => s.setLaunchAtStartup)
  const clearLyricsCache = usePlayer((s) => s.clearLyricsCache)
  const clearMixesCache = usePlayer((s) => s.clearMixesCache)
  const lang = usePlayer((s) => s.lang)
  const setLang = usePlayer((s) => s.setLang)
  const t = useT()

  const [lyricsCleared, setLyricsCleared] = useState(false)
  const [mixesCleared, setMixesCleared] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Discord Rich Presence config lives in the main process (a small JSON file).
  const [discordEnabled, setDiscordEnabled] = useState(false)
  const [discordAppId, setDiscordAppId] = useState('')
  useEffect(() => {
    window.api
      .discordGetConfig()
      .then((c) => {
        setDiscordEnabled(c.enabled)
        setDiscordAppId(c.clientId)
      })
      .catch(() => {})
  }, [])

  function applyDiscord(enabled: boolean, appId: string): void {
    setDiscordEnabled(enabled)
    setDiscordAppId(appId)
    void window.api.discordSetConfig(enabled, appId)
  }

  // Offline cache size/count (refreshed on open).
  const offlineCount = usePlayer((s) => s.offlineIds.length)
  const loadOffline = usePlayer((s) => s.loadOffline)
  const [offlineSize, setOfflineSize] = useState(0)
  useEffect(() => {
    window.api.offlineSize().then(setOfflineSize).catch(() => {})
  }, [offlineCount])

  async function clearOffline(): Promise<void> {
    await window.api.offlineClear()
    await loadOffline()
    setOfflineSize(0)
  }

  function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className={`modal-backdrop ${closing ? 'closing' : ''}`} onMouseDown={close}>
      <div className="modal settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('settings')}</h2>
          <button className="icon-btn" onClick={close} title="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Appearance */}
          <section className="set-block">
            <div className="set-label">{t('appearance')}</div>

            <div className="set-row">
              <span className="set-row-title">{t('language')}</span>
              <div className="mix-toggle">
                <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
                  English
                </button>
                <button className={lang === 'ru' ? 'active' : ''} onClick={() => setLang('ru')}>
                  Русский
                </button>
              </div>
            </div>

            <div className="set-row col">
              <span className="set-row-title">{t('theme')}</span>
              <div className="theme-row">
                {THEMES.map((th) => (
                  <button
                    key={th.id}
                    className={`theme-chip ${theme === th.id ? 'active' : ''}`}
                    onClick={() => setTheme(th.id)}
                  >
                    <span className="theme-dot" style={{ background: th.color }} />
                    {th.label}
                  </button>
                ))}
                <button
                  className={`theme-chip ${theme === 'custom' ? 'active' : ''}`}
                  onClick={() => {
                    if (theme !== 'custom') setTheme('custom')
                    setPickerOpen((o) => !o)
                  }}
                >
                  <span className="theme-dot" style={{ background: customAccent }} />
                  {t('customColor')}
                </button>
              </div>
              {pickerOpen && <ColorPicker value={customAccent} onChange={setCustomAccent} />}
            </div>

            <div className="set-row">
              <div>
                <span className="set-row-title">{t('compactMode')}</span>
                <span className="set-row-sub">{t('compactSub')}</span>
              </div>
              <Toggle checked={compact} onChange={setCompact} />
            </div>

            <div className="set-row col">
              <span className="set-row-title">{t('customBackground')}</span>
              <div className="set-account">
                <button className="sync-btn ghost" onClick={() => pickBackground()}>
                  {customBg ? t('changeImage') : t('chooseImage')}
                </button>
                {customBg && (
                  <button className="sync-btn ghost" onClick={() => openFraming()}>
                    {t('adjustFraming')}
                  </button>
                )}
                {customBg && (
                  <button className="sync-btn ghost" onClick={() => clearBackground()}>
                    {t('remove')}
                  </button>
                )}
              </div>
              {customBg && (
                <div className="set-subrow">
                  <span className="set-row-sub">{t('backgroundScope')}</span>
                  <div className="mix-toggle">
                    <button
                      className={bgScope === 'fullscreen' ? 'active' : ''}
                      onClick={() => setBgScope('fullscreen')}
                    >
                      {t('scopeFullscreen')}
                    </button>
                    <button
                      className={bgScope === 'interface' ? 'active' : ''}
                      onClick={() => setBgScope('interface')}
                    >
                      {t('scopeInterface')}
                    </button>
                    <button
                      className={bgScope === 'global' ? 'active' : ''}
                      onClick={() => setBgScope('global')}
                    >
                      {t('scopeGlobal')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Playback */}
          <section className="set-block">
            <div className="set-label">{t('playback')}</div>
            <div className="set-row">
              <div>
                <span className="set-row-title">{t('resumeSession')}</span>
                <span className="set-row-sub">{t('resumeSub')}</span>
              </div>
              <Toggle checked={resumeSession} onChange={setResumeSession} />
            </div>
          </section>

          {/* Lyrics */}
          <section className="set-block">
            <div className="set-label">{t('lyrics')}</div>
            <div className="set-row">
              <div>
                <span className="set-row-title">{t('geniusFallback')}</span>
                <span className="set-row-sub">{t('geniusSub')}</span>
              </div>
              <Toggle checked={geniusFallback} onChange={setGeniusFallback} />
            </div>
            <div className="set-row">
              <span className="set-row-title">{t('textSize')}</span>
              <div className="mix-toggle">
                {(['sm', 'md', 'lg'] as const).map((s) => (
                  <button
                    key={s}
                    className={lyricsSize === s ? 'active' : ''}
                    onClick={() => setLyricsSize(s)}
                  >
                    {s === 'sm' ? 'S' : s === 'md' ? 'M' : 'L'}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* SoundCloud */}
          <section className="set-block">
            <div className="set-label">{t('scAccount')}</div>
            {scAuth ? (
              <>
                <div className="set-account">
                  <span className="sc-chip">
                    {scAuth.avatar && <img src={scAuth.avatar} alt="" />}
                    {scAuth.name}
                  </span>
                  <button className="sync-btn ghost" onClick={() => disconnectSoundCloud()}>
                    {t('signOut')}
                  </button>
                </div>
                <div className="mix-toggle" style={{ marginTop: 8 }}>
                  <button className={mixSource === 'sc' ? 'active' : ''} onClick={() => setMixSource('sc')}>
                    SC mixes
                  </button>
                  <button
                    className={mixSource === 'generated' ? 'active' : ''}
                    onClick={() => setMixSource('generated')}
                  >
                    Generated
                  </button>
                </div>
                <div className="set-btn-row" style={{ marginTop: 8 }}>
                  <button
                    className="sync-btn ghost"
                    disabled={scImport === 'busy'}
                    onClick={() => runImport(importSoundcloudLikes, setScImport)}
                  >
                    {importLabel(scImport)}
                  </button>
                  <button
                    className="sync-btn ghost"
                    disabled={scRemove === 'busy'}
                    onClick={() => runRemove('soundcloud', setScRemove)}
                  >
                    {removeLabel(scRemove)}
                  </button>
                </div>
              </>
            ) : (
              <button
                className="btn-play sc-signin"
                disabled={scConnecting}
                onClick={() => connectSoundCloud()}
              >
                <RealSoundCloudIcon size={18} />
                <span>{scConnecting ? t('connecting') : t('signInSc')}</span>
              </button>
            )}
          </section>

          {/* Yandex Music */}
          <section className="set-block">
            <div className="set-label">{t('ymAccount')}</div>
            {ymAuth ? (
              <div className="set-account">
                <span className="sc-chip ym-chip">
                  {ymAuth.avatar ? (
                    <img src={ymAuth.avatar} alt="" />
                  ) : (
                    <RealYandexMusicIcon size={20} className="chip-logo" />
                  )}
                  <span className="ym-chip-name">{ymAuth.name}</span>
                </span>
                <button className="sync-btn ghost" onClick={() => disconnectYandex()}>
                  {t('signOut')}
                </button>
                <button
                  className="sync-btn ghost"
                  disabled={ymImport === 'busy'}
                  onClick={() => runImport(importYandexLikes, setYmImport)}
                >
                  {importLabel(ymImport)}
                </button>
                <button
                  className="sync-btn ghost"
                  disabled={ymRemove === 'busy'}
                  onClick={() => runRemove('yandex', setYmRemove)}
                >
                  {removeLabel(ymRemove)}
                </button>
              </div>
            ) : (
              <button
                className="btn-play sc-signin"
                disabled={ymConnecting}
                onClick={() => connectYandex()}
              >
                <RealYandexMusicIcon size={18} />
                <span>{ymConnecting ? t('connecting') : t('signInYm')}</span>
              </button>
            )}
            <div className="set-hint">{t('ymPlusHint')}</div>
          </section>

          {/* Storage */}
          <section className="set-block">
            <div className="set-label">{t('storage')}</div>
            <div className="set-row">
              <span className="set-row-title">{t('lyricsCache')}</span>
              <button
                className="sync-btn ghost"
                onClick={async () => {
                  await clearLyricsCache()
                  setLyricsCleared(true)
                  setTimeout(() => setLyricsCleared(false), 1500)
                }}
              >
                {lyricsCleared ? t('cleared') : t('clearBtn')}
              </button>
            </div>
            <div className="set-row">
              <span className="set-row-title">{t('mixesCache')}</span>
              <button
                className="sync-btn ghost"
                onClick={async () => {
                  await clearMixesCache()
                  setMixesCleared(true)
                  setTimeout(() => setMixesCleared(false), 1500)
                }}
              >
                {mixesCleared ? t('rebuilt') : t('rebuild')}
              </button>
            </div>
            <div className="set-row">
              <div>
                <span className="set-row-title">{t('offlineCache')}</span>
                <span className="set-row-sub">
                  {offlineCount > 0
                    ? `${offlineCount} · ${fmtSize(offlineSize)}`
                    : t('offlineCacheSub')}
                </span>
              </div>
              <button className="sync-btn ghost" disabled={offlineCount === 0} onClick={clearOffline}>
                {t('clearBtn')}
              </button>
            </div>
          </section>

          {/* System */}
          <section className="set-block">
            <div className="set-label">{t('system')}</div>
            <div className="set-row">
              <div>
                <span className="set-row-title">{t('launchStartup')}</span>
                <span className="set-row-sub">{t('launchSub')}</span>
              </div>
              <Toggle checked={launchAtStartup} onChange={setLaunchAtStartup} />
            </div>
          </section>

          <section className="set-block">
            <div className="set-label">{t('discord')}</div>
            <div className="set-row">
              <div>
                <span className="set-row-title">{t('discordRpc')}</span>
                <span className="set-row-sub">{t('discordSub')}</span>
              </div>
              <Toggle
                checked={discordEnabled}
                onChange={(v) => applyDiscord(v, discordAppId)}
              />
            </div>
            {discordEnabled && (
              <div className="set-row col">
                <span className="set-row-title">{t('discordAppId')}</span>
                <input
                  className="set-input"
                  placeholder="000000000000000000"
                  value={discordAppId}
                  onChange={(e) => setDiscordAppId(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => applyDiscord(discordEnabled, discordAppId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyDiscord(discordEnabled, discordAppId)
                  }}
                />
                <span className="set-row-sub">{t('discordAppIdHint')}</span>
              </div>
            )}
          </section>

          <section className="set-block">
            <div className="set-label">{t('about')}</div>
            <p className="set-hint">{t('aboutText')}</p>
            <p className="set-devs">
              {t('developers')}: <strong>icountedtheblink</strong> &amp; <strong>Claude</strong>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
