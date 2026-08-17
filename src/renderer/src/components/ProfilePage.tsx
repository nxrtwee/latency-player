import { useMemo, useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTotal } from '../util'
import {
  ActivityIcon,
  ClockIcon,
  EditIcon,
  HeartIcon,
  QueueIcon,
  RealSoundCloudIcon,
  RealYandexMusicIcon
} from './Icons'

/**
 * The profile hero used to carry three hand-editable vanity numbers (followers /
 * plays / rating). They were invented, editable by anyone, and told the owner of
 * the library nothing — so the meta line is just the handle now. The real numbers
 * live in the `.act-stats` cards below, where they are actually computed.
 */
export function ProfilePage(): JSX.Element {
  const t = useT()
  const scAuth = usePlayer((s) => s.scAuth)
  const scConnecting = usePlayer((s) => s.scConnecting)
  const connectSoundCloud = usePlayer((s) => s.connectSoundCloud)
  const disconnectSoundCloud = usePlayer((s) => s.disconnectSoundCloud)
  const ymAuth = usePlayer((s) => s.ymAuth)
  const ymConnecting = usePlayer((s) => s.ymConnecting)
  const connectYandex = usePlayer((s) => s.connectYandex)
  const disconnectYandex = usePlayer((s) => s.disconnectYandex)
  const profileName = usePlayer((s) => s.profileName)
  const profileAvatar = usePlayer((s) => s.profileAvatar)
  const setProfileName = usePlayer((s) => s.setProfileName)
  const pickProfileAvatar = usePlayer((s) => s.pickProfileAvatar)
  const clearProfileAvatar = usePlayer((s) => s.clearProfileAvatar)
  const openAvatarFraming = usePlayer((s) => s.openAvatarFraming)
  const avPosX = usePlayer((s) => s.avPosX)
  const avPosY = usePlayer((s) => s.avPosY)
  const avZoom = usePlayer((s) => s.avZoom)
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed)
  const listenedSec = usePlayer((s) => s.listenedSec)
  const likes = usePlayer((s) => s.likes)
  const scLikes = usePlayer((s) => s.scLikes)
  const playlists = usePlayer((s) => s.playlists)
  const setSource = usePlayer((s) => s.setSource)
  const playQueue = usePlayer((s) => s.playQueue)
  const openArtistFromTrack = usePlayer((s) => s.openArtistFromTrack)

  const name = profileName || scAuth?.name || t('guest')
  const avatar = profileAvatar || scAuth?.avatar || null
  const subtitle = scAuth ? `@${scAuth.name}` : t('localProfile')
  const hasOverride = !!profileName || !!profileAvatar

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function startEdit(): void {
    setDraft(profileName || scAuth?.name || '')
    setEditing(true)
  }
  function saveName(): void {
    setProfileName(draft.trim())
    setEditing(false)
  }
  // Click the avatar: re-frame an existing image, or pick one if there's none.
  function editAvatar(): void {
    if (avatar) openAvatarFraming()
    else pickProfileAvatar()
  }

  const stats = useMemo(() => {
    const likeCount = new Set([...likes, ...scLikes].map((tr) => tr.id)).size
    return { likeCount }
  }, [likes, scLikes])

  const topArtists = useMemo(() => {
    const seen = new Set<string>()
    const out: { key: string; name: string; artwork?: string; track: Track }[] = []
    for (const tr of recentlyPlayed) {
      const n = (tr.artist || '').trim()
      if (!n) continue
      const key = n.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, name: n, artwork: tr.artwork, track: tr })
      if (out.length >= 10) break
    }
    return out
  }, [recentlyPlayed])

  return (
    <section className="tracklist profile">
      <div className="ph-aurora" />

      <header className="ph pf-head">
        <button className="pf-avatar" onClick={editAvatar} title={t('changePhoto')}>
          {avatar ? (
            <img
              src={avatar}
              alt=""
              style={{ objectPosition: `${avPosX}% ${avPosY}%`, transform: `scale(${avZoom})` }}
            />
          ) : (
            <span>{name[0]?.toUpperCase() ?? '?'}</span>
          )}
          <span className="pf-avatar-edit">{t('changePhoto')}</span>
        </button>
        <div className="ph-info">
          <span className="ph-label">{t('profile')}</span>
          {editing ? (
            <input
              className="pf-name-input"
              autoFocus
              value={draft}
              placeholder={t('yourName')}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
          ) : (
            <h1 className="ph-title pf-name" onClick={startEdit} title={t('yourName')}>
              {name}
            </h1>
          )}
          <div className="ph-meta pf-meta">
            <span>{subtitle}</span>
          </div>
          <div className="ph-actions">
            <button className="btn-play" onClick={startEdit}>
              <EditIcon size={17} />
              <span>{t('editName')}</span>
            </button>
            <button className="sync-btn ghost" onClick={() => pickProfileAvatar()}>
              {t('changePhoto')}
            </button>
            {avatar && (
              <button className="sync-btn ghost" onClick={openAvatarFraming}>
                {t('adjustFraming')}
              </button>
            )}
            {profileAvatar && (
              <button className="sync-btn ghost" onClick={clearProfileAvatar}>
                {t('removePhoto')}
              </button>
            )}
            {scAuth && hasOverride && (
              <button
                className="sync-btn ghost"
                onClick={() => {
                  setProfileName('')
                  clearProfileAvatar()
                }}
              >
                {t('useScIdentity')}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="act-stats">
        <div className="stat-card">
          <div className="stat-icon">
            <ActivityIcon size={20} />
          </div>
          <span className="stat-value">{recentlyPlayed.length}</span>
          <span className="stat-label">{t('tracksPlayed')}</span>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <ClockIcon size={20} />
          </div>
          <span className="stat-value">{formatTotal(listenedSec)}</span>
          <span className="stat-label">{t('listeningTime')}</span>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <HeartIcon size={20} />
          </div>
          <span className="stat-value">{stats.likeCount}</span>
          <span className="stat-label">{t('likedTracks')}</span>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <QueueIcon size={20} />
          </div>
          <span className="stat-value">{playlists.length}</span>
          <span className="stat-label">{t('playlists')}</span>
        </div>
      </div>

      <div className="profile-section">
        <h2 className="home-h2">{t('account')}</h2>
        <div className="profile-account">
          <span className="pa-icon">
            <RealSoundCloudIcon size={28} />
          </span>
          <div className="pa-text">
            <div className="pa-title">{scAuth ? t('connectedAs') : 'SoundCloud'}</div>
            <div className="pa-sub">{scAuth ? scAuth.name : t('scAccountDesc')}</div>
          </div>
          {scAuth ? (
            <button className="sync-btn ghost" onClick={disconnectSoundCloud}>
              {t('signOut')}
            </button>
          ) : (
            <button className="sync-btn primary" onClick={connectSoundCloud} disabled={scConnecting}>
              {scConnecting ? t('connecting') : t('signInSc')}
            </button>
          )}
        </div>
        <div className="profile-account">
          <span className="pa-icon">
            <RealYandexMusicIcon size={28} />
          </span>
          <div className="pa-text">
            <div className="pa-title">{ymAuth ? t('connectedAs') : t('yandexMusic')}</div>
            <div className="pa-sub">{ymAuth ? ymAuth.name : t('ymPlusHint')}</div>
          </div>
          {ymAuth ? (
            <button className="sync-btn ghost" onClick={disconnectYandex}>
              {t('signOut')}
            </button>
          ) : (
            <button className="sync-btn primary" onClick={connectYandex} disabled={ymConnecting}>
              {ymConnecting ? t('connecting') : t('signInYm')}
            </button>
          )}
        </div>
      </div>

      {topArtists.length > 0 && (
        <div className="profile-section">
          <h2 className="home-h2">{t('recentArtists')}</h2>
          <div className="profile-artists">
            {topArtists.map((a) => (
              <button
                key={a.key}
                className="pa-artist"
                onClick={() => openArtistFromTrack(a.track)}
                title={a.name}
              >
                <span className="pa-artist-av">
                  {a.artwork ? <img src={a.artwork} alt="" /> : <span>{a.name[0]}</span>}
                </span>
                <span className="pa-artist-name">{a.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {recentlyPlayed.length > 0 && (
        <div className="profile-section">
          <div className="home-h2-row">
            <h2 className="home-h2">{t('recentlyPlayed')}</h2>
            <button className="see-all" onClick={() => setSource('recent')}>
              {t('seeAll')}
            </button>
          </div>
          <div className="profile-tracks">
            {recentlyPlayed.slice(0, 6).map((tr, i) => (
              <button
                key={`${tr.id}-${i}`}
                className="pt-card"
                onClick={() => playQueue(recentlyPlayed, i)}
                title={`${tr.title} — ${tr.artist || ''}`}
              >
                <span className="pt-cover">
                  {tr.artwork ? <img src={tr.artwork} alt="" /> : <span>♫</span>}
                </span>
                <span className="pt-title">{tr.title}</span>
                <span className="pt-artist">{tr.artist || 'Unknown artist'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
