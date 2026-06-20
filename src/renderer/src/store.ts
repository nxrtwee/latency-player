import { create } from 'zustand'
import type { Artist, Playlist, Track } from '@shared/types'
import type { PlaybackHandle } from './providers/types'
import { getProvider } from './providers/registry'

export type RepeatMode = 'off' | 'all' | 'one'
/** Where the custom background image is applied. */
export type BgScope = 'global' | 'interface' | 'fullscreen'
export type Source =
  | 'home'
  | 'explore'
  | 'activity'
  | 'local'
  | 'likes'
  | 'playlist'
  | 'recent'
  | 'info'
  | 'artist'
  | 'mix'
  | 'profile'
export type InfoService = 'soundcloud' | 'spotify' | 'youtube'
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

  // recently played (most-recent first), with play timestamps
  recentlyPlayed: PlayedTrack[]

  // playlists
  playlists: Playlist[]

  // soundcloud search
  scQuery: string
  scResults: Track[]
  scUsers: Artist[]
  scLoading: boolean

  // artist page
  selectedArtist: Artist | null
  artistTracks: Track[]
  artistLoading: boolean

  // daily mixes
  mixes: Mix[]
  mixesLoading: boolean
  mixesReal: boolean
  mixSource: 'sc' | 'generated'
  selectedMix: Mix | null

  // soundcloud account
  scAuth: Artist | null
  scConnecting: boolean
  scLikes: Track[]

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

  // appearance
  theme: string
  customAccent: string
  customBg: string | null
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
  lyricsSize: 'sm' | 'md' | 'lg'
  lang: 'en' | 'ru'

  // preferences
  resumeSession: boolean
  geniusFallback: boolean
  launchAtStartup: boolean

  // playback
  queue: Track[]
  currentIndex: number // -1 = nothing loaded
  isPlaying: boolean
  positionSec: number
  durationSec: number
  volume: number
  repeat: RepeatMode
  shuffle: boolean

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
  removeFromPlaylist: (id: string, trackId: string) => Promise<void>

  // queue persistence
  restoreQueue: () => void

  // library actions
  loadLibrary: () => Promise<void>
  addFolder: () => Promise<void>
  removeFolder: (folder: string) => Promise<void>
  rescan: () => Promise<void>

  // soundcloud actions
  searchSoundCloud: (query: string) => Promise<void>

  // artist navigation
  openArtist: (artist: Artist) => Promise<void>
  openArtistFromTrack: (track: Track) => Promise<void>

  // daily mixes
  generateMixes: (force?: boolean) => Promise<void>
  openMix: (mix: Mix) => void
  setMixSource: (mode: 'sc' | 'generated') => Promise<void>

  // soundcloud account
  loadScAuth: () => Promise<void>
  connectSoundCloud: () => Promise<void>
  disconnectSoundCloud: () => Promise<void>

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

  // appearance
  setTheme: (theme: string) => void
  setCustomAccent: (hex: string) => void
  pickBackground: () => Promise<void>
  clearBackground: () => void
  setBgFraming: (f: Partial<{ x: number; y: number; zoom: number }>) => void
  setBgScope: (scope: BgScope) => void
  openFraming: () => void
  closeFraming: () => void
  setAvatarFraming: (f: Partial<{ x: number; y: number; zoom: number }>) => void
  openAvatarFraming: () => void
  setCompact: (v: boolean) => void
  setLyricsSize: (v: 'sm' | 'md' | 'lg') => void
  setLang: (v: 'en' | 'ru') => void

  // preferences
  setResumeSession: (v: boolean) => void
  setGeniusFallback: (v: boolean) => void
  setLaunchAtStartup: (v: boolean) => Promise<void>
  loadPrefs: () => Promise<void>
  clearLyricsCache: () => Promise<void>
  clearMixesCache: () => Promise<void>

  // likes actions
  loadLikes: () => Promise<void>
  toggleLike: (track: Track) => Promise<void>

  // playback actions
  playQueue: (tracks: Track[], startIndex: number) => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  jumpTo: (index: number) => void
  clearUpcoming: () => void
  seek: (sec: number) => void
  setVolume: (v: number) => void
  cycleRepeat: () => void
  toggleShuffle: () => void
}

