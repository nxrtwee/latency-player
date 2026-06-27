// Profile — real store data: editable name, avatar, vanity stats. SoundCloud
// sign-in is stubbed until native OAuth capture (later step).
import { useRef, useState } from 'react'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'
import { ConnectSC } from '../components/ConnectSC'
import { ConnectYandex } from '../components/ConnectYandex'
import { FramingModal, type Framing } from '../components/FramingModal'
import type { Detail } from '../MobileApp'

export function ProfileScreen({ onOpenDetail }: { onOpenDetail: (d: Detail) => void }): JSX.Element {
  const profileName = usePlayer((s) => s.profileName)
  const profileAvatar = usePlayer((s) => s.profileAvatar)
  const followers = usePlayer((s) => s.profileFollowers)
  const setProfileName = usePlayer((s) => s.setProfileName)
  const playlists = usePlayer((s) => s.playlists)
  const likes = usePlayer((s) => s.likes)
  const recent = usePlayer((s) => s.recentlyPlayed)
  const scAuth = usePlayer((s) => s.scAuth)
  const scLikes = usePlayer((s) => s.scLikes)
  const disconnectSC = usePlayer((s) => s.disconnectSoundCloud)
  const ymAuth = usePlayer((s) => s.ymAuth)
  const disconnectYandex = usePlayer((s) => s.disconnectYandex)
  const importYandexLikes = usePlayer((s) => s.importYandexLikes)
  const t = useT()
  const [connectOpen, setConnectOpen] = useState(false)
  const [ymConnectOpen, setYmConnectOpen] = useState(false)
  const [importState, setImportState] = useState<'idle' | 'busy' | number>('idle')

  const runImport = async (): Promise<void> => {
    setImportState('busy')
    const n = await importYandexLikes()
    setImportState(n)
  }
  const [cropAv, setCropAv] = useState(false)
  const avInput = useRef<HTMLInputElement>(null)
  const [avFrame, setAvFrame] = useState<Framing>(() => {
    try {
      const raw = localStorage.getItem('lp.m.av.frame')
      if (raw) return JSON.parse(raw) as Framing
    } catch {
      /* default */
    }
    return { posX: 50, posY: 50, zoom: 1 }
  })
  const saveAvFrame = (f: Framing): void => {
    setAvFrame(f)
    try {
      localStorage.setItem('lp.m.av.frame', JSON.stringify(f))
    } catch {
      /* non-fatal */
    }
    setCropAv(false)
  }

  const onAvatarPick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : null
      if (!url) return
      usePlayer.setState({ profileAvatar: url })
      try {
        localStorage.setItem('lp.profileAvatar', url)
      } catch {
        /* quota */
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // When connected to SoundCloud, the profile reflects the SC account unless the
  // user has set their own name/avatar (manual override wins, like desktop).
  const name = profileName || scAuth?.name || ymAuth?.name || t('listener')
  const avatar = profileAvatar || scAuth?.avatar || ymAuth?.avatar || null
  const followerCount = scAuth?.followers ?? followers
  const likeCount = new Set([...likes, ...scLikes].map((x) => x.id)).size

  const startEdit = (): void => {
    setDraft(profileName)
    setEditing(true)
  }
  const commit = (): void => {
    setProfileName(draft.trim())
    setEditing(false)
  }

  const stats = [
    { label: t('playlists'), value: playlists.length },
    { label: t('likes'), value: likeCount },
    { label: t('followers'), value: followerCount }
  ]

  return (
    <div className="view">
      <h1 className="display sm">{t('profile')}</h1>

      <div className="profile-card">
        <div className="profile-avatar">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              style={{ objectPosition: `${avFrame.posX}% ${avFrame.posY}%`, transform: `scale(${avFrame.zoom})` }}
            />
          ) : null}
        </div>

        {editing ? (
          <input
            className="profile-name-input"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            placeholder="Ваше имя"
          />
        ) : (
          <button className="profile-name" onClick={startEdit}>
            {name}
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </button>
        )}
        <div className="profile-bio">{t('bio')}</div>

        <input ref={avInput} type="file" accept="image/*" hidden onChange={onAvatarPick} />
        <div className="profile-actions">
          <button className="pill ghost" onClick={() => avInput.current?.click()}>{t('changePhoto')}</button>
          {avatar && (
            <button className="pill ghost" onClick={() => setCropAv(true)}>{t('crop')}</button>
          )}
          <button className="pill ghost" onClick={startEdit}>{t('changeName')}</button>
        </div>

        <div className="stats">
          {stats.map((s) => (
            <div key={s.label} className="stat">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <section>
        <h2>{t('scAccount')}</h2>
        {scAuth ? (
          <>
            <div className="sc-account-row">
              <div className="sc-account-chip">
                {scAuth.avatar && <img src={scAuth.avatar} alt="" />}
                <span>{scAuth.name}</span>
              </div>
              <button className="ghost-btn" onClick={() => void disconnectSC()}>{t('disconnect')}</button>
            </div>
            <button
              className="set-row sc-likes-row"
              onClick={() => onOpenDetail({ kind: 'sclikes' })}
            >
              <span className="set-row-title">{t('mySCLikes')}</span>
              <span className="pl-more">{scLikes.length} ›</span>
            </button>
          </>
        ) : (
          <>
            <button className="sc-connect" onClick={() => setConnectOpen(true)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                <path d="M3 16v-4M6 16V9M9 16V7M12 16V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M14 16h4a3 3 0 0 0 0-6c-.2-2.2-2-4-4.3-4-1.2 0-2.3.5-3 1.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {t('connectSC')}
            </button>
            <div className="profile-hint">{t('scSub')}</div>
          </>
        )}
      </section>

      <section>
        <h2>{t('ymAccount')}</h2>
        {ymAuth ? (
          <>
            <div className="sc-account-row">
              <div className="sc-account-chip">
                {ymAuth.avatar && <img src={ymAuth.avatar} alt="" />}
                <span>{ymAuth.name}</span>
              </div>
              <button className="ghost-btn" onClick={() => void disconnectYandex()}>
                {t('disconnect')}
              </button>
            </div>
            <button className="set-row" onClick={() => onOpenDetail({ kind: 'wave' })}>
              <span className="set-row-title">{t('myWave')}</span>
              <span className="pl-more">›</span>
            </button>
            <button
              className="set-row"
              onClick={() => void runImport()}
              disabled={importState === 'busy'}
            >
              <span className="set-row-title">{t('importYMLikes')}</span>
              <span className="pl-more">
                {importState === 'busy'
                  ? t('importing')
                  : typeof importState === 'number'
                    ? `+${importState}`
                    : ''}
              </span>
            </button>
          </>
        ) : (
          <>
            <button className="sc-connect" onClick={() => setYmConnectOpen(true)}>
              {t('connectYM')}
            </button>
            <div className="profile-hint">{t('ymSub')}</div>
          </>
        )}
      </section>

      {connectOpen && <ConnectSC onClose={() => setConnectOpen(false)} />}
      {ymConnectOpen && <ConnectYandex onClose={() => setYmConnectOpen(false)} />}
      {cropAv && avatar && (
        <FramingModal
          image={avatar}
          aspect={1}
          circle
          initial={avFrame}
          onSave={saveAvFrame}
          onClose={() => setCropAv(false)}
        />
      )}

      <section>
        <h2>{t('activity')}</h2>
        <div className="profile-hint">
          {t('played')}: {recent.length} · {t('likes')}: {likes.length}
        </div>
      </section>
    </div>
  )
}
