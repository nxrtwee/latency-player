import { useMemo, useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import {
  HeartIcon,
  ClockIcon,
  FolderIcon,
  DownloadIcon,
  YandexMusicIcon,
  SoundCloudIcon,
  YandexIcon,
  PlusIcon
} from './Icons'

/**
 * postgen shell — thin left icon rail.
 *
 * With primary nav + search + transport on the top bar (PostgenTopBar), the
 * left column shrinks to a compact rail of the library / sources / playlists —
 * everything is icon-first with hover tooltips + an expandable playlist strip.
 * Only renders when `skin === 'postgen'`. Reuses Sidebar's store wiring.
 */
export function PostgenRail(): JSX.Element {
  const source = usePlayer((s) => s.source)
  const setSource = usePlayer((s) => s.setSource)
  const infoService = usePlayer((s) => s.infoService)
  const openInfo = usePlayer((s) => s.openInfo)
  const ymAuth = usePlayer((s) => s.ymAuth)
  const scAuth = usePlayer((s) => s.scAuth)
  const profileName = usePlayer((s) => s.profileName)
  const profileAvatar = usePlayer((s) => s.profileAvatar)
  const avPosX = usePlayer((s) => s.avPosX)
  const avPosY = usePlayer((s) => s.avPosY)
  const avZoom = usePlayer((s) => s.avZoom)
  const likesCount = usePlayer((s) => new Set([...s.likes, ...s.scLikes].map((x) => x.id)).size)
  const offlineCount = usePlayer((s) => s.offlineIds.length)

  const playlists = usePlayer((s) => s.playlists)
  const selectedPlaylistId = usePlayer((s) => s.selectedPlaylistId)
  const openPlaylist = usePlayer((s) => s.openPlaylist)
  const createPlaylist = usePlayer((s) => s.createPlaylist)

  const mixes = usePlayer((s) => s.mixes)
  const openMix = usePlayer((s) => s.openMix)
  const selectedMixId = usePlayer((s) => s.selectedMix?.id)
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed)
  const selectedArtistName = usePlayer((s) => s.selectedArtist?.name)
  const openArtistFromTrack = usePlayer((s) => s.openArtistFromTrack)

  const t = useT()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const recentArtists = useMemo(() => {
    const seen = new Set<string>()
    const out: { key: string; name: string; artwork?: string; track: Track }[] = []
    for (const tr of recentlyPlayed) {
      const name = (tr.artist || '').trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, name, artwork: tr.artwork, track: tr })
      if (out.length >= 5) break
    }
    return out
  }, [recentlyPlayed])

  function submitCreate(): void {
    const n = newName.trim()
    if (n) createPlaylist(n)
    setNewName('')
    setCreating(false)
  }

  const libNav = [
    { id: 'likes', icon: HeartIcon, key: 'yourLikes', badge: likesCount },
    { id: 'recent', icon: ClockIcon, key: 'recentlyPlayed' },
    { id: 'local', icon: FolderIcon, key: 'localFiles' },
    { id: 'offline', icon: DownloadIcon, key: 'downloaded', badge: offlineCount }
  ] as const

  return (
    <aside className="pg-rail">
      <button
        className={`pg-rail-profile ${source === 'profile' ? 'active' : ''}`}
        onClick={() => setSource('profile')}
        title={profileName || scAuth?.name || t('viewProfile')}
      >
        {profileAvatar || scAuth?.avatar ? (
          <img
            src={profileAvatar || scAuth?.avatar}
            alt=""
            style={{ objectPosition: `${avPosX}% ${avPosY}%`, transform: `scale(${avZoom})` }}
          />
        ) : (
          <span>{(profileName || scAuth?.name || t('guest'))[0]?.toUpperCase()}</span>
        )}
      </button>

      <div className="pg-rail-group">
        {libNav.map((item) => {
          const Icon = item.icon
          const active = source === item.id
          return (
            <button
              key={item.id}
              className={`pg-rail-btn ${active ? 'active' : ''}`}
              onClick={() => setSource(item.id)}
              title={t(item.key)}
            >
              <Icon size={19} />
              {'badge' in item && item.badge ? (
                <span className="pg-rail-badge">{item.badge}</span>
              ) : null}
            </button>
          )
        })}
        {ymAuth && (
          <button
            className={`pg-rail-btn ${source === 'wave' ? 'active' : ''}`}
            onClick={() => setSource('wave')}
            title={t('myWave')}
          >
            <YandexMusicIcon size={19} />
          </button>
        )}
      </div>

      <div className="pg-rail-sep" />

      <div className="pg-rail-group">
        <button
          className={`pg-rail-btn ${source === 'info' && infoService === 'soundcloud' ? 'active' : ''}`}
          onClick={() => openInfo('soundcloud')}
          title="SoundCloud"
        >
          <SoundCloudIcon size={19} />
        </button>
        <button
          className={`pg-rail-btn ${source === 'info' && infoService === 'yandex' ? 'active' : ''}`}
          onClick={() => openInfo('yandex')}
          title={t('yandexMusic')}
        >
          <YandexIcon size={19} />
        </button>
      </div>

      <div className="pg-rail-sep" />

      {mixes.length > 0 && (
        <div className="pg-rail-covers">
          {mixes.slice(0, 4).map((mix) => (
            <button
              key={mix.id}
              className={`pg-rail-cover ${source === 'mix' && selectedMixId === mix.id ? 'active' : ''}`}
              onClick={() => openMix(mix)}
              title={mix.title}
            >
              {mix.cover ? <img src={mix.cover} alt="" /> : <span>♫</span>}
            </button>
          ))}
        </div>
      )}

      {recentArtists.length > 0 && (
        <div className="pg-rail-covers">
          {recentArtists.map((a) => (
            <button
              key={a.key}
              className={`pg-rail-cover round ${
                source === 'artist' && selectedArtistName?.toLowerCase() === a.key ? 'active' : ''
              }`}
              onClick={() => openArtistFromTrack(a.track)}
              title={a.name}
            >
              {a.artwork ? <img src={a.artwork} alt="" /> : <span>{a.name[0]}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="pg-rail-playlists">
        <div className="pg-rail-covers">
          {playlists.map((pl) => {
            const active = source === 'playlist' && selectedPlaylistId === pl.id
            const art = pl.tracks.find((tr) => tr.artwork)?.artwork
            return (
              <button
                key={pl.id}
                className={`pg-rail-cover ${active ? 'active' : ''}`}
                onClick={() => openPlaylist(pl.id)}
                title={`${pl.name} — ${pl.tracks.length}`}
              >
                {art ? <img src={art} alt="" /> : <span>♫</span>}
              </button>
            )
          })}
        </div>
        {creating ? (
          <input
            className="pg-rail-plnew"
            autoFocus
            placeholder="…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={submitCreate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate()
              if (e.key === 'Escape') {
                setNewName('')
                setCreating(false)
              }
            }}
          />
        ) : (
          <button
            className="pg-rail-btn pg-rail-add"
            title={t('newPlaylist')}
            onClick={() => setCreating(true)}
          >
            <PlusIcon size={17} />
          </button>
        )}
      </div>
    </aside>
  )
}