// The live playback handle lives outside React state — it's an imperative
// resource, not render data.
let handle: PlaybackHandle | null = null

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

  function loadIndex(index: number, autoplay: boolean): void {
    const { queue, volume } = get()
    if (index < 0 || index >= queue.length) {
      handle?.destroy()
      handle = null
      set({ currentIndex: -1, isPlaying: false, positionSec: 0, durationSec: 0 })
      return
    }
    const track = queue[index]
    const provider = getProvider(track.providerId)
    if (!provider) {
      set({ error: `No provider registered for "${track.providerId}"` })
      return
    }

    handle?.destroy()
    set({ currentIndex: index, positionSec: 0, durationSec: track.durationSec ?? 0, error: null })

    handle = provider.createPlayback(track, {
      onTime: (sec) => set({ positionSec: sec }),
      onDuration: (sec) => set({ durationSec: sec }),
      onPlayingChange: (playing) => set({ isPlaying: playing }),
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
    }
    persistQueue()
  }

  return {
    source: 'home',
    selectedPlaylistId: null,
    infoService: 'soundcloud',

    tracks: [],
    folders: [],
    loading: false,
    error: null,

    likes: [],

    recentlyPlayed: initialRecent,

    playlists: [],

    scQuery: '',
    scResults: [],
    scUsers: [],
    scLoading: false,

    selectedArtist: null,
    artistTracks: [],
    artistLoading: false,

    mixes: [],
    mixesLoading: false,
    mixesReal: false,
    mixSource: localStorage.getItem('lp.mixSource') === 'generated' ? 'generated' : 'sc',
    selectedMix: null,

    scAuth: null,
    scConnecting: false,
    scLikes: [],

    profileName: localStorage.getItem('lp.profileName') || '',
    profileAvatar: localStorage.getItem('lp.profileAvatar'),
    profileFollowers: readNum('lp.profileFollowers', 0),
    profilePlays: readNum('lp.profilePlays', 0),
    profileRating: readNum('lp.profileRating', 0),

    lyricsOpen: false,
    rightOpen: true,
    settingsOpen: false,
    // 'light' was removed — migrate any saved value back to the default.
    theme: ((): string => {
      const t = localStorage.getItem('lp.theme') || 'green'
      return t === 'light' ? 'green' : t
    })(),
    customAccent: localStorage.getItem('lp.customAccent') || '#1ed760',
    customBg: localStorage.getItem('lp.bg'),
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
    lyricsSize: (localStorage.getItem('lp.lyricsSize') as 'sm' | 'md' | 'lg') || 'md',
    lang: (localStorage.getItem('lp.lang') as 'en' | 'ru') || 'en',
    resumeSession: localStorage.getItem('lp.resume') !== '0',
    geniusFallback: localStorage.getItem('lp.genius') !== '0',
    launchAtStartup: false,

    queue: [],
    currentIndex: -1,
    isPlaying: false,
    positionSec: 0,
    durationSec: 0,
    volume: initialVolume,
    repeat: 'off',
    shuffle: false,

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

    async removeFromPlaylist(id, trackId) {
      const playlists = await window.api.removeFromPlaylist(id, trackId)
      set({ playlists })
    },

    async loadLikes() {
      const likes = await window.api.getLikes()
      set({ likes })
    },

    async toggleLike(track) {
      const likes = await window.api.toggleLike(track)
      set({ likes })
    },

    async searchSoundCloud(query) {
      set({ scQuery: query })
      const q = query.trim()
      if (!q) {
        set({ scResults: [], scUsers: [], scLoading: false })
        return
      }
      set({ scLoading: true, error: null })
      try {
        const [results, users] = await Promise.all([
          window.api.scSearch(q),
          window.api.scSearchUsers(q).catch(() => [])
        ])
        set({ scResults: results, scUsers: users, scLoading: false })
      } catch (e) {
        set({
          scLoading: false,
          error: `SoundCloud: ${e instanceof Error ? e.message : String(e)}`
        })
      }
    },

    async openArtist(artist) {
      set({ source: 'artist', selectedArtist: artist, artistTracks: [], error: null })
      if (artist.provider === 'soundcloud') {
        set({ artistLoading: true })
        try {
          // Fetch full profile (avatar/followers) in parallel when we only have a bare id.
          const needProfile = !artist.avatar || artist.followers == null
          const [tracks, profile] = await Promise.all([
            window.api.scUserTracks(artist.id),
            needProfile ? window.api.scUser(artist.id).catch(() => null) : Promise.resolve(null)
          ])
          set((s) => ({
            artistTracks: tracks,
            artistLoading: false,
            selectedArtist: profile && s.selectedArtist?.id === artist.id ? profile : s.selectedArtist
          }))
        } catch (e) {
          set({
            artistLoading: false,
            error: `SoundCloud: ${e instanceof Error ? e.message : String(e)}`
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

    async openArtistFromTrack(track) {
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

    setTheme(theme) {
      set({ theme })
      try {
        localStorage.setItem('lp.theme', theme)
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

    setCompact(v) {
      set({ compact: v })
      localStorage.setItem('lp.compact', v ? '1' : '0')
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

    async loadPrefs() {
      try {
        const v = await window.api.getLaunchAtStartup()
        set({ launchAtStartup: v })
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
            .then((scLikes) => set({ scLikes }))
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
            .then((scLikes) => set({ scLikes }))
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
      try {
        localStorage.removeItem('lp.mixes.v2')
      } catch {
        /* ignore */
      }
      await get().generateMixes(true)
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
      set({ queue: tracks })
      loadIndex(startIndex, true)
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
      const { currentIndex, queue, repeat, shuffle } = get()
      if (queue.length === 0) return
      if (shuffle) {
        loadIndex(Math.floor(Math.random() * queue.length), true)
        return
      }
      const nextIndex = currentIndex + 1
      if (nextIndex >= queue.length) {
        if (repeat === 'all') loadIndex(0, true)
        else set({ isPlaying: false })
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

    seek(sec) {
      handle?.seek(sec)
      set({ positionSec: sec })
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
    }
  }
})
