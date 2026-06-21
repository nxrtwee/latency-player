import { useEffect, useState } from 'react'
import { usePlayer } from '@renderer/store'
import { TabBar, type TabId } from './components/TabBar'
import { MiniPlayer } from './components/MiniPlayer'
import { HomeScreen } from './screens/Home'
import { SearchScreen } from './screens/Search'
import { LibraryScreen } from './screens/Library'
import { ProfileScreen } from './screens/Profile'
import { NowPlaying } from './screens/NowPlaying'
import { ListView } from './screens/ListView'
import { ActivityScreen } from './screens/Activity'
import { LocalScreen } from './screens/Local'
import { SettingsScreen } from './screens/Settings'
import { ArtistScreen } from './screens/Artist'
import { useT } from './i18n'
import { installMediaSession } from './api/mediaSession'
import { installStatusBar } from './api/statusBar'
import type { Artist, Track } from '@shared/types'

/** A pushed detail view over the tab content. List kinds resolve to a ListView;
 *  activity/local/artist are their own screens. */
export type Detail =
  | { kind: 'likes' }
  | { kind: 'recent' }
  | { kind: 'playlist'; id: string }
  | { kind: 'mix'; id: string }
  | { kind: 'activity' }
  | { kind: 'local' }
  | { kind: 'artist'; track?: Track; artist?: Artist }
  | { kind: 'sclikes' }

/** Track-count label, language-aware (RU pluralization / EN tracks). */
function tracksLabel(n: number, lang: string): string {
  if (lang !== 'ru') return `${n} ${n === 1 ? 'track' : 'tracks'}`
  const a = Math.abs(n) % 100
  const b = a % 10
  let word = 'треков'
  if (!(a > 10 && a < 20)) {
    if (b === 1) word = 'трек'
    else if (b > 1 && b < 5) word = 'трека'
  }
  return `${n} ${word}`
}

