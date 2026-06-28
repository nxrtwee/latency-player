import { create } from 'zustand'
import type { Album, Artist, Playlist, Track } from '@shared/types'
import type { PlaybackHandle } from './providers/types'
import { getProvider } from './providers/registry'

export type RepeatMode = 'off' | 'all' | 'one'
/** Where the custom background image is applied. */
export type BgScope = 'global' | 'interface' | 'fullscreen'
/** Per-track karaoke/fullscreen background (local image or video file). */
export type KaraokeBg = { type: 'image'; url: string } | { type: 'video'; url: string }
export type Source =
  | 'home'
  | 'explore'
  | 'activity'
  | 'local'
  | 'likes'
  | 'playlist'
  | 'recent'
  | 'offline'
  | 'comments'
  | 'info'
  | 'artist'
  | 'album'
  | 'mix'
  | 'wave'
  | 'profile'
export type InfoService = 'soundcloud' | 'yandex'
export type PlayedTrack = Track & { playedAt: number }
export interface Mix {
  id: string
  title: string
  subtitle: string
  cover?: string
  tracks: Track[]
}

interface PlayerState {
  // navigation
  source: Source
  selectedPlaylistId: string | null
  infoService: InfoService

  // library
  tracks: Track[]
  folders: string[]
  loading: boolean
  error: string | null

  // likes
  likes: Track[]

  // offline cache (set of track ids available offline) + in-flight downloads
  offlineIds: string[]
  offlineTracks: Track[]
  downloading: string[]

  // recently played (most-recent first), with play timestamps
  recentlyPlayed: PlayedTrack[]
  // total seconds actually listened (accumulated from real playback progress,
  // not track durations) — drives the "listening time" stat
  listenedSec: number

  // playlists
  playlists: Playlist[]

  // track search (provider chosen via searchSource)
  searchSource: 'soundcloud' | 'yandex'
  searchQuery: string
  searchResults: Track[]
  searchArtists: Artist[]
  searchAlbums: Album[]
  searchLoading: boolean

  // global search history (most-recent first)
  searchHistory: string[]

  // artist page
  selectedArtist: Artist | null
  artistTracks: Track[]
  artistSimilar: Artist[]
  artistAlbums: Album[]
  artistLoading: boolean
  // album page
  selectedAlbum: Album | null
  albumTracks: Track[]
  albumLoading: boolean

  // daily mixes
  mixes: Mix[]
  mixesLoading: boolean
  mixesReal: boolean
  mixSource: 'sc' | 'generated'
  selectedMix: Mix | null
  myWave: Mix | null
  /** true while the queue is the endless My Wave radio (keeps fetching more). */
  waveActive: boolean

  // soundcloud account
  scAuth: Artist | null
  scConnecting: boolean
  scLikes: Track[]

  // O(1) membership for "is this track liked" (app likes ∪ SoundCloud likes)
  likedIds: Set<string>

  // yandex music account
  ymAuth: Artist | null
  ymConnecting: boolean

  // local profile (overrides SoundCloud identity when set)
  profileName: string
  profileAvatar: string | null
  // editable vanity stats (for fun — purely local)
  profileFollowers: number
  profilePlays: number
  profileRating: number

  // lyrics panel
  lyricsOpen: boolean

  // right panel visibility
  rightOpen: boolean

  // settings modal
  settingsOpen: boolean

  // equalizer panel
  eqOpen: boolean

  // appearance
  theme: string
  skin: string
  // Graphics quality preset: standard | balanced | optimized | performance.
  // Higher tiers progressively shed GPU-heavy effects (glass blur, grain,
  // infinite animations, visualizer rAF). standard = unchanged current look.
  graphics: string
  // Frame-rate cap for the in-app visualizer/animations. 15–120; 120 = uncapped.
  fpsLimit: number
  customAccent: string
  customBg: string | null
  // Per-track cover overrides (trackId → media:// url). Falls back to the
  // provider artwork when absent. Reset removes the override.
  customCovers: Record<string, string>
  // Per-track karaoke/fullscreen background (independent of the global bg).
  // image/video are media:// urls.
  karaokeBgs: Record<string, KaraokeBg>
  // nextgen floating player bar width, as a percent of the window (45–95).
  playerBarWidth: number
  playerBarHeight: number
  // custom-background framing (object-position % + zoom scale)
  bgPosX: number
  bgPosY: number
  bgZoom: number
  bgScope: BgScope
  framingOpen: boolean
  // which image the framing modal is editing
  framingTarget: 'bg' | 'avatar'
  // profile-avatar framing (object-position % + zoom scale)
  avPosX: number
  avPosY: number
  avZoom: number
  compact: boolean
  sidebarCollapsed: boolean
  // search-results visibility for the "Albums & playlists" section
  showSearchAlbums: boolean
  showSearchPlaylists: boolean
  // whether the SoundCloud "Your Mixes" section shows on the home page
  showHomeMixes: boolean
  // left-sidebar sections (each independently hideable)
  showSidebarMixes: boolean
  showSidebarArtists: boolean
  lyricsSize: 'sm' | 'md' | 'lg'
  lang: 'en' | 'ru'

  // preferences
  resumeSession: boolean
  geniusFallback: boolean
  launchAtStartup: boolean
  // Chromium GPU compositing. Default on; turning it off (needs restart) is the
  // real lever against a weak GPU being driven every frame. Source of truth is
  // a main-process prefs file; this mirrors it for the toggle UI (loadPrefs).
  hwAccel: boolean

  // playback
  queue: Track[]
  currentIndex: number // -1 = nothing loaded
  isPlaying: boolean
  positionSec: number
  durationSec: number
  volume: number
  repeat: RepeatMode
  shuffle: boolean
  // when the queue runs out, keep playing by appending related tracks
  autopilot: boolean
  autopilotLoading: boolean

  // navigation actions
  setSource: (source: Source) => void
  openPlaylist: (id: string) => void
  openInfo: (service: InfoService) => void

  // playlist actions
  loadPlaylists: () => Promise<void>
  createPlaylist: (name: string) => Promise<Playlist>
  renamePlaylist: (id: string, name: string) => Promise<void>
  deletePlaylist: (id: string) => Promise<void>
  addToPlaylist: (id: string, track: Track) => Promise<void>
  addAllToPlaylist: (id: string, tracks: Track[]) => Promise<void>
  removeFromPlaylist: (id: string, trackId: string) => Promise<void>

  // queue persistence
  restoreQueue: () => void

  // library actions
  loadLibrary: () => Promise<void>
  addFolder: () => Promise<void>
  removeFolder: (folder: string) => Promise<void>
  rescan: () => Promise<void>

  // track search actions
  runSearch: (query: string) => Promise<void>
  setSearchSource: (source: 'soundcloud' | 'yandex') => void

  // search history
  pushSearchHistory: (query: string) => void
  clearSearchHistory: () => void

  // artist navigation
  openArtist: (artist: Artist) => Promise<void>
  openArtistFromTrack: (track: Track) => Promise<void>
  openAlbum: (album: Album) => Promise<void>

  // daily mixes
  generateMixes: (force?: boolean) => Promise<void>
  openMix: (mix: Mix) => void
  setMixSource: (mode: 'sc' | 'generated') => Promise<void>

  // soundcloud account
  loadScAuth: () => Promise<void>
  connectSoundCloud: () => Promise<void>
  disconnectSoundCloud: () => Promise<void>

  // yandex music account
  loadYmAuth: () => Promise<void>
  connectYandex: () => Promise<void>
  disconnectYandex: () => Promise<void>

  // import liked tracks from a service into the local likes; returns count added
  importYandexLikes: () => Promise<number>
  importSoundcloudLikes: () => Promise<number>
  // remove previously-imported likes of a provider from the global likes; returns count removed
  removeImportedLikes: (provider: 'soundcloud' | 'yandex') => Promise<number>

  // yandex personal radio ("My Wave")
  loadMyWave: () => Promise<void>
  playMyWave: (startIndex?: number) => void
  // Play a SPECIFIC already-shown wave track (no fresh fetch) — for the orbit
  // covers, where the user expects the cover they clicked to actually play.
  playWaveTrack: (index: number) => void

  // profile
  setProfileName: (name: string) => void
  pickProfileAvatar: () => Promise<void>
  clearProfileAvatar: () => void
  setProfileStat: (key: 'followers' | 'plays' | 'rating', value: number) => void

