import { useEffect, useRef, useState } from 'react'
import { usePlayer } from './store'
import { Sidebar } from './components/Sidebar'
import { OverlayScrollbar } from './components/OverlayScrollbar'
import { TrackList } from './components/TrackList'
import { PlayerBar } from './components/PlayerBar'
import { RightPanel } from './components/RightPanel'
import { TitleBar } from './components/TitleBar'
import { Resizer } from './components/Resizer'
import { InfoPage } from './components/InfoPage'
import { HomePage } from './components/HomePage'
import { ExplorePage } from './components/ExplorePage'
import { ActivityPage } from './components/ActivityPage'
import { ArtistPage } from './components/ArtistPage'
import { AlbumPage } from './components/AlbumPage'
import { MixPage } from './components/MixPage'
import { WavePage } from './components/WavePage'
import { LyricsView } from './components/LyricsView'
import { Settings } from './components/Settings'
import { CustomScroll } from './components/CustomScroll'
import { BgFraming } from './components/BgFraming'
import { ProfilePage } from './components/ProfilePage'
import { Equalizer } from './components/Equalizer'
import { CommentsPage } from './components/CommentsPage'
import { Splash } from './components/Splash'

function usePersistentWidth(
  key: string,
  def: number,
  min: number,
  max: number
): readonly [number, (w: number) => void] {
  const [w, setW] = useState(() => {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v >= min && v <= max ? v : def
  })
  return [w, setW] as const
}