export function MobileApp(): JSX.Element {
  const [tab, setTab] = useState<TabId>('home')
  const [npOpen, setNpOpen] = useState(false)
  const [detail, setDetail] = useState<Detail | null>(null)
  // custom background (data URL persisted locally) — applied app-wide
  const [customBg, setCustomBg] = useState<string | null>(() => {
    try {
      return localStorage.getItem('lp.m.bg')
    } catch {
      return null
    }
  })
  const [bgFrame, setBgFrame] = useState(() => {
    try {
      const raw = localStorage.getItem('lp.m.bg.frame')
      if (raw) return JSON.parse(raw) as { posX: number; posY: number; zoom: number }
    } catch {
      /* default */
    }
    return { posX: 50, posY: 50, zoom: 1 }
  })
  const changeBg = (url: string | null): void => {
    setCustomBg(url)
    try {
      if (url) localStorage.setItem('lp.m.bg', url)
      else localStorage.removeItem('lp.m.bg')
    } catch {
      /* quota — non-fatal */
    }
  }
  const changeBgFrame = (f: { posX: number; posY: number; zoom: number }): void => {
    setBgFrame(f)
    try {
      localStorage.setItem('lp.m.bg.frame', JSON.stringify(f))
    } catch {
      /* non-fatal */
    }
  }

  const loadLikes = usePlayer((s) => s.loadLikes)
  const loadPlaylists = usePlayer((s) => s.loadPlaylists)
  const generateMixes = usePlayer((s) => s.generateMixes)
  const likes = usePlayer((s) => s.likes)
  const recent = usePlayer((s) => s.recentlyPlayed)
  const playlists = usePlayer((s) => s.playlists)
  const mixes = usePlayer((s) => s.mixes)
  const scLikes = usePlayer((s) => s.scLikes)
  const loadScAuth = usePlayer((s) => s.loadScAuth)
  const lang = usePlayer((s) => s.lang)
  const t = useT()
  const label = (n: number): string => tracksLabel(n, lang)

  // Bootstrap persisted/derived data once on mount.
  useEffect(() => {
    void loadLikes()
    void loadPlaylists()
    void loadScAuth() // restore a saved SoundCloud token → real mixes/likes
    void generateMixes()
    installMediaSession()
    installStatusBar()
  }, [loadLikes, loadPlaylists, loadScAuth, generateMixes])

  const openTab = (id: TabId): void => {
    setDetail(null)
    setTab(id)
  }
  // tap an artist anywhere → open their page
  const openArtist = (track: Track): void => setDetail({ kind: 'artist', track })

  // Resolve the active detail to a concrete track list + heading.
  let detailView: JSX.Element | null = null
  if (detail) {
    if (detail.kind === 'likes') {
      // global likes = app likes + SoundCloud likes (deduped by id)
      const merged = [...likes, ...scLikes].filter(
        (tr, i, a) => a.findIndex((x) => x.id === tr.id) === i
      )
      detailView = (
        <ListView title={t('liked')} subtitle={label(merged.length)} tracks={merged} onClose={() => setDetail(null)} onArtist={openArtist} />
      )
    } else if (detail.kind === 'recent') {
      detailView = (
        <ListView title={t('recent')} subtitle={label(recent.length)} tracks={recent} onClose={() => setDetail(null)} onArtist={openArtist} />
      )
    } else if (detail.kind === 'activity') {
      detailView = <ActivityScreen onClose={() => setDetail(null)} />
    } else if (detail.kind === 'local') {
      detailView = <LocalScreen onClose={() => setDetail(null)} />
    } else if (detail.kind === 'sclikes') {
      detailView = (
        <ListView title={t('mySCLikes')} subtitle={label(scLikes.length)} tracks={scLikes} onClose={() => setDetail(null)} onArtist={openArtist} />
      )
    } else if (detail.kind === 'artist') {
      detailView = (
        <ArtistScreen from={{ track: detail.track, artist: detail.artist }} onClose={() => setDetail(null)} />
      )
    } else if (detail.kind === 'mix') {
      const mix = mixes.find((m) => m.id === detail.id)
      detailView = (
        <ListView
          title={mix?.title || 'Mix'}
          subtitle={mix?.subtitle || label(mix?.tracks.length ?? 0)}
          tracks={mix?.tracks ?? []}
          onClose={() => setDetail(null)}
          onArtist={openArtist}
        />
      )
    } else {
      const pl = playlists.find((p) => p.id === detail.id)
      detailView = (
        <ListView
          title={pl?.name || t('playlists')}
          subtitle={label(pl?.tracks.length ?? 0)}
          tracks={pl?.tracks ?? []}
          onClose={() => setDetail(null)}
        />
      )
    }
  }

  return (
    <div className={'app' + (customBg ? ' has-bg' : '')}>
      {customBg && (
        <div className="app-bg">
          <img
            src={customBg}
            alt=""
            style={{
              objectPosition: `${bgFrame.posX}% ${bgFrame.posY}%`,
              transform: `scale(${bgFrame.zoom})`
            }}
          />
          <div className="app-bg-scrim" />
        </div>
      )}
      <main className="screen" key={detail ? 'detail' : tab}>
        {detail ? (
          detailView
        ) : (
          <>
            {tab === 'home' && <HomeScreen onOpenDetail={setDetail} onOpenTab={openTab} />}
            {tab === 'search' && <SearchScreen onArtist={openArtist} />}
            {tab === 'library' && <LibraryScreen onOpenDetail={setDetail} onArtist={openArtist} />}
            {tab === 'profile' && <ProfileScreen onOpenDetail={setDetail} />}
            {tab === 'settings' && (
              <SettingsScreen
                customBg={customBg}
                onChangeBg={changeBg}
                bgFrame={bgFrame}
                onChangeBgFrame={changeBgFrame}
              />
            )}
          </>
        )}
      </main>
      <MiniPlayer onExpand={() => setNpOpen(true)} />
      <TabBar active={tab} onChange={openTab} />
      {npOpen && <NowPlaying onClose={() => setNpOpen(false)} />}
    </div>
  )
}
