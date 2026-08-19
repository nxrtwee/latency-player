import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '@renderer/store'
import { CustomScroll } from '@renderer/components/CustomScroll'
import { TrackList } from '@renderer/components/TrackList'
import { HomePage } from '@renderer/components/HomePage'
import { ExplorePage } from '@renderer/components/ExplorePage'
import { ActivityPage } from '@renderer/components/ActivityPage'
import { ArtistPage } from '@renderer/components/ArtistPage'
import { AlbumPage } from '@renderer/components/AlbumPage'
import { MixPage } from '@renderer/components/MixPage'
import { WavePage } from '@renderer/components/WavePage'
import { InfoPage } from '@renderer/components/InfoPage'
import { ProfilePage } from '@renderer/components/ProfilePage'
import { CommentsPage } from '@renderer/components/CommentsPage'
import { LyricsView } from '@renderer/components/LyricsView'
import { Settings } from '@renderer/components/Settings'
import { BgFraming } from '@renderer/components/BgFraming'
import { Splash } from '@renderer/components/Splash'
import { TopBar } from './shell/TopBar'
import { Drawer } from './shell/Drawer'
import { BottomTabs } from './shell/BottomTabs'
import { PlayerDock } from './shell/PlayerDock'
import { TokenSheet } from './shell/TokenSheet'
import { installMediaSession } from './api/mediaSession'
import { installResolvePrefetch } from './api/resolveCache'
import { installNativeLevels } from './api/nativeLevels'
import { installStatusBar } from './api/statusBar'
import { applyUiScale } from './uiScale'

/**
 * The phone shell.
 *
 * It renders the DESKTOP components and the desktop DOM — same `.app` /
 * `.app-body` / `main.content` / `CustomScroll` skeleton, same page router keyed
 * off the shared store's `source`, same PlayerBar, same fullscreen player, same
 * Settings modal. Nothing here re-implements a screen; the phone-shaped
 * deviations are three pieces of chrome the desktop has no use for (TopBar,
 * Drawer, BottomTabs) plus the portrait.css layer.
 *
 * Deliberately NOT rendered: TitleBar (no OS window), Resizer (no pointer),
 * RightPanel (no room — its queue lives in the fullscreen player) and Equalizer
 * (only reachable from the right panel, and the mobile audio path has no EQ).
 */