export function App(): JSX.Element {
  const loadLibrary = usePlayer((s) => s.loadLibrary)
  const loadLikes = usePlayer((s) => s.loadLikes)
  const loadOffline = usePlayer((s) => s.loadOffline)
  const loadPlaylists = usePlayer((s) => s.loadPlaylists)
  const restoreQueue = usePlayer((s) => s.restoreQueue)
  const generateMixes = usePlayer((s) => s.generateMixes)
  const loadScAuth = usePlayer((s) => s.loadScAuth)
  const loadYmAuth = usePlayer((s) => s.loadYmAuth)
  const loadMyWave = usePlayer((s) => s.loadMyWave)
  const error = usePlayer((s) => s.error)
  const source = usePlayer((s) => s.source)
  const selectedPlaylistId = usePlayer((s) => s.selectedPlaylistId)
  const selectedArtistId = usePlayer((s) => s.selectedArtist?.id)
  const selectedAlbumId = usePlayer((s) => s.selectedAlbum?.id)
  const selectedMixId = usePlayer((s) => s.selectedMix?.id)
  const infoService = usePlayer((s) => s.infoService)
  const lyricsOpen = usePlayer((s) => s.lyricsOpen)
  const rightOpen = usePlayer((s) => s.rightOpen)
  const settingsOpen = usePlayer((s) => s.settingsOpen)
  const eqOpen = usePlayer((s) => s.eqOpen)
  const theme = usePlayer((s) => s.theme)
  const customAccent = usePlayer((s) => s.customAccent)
  const customBg = usePlayer((s) => s.customBg)
  const bgPosX = usePlayer((s) => s.bgPosX)
  const bgPosY = usePlayer((s) => s.bgPosY)
  const bgZoom = usePlayer((s) => s.bgZoom)
  const bgScope = usePlayer((s) => s.bgScope)
  const framingOpen = usePlayer((s) => s.framingOpen)

  // The image shows in the interface for 'interface' and 'global' scopes.
  const showInterfaceBg = !!customBg && bgScope !== 'fullscreen'
  const compact = usePlayer((s) => s.compact)
  const sidebarCollapsed = usePlayer((s) => s.sidebarCollapsed)
  const skin = usePlayer((s) => s.skin)
  const lyricsSize = usePlayer((s) => s.lyricsSize)
  const resumeSession = usePlayer((s) => s.resumeSession)
  const loadPrefs = usePlayer((s) => s.loadPrefs)

  // Keep the right panel mounted through its slide-out so the collapse animation
  // can play; it unmounts only after rpOut finishes (see RightPanel onClosed).
  const [rightMounted, setRightMounted] = useState(rightOpen)
  useEffect(() => {
    if (rightOpen) setRightMounted(true)
  }, [rightOpen])

  // Launch splash — shown once per app start, removes itself when its exit ends.
  const [splashDone, setSplashDone] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-skin', skin)
    root.setAttribute('data-compact', compact ? '1' : '0')
    root.setAttribute('data-lyrics', lyricsSize)
    // For the custom theme the accent comes from the user's color; --accent-2 and
    // --accent-soft are derived in CSS via color-mix. Other themes use their own.
    if (theme === 'custom') root.style.setProperty('--accent', customAccent)
    else root.style.removeProperty('--accent')
  }, [theme, skin, customAccent, compact, lyricsSize])

  const viewKey =
    source === 'playlist'
      ? `pl-${selectedPlaylistId}`
      : source === 'artist'
        ? `ar-${selectedArtistId}`
        : source === 'album'
          ? `al-${selectedAlbumId}`
          : source === 'mix'
          ? `mix-${selectedMixId}`
          : source === 'info'
            ? `in-${infoService}`
            : source === 'comments'
              ? 'comments'
              : source

  const [sidebarW, setSidebarW] = usePersistentWidth('lp.sidebarW', 236, 200, 360)
  const [rightW, setRightW] = usePersistentWidth('lp.rightW', 332, 280, 540)
  const sidebarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    loadLibrary()
    loadPlaylists()
    loadPrefs()
    loadOffline().then(() => {
      if (resumeSession) restoreQueue()
    })
    loadYmAuth().then(() => loadMyWave())
    Promise.all([loadLikes(), loadScAuth()]).then(() => generateMixes())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Warm the decode cache for the custom background so the fullscreen player can
  // show it instantly (no first-open flash), even when the interface doesn't use it.
  useEffect(() => {
    if (!customBg) return
    const img = new Image()
    img.src = customBg
    void img.decode?.().catch(() => {})
  }, [customBg])

  return (
    <div className={`app ${showInterfaceBg ? 'has-bg' : ''}`}>
      {showInterfaceBg && (
        <div className="app-bg">
          <img
            src={customBg!}
            alt=""
            style={{ objectPosition: `${bgPosX}% ${bgPosY}%`, transform: `scale(${bgZoom})` }}
          />
          <div className="app-bg-scrim" />
        </div>
      )}
      <TitleBar />
      <div className="app-body">
        <Sidebar
          ref={sidebarRef}
          width={sidebarCollapsed ? undefined : sidebarW}
          collapsed={sidebarCollapsed}
        />
        <OverlayScrollbar scrollRef={sidebarRef} />
        {!sidebarCollapsed && (
          <Resizer
            width={sidebarW}
            setWidth={setSidebarW}
            min={200}
            max={360}
            dir={1}
            persistKey="lp.sidebarW"
          />
        )}
        <main className="content">
          {error && <div className="error-banner">{error}</div>}
          <CustomScroll key={viewKey}>
            {source === 'home' ? (
              <HomePage />
            ) : source === 'explore' ? (
              <ExplorePage />
            ) : source === 'activity' ? (
              <ActivityPage />
            ) : source === 'artist' ? (
              <ArtistPage />
            ) : source === 'album' ? (
              <AlbumPage />
            ) : source === 'mix' ? (
              <MixPage />
            ) : source === 'wave' ? (
              <WavePage />
            ) : source === 'info' ? (
              <InfoPage />
            ) : source === 'profile' ? (
              <ProfilePage />
            ) : source === 'comments' ? (
              <CommentsPage />
            ) : (
              <TrackList />
            )}
          </CustomScroll>
        </main>
        {rightOpen && (
          <Resizer
            width={rightW}
            setWidth={setRightW}
            min={280}
            max={540}
            dir={-1}
            persistKey="lp.rightW"
          />
        )}
        {rightMounted && (
          <RightPanel
            width={rightW}
            closing={!rightOpen}
            onClosed={() => setRightMounted(false)}
          />
        )}
      </div>
      <PlayerBar />
      {lyricsOpen && <LyricsView />}
      {settingsOpen && <Settings />}
      {framingOpen && <BgFraming />}
      {eqOpen && <Equalizer />}
      {!splashDone && <Splash onDone={() => setSplashDone(true)} />}
    </div>
  )
}