  // lyrics
  toggleLyrics: () => void

  // panels
  toggleRightPanel: () => void
  setSettingsOpen: (open: boolean) => void
  setEqOpen: (open: boolean) => void

  // appearance
  setTheme: (theme: string) => void
  setSkin: (skin: string) => void
  setGraphics: (g: string) => void
  setFpsLimit: (n: number) => void
  setCustomAccent: (hex: string) => void
  pickBackground: () => Promise<void>
  clearBackground: () => void
  setTrackCover: (trackId: string) => Promise<void>
  resetTrackCover: (trackId: string) => void
  setKaraokeImage: (trackId: string) => Promise<void>
  setKaraokeVideoFile: (trackId: string) => Promise<void>
  resetKaraokeBg: (trackId: string) => void
  setPlayerBarWidth: (pct: number) => void
  setPlayerBarHeight: (pct: number) => void
  setBgFraming: (f: Partial<{ x: number; y: number; zoom: number }>) => void
  setBgScope: (scope: BgScope) => void
  openFraming: () => void
  closeFraming: () => void
  setAvatarFraming: (f: Partial<{ x: number; y: number; zoom: number }>) => void
  openAvatarFraming: () => void
  setCompact: (v: boolean) => void
  toggleSidebar: () => void
  setShowSearchAlbums: (v: boolean) => void
  setShowSearchPlaylists: (v: boolean) => void
  setShowHomeMixes: (v: boolean) => void
  setShowSidebarMixes: (v: boolean) => void
  setShowSidebarArtists: (v: boolean) => void
  setLyricsSize: (v: 'sm' | 'md' | 'lg') => void
  setLang: (v: 'en' | 'ru') => void

  // preferences
  setResumeSession: (v: boolean) => void
  setGeniusFallback: (v: boolean) => void
  setLaunchAtStartup: (v: boolean) => Promise<void>
  setHwAccel: (v: boolean) => Promise<void>
  loadPrefs: () => Promise<void>
  clearLyricsCache: () => Promise<void>
  clearMixesCache: () => Promise<void>

  // likes actions
  loadLikes: () => Promise<void>
  toggleLike: (track: Track) => Promise<void>

  // offline actions
  loadOffline: () => Promise<void>
  downloadTrack: (track: Track) => Promise<void>
  downloadAll: (tracks: Track[]) => Promise<void>
  removeOffline: (trackId: string) => Promise<void>

  // playback actions
  playQueue: (tracks: Track[], startIndex: number) => void
  enqueue: (tracks: Track[]) => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  jumpTo: (index: number) => void
  clearUpcoming: () => void
  reorderQueue: (from: number, to: number) => void
  removeFromQueue: (index: number) => void
  seek: (sec: number) => void
  setVolume: (v: number) => void
  cycleRepeat: () => void
  toggleShuffle: () => void
  toggleAutopilot: () => void
}

// The live playback handle lives outside React state — it's an imperative
// resource, not render data.
let handle: PlaybackHandle | null = null

// Real-listening-time accounting. `lastTickPos` is the previous reported play
// position for the current track; positive deltas under 2s are summed into the
// listenedSec accumulator (seeks/track-changes jump more and are ignored). Reset
// to 0 whenever a new track loads. Persist is throttled to avoid hammering disk.
let lastTickPos = 0
let lastListenPersist = 0

// Synchronous map of trackId -> local media:// URL for offline-cached tracks, so
// loadIndex can swap a streamed SoundCloud track for its downloaded file without
// an async hop mid-playback. Populated by loadOffline().
const offlineUrls = new Map<string, string>()

const VOLUME_KEY = 'lp.volume'
const initialVolume = (() => {
  const v = Number(localStorage.getItem(VOLUME_KEY))
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.8
})()

const RECENT_KEY = 'lp.recent'
const RECENT_MAX = 80
const initialRecent: PlayedTrack[] = (() => {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed = raw ? (JSON.parse(raw) as PlayedTrack[]) : []
    if (!Array.isArray(parsed)) return []
    return parsed.map((t) => ({ ...t, playedAt: t.playedAt ?? 0 }))
  } catch {
    return []
  }
})()

const QUEUE_KEY = 'lp.queue'

const SEARCH_HISTORY_KEY = 'lp.searchHistory'
const SEARCH_HISTORY_MAX = 8
const initialSearchHistory: string[] = (() => {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
    const parsed = raw ? (JSON.parse(raw) as string[]) : []
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
})()

/** Read a numeric localStorage value, falling back when absent/NaN (0 stays valid). */
const readNum = (key: string, def: number): number => {
  const raw = localStorage.getItem(key)
  if (raw === null) return def
  const v = Number(raw)
  return Number.isFinite(v) ? v : def
}

