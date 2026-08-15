import { useEffect, useRef, useState } from 'react'
import { usePlayer } from './store'
import {
  eventToCombo,
  runHotkeyAction,
  comboToAccelerator,
  isGlobalCombo,
  isCaptureActive,
  type HotkeyActionId
} from './keybindings'
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

// True when the given element (or the currently focused element) is a text-entry
// context. Used to make hotkeys stand down while the user is typing anywhere.
function isEditableEl(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  if (!t || !t.tagName) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}


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
  const probeAvailability = usePlayer((s) => s.probeAvailability)
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
  const skin = usePlayer((s) => s.skin)
  const visual = usePlayer((s) => s.visual)
  const customAccent = usePlayer((s) => s.customAccent)
  const customBg = usePlayer((s) => s.customBg)
  const bgKind = usePlayer((s) => s.bgKind)
  const bgPosX = usePlayer((s) => s.bgPosX)
  const bgPosY = usePlayer((s) => s.bgPosY)
  const bgZoom = usePlayer((s) => s.bgZoom)
  const bgScope = usePlayer((s) => s.bgScope)
  const framingOpen = usePlayer((s) => s.framingOpen)

  // The image shows in the interface for 'interface' and 'global' scopes.
  const showInterfaceBg = !!customBg && bgScope !== 'fullscreen'
  const compact = usePlayer((s) => s.compact)
  const sidebarCollapsed = usePlayer((s) => s.sidebarCollapsed)
  const graphics = usePlayer((s) => s.graphics)
  const hwAccel = usePlayer((s) => s.hwAccel)
  const lyricsSize = usePlayer((s) => s.lyricsSize)
  const resumeSession = usePlayer((s) => s.resumeSession)
  const loadPrefs = usePlayer((s) => s.loadPrefs)
  const keybindings = usePlayer((s) => s.keybindings)

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
    root.setAttribute('data-visual', visual)
    root.setAttribute('data-graphics', graphics)
    // Software compositing (HW accel off) makes backdrop-filter/blur/grain
    // brutally expensive — flag it so the CSS sheds those heavy effects (else
    // nextgen turns into a slideshow). See perf.css.
    root.setAttribute('data-hwaccel', hwAccel ? '1' : '0')
    root.setAttribute('data-compact', compact ? '1' : '0')
    root.setAttribute('data-lyrics', lyricsSize)
    // For the custom theme the accent comes from the user's color; --accent-2 and
    // --accent-soft are derived in CSS via color-mix. Other themes use their own.
    if (theme === 'custom') root.style.setProperty('--accent', customAccent)
    else root.style.removeProperty('--accent')
  }, [theme, skin, visual, graphics, hwAccel, customAccent, compact, lyricsSize])

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
    Promise.all([loadLikes(), loadScAuth()]).then(() => {
      generateMixes()
      // Probe source reachability AFTER auth loads so authed backends are
      // trusted without a network hit, and the effective source auto-corrects.
      void probeAvailability()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Warm the decode cache for the custom background so the fullscreen player can
  // show it instantly (no first-open flash), even when the interface doesn't use it.
  // Images only — a <video> streams its own frames, there's nothing to pre-decode.
  useEffect(() => {
    if (!customBg || bgKind === 'video') return
    const img = new Image()
    img.src = customBg
    void img.decode?.().catch(() => {})
  }, [customBg, bgKind])

  // The interface background video keeps decoding even while the fullscreen player
  // is open — but the player fully covers it and renders its OWN background, so two
  // video layers decode at once (the FPS drop after adding video backgrounds). Pause
  // the (invisible) interface clip while lyrics are open; resume on close.
  //
  // Also self-heal: Chromium can spontaneously pause a background <video> during
  // heavy compositing — whenever it pauses and we didn't ask for it, resume.
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = bgVideoRef.current
    if (!v) return
    const sync = (): void => {
      if (usePlayer.getState().lyricsOpen) v.pause()
      else v.play().catch(() => {})
    }
    sync()
    v.addEventListener('pause', sync)
    return () => v.removeEventListener('pause', sync)
  }, [lyricsOpen, customBg, bgKind])

  // Freeze watchdog. The self-heal above only catches an explicit `pause`. But a
  // background <video> in Chromium/Electron can also wedge PERMANENTLY after an
  // FPS dip / compositor stall: the element keeps reporting playing (paused is
  // false, no `pause` event) yet never presents another frame — it sits dead
  // until the bg or the whole app is reloaded. Detect it via
  // requestVideoFrameCallback: while the clip should be playing, a presented
  // frame must arrive every ~1.5s. If none does, re-kick decode (tiny seek +
  // play) AND nudge the layer transform to force the compositor to re-present.
  // Skipped while lyrics owns the clip (we pause it there on purpose).
  useEffect(() => {
    const v = bgVideoRef.current
    if (!v || bgKind !== 'video' || !customBg) return
    // rVFC isn't in every TS DOM lib version — reach it through a narrow cast
    // (via unknown so it doesn't clash with a built-in declaration if present).
    const vf = v as unknown as {
      requestVideoFrameCallback?: (cb: () => void) => number
      cancelVideoFrameCallback?: (h: number) => void
    }
    const hasRvfc = typeof vf.requestVideoFrameCallback === 'function'
    let lastFrame = performance.now()
    let lastTime = v.currentTime
    let rvfc = 0
    const onFrame = (): void => {
      lastFrame = performance.now()
      rvfc = vf.requestVideoFrameCallback!(onFrame)
    }
    if (hasRvfc) rvfc = vf.requestVideoFrameCallback!(onFrame)

    const watchdog = window.setInterval(() => {
      if (v.paused || usePlayer.getState().lyricsOpen) {
        lastFrame = performance.now()
        lastTime = v.currentTime
        return
      }
      // No presented frame (rVFC) — or, lacking rVFC, a frozen currentTime — for
      // longer than the grace window means the clip is wedged. 500ms still sits
      // above the frame interval of a janking-but-alive clip (so a legit FPS dip
      // isn't mistaken for a freeze), while recovering almost imperceptibly fast.
      const stalled = hasRvfc
        ? performance.now() - lastFrame > 500
        : v.currentTime === lastTime
      lastTime = v.currentTime
      if (!stalled) return
      try {
        v.currentTime = v.currentTime + 0.001
      } catch {
        /* seek can throw mid-load; ignore */
      }
      v.play().catch(() => {})
      // Force the compositor to re-composite the (possibly frozen) layer.
      v.style.transform = 'translateZ(0) translateY(0.02px)'
      requestAnimationFrame(() => {
        v.style.transform = ''
      })
      lastFrame = performance.now()
    }, 250)

    return () => {
      window.clearInterval(watchdog)
      if (hasRvfc && rvfc) vf.cancelVideoFrameCallback?.(rvfc)
    }
  }, [customBg, bgKind])

  // ---- Client hotkeys ---------------------------------------------------------
  // In-app dispatch: catch keydown (when focused) and all mouse-button binds in
  // the capture phase. Reads live state via getState() so the listener is bound
  // once. Skips typing contexts and the settings capture mode.
  useEffect(() => {
    const dispatch = (e: KeyboardEvent | MouseEvent): void => {
      if (isCaptureActive() || isEditableEl(e.target) || isEditableEl(document.activeElement)) return
      const combo = eventToCombo(e)
      if (!combo) return
      // Combos registered as OS-global shortcuts (accelerator + modifier) are
      // handled solely via the main globalShortcut → onHotkeyTrigger path, so we
      // skip them here to avoid double-firing. Everything else — mouse buttons and
      // modifierless / unmappable keys — is in-app only and handled right here.
      if (isGlobalCombo(combo)) return
      const binds = usePlayer.getState().keybindings
      const hit = Object.keys(binds).find((id) => binds[id] === combo)
      if (!hit) return
      e.preventDefault()
      runHotkeyAction(hit as HotkeyActionId)
    }
    const onKey = (e: KeyboardEvent): void => dispatch(e)
    const onMouse = (e: MouseEvent): void => dispatch(e)
    window.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener('mousedown', onMouse, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('mousedown', onMouse, { capture: true })
    }
  }, [])

  // Background + focused dispatch for keyboard accelerators: main forwards every
  // globalShortcut trigger here. The DOM listener above skips accelerator combos,
  // so there's no double-fire. Stand down while the user is typing.
  useEffect(() => {
    const unsub = window.api?.onHotkeyTrigger?.((id) => {
      if (isEditableEl(document.activeElement)) return
      runHotkeyAction(id as HotkeyActionId)
    })
    return () => unsub?.()
  }, [])

  // Keep the OS-global registration in sync with the bound keyboard combos. Only
  // modifier-bearing combos are registered globally (a bare key would hijack
  // typing in every app). Mouse binds and modifierless keys stay in-app only.
  // While any text field is focused we register an EMPTY set, so combos never
  // fire (and their keys flow into the input) while the user is typing.
  useEffect(() => {
    if (!window.api?.setGlobalHotkeys) return
    const list: { accel: string; id: string }[] = []
    for (const [id, combo] of Object.entries(keybindings)) {
      if (isGlobalCombo(combo)) list.push({ accel: comboToAccelerator(combo)!, id })
    }
    let current: 'full' | 'empty' | null = null
    const apply = (): void => {
      const want = isEditableEl(document.activeElement) ? 'empty' : 'full'
      if (want === current) return
      current = want
      void window.api!.setGlobalHotkeys!(want === 'empty' ? [] : list)
    }
    apply()
    const onFocusIn = (): void => apply()
    // focusout fires before activeElement updates — defer a tick.
    const onFocusOut = (): void => {
      window.setTimeout(apply, 0)
    }
    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('focusout', onFocusOut)
    return () => {
      window.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('focusout', onFocusOut)
    }
  }, [keybindings])

  // Shared page router — identical across shells; only the surrounding chrome
  // differs by skin. HomePage itself swaps to the bento surface when the
  // Universal visual is on (see HomePage's visual gate).
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

  const overlays = (
    <>
      {lyricsOpen && <LyricsView />}
      {settingsOpen && <Settings />}
      {framingOpen && <BgFraming />}
      {eqOpen && <Equalizer />}
      {!splashDone && <Splash onDone={() => setSplashDone(true)} />}
    </>
  )

  const bgLayer = showInterfaceBg && (
    <div className="app-bg">
      {bgKind === 'video' ? (
        <video ref={bgVideoRef} src={customBg!} autoPlay loop muted playsInline />
      ) : (
        <img
          src={customBg!}
          alt=""
          style={{ objectPosition: `${bgPosX}% ${bgPosY}%`, transform: `scale(${bgZoom})` }}
        />
      )}
      <div className="app-bg-scrim" />
    </div>
  )

  return (
    <div className={`app ${showInterfaceBg ? 'has-bg' : ''}`}>
      {bgLayer}
      <TitleBar />
      <div className="app-body">
        <Sidebar
          ref={sidebarRef}
          width={sidebarCollapsed ? undefined : sidebarW}
          collapsed={sidebarCollapsed}
        />
        <OverlayScrollbar scrollRef={sidebarRef} pad={16} />
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
          {page}
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
      {overlays}
    </div>
  )
}
