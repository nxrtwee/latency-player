import { forwardRef, useMemo, useState } from 'react'
import type { Track } from '@shared/types'
import { grabScroll } from '../grabScroll'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { Logo } from './Logo'
import {
  PlusIcon,
  RefreshIcon,
  CloseIcon,
  HeartIcon,
  HomeIcon,
  CompassIcon,
  ActivityIcon,
  ClockIcon,
  FolderIcon,
  SoundCloudIcon,
  YandexIcon,
  YandexMusicIcon,
  SettingsIcon,
  DownloadIcon,
  CommentIcon
} from './Icons'

function CollapseIcon({ collapsed }: { collapsed: boolean }): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ transform: collapsed ? 'rotate(180deg)' : undefined }}
    >
      <path
        d="M10 3 L5 8 L10 13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const Sidebar = forwardRef<
  HTMLElement,
  {
    width?: number
    collapsed?: boolean
  }
>(function Sidebar({ width, collapsed }, ref): JSX.Element {
  const folders = usePlayer((s) => s.folders)
  const addFolder = usePlayer((s) => s.addFolder)
  const removeFolder = usePlayer((s) => s.removeFolder)
  const rescan = usePlayer((s) => s.rescan)
  const loading = usePlayer((s) => s.loading)
  const source = usePlayer((s) => s.source)
  const setSource = usePlayer((s) => s.setSource)
  const infoService = usePlayer((s) => s.infoService)
  const openInfo = usePlayer((s) => s.openInfo)
  const setSettingsOpen = usePlayer((s) => s.setSettingsOpen)
  const toggleSidebar = usePlayer((s) => s.toggleSidebar)
  const likesCount = usePlayer(
    (s) => new Set([...s.likes, ...s.scLikes].map((t) => t.id)).size
  )
  const offlineCount = usePlayer((s) => s.offlineIds.length)

  const playlists = usePlayer((s) => s.playlists)
  const selectedPlaylistId = usePlayer((s) => s.selectedPlaylistId)
  const openPlaylist = usePlayer((s) => s.openPlaylist)
  const createPlaylist = usePlayer((s) => s.createPlaylist)
  const renamePlaylist = usePlayer((s) => s.renamePlaylist)
  const deletePlaylist = usePlayer((s) => s.deletePlaylist)

  const scAuth = usePlayer((s) => s.scAuth)
  const ymAuth = usePlayer((s) => s.ymAuth)
  const profileName = usePlayer((s) => s.profileName)
  const profileAvatar = usePlayer((s) => s.profileAvatar)
  const avPosX = usePlayer((s) => s.avPosX)
  const avPosY = usePlayer((s) => s.avPosY)
  const avZoom = usePlayer((s) => s.avZoom)
  const mixes = usePlayer((s) => s.mixes)
  const showSidebarMixes = usePlayer((s) => s.showSidebarMixes)
  const showSidebarArtists = usePlayer((s) => s.showSidebarArtists)
  const openMix = usePlayer((s) => s.openMix)
  const selectedMixId = usePlayer((s) => s.selectedMix?.id)
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed)
  const selectedArtistName = usePlayer((s) => s.selectedArtist?.name)
  const openArtistFromTrack = usePlayer((s) => s.openArtistFromTrack)

  // Unique recent artists (most-recent first) with a representative track for art
  // + navigation. Capped so the list stays compact.
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
      if (out.length >= 6) break
    }
    return out
  }, [recentlyPlayed])

  const t = useT()
  const [showFolders, setShowFolders] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function submitCreate(): void {
    const n = newName.trim()
    if (n) createPlaylist(n)
    setNewName('')
    setCreating(false)
  }
  function submitRename(id: string): void {
    const n = editName.trim()
    if (n) renamePlaylist(id, n)
    setEditingId(null)
  }

  return (
    <aside
      ref={ref}
      className={`sidebar ${collapsed ? 'collapsed' : ''}`}
      style={width && !collapsed ? { width, flex: '0 0 auto' } : undefined}
      onMouseDown={grabScroll}
    >
      <div className="brand">
        <span className="brand-logo">
          <Logo size={30} />
        </span>
        <span className="brand-name">Latency</span>
        <button
          className="sidebar-collapse"
          title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
          onClick={toggleSidebar}
        >
          <CollapseIcon collapsed={!!collapsed} />
        </button>
      </div>

      <button
        className={`sidebar-profile ${source === 'profile' ? 'active' : ''}`}
        onClick={() => setSource('profile')}
        title={t('viewProfile')}
      >
        <span className="sp-avatar">
          {profileAvatar || scAuth?.avatar ? (
            <img
              src={profileAvatar || scAuth?.avatar}
              alt=""
              style={{ objectPosition: `${avPosX}% ${avPosY}%`, transform: `scale(${avZoom})` }}
            />
          ) : (
            <span>{(profileName || scAuth?.name || t('guest'))[0]?.toUpperCase()}</span>
          )}
        </span>
        <span className="sp-meta">
          <span className="sp-name">{profileName || scAuth?.name || t('guest')}</span>
          <span className="sp-sub">{scAuth ? `@${scAuth.name}` : t('viewProfile')}</span>
        </span>
      </button>

      <div className="nav-group">
        <div className="nav-label">{t('discover')}</div>
        <button
          className={`nav-item ${source === 'home' ? 'active' : ''}`}
          onClick={() => setSource('home')}
          title={t('home')}
        >
          <HomeIcon size={18} />
          <span>{t('home')}</span>
        </button>
        <button
          className={`nav-item ${source === 'explore' ? 'active' : ''}`}
          onClick={() => setSource('explore')}
          title={t('explore')}
        >
          <CompassIcon size={18} />
          <span>{t('explore')}</span>
        </button>
        <button
          className={`nav-item ${source === 'activity' ? 'active' : ''}`}
          onClick={() => setSource('activity')}
          title={t('activity')}
        >
          <ActivityIcon size={18} />
          <span>{t('activity')}</span>
        </button>
        <button
          className={`nav-item ${source === 'comments' ? 'active' : ''}`}
          onClick={() => setSource('comments')}
          title={t('commentsSidebar')}
        >
          <CommentIcon size={18} />
          <span>{t('commentsSidebar')}</span>
        </button>
      </div>

      <div className="nav-group">
        <div className="nav-label">{t('yourMusic')}</div>
        <button
          className={`nav-item ${source === 'likes' ? 'active' : ''}`}
          onClick={() => setSource('likes')}
          title={t('yourLikes')}
        >
          <HeartIcon size={18} />
          <span>{t('yourLikes')}</span>
          {likesCount > 0 && <span className="nav-badge">{likesCount}</span>}
        </button>
        <button
          className={`nav-item ${source === 'recent' ? 'active' : ''}`}
          onClick={() => setSource('recent')}
          title={t('recentlyPlayed')}
        >
          <ClockIcon size={18} />
          <span>{t('recentlyPlayed')}</span>
        </button>
        <button
          className={`nav-item ${source === 'local' ? 'active' : ''}`}
          onClick={() => setSource('local')}
          title={t('localFiles')}
        >
          <FolderIcon size={18} />
          <span>{t('localFiles')}</span>
        </button>
        <button
          className={`nav-item ${source === 'offline' ? 'active' : ''}`}
          onClick={() => setSource('offline')}
          title={t('downloaded')}
        >
          <DownloadIcon size={18} />
          <span>{t('downloaded')}</span>
          {offlineCount > 0 && <span className="nav-badge">{offlineCount}</span>}
        </button>
        {ymAuth && (
          <button
            className={`nav-item ${source === 'wave' ? 'active' : ''}`}
            onClick={() => setSource('wave')}
            title={t('myWave')}
          >
            <YandexMusicIcon size={18} />
            <span>{t('myWave')}</span>
          </button>
        )}
      </div>

      {!collapsed && showSidebarMixes && mixes.length > 0 && (
        <div className="nav-group">
          <div className="nav-label">{t('madeForYou')}</div>
          {mixes.slice(0, 5).map((mix) => (
            <button
              key={mix.id}
              className={`mix-item ${source === 'mix' && selectedMixId === mix.id ? 'active' : ''}`}
              onClick={() => openMix(mix)}
              title={mix.title}
            >
              <span className="mix-thumb">
                {mix.cover ? <img src={mix.cover} alt="" /> : <span>♫</span>}
              </span>
              <span className="mix-title">{mix.title}</span>
            </button>
          ))}
        </div>
      )}

      {!collapsed && showSidebarArtists && recentArtists.length > 0 && (
        <div className="nav-group">
          <div className="nav-label">{t('recentArtists')}</div>
          {recentArtists.map((a) => (
            <button
              key={a.key}
              className={`artist-mini ${
                source === 'artist' && selectedArtistName?.toLowerCase() === a.key ? 'active' : ''
              }`}
              onClick={() => openArtistFromTrack(a.track)}
              title={a.name}
            >
              <span className="artist-mini-av">
                {a.artwork ? <img src={a.artwork} alt="" /> : <span>{a.name[0]}</span>}
              </span>
              <span className="artist-mini-name">{a.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="nav-group">
        <div className="nav-label">{t('sources')}</div>
        <button
          className={`nav-item ${source === 'info' && infoService === 'soundcloud' ? 'active' : ''}`}
          onClick={() => openInfo('soundcloud')}
          title="SoundCloud"
        >
          <SoundCloudIcon size={18} />
          <span>SoundCloud</span>
        </button>
        <button
          className={`nav-item ${source === 'info' && infoService === 'yandex' ? 'active' : ''}`}
          onClick={() => openInfo('yandex')}
          title={t('yandexMusic')}
        >
          <YandexIcon size={18} />
          <span>{t('yandexMusic')}</span>
        </button>
      </div>

      <div className="nav-group playlists">
        <div className="nav-label nav-label-row">
          <span>{t('playlists')}</span>
          <button className="icon-btn" title={t('newPlaylist')} onClick={() => setCreating(true)}>
            <PlusIcon size={15} />
          </button>
        </div>
        {creating && (
          <input
            className="pl-new-input"
            autoFocus
            placeholder="Playlist name…"
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
        )}
        <ul className="pl-list">
          {playlists.map((pl) => {
            const active = source === 'playlist' && selectedPlaylistId === pl.id
            if (editingId === pl.id) {
              return (
                <li key={pl.id}>
                  <input
                    className="pl-new-input"
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => submitRename(pl.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename(pl.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                  />
                </li>
              )
            }
            return (
              <li
                key={pl.id}
                className={`pl-row ${active ? 'active' : ''}`}
                onClick={() => openPlaylist(pl.id)}
                onDoubleClick={() => {
                  setEditingId(pl.id)
                  setEditName(pl.name)
                }}
                title={`${pl.name} — ${pl.tracks.length} tracks (double-click to rename)`}
              >
                <span className="pl-thumb">
                  {pl.tracks.find((tr) => tr.artwork)?.artwork ? (
                    <img src={pl.tracks.find((tr) => tr.artwork)!.artwork} alt="" />
                  ) : (
                    <span>♫</span>
                  )}
                </span>
                <span className="pl-name">{pl.name}</span>
                <span className="pl-count">{pl.tracks.length}</span>
                <button
                  className="icon-btn pl-del"
                  title="Delete playlist"
                  onClick={(e) => {
                    e.stopPropagation()
                    deletePlaylist(pl.id)
                  }}
                >
                  <CloseIcon size={12} />
                </button>
              </li>
            )
          })}
          {playlists.length === 0 && !creating && !collapsed && (
            <li className="muted small">{t('noPlaylists')}</li>
          )}
        </ul>
      </div>

      {source === 'local' && (
        <div className="folders">
          <button className="folders-toggle" onClick={() => setShowFolders((v) => !v)}>
            <span>
              {t('folders')} ({folders.length})
            </span>
            <button
              className="icon-btn"
              title="Rescan"
              disabled={loading}
              onClick={(e) => {
                e.stopPropagation()
                rescan()
              }}
            >
              <RefreshIcon size={14} />
            </button>
          </button>
          {showFolders && (
            <ul>
              {folders.map((f) => (
                <li key={f} title={f}>
                  <span className="folder-path">{f}</span>
                  <button className="icon-btn" title="Remove" onClick={() => removeFolder(f)}>
                    <CloseIcon size={12} />
                  </button>
                </li>
              ))}
              {folders.length === 0 && <li className="muted small">{t('noFolders')}</li>}
            </ul>
          )}
          <button className="add-folder" disabled={loading} onClick={() => addFolder()}>
            <PlusIcon size={15} />
            <span>{t('addMusicFolder')}</span>
          </button>
        </div>
      )}

      <button
        className="nav-item sidebar-settings"
        onClick={() => setSettingsOpen(true)}
        title={t('settings')}
      >
        <SettingsIcon size={18} />
        <span>{t('settings')}</span>
      </button>
    </aside>
  )
})