export const usePlayer = create<PlayerState>((set, get) => {
  function persistQueue(): void {
    const { queue, currentIndex } = get()
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify({ queue, currentIndex }))
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }

  function setKaraokeBg(trackId: string, bg: KaraokeBg): void {
    const next = { ...get().karaokeBgs, [trackId]: bg }
    set({ karaokeBgs: next })
    try {
      localStorage.setItem('lp.karaokeBgs', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  /** Push the current track + play state to Discord (no-op when RPC is off). */
  function updatePresence(): void {
    try {
      const { queue, currentIndex, isPlaying, positionSec } = get()
      const track = currentIndex >= 0 ? queue[currentIndex] : undefined
      if (!track) {
        window.api.discordUpdate(null)
        return
      }
      window.api.discordUpdate({
        title: track.title,
        artist: track.artist,
        album: track.album,
        // Only http(s) covers work as a Discord image (SoundCloud artwork);
        // local files have data: URLs which Discord can't load.
        artwork: track.artwork && /^https?:\/\//.test(track.artwork) ? track.artwork : undefined,
        startedAt: Date.now() - Math.round(positionSec * 1000),
        playing: isPlaying
      })
    } catch {
      /* ignore */
    }
  }

  /**
   * Mirror the current track + play state to the OS media controls. Chromium maps
   * navigator.mediaSession onto the Windows System Media Transport Controls
   * (SMTC), so this is what fills the system media overlay with cover/title/
   * artist/progress — without it Windows shows "unknown application".
   */
  function updateMediaSession(): void {
    if (!('mediaSession' in navigator)) return
    try {
      const { queue, currentIndex, isPlaying, positionSec, durationSec } = get()
      const ms = navigator.mediaSession
      const track = currentIndex >= 0 ? queue[currentIndex] : undefined
      if (!track) {
        ms.metadata = null
        ms.playbackState = 'none'
        return
      }
      ms.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || '',
        album: track.album || '',
        // http(s) covers and local data: URLs both work for SMTC artwork.
        artwork: track.artwork ? [{ src: track.artwork, sizes: '512x512' }] : []
      })
      ms.playbackState = isPlaying ? 'playing' : 'paused'
      if (durationSec > 0 && Number.isFinite(durationSec)) {
        try {
          ms.setPositionState({
            duration: durationSec,
            position: Math.max(0, Math.min(positionSec, durationSec)),
            playbackRate: 1
          })
        } catch {
          /* position can briefly exceed duration during a track swap — ignore */
        }
      }
    } catch {
      /* MediaSession unsupported — ignore */
    }
  }

  /**
   * Wire the OS media buttons (play/pause/next/prev/seek) to the player controls.
   * Registered once at startup; each handler reads the latest controls via get().
   */
  function bindMediaSessionHandlers(): void {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const on = (action: MediaSessionAction, fn: MediaSessionActionHandler): void => {
      try {
        ms.setActionHandler(action, fn)
      } catch {
        /* action unsupported by this Chromium build — ignore */
      }
    }
    on('play', () => get().togglePlay())
    on('pause', () => get().togglePlay())
    on('previoustrack', () => get().prev())
    on('nexttrack', () => get().next())
    on('seekto', (d) => {
      if (d.seekTime != null) get().seek(d.seekTime)
    })
    on('seekbackward', (d) => {
      get().seek(Math.max(0, get().positionSec - (d.seekOffset ?? 10)))
    })
    on('seekforward', (d) => {
      get().seek(Math.min(get().durationSec, get().positionSec + (d.seekOffset ?? 10)))
    })
  }

  function recordRecent(track: Track): void {
    const existing = get().recentlyPlayed.filter((t) => t.id !== track.id)
    const recentlyPlayed = [{ ...track, playedAt: Date.now() }, ...existing].slice(0, RECENT_MAX)
    set({ recentlyPlayed })
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recentlyPlayed))
    } catch {
      /* non-fatal */
    }
  }

  /**
   * Autopilot: when the queue is exhausted, find tracks related to a recent
   * SoundCloud track, append the fresh ones, and start playing the first of them.
   * No-op (returns false) when there's no SoundCloud seed or nothing new comes back.
   */
  async function extendQueueWithRelated(): Promise<boolean> {
    const { queue } = get()
    if (queue.length === 0) return false
    // Seed from the most recent SoundCloud track in the queue (newest first).
    const seed = [...queue].reverse().find((t) => t.providerId === 'soundcloud' && t.id.startsWith('sc:'))
    if (!seed) return false

    set({ autopilotLoading: true })
    try {
      const related = await window.api.scRelated(seed.id.slice(3))
      const have = new Set(get().queue.map((t) => t.id))
      const fresh = related.filter((t) => !have.has(t.id))
      if (fresh.length === 0) {
        set({ autopilotLoading: false })
        return false
      }
      const startIndex = get().queue.length
      set({ queue: [...get().queue, ...fresh], autopilotLoading: false })
      loadIndex(startIndex, true)
      persistQueue()
      return true
    } catch {
      set({ autopilotLoading: false })
      return false
    }
  }

  /**
   * Fetch the next batch of My Wave tracks and append the fresh ones to the queue.
   * Passing the last queued track id makes the rotor return the NEXT tracks rather
   * than the same opening batch. When `playFirstNew` is set it also starts playing
   * the first appended track (used when the queue ran dry); otherwise it's a silent
   * top-up (lookahead prefetch) that leaves the current track alone.
   */
  async function topUpWave(playFirstNew: boolean): Promise<boolean> {
    try {
      const q = get().queue
      const lastId = q.length ? q[q.length - 1].id : undefined
      const wave = await window.api.ymMyWave(lastId)
      const have = new Set(q.map((t) => t.id))
      const fresh = wave.tracks.filter((t) => !have.has(t.id))
      if (fresh.length === 0) return false
      const startIndex = get().queue.length
      set({ queue: [...get().queue, ...fresh] })
      if (playFirstNew) loadIndex(startIndex, true)
      persistQueue()
      return true
    } catch {
      return false
    }
  }

  const extendQueueWithWave = (): Promise<boolean> => topUpWave(true)

  // Keep at least this many tracks queued ahead while the wave plays, so the
  // next/prev buttons always have a target (an empty look-ahead used to wedge the
  // player). Prefetch is guarded so it never runs twice concurrently.
  const WAVE_LOOKAHEAD = 3
  let wavePrefetching = false
  async function maybePrefetchWave(): Promise<void> {
    if (wavePrefetching || !get().waveActive) return
    const { queue, currentIndex } = get()
    if (queue.length - currentIndex - 1 >= WAVE_LOOKAHEAD) return
    wavePrefetching = true
    try {
      await topUpWave(false)
    } finally {
      wavePrefetching = false
    }
  }

  // Rotor feedback drives My Wave's recommendations — without trackStarted/Finished
  // the station keeps replaying the same opening batch. Best-effort, Yandex-only.
  function reportWaveFinished(): void {
    const { waveActive, currentIndex, queue, positionSec } = get()
    if (!waveActive || currentIndex < 0) return
    const cur = queue[currentIndex]
    if (cur?.providerId === 'yandex') {
      window.api.ymWaveFeedback('trackFinished', cur.id, Math.max(0, Math.round(positionSec)))
    }
  }
  function reportWaveStarted(track: Track): void {
    if (get().waveActive && track.providerId === 'yandex') {
      window.api.ymWaveFeedback('trackStarted', track.id, 0)
    }
  }

  function loadIndex(index: number, autoplay: boolean): void {
    const { queue, volume } = get()
    // Tell the rotor the outgoing wave track finished before we switch.
    reportWaveFinished()
    if (index < 0 || index >= queue.length) {
      handle?.destroy()
      handle = null
      set({ currentIndex: -1, isPlaying: false, positionSec: 0, durationSec: 0 })
      updatePresence()
      updateMediaSession()
      return
    }
    const track = queue[index]
    // If this SoundCloud/Yandex track is cached offline, play the local file
    // instead — swap to the local provider + media:// uri so no network is touched.
    // We keep `track` as the original (for history/presence) and use `playTrack`
    // only for the actual playback handle.
    const cachedUrl = offlineUrls.get(track.id)
    const playTrack: Track =
      cachedUrl && (track.providerId === 'soundcloud' || track.providerId === 'yandex')
        ? { ...track, providerId: 'local', uri: cachedUrl }
        : track
    const provider = getProvider(playTrack.providerId)
    if (!provider) {
      set({ error: `No provider registered for "${track.providerId}"` })
      return
    }

    handle?.destroy()
    lastTickPos = 0
    set({ currentIndex: index, positionSec: 0, durationSec: track.durationSec ?? 0, error: null })
    // Surface the new track to the OS media overlay immediately (before it plays).
    updateMediaSession()

    handle = provider.createPlayback(playTrack, {
      onTime: (sec) => {
        // Accumulate REAL listened time: only positive sub-2s deltas while playing
        // count (ignores the jump from a seek or the reset on a new track).
        const d = sec - lastTickPos
        lastTickPos = sec
        if (d > 0 && d < 2 && get().isPlaying) {
          const listenedSec = get().listenedSec + d
          set({ positionSec: sec, listenedSec })
          const now = Date.now()
          if (now - lastListenPersist > 5000) {
            lastListenPersist = now
            try {
              localStorage.setItem('lp.listenedSec', String(Math.round(listenedSec)))
            } catch {
              /* non-fatal */
            }
          }
        } else {
          set({ positionSec: sec })
        }
      },
      onDuration: (sec) => {
        set({ durationSec: sec })
        updateMediaSession()
      },
      onPlayingChange: (playing) => {
        set({ isPlaying: playing })
        updatePresence()
        updateMediaSession()
      },
      onError: (message) => set({ error: message }),
      onEnded: () => {
        const { repeat } = get()
        if (repeat === 'one') {
          handle?.seek(0)
          handle?.play()
        } else {
          get().next()
        }
      }
    })
    handle.setVolume(volume)
    if (autoplay) {
      handle.play()
      recordRecent(track)
      reportWaveStarted(track)
    }
    persistQueue()
    // Keep a few tracks queued ahead so next/prev never hit an empty queue.
    void maybePrefetchWave()
  }

  // O(1) liked lookup for track rows: rebuilt whenever likes/scLikes change so
  // a 300+ liked list doesn't make every row scan the array on each state tick.
  const syncLikedIds = (): void =>
    set({ likedIds: new Set([...get().likes, ...get().scLikes].map((t) => t.id)) })

  // Register the OS media-key / overlay button handlers once at startup.
  bindMediaSessionHandlers()

  return {
    source: 'home',
    selectedPlaylistId: null,
    infoService: 'soundcloud',

    tracks: [],
    folders: [],
    loading: false,
    error: null,

    likes: [],

    offlineIds: [],
    offlineTracks: [],
    downloading: [],

    recentlyPlayed: initialRecent,
    listenedSec: readNum('lp.listenedSec', 0),

    playlists: [],

    searchSource: localStorage.getItem('lp.searchSource') === 'yandex' ? 'yandex' : 'soundcloud',
    searchQuery: '',
    searchResults: [],
    searchArtists: [],
    searchAlbums: [],
    searchLoading: false,

    searchHistory: initialSearchHistory,

    selectedArtist: null,
    artistTracks: [],
    artistSimilar: [],
    artistAlbums: [],
    artistLoading: false,
    selectedAlbum: null,
    albumTracks: [],
    albumLoading: false,

    mixes: [],
    mixesLoading: false,
    mixesReal: false,
    mixSource: localStorage.getItem('lp.mixSource') === 'generated' ? 'generated' : 'sc',
    selectedMix: null,
    myWave: null,
    waveActive: false,

    scAuth: null,
    scConnecting: false,
    scLikes: [],
    likedIds: new Set<string>(),

    ymAuth: null,
    ymConnecting: false,

    profileName: localStorage.getItem('lp.profileName') || '',
    profileAvatar: localStorage.getItem('lp.profileAvatar'),
    profileFollowers: readNum('lp.profileFollowers', 0),
    profilePlays: readNum('lp.profilePlays', 0),
    profileRating: readNum('lp.profileRating', 0),

    lyricsOpen: false,
    rightOpen: true,
    settingsOpen: false,
    eqOpen: false,
    // 'light' was removed — migrate any saved value back to the default.
    theme: ((): string => {
      const t = localStorage.getItem('lp.theme') || 'crimson'
      // 'light' and 'green' were removed — migrate them to the crimson default.
      return t === 'light' || t === 'green' ? 'crimson' : t
    })(),
    // nextgen is the flagship skin: default to it unless the user explicitly
    // chose oldgen (i.e. first launch / unset = nextgen).
    skin: localStorage.getItem('lp.skin') === 'oldgen' ? 'oldgen' : 'nextgen',
    graphics: (() => {
      const v = localStorage.getItem('lp.graphics') || ''
      return ['balanced', 'optimized', 'performance'].includes(v) ? v : 'standard'
    })(),
    fpsLimit: (() => {
      const n = parseInt(localStorage.getItem('lp.fpsLimit') || '', 10)
      return Number.isFinite(n) && n >= 15 && n <= 120 ? n : 60
    })(),
    customAccent: localStorage.getItem('lp.customAccent') || '#ff2e54',
    customBg: localStorage.getItem('lp.bg'),
    customCovers: (() => {
      try {
        const raw = localStorage.getItem('lp.customCovers')
        const obj = raw ? (JSON.parse(raw) as Record<string, string>) : {}
        return obj && typeof obj === 'object' ? obj : {}
      } catch {
        return {}
      }
    })(),
    karaokeBgs: (() => {
      try {
        const raw = localStorage.getItem('lp.karaokeBgs')
        const obj = raw ? (JSON.parse(raw) as Record<string, KaraokeBg>) : {}
        return obj && typeof obj === 'object' ? obj : {}
      } catch {
        return {}
      }
    })(),
    playerBarWidth: Math.min(95, Math.max(45, readNum('lp.playerBarW', 64))),
    playerBarHeight: Math.min(100, Math.max(60, readNum('lp.playerBarH', 100))),
    bgPosX: readNum('lp.bgPosX', 50),
    bgPosY: readNum('lp.bgPosY', 50),
    bgZoom: readNum('lp.bgZoom', 1),
    bgScope: (localStorage.getItem('lp.bgScope') as BgScope) || 'global',
    framingOpen: false,
    framingTarget: 'bg',
    avPosX: readNum('lp.avPosX', 50),
    avPosY: readNum('lp.avPosY', 50),
    avZoom: readNum('lp.avZoom', 1),
    compact: localStorage.getItem('lp.compact') === '1',
    sidebarCollapsed: localStorage.getItem('lp.sidebarCollapsed') === '1',
    showSearchAlbums: localStorage.getItem('lp.searchAlbums') !== '0',
    showSearchPlaylists: localStorage.getItem('lp.searchPlaylists') === '1',
    showHomeMixes: localStorage.getItem('lp.homeMixes') !== '0',
    showSidebarMixes: localStorage.getItem('lp.sbMixes') !== '0',
    showSidebarArtists: localStorage.getItem('lp.sbArtists') !== '0',
    lyricsSize: (localStorage.getItem('lp.lyricsSize') as 'sm' | 'md' | 'lg') || 'md',
    lang: (localStorage.getItem('lp.lang') as 'en' | 'ru') || 'en',
    resumeSession: localStorage.getItem('lp.resume') !== '0',
    geniusFallback: localStorage.getItem('lp.genius') !== '0',
    launchAtStartup: false,
    hwAccel: true,

    queue: [],
    currentIndex: -1,
    isPlaying: false,
    positionSec: 0,
    durationSec: 0,
    volume: initialVolume,
    repeat: 'off',
    shuffle: false,
    autopilot: localStorage.getItem('lp.autopilot') === '1',
    autopilotLoading: false,

    setSource(source) {
      set({ source })
    },

    openPlaylist(id) {
      set({ source: 'playlist', selectedPlaylistId: id })
    },

    openInfo(service) {
      set({ source: 'info', infoService: service })
    },

    async loadPlaylists() {
      const playlists = await window.api.getPlaylists()
      set({ playlists })
    },

    async createPlaylist(name) {
      const playlists = await window.api.createPlaylist(name)
      set({ playlists })
      return playlists[playlists.length - 1]
    },

    async renamePlaylist(id, name) {
      const playlists = await window.api.renamePlaylist(id, name)
      set({ playlists })
    },

    async deletePlaylist(id) {
      const playlists = await window.api.removePlaylist(id)
      const { selectedPlaylistId, source } = get()
      // if we just deleted the open playlist, fall back to Local
      if (selectedPlaylistId === id) {
        set({ playlists, selectedPlaylistId: null, source: source === 'playlist' ? 'local' : source })
      } else {
        set({ playlists })
      }
    },

    async addToPlaylist(id, track) {
      const playlists = await window.api.addToPlaylist(id, track)
      set({ playlists })
    },

    async addAllToPlaylist(id, tracks) {
      if (tracks.length === 0) return
      const playlists = await window.api.addTracksToPlaylist(id, tracks)
      set({ playlists })
    },

    async removeFromPlaylist(id, trackId) {
      const playlists = await window.api.removeFromPlaylist(id, trackId)
      set({ playlists })
    },

    async loadLikes() {
      const likes = await window.api.getLikes()
      set({ likes })
      syncLikedIds()
    },

    async toggleLike(track) {
      const likes = await window.api.toggleLike(track)
      set({ likes })
      syncLikedIds()
    },

    async loadOffline() {
      try {
        const [offlineIds, offlineTracks] = await Promise.all([
          window.api.offlineList(),
          window.api.offlineTracks()
        ])
        // Resolve each id's local URL once, into the synchronous swap map.
        offlineUrls.clear()
        await Promise.all(
          offlineIds.map(async (id) => {
            const url = await window.api.offlineLocalUrl(id)
            if (url) offlineUrls.set(id, url)
          })
        )
        set({ offlineIds, offlineTracks })
      } catch {
        /* ignore */
      }
    },

    async downloadTrack(track) {
      if (get().offlineIds.includes(track.id) || get().downloading.includes(track.id)) return
      set({ downloading: [...get().downloading, track.id] })
      try {
        const ok = await window.api.offlineDownload(track)
        if (ok) {
          const url = await window.api.offlineLocalUrl(track.id)
          if (url) offlineUrls.set(track.id, url)
        }
        set((s) => ({
          downloading: s.downloading.filter((id) => id !== track.id),
          offlineIds: ok ? [...s.offlineIds, track.id] : s.offlineIds,
          offlineTracks: ok ? [track, ...s.offlineTracks] : s.offlineTracks,
          error: ok ? s.error : 'Download failed (HLS-only or network error)'
        }))
      } catch {
        set((s) => ({ downloading: s.downloading.filter((id) => id !== track.id) }))
      }
    },

    async downloadAll(tracks) {
      // Sequential so we don't hammer SoundCloud's CDN with N parallel requests.
      // downloadTrack already no-ops on already-cached / in-flight ids; local files
      // are already on disk so there's nothing to cache.
      for (const track of tracks) {
        if (track.providerId === 'local') continue
        if (get().offlineIds.includes(track.id)) continue
        await get().downloadTrack(track)
      }
    },

    async removeOffline(trackId) {
      try {
        await window.api.offlineRemove(trackId)
        offlineUrls.delete(trackId)
        set((s) => ({
          offlineIds: s.offlineIds.filter((id) => id !== trackId),
          offlineTracks: s.offlineTracks.filter((t) => t.id !== trackId)
        }))
      } catch {
        /* ignore */
      }
    },

    setSearchSource(source) {
      set({ searchSource: source })
      try {
        localStorage.setItem('lp.searchSource', source)
      } catch {
        /* ignore */
      }
    },

    async runSearch(query) {
      set({ searchQuery: query })
      const q = query.trim()
      if (!q) {
        set({ searchResults: [], searchArtists: [], searchAlbums: [], searchLoading: false })
        return
      }
      const source = get().searchSource
      set({ searchLoading: true, error: null })
      try {
        const [results, artists, albums, playlists] =
          source === 'yandex'
            ? await Promise.all([
                window.api.ymSearch(q),
                window.api.ymSearchArtists(q).catch(() => []),
                window.api.ymSearchAlbums(q).catch(() => []),
                window.api.ymSearchPlaylists(q).catch(() => [])
              ])
            : await Promise.all([
                window.api.scSearch(q),
                window.api.scSearchUsers(q).catch(() => []),
                window.api.scSearchAlbums(q).catch(() => []),
                window.api.scSearchPlaylists(q).catch(() => [])
              ])
        set({
          searchResults: results,
          searchArtists: artists,
          searchAlbums: [...albums, ...playlists],
          searchLoading: false
        })
      } catch (e) {
        const label = source === 'yandex' ? 'Yandex' : 'SoundCloud'
        set({
          searchLoading: false,
          error: `${label}: ${e instanceof Error ? e.message : String(e)}`
        })
      }
    },

    pushSearchHistory(query) {
      const q = query.trim()
      if (!q) return
      const next = [q, ...get().searchHistory.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(
        0,
        SEARCH_HISTORY_MAX
      )
      set({ searchHistory: next })
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next))
      } catch {
        /* non-fatal */
      }
    },

    clearSearchHistory() {
      set({ searchHistory: [] })
      try {
        localStorage.removeItem(SEARCH_HISTORY_KEY)
      } catch {
        /* ignore */
      }
    },

    async openArtist(artist) {
      set({
        source: 'artist',
        selectedArtist: artist,
        artistTracks: [],
        artistSimilar: [],
        artistAlbums: [],
        error: null
      })
      // Only apply async results if the user is still on this artist.
      const stillHere = (): boolean => get().selectedArtist?.id === artist.id
      if (artist.provider === 'soundcloud') {
        set({ artistLoading: true })
        try {
          // Fetch full profile (avatar/followers) in parallel when we only have a bare id.
          const needProfile = !artist.avatar || artist.followers == null
          const [tracks, profile, albums] = await Promise.all([
            window.api.scUserTracks(artist.id),
            needProfile ? window.api.scUser(artist.id).catch(() => null) : Promise.resolve(null),
            window.api.scUserAlbums(artist.id).catch(() => [])
          ])
          set((s) => ({
            artistTracks: tracks,
            artistLoading: false,
            artistAlbums: s.selectedArtist?.id === artist.id ? albums : s.artistAlbums,
            selectedArtist: profile && s.selectedArtist?.id === artist.id ? profile : s.selectedArtist
          }))
          // SoundCloud has no related-artists API — derive from the top track's
          // related tracks (their uploaders, with avatars, current artist excluded).
          const seed = tracks.find((t) => t.id.startsWith('sc:'))
          if (seed) {
            window.api
              .scRelatedArtists(seed.id.slice(3))
              .then((rel) => {
                const similar = rel.filter((a) => a.id !== artist.id).slice(0, 12)
                if (stillHere()) set({ artistSimilar: similar })
              })
              .catch(() => {})
          }
        } catch (e) {
          set({
            artistLoading: false,
            error: `SoundCloud: ${e instanceof Error ? e.message : String(e)}`
          })
        }
        return
      }
      if (artist.provider === 'yandex') {
        set({ artistLoading: true })
        try {
          // Also refetch when we lack the monthly-listeners stat (search results
          // carry an avatar but no stats, so an avatar alone isn't enough).
          const needProfile = !artist.avatar || artist.monthlyListeners == null
          const [tracks, profile, similar, albums] = await Promise.all([
            window.api.ymArtistTracks(artist.id),
            needProfile ? window.api.ymArtist(artist.id).catch(() => null) : Promise.resolve(null),
            window.api.ymSimilarArtists(artist.id).catch(() => []),
            window.api.ymArtistAlbums(artist.id).catch(() => [])
          ])
          set((s) => ({
            artistTracks: tracks,
            artistLoading: false,
            artistSimilar: s.selectedArtist?.id === artist.id ? similar : s.artistSimilar,
            artistAlbums: s.selectedArtist?.id === artist.id ? albums : s.artistAlbums,
            selectedArtist: profile && s.selectedArtist?.id === artist.id ? profile : s.selectedArtist
          }))
        } catch (e) {
          set({
            artistLoading: false,
            error: `Yandex: ${e instanceof Error ? e.message : String(e)}`
          })
        }
        return
      }
      // local: gather matching tracks across library, likes and playlists
      const { tracks, likes, playlists } = get()
      const pool = new Map<string, Track>()
      for (const t of [...tracks, ...likes, ...playlists.flatMap((p) => p.tracks)]) {
        if ((t.artist || '').toLowerCase() === artist.name.toLowerCase()) pool.set(t.id, t)
      }
      set({ artistTracks: [...pool.values()], artistLoading: false })
    },

    async openAlbum(album) {
      set({ source: 'album', selectedAlbum: album, albumTracks: [], albumLoading: true, error: null })
      try {
        const tracks =
          album.provider === 'yandex'
            ? album.kind === 'playlist'
              ? await window.api.ymPlaylistTracks(album.id)
              : await window.api.ymAlbumTracks(album.id)
            : album.provider === 'soundcloud'
              ? // SoundCloud albums and sets are both /playlists/{id}
                await window.api.scAlbumTracks(album.id)
              : []
        if (get().selectedAlbum?.id === album.id) set({ albumTracks: tracks, albumLoading: false })
      } catch (e) {
        set({
          albumLoading: false,
          error: `${album.provider === 'yandex' ? 'Yandex' : 'SoundCloud'}: ${
            e instanceof Error ? e.message : String(e)
          }`
        })
      }
    },

    async openArtistFromTrack(track) {
      if (track.providerId === 'yandex') {
        if (track.artistId) {
          await get().openArtist({
            id: track.artistId,
            name: track.artist || 'Artist',
            provider: 'yandex'
          })
          return
        }
      }
      if (track.providerId === 'soundcloud') {
        if (track.artistId) {
          await get().openArtist({
            id: track.artistId,
            name: track.artist || 'Artist',
            provider: 'soundcloud'
          })
          return
        }
        // Older liked SC tracks have no artistId — resolve the profile by name.
        if (track.artist) {
          try {
            const users = await window.api.scSearchUsers(track.artist)
            const match =
              users.find((u) => u.name.toLowerCase() === track.artist!.toLowerCase()) || users[0]
            if (match) {
              await get().openArtist(match)
              return
            }
          } catch {
            /* fall through to local */
          }
        }
      }
      if (track.artist) {
        await get().openArtist({ id: track.artist, name: track.artist, provider: 'local' })
      }
    },

    async generateMixes(force = false) {
      const today = new Date().toISOString().slice(0, 10)
      if (!force) {
        try {
          const raw = localStorage.getItem('lp.mixes.v2')
          if (raw) {
            const cached = JSON.parse(raw) as { date: string; mixes: Mix[]; real?: boolean }
            if (cached.date === today && cached.mixes?.length) {
              set({ mixes: cached.mixes, mixesReal: !!cached.real })
              return
            }
          }
        } catch {
          /* ignore */
        }
      }

      const persist = (mixes: Mix[], real: boolean): void => {
        try {
          localStorage.setItem('lp.mixes.v2', JSON.stringify({ date: today, mixes, real }))
        } catch {
          /* ignore quota */
        }
      }

      set({ mixesLoading: true })

      // 1) When signed in (and not forced to generated), use the real SC mixes.
      if (get().scAuth && get().mixSource !== 'generated') {
        try {
          const personal = await window.api.scPersonalMixes()
          if (personal.length) {
            const mixes: Mix[] = personal.slice(0, 10).map((m, i) => ({
              id: `mix-${today}-${i + 1}`,
              title: m.title,
              subtitle: m.subtitle || 'From your SoundCloud',
              cover: m.cover,
              tracks: m.tracks
            }))
            set({ mixes, mixesReal: true, mixesLoading: false })
            persist(mixes, true)
            return
          }
        } catch {
          /* fall back to generated */
        }
      }

      // 2) Generated from taste — real SC likes when signed in, else local likes.
      let likes = get().likes
      if (get().scAuth) {
        try {
          const my = await window.api.scMyLikes()
          if (my.length) likes = my
        } catch {
          /* keep local likes */
        }
      }
      const recents = get().recentlyPlayed
      if (likes.length === 0 && recents.length === 0) {
        set({ mixes: [], mixesReal: false, mixesLoading: false })
        return
      }

      try {
        // Seed candidates — one per artist so mixes stay distinct.
        type Cand = { numId: string; track: Track }
        const cands: Cand[] = []
        const artistSeen = new Set<string>()
        const pushCand = (track: Track): void => {
          if (track.providerId !== 'soundcloud' || !track.id.startsWith('sc:')) return
          const key = (track.artist || track.id).toLowerCase()
          if (artistSeen.has(key)) return
          artistSeen.add(key)
          cands.push({ numId: track.id.slice(3), track })
        }

        // SoundCloud likes first, then recents — the strongest signal
        for (const t of likes) pushCand(t)
        if (cands.length < 5) for (const t of recents) pushCand(t)

        // 2) supplement from liked LOCAL artists, resolved to their real SC profile
        if (cands.length < 5) {
          const localArtists: string[] = []
          const seenLocal = new Set<string>()
          for (const t of [...likes, ...recents]) {
            const a = (t.artist || '').trim()
            const key = a.toLowerCase()
            if (a && t.providerId === 'local' && !artistSeen.has(key) && !seenLocal.has(key)) {
              seenLocal.add(key)
              localArtists.push(a)
            }
          }
          for (const a of localArtists) {
            if (cands.length >= 14) break
            try {
              const users = await window.api.scSearchUsers(a)
              const u = users.find((x) => x.name.toLowerCase() === a.toLowerCase()) || users[0]
              if (!u) continue
              const tracks = await window.api.scUserTracks(u.id)
              if (tracks[0]) pushCand(tracks[0]) // dedups by artist internally
            } catch {
              /* skip this artist */
            }
          }
        }

        if (cands.length === 0) {
          set({ mixes: [], mixesLoading: false })
          return
        }

        // rotate seeds by day (or randomly when manually refreshed)
        const rot = force ? Math.floor(Math.random() * cands.length) : Math.floor(Date.now() / 86_400_000)
        const ordered = cands.map((_, i) => cands[(i + rot) % cands.length])
        const chosen = ordered.slice(0, Math.min(12, cands.length))

        const mixes: Mix[] = []
        let n = 1
        for (const c of chosen) {
          try {
            const related = await window.api.scRelated(c.numId)
            const tseen = new Set<string>()
            const tracks: Track[] = []
            // related drives the mix; the seed itself goes first
            for (const t of [c.track, ...related]) {
              if (!tseen.has(t.id)) {
                tseen.add(t.id)
                tracks.push(t)
              }
            }
            if (tracks.length < 5) continue
            const artist = c.track.artist || 'your likes'
            mixes.push({
              id: `mix-${today}-${n}`,
              title: `${artist} Mix`,
              subtitle: `Based on ${artist} & similar artists`,
              cover: tracks.find((t) => t.artwork)?.artwork,
              tracks
            })
            n++
          } catch {
            /* skip this seed */
          }
        }
        set({ mixes, mixesReal: false, mixesLoading: false })
        persist(mixes, false)
      } catch {
        set({ mixesLoading: false })
      }
    },

    openMix(mix) {
      set({ source: 'mix', selectedMix: mix })
    },

    toggleLyrics() {
      set({ lyricsOpen: !get().lyricsOpen })
    },

    toggleRightPanel() {
      set({ rightOpen: !get().rightOpen })
    },

    setSettingsOpen(open) {
      set({ settingsOpen: open })
    },

    setEqOpen(open) {
      set({ eqOpen: open })
    },

    setTheme(theme) {
      set({ theme })
      try {
        localStorage.setItem('lp.theme', theme)
      } catch {
        /* ignore */
      }
    },

    setSkin(skin) {
      const v = skin === 'nextgen' ? 'nextgen' : 'oldgen'
      set({ skin: v })
      try {
        localStorage.setItem('lp.skin', v)
      } catch {
        /* ignore */
      }
    },

    setGraphics(g) {
      const v = ['balanced', 'optimized', 'performance'].includes(g) ? g : 'standard'
      set({ graphics: v })
      try {
        localStorage.setItem('lp.graphics', v)
      } catch {
        /* ignore */
      }
    },

    setFpsLimit(n) {
      const v = Math.max(15, Math.min(120, Math.round(n)))
      set({ fpsLimit: v })
      try {
        localStorage.setItem('lp.fpsLimit', String(v))
      } catch {
        /* ignore */
      }
    },

    setCustomAccent(hex) {
      // Choosing a custom color implies switching to the custom theme.
      set({ customAccent: hex, theme: 'custom' })
      try {
        localStorage.setItem('lp.customAccent', hex)
        localStorage.setItem('lp.theme', 'custom')
      } catch {
        /* ignore */
      }
    },

    async pickBackground() {
      const url = await window.api.pickBackground()
      if (url) {
        // New image → reset framing to centered/fit, then open the framing modal.
        set({ customBg: url, bgPosX: 50, bgPosY: 50, bgZoom: 1, framingOpen: true })
        try {
          localStorage.setItem('lp.bg', url)
          localStorage.setItem('lp.bgPosX', '50')
          localStorage.setItem('lp.bgPosY', '50')
          localStorage.setItem('lp.bgZoom', '1')
        } catch {
          /* ignore */
        }
      }
    },

    clearBackground() {
      set({ customBg: null, framingOpen: false, bgPosX: 50, bgPosY: 50, bgZoom: 1 })
      try {
        localStorage.removeItem('lp.bg')
      } catch {
        /* ignore */
      }
    },

    async setTrackCover(trackId) {
      // Reuse the same image picker as backgrounds/avatars — returns a media://
      // url pointing at the chosen file (no copy), or null if cancelled.
      const url = await window.api.pickBackground()
      if (!url) return
      const next = { ...get().customCovers, [trackId]: url }
      set({ customCovers: next })
      try {
        localStorage.setItem('lp.customCovers', JSON.stringify(next))
      } catch {
        /* ignore */
      }
    },

    resetTrackCover(trackId) {
      // Remove the override → the provider (SoundCloud/Yandex/local) artwork shows again.
      const next = { ...get().customCovers }
      if (!(trackId in next)) return
      delete next[trackId]
      set({ customCovers: next })
      try {
        localStorage.setItem('lp.customCovers', JSON.stringify(next))
      } catch {
        /* ignore */
      }
    },

    async setKaraokeImage(trackId) {
      const url = await window.api.pickBackground()
      if (url) setKaraokeBg(trackId, { type: 'image', url })
    },

    async setKaraokeVideoFile(trackId) {
      const url = await window.api.pickVideo()
      if (url) setKaraokeBg(trackId, { type: 'video', url })
    },

    resetKaraokeBg(trackId) {
      const next = { ...get().karaokeBgs }
      if (!(trackId in next)) return
      delete next[trackId]
      set({ karaokeBgs: next })
      try {
        localStorage.setItem('lp.karaokeBgs', JSON.stringify(next))
      } catch {
        /* ignore */
      }
    },

    setPlayerBarWidth(pct) {
      const w = Math.min(95, Math.max(45, Math.round(pct)))
      set({ playerBarWidth: w })
      try {
        localStorage.setItem('lp.playerBarW', String(w))
      } catch {
        /* ignore */
      }
    },

    setPlayerBarHeight(pct) {
      const h = Math.min(100, Math.max(60, Math.round(pct)))
      set({ playerBarHeight: h })
      try {
        localStorage.setItem('lp.playerBarH', String(h))
      } catch {
        /* ignore */
      }
    },

    setBgFraming(f) {
      set((s) => {
        const next = {
          bgPosX: f.x ?? s.bgPosX,
          bgPosY: f.y ?? s.bgPosY,
          bgZoom: f.zoom ?? s.bgZoom
        }
        try {
          localStorage.setItem('lp.bgPosX', String(next.bgPosX))
          localStorage.setItem('lp.bgPosY', String(next.bgPosY))
          localStorage.setItem('lp.bgZoom', String(next.bgZoom))
        } catch {
          /* ignore */
        }
        return next
      })
    },

    setBgScope(scope) {
      set({ bgScope: scope })
      try {
        localStorage.setItem('lp.bgScope', scope)
      } catch {
        /* ignore */
      }
    },

    openFraming() {
      if (get().customBg) set({ framingOpen: true, framingTarget: 'bg' })
    },

    closeFraming() {
      set({ framingOpen: false })
    },

    setAvatarFraming(f) {
      set((s) => {
        const next = {
          avPosX: f.x ?? s.avPosX,
          avPosY: f.y ?? s.avPosY,
          avZoom: f.zoom ?? s.avZoom
        }
        try {
          localStorage.setItem('lp.avPosX', String(next.avPosX))
          localStorage.setItem('lp.avPosY', String(next.avPosY))
          localStorage.setItem('lp.avZoom', String(next.avZoom))
        } catch {
          /* ignore */
        }
        return next
      })
    },

    openAvatarFraming() {
      const { profileAvatar, scAuth } = get()
      if (profileAvatar || scAuth?.avatar) set({ framingOpen: true, framingTarget: 'avatar' })
    },

    setShowSearchAlbums(v) {
      set({ showSearchAlbums: v })
      localStorage.setItem('lp.searchAlbums', v ? '1' : '0')
    },

    setShowSearchPlaylists(v) {
      set({ showSearchPlaylists: v })
      localStorage.setItem('lp.searchPlaylists', v ? '1' : '0')
    },

    setShowHomeMixes(v) {
      set({ showHomeMixes: v })
      localStorage.setItem('lp.homeMixes', v ? '1' : '0')
    },

    setShowSidebarMixes(v) {
      set({ showSidebarMixes: v })
      localStorage.setItem('lp.sbMixes', v ? '1' : '0')
    },

    setShowSidebarArtists(v) {
      set({ showSidebarArtists: v })
      localStorage.setItem('lp.sbArtists', v ? '1' : '0')
    },

    setCompact(v) {
      set({ compact: v })
      localStorage.setItem('lp.compact', v ? '1' : '0')
    },

    toggleSidebar() {
      const v = !get().sidebarCollapsed
      set({ sidebarCollapsed: v })
      localStorage.setItem('lp.sidebarCollapsed', v ? '1' : '0')
    },

    setLyricsSize(v) {
      set({ lyricsSize: v })
      localStorage.setItem('lp.lyricsSize', v)
    },

    setLang(v) {
      set({ lang: v })
      localStorage.setItem('lp.lang', v)
    },

    setResumeSession(v) {
      set({ resumeSession: v })
      localStorage.setItem('lp.resume', v ? '1' : '0')
    },

    setGeniusFallback(v) {
      set({ geniusFallback: v })
      localStorage.setItem('lp.genius', v ? '1' : '0')
    },

    async setLaunchAtStartup(v) {
      set({ launchAtStartup: v })
      try {
        await window.api.setLaunchAtStartup(v)
      } catch {
        /* ignore */
      }
    },

    async setHwAccel(v) {
      set({ hwAccel: v })
      try {
        await window.api.setHardwareAcceleration(v)
      } catch {
        /* ignore */
      }
    },

    async loadPrefs() {
      try {
        const v = await window.api.getLaunchAtStartup()
        set({ launchAtStartup: v })
      } catch {
        /* ignore */
      }
      try {
        const h = await window.api.getHardwareAcceleration()
        set({ hwAccel: h })
      } catch {
        /* ignore */
      }
    },

    async clearLyricsCache() {
      try {
        await window.api.clearLyricsCache()
      } catch {
        /* ignore */
      }
    },

    async clearMixesCache() {
      try {
        localStorage.removeItem('lp.mixes.v2')
      } catch {
        /* ignore */
      }
      await get().generateMixes(true)
    },

    async setMixSource(mode) {
      set({ mixSource: mode })
      try {
        localStorage.setItem('lp.mixSource', mode)
        localStorage.removeItem('lp.mixes.v2')
      } catch {
        /* ignore */
      }
      await get().generateMixes(true)
    },

    async loadScAuth() {
      try {
        if (await window.api.scIsAuthed()) {
          const me = await window.api.scMe()
          set({ scAuth: me })
          window.api
            .scMyLikes()
            .then((scLikes) => {
              set({ scLikes })
              syncLikedIds()
            })
            .catch(() => {})
        }
      } catch {
        /* not signed in */
      }
    },

    async connectSoundCloud() {
      set({ scConnecting: true })
      try {
        const user = await window.api.scLogin()
        set({ scAuth: user, scConnecting: false })
        if (user) {
          window.api
            .scMyLikes()
            .then((scLikes) => {
              set({ scLikes })
              syncLikedIds()
            })
            .catch(() => {})
          // clear today's cache so we rebuild from the real account
          try {
            localStorage.removeItem('lp.mixes.v2')
          } catch {
            /* ignore */
          }
          await get().generateMixes(true)
        }
      } catch {
        set({ scConnecting: false })
      }
    },

    async disconnectSoundCloud() {
      try {
        await window.api.scLogout()
      } catch {
        /* ignore */
      }
      set({ scAuth: null, scLikes: [] })
      syncLikedIds()
      try {
        localStorage.removeItem('lp.mixes.v2')
      } catch {
        /* ignore */
      }
      await get().generateMixes(true)
    },

    async loadYmAuth() {
      try {
        if (await window.api.ymIsAuthed()) {
          const me = await window.api.ymMe()
          set({ ymAuth: me })
        }
      } catch {
        /* not signed in */
      }
    },

    async connectYandex() {
      set({ ymConnecting: true })
      try {
        const user = await window.api.ymLogin()
        set({ ymAuth: user, ymConnecting: false })
        if (user) get().loadMyWave()
      } catch {
        set({ ymConnecting: false })
      }
    },

    async disconnectYandex() {
      try {
        await window.api.ymLogout()
      } catch {
        /* ignore */
      }
      set({ ymAuth: null, myWave: null })
    },

    async importYandexLikes() {
      if (!get().ymAuth) return 0
      const before = get().likes.length
      try {
        const tracks = await window.api.ymMyLikes()
        if (!tracks.length) return 0
        const likes = await window.api.addManyLikes(tracks)
        set({ likes })
        syncLikedIds()
        return likes.length - before
      } catch (e) {
        set({ error: `Yandex: ${e instanceof Error ? e.message : String(e)}` })
        return 0
      }
    },

    async importSoundcloudLikes() {
      if (!get().scAuth) return 0
      const before = get().likes.length
      try {
        const tracks = await window.api.scMyLikes()
        if (!tracks.length) return 0
        const likes = await window.api.addManyLikes(tracks)
        set({ likes })
        syncLikedIds()
        return likes.length - before
      } catch (e) {
        set({ error: `SoundCloud: ${e instanceof Error ? e.message : String(e)}` })
        return 0
      }
    },

    async removeImportedLikes(provider) {
      const before = get().likes.length
      try {
        const likes = await window.api.removeProviderLikes(provider)
        set({ likes })
        syncLikedIds()
        return before - likes.length
      } catch {
        return 0
      }
    },

    async loadMyWave() {
      if (!get().ymAuth) {
        set({ myWave: null })
        return
      }
      try {
        const wave = await window.api.ymMyWave()
        if (wave.tracks.length >= 4) {
          set({
            myWave: {
              id: 'ym-wave',
              title: get().lang === 'ru' ? 'Моя волна' : 'My Wave',
              subtitle: get().lang === 'ru' ? 'Персональная волна Яндекса' : 'Yandex personal radio',
              cover: wave.cover,
              tracks: wave.tracks
            }
          })
        } else {
          set({ myWave: null })
        }
      } catch {
        set({ myWave: null })
      }
    },

    setProfileName(name) {
      set({ profileName: name })
      try {
        localStorage.setItem('lp.profileName', name)
      } catch {
        /* ignore */
      }
    },

    async pickProfileAvatar() {
      // Reuses the image-picker IPC (returns a media:// URL or null).
      const url = await window.api.pickBackground()
      if (url) {
        // Reset framing to centered/fit, then open the framing modal for the avatar.
        set({
          profileAvatar: url,
          avPosX: 50,
          avPosY: 50,
          avZoom: 1,
          framingOpen: true,
          framingTarget: 'avatar'
        })
        try {
          localStorage.setItem('lp.profileAvatar', url)
          localStorage.setItem('lp.avPosX', '50')
          localStorage.setItem('lp.avPosY', '50')
          localStorage.setItem('lp.avZoom', '1')
        } catch {
          /* ignore */
        }
      }
    },

    clearProfileAvatar() {
      set({ profileAvatar: null })
      try {
        localStorage.removeItem('lp.profileAvatar')
      } catch {
        /* ignore */
      }
    },

    setProfileStat(key, value) {
      const v = Number.isFinite(value) ? Math.max(0, value) : 0
      const field = (
        { followers: 'profileFollowers', plays: 'profilePlays', rating: 'profileRating' } as const
      )[key]
      const lsKey = (
        { followers: 'lp.profileFollowers', plays: 'lp.profilePlays', rating: 'lp.profileRating' } as const
      )[key]
      set({ [field]: v } as Partial<PlayerState>)
      try {
        localStorage.setItem(lsKey, String(v))
      } catch {
        /* ignore */
      }
    },

    async loadLibrary() {
      set({ loading: true })
      const state = await window.api.getLibrary()
      set({ tracks: state.tracks, folders: state.folders, loading: false })
    },

    async addFolder() {
      set({ loading: true })
      const state = await window.api.addFolder()
      set({ tracks: state.tracks, folders: state.folders, loading: false })
    },

    async removeFolder(folder) {
      set({ loading: true })
      const state = await window.api.removeFolder(folder)
      set({ tracks: state.tracks, folders: state.folders, loading: false })
    },

    async rescan() {
      set({ loading: true })
      const state = await window.api.rescan()
      set({ tracks: state.tracks, folders: state.folders, loading: false })
    },

    playQueue(tracks, startIndex) {
      if (tracks.length === 0) return
      set({ queue: tracks, waveActive: false })
      loadIndex(startIndex, true)
      persistQueue()
    },

    enqueue(tracks) {
      if (tracks.length === 0) return
      const { queue, currentIndex } = get()
      // Nothing playing yet → just start the list (an empty queue can't show
      // "next up", so appending alone would silently swallow the tracks).
      if (currentIndex < 0 || queue.length === 0) {
        get().playQueue(tracks, 0)
        return
      }
      set({ queue: [...queue, ...tracks] })
      persistQueue()
    },

    async playMyWave(startIndex = 0) {
      // Pull a FRESH batch every time the wave starts (the cached myWave is only
      // for the home/wave-page preview) — otherwise each start replays the same
      // tracks. loadMyWave re-fetches from the rotor and rotates via feedback.
      await get().loadMyWave()
      const wave = get().myWave
      if (!wave || wave.tracks.length === 0) return
      set({ queue: wave.tracks, waveActive: true })
      // The fresh batch may differ in length from what the caller saw — clamp the
      // start index so a stale random/shuffle index can't fall off the end.
      loadIndex(Math.min(Math.max(0, startIndex), wave.tracks.length - 1), true)
      persistQueue()
    },

    playWaveTrack(index) {
      // Play the CURRENT cached wave tracks as-is (no re-fetch), so the cover the
      // user clicked is exactly what plays. The wave stays active and keeps
      // refilling near the end via the normal feedback path.
      const wave = get().myWave
      if (!wave || wave.tracks.length === 0) return
      set({ queue: wave.tracks, waveActive: true })
      loadIndex(Math.min(Math.max(0, index), wave.tracks.length - 1), true)
      persistQueue()
    },

    restoreQueue() {
      try {
        const raw = localStorage.getItem(QUEUE_KEY)
        if (!raw) return
        const saved = JSON.parse(raw) as { queue: Track[]; currentIndex: number }
        if (!Array.isArray(saved.queue) || saved.queue.length === 0) return
        set({ queue: saved.queue })
        if (saved.currentIndex >= 0 && saved.currentIndex < saved.queue.length) {
          loadIndex(saved.currentIndex, false) // restore paused, ready to resume
        }
      } catch {
        /* ignore corrupt state */
      }
    },

    togglePlay() {
      const { isPlaying, currentIndex, queue } = get()
      if (currentIndex === -1 && queue.length > 0) {
        loadIndex(0, true)
        return
      }
      if (!handle) return
      if (isPlaying) handle.pause()
      else handle.play()
    },

    next() {
      const { currentIndex, queue, repeat, shuffle, autopilot, waveActive } = get()
      if (queue.length === 0) return
      if (shuffle) {
        loadIndex(Math.floor(Math.random() * queue.length), true)
        return
      }
      const nextIndex = currentIndex + 1
      if (nextIndex >= queue.length) {
        if (repeat === 'all') {
          loadIndex(0, true)
        } else if (waveActive) {
          // Endless My Wave: pull more radio tracks and continue.
          set({ isPlaying: false })
          void extendQueueWithWave().then((extended) => {
            if (!extended) set({ isPlaying: false })
          })
        } else if (autopilot) {
          // Keep the music going: append related tracks and play on. If nothing
          // comes back, fall back to stopping.
          set({ isPlaying: false })
          void extendQueueWithRelated().then((extended) => {
            if (!extended) set({ isPlaying: false })
          })
        } else {
          set({ isPlaying: false })
        }
        return
      }
      loadIndex(nextIndex, true)
    },

    prev() {
      const { currentIndex, positionSec } = get()
      // Standard behavior: restart current track if >3s in, else go back.
      if (positionSec > 3) {
        handle?.seek(0)
        return
      }
      loadIndex(Math.max(0, currentIndex - 1), true)
    },

    jumpTo(index) {
      const { queue } = get()
      if (index >= 0 && index < queue.length) loadIndex(index, true)
    },

    clearUpcoming() {
      const { queue, currentIndex } = get()
      if (currentIndex < 0) return
      set({ queue: queue.slice(0, currentIndex + 1) })
      persistQueue()
    },

    reorderQueue(from, to) {
      const { queue, currentIndex } = get()
      if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return
      const next = queue.slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      // Track where the playing item lands so we never reload it. Pure index math
      // (robust to duplicate track ids in the queue).
      let newIndex = currentIndex
      if (from === currentIndex) {
        newIndex = to
      } else {
        if (from < currentIndex) newIndex--
        if (to <= newIndex) newIndex++
      }
      set({ queue: next, currentIndex: newIndex })
      persistQueue()
    },

    removeFromQueue(index) {
      const { queue, currentIndex } = get()
      if (index < 0 || index >= queue.length) return
      // Removing the currently playing track is handled by skipping to the next one.
      if (index === currentIndex) {
        get().next()
        // After advancing, drop the old track from the queue and fix the index.
        const after = get()
        const q = after.queue.slice()
        q.splice(index, 1)
        set({
          queue: q,
          currentIndex: after.currentIndex > index ? after.currentIndex - 1 : after.currentIndex
        })
        persistQueue()
        return
      }
      const next = queue.slice()
      next.splice(index, 1)
      set({ queue: next, currentIndex: index < currentIndex ? currentIndex - 1 : currentIndex })
      persistQueue()
    },

    seek(sec) {
      handle?.seek(sec)
      set({ positionSec: sec })
      updatePresence()
      updateMediaSession()
    },

    setVolume(v) {
      const volume = Math.min(1, Math.max(0, v))
      handle?.setVolume(volume)
      localStorage.setItem(VOLUME_KEY, String(volume))
      set({ volume })
    },

    cycleRepeat() {
      const order: RepeatMode[] = ['off', 'all', 'one']
      const next = order[(order.indexOf(get().repeat) + 1) % order.length]
      set({ repeat: next })
    },

    toggleShuffle() {
      set({ shuffle: !get().shuffle })
    },

    toggleAutopilot() {
      const autopilot = !get().autopilot
      set({ autopilot })
      try {
        localStorage.setItem('lp.autopilot', autopilot ? '1' : '0')
      } catch {
        /* ignore */
      }
      // If turning it on while sitting at the end of an exhausted queue, kick in now.
      if (autopilot) {
        const { currentIndex, queue, isPlaying } = get()
        if (queue.length > 0 && currentIndex === queue.length - 1 && !isPlaying) {
          void extendQueueWithRelated()
        }
      }
    }
  }
})