export function MobileApp(): JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [splashDone, setSplashDone] = useState(false)

  const source = usePlayer((s) => s.source)
  const selectedPlaylistId = usePlayer((s) => s.selectedPlaylistId)
  const selectedArtistId = usePlayer((s) => s.selectedArtist?.id)
  const selectedAlbumId = usePlayer((s) => s.selectedAlbum?.id)
  const selectedMixId = usePlayer((s) => s.selectedMix?.id)
  const infoService = usePlayer((s) => s.infoService)
  const error = usePlayer((s) => s.error)

  const lyricsOpen = usePlayer((s) => s.lyricsOpen)
  const settingsOpen = usePlayer((s) => s.settingsOpen)
  const framingOpen = usePlayer((s) => s.framingOpen)

  const theme = usePlayer((s) => s.theme)
  const skin = usePlayer((s) => s.skin)
  const visual = usePlayer((s) => s.visual)
  const graphics = usePlayer((s) => s.graphics)
  const lyricsSize = usePlayer((s) => s.lyricsSize)
  const compact = usePlayer((s) => s.compact)
  const customAccent = usePlayer((s) => s.customAccent)
  const uiScale = usePlayer((s) => s.uiScale)

  const customBg = usePlayer((s) => s.customBg)
  const bgKind = usePlayer((s) => s.bgKind)
  const bgPosX = usePlayer((s) => s.bgPosX)
  const bgPosY = usePlayer((s) => s.bgPosY)
  const bgZoom = usePlayer((s) => s.bgZoom)
  const bgScope = usePlayer((s) => s.bgScope)
  const showInterfaceBg = !!customBg && bgScope !== 'fullscreen'

  const loadLibrary = usePlayer((s) => s.loadLibrary)
  const loadLikes = usePlayer((s) => s.loadLikes)
  const loadOffline = usePlayer((s) => s.loadOffline)
  const loadPlaylists = usePlayer((s) => s.loadPlaylists)
  const restoreQueue = usePlayer((s) => s.restoreQueue)
  const generateMixes = usePlayer((s) => s.generateMixes)
  const loadScAuth = usePlayer((s) => s.loadScAuth)
  const loadYmAuth = usePlayer((s) => s.loadYmAuth)
  const loadMyWave = usePlayer((s) => s.loadMyWave)
  const probeAvailability = usePlayer((s) => s.probeAvailability)
  const resumeSession = usePlayer((s) => s.resumeSession)

  // Same attribute matrix the desktop sets (App.tsx), minus the two flags that
  // describe an Electron window: `data-hwaccel` is pinned to 1 (a phone browser
  // always composites on the GPU) and there is no window to relaunch anyway.
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-skin', skin)
    root.setAttribute('data-visual', visual)
    root.setAttribute('data-graphics', graphics)
    root.setAttribute('data-hwaccel', '1')
    root.setAttribute('data-compact', compact ? '1' : '0')
    root.setAttribute('data-lyrics', lyricsSize)
    if (theme === 'custom') root.style.setProperty('--accent', customAccent)
    else root.style.removeProperty('--accent')
  }, [theme, skin, visual, graphics, compact, lyricsSize, customAccent])

  // Interface scale — the Settings slider only writes the pref; the viewport
  // rewrite lives in the phone shell (uiScale.ts explains why it is the viewport
  // and not CSS zoom). main.tsx already applied the saved value pre-paint, so
  // this effect exists for live changes.
  useEffect(() => {
    applyUiScale(uiScale)
  }, [uiScale])

  // Bootstrap. The desktop's loaders (they all go through window.api, which the
  // mobile shim implements) plus the four native installs that only exist here:
  // lock-screen transport, neighbour stream prefetch, the native level tap that
  // drives the visualizer, and the status-bar style.
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void loadLibrary()
    void loadPlaylists()
    void loadOffline().then(() => {
      if (resumeSession) restoreQueue()
    })
    void loadYmAuth().then(() => loadMyWave())
    void Promise.all([loadLikes(), loadScAuth()]).then(() => {
      void generateMixes()
      void probeAvailability()
    })
    installMediaSession()
    installResolvePrefetch()
    installNativeLevels()
    installStatusBar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Warm the decode cache for the wallpaper so the fullscreen player shows it
  // without a first-open flash (desktop does the same).
  useEffect(() => {
    if (!customBg || bgKind === 'video') return
    const img = new Image()
    img.src = customBg
    void img.decode?.().catch(() => {})
  }, [customBg, bgKind])

  // A video wallpaper is the only thing here that keeps a decoder running, and
  // there are two moments when nobody can see it: the fullscreen player covers it
  // (it draws its own copy), and the app is in the background. On a phone the
  // second one is most of the day, so this is battery, not just CPU. Same logic
  // and the same `pause` self-heal as the desktop's App.tsx.
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = bgVideoRef.current
    if (!v) return
    const sync = (): void => {
      if (usePlayer.getState().lyricsOpen || document.hidden) v.pause()
      else v.play().catch(() => {})
    }
    sync()
    v.addEventListener('pause', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      v.removeEventListener('pause', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [lyricsOpen, customBg, bgKind, showInterfaceBg])

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
              : source

  const page = (
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
  )

  return (
    <div className={`app ${showInterfaceBg ? 'has-bg' : ''}`}>
      {showInterfaceBg && (
        <div className="app-bg">
          {bgKind === 'video' ? (
            <video
              ref={bgVideoRef}
              src={customBg!}
              autoPlay
              loop
              muted
              playsInline
              style={{
                objectPosition: `${bgPosX}% ${bgPosY}%`,
                transformOrigin: `${bgPosX}% ${bgPosY}%`,
                // Keeps `.app-bg video`'s compositor promotion (see styles.css).
                transform: `scale(${bgZoom}) translateZ(0)`
              }}
            />
          ) : (
            <img
              src={customBg!}
              alt=""
              style={{
                objectPosition: `${bgPosX}% ${bgPosY}%`,
                transformOrigin: `${bgPosX}% ${bgPosY}%`,
                transform: `scale(${bgZoom})`
              }}
            />
          )}
          <div className="app-bg-scrim" />
        </div>
      )}

      <div className="app-body">
        <main className="content">
          <TopBar onMenu={() => setDrawerOpen(true)} />
          {error && (
            <div className="error-banner" onClick={() => usePlayer.setState({ error: null })}>
              {error}
            </div>
          )}
          {page}
        </main>
      </div>

      {/* Root-level chrome: `.app > .app-body` is a z-index:1 stacking context,
          so anything that must paint over the page (capsule 30, tabs 31, drawer
          38, fullscreen player 40, modals 60) has to be a sibling of it. */}
      <PlayerDock />
      <BottomTabs />
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {lyricsOpen && <LyricsView />}
      {settingsOpen && <Settings />}
      {framingOpen && <BgFraming />}
      {/* Paste-a-token sign-in: driven imperatively by the shim's scLogin /
          ymLogin, so it renders nothing until a connect button asks. */}
      <TokenSheet />
      {!splashDone && <Splash onDone={() => setSplashDone(true)} />}
    </div>
  )
}
