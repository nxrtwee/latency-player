// Library — functional segmented tabs: Playlists / Tracks / Artists / Albums,
// all derived from real store data (likes + playlists + history).
import { useMemo, useState } from 'react'
import { usePlayer } from '@renderer/store'
import type { Track } from '@shared/types'
import type { Detail } from '../MobileApp'
import { useT } from '../i18n'
import { TrackRow } from '../components/TrackRow'

const HUES = [330, 280, 250, 200, 220, 300, 190, 340]
type Tab = 'playlists' | 'tracks' | 'artists' | 'albums'

export function LibraryScreen({
  onOpenDetail,
  onArtist
}: {
  onOpenDetail: (d: Detail) => void
  onArtist: (track: Track) => void
}): JSX.Element {
  const likes = usePlayer((s) => s.likes)
  const scLikes = usePlayer((s) => s.scLikes)
  const playlists = usePlayer((s) => s.playlists)
  const recent = usePlayer((s) => s.recentlyPlayed)
  const ymAuth = usePlayer((s) => s.ymAuth)
  const createPlaylist = usePlayer((s) => s.createPlaylist)
  const deletePlaylist = usePlayer((s) => s.deletePlaylist)
  const playQueue = usePlayer((s) => s.playQueue)
  const lang = usePlayer((s) => s.lang)
  const t = useT()
  const [tab, setTab] = useState<Tab>('playlists')

  const trk = (n: number): string =>
    lang === 'ru' ? `${n} треков` : `${n} ${n === 1 ? 'track' : 'tracks'}`

  const likeCount = new Set([...likes, ...scLikes].map((x) => x.id)).size

  // De-duplicated pool of every track the user has touched.
  const allTracks = useMemo(() => {
    const map = new Map<string, Track>()
    for (const t of [...likes, ...scLikes, ...playlists.flatMap((p) => p.tracks), ...recent]) {
      if (!map.has(t.id)) map.set(t.id, t)
    }
    return [...map.values()]
  }, [likes, scLikes, playlists, recent])

  const artists = useMemo(() => {
    const map = new Map<string, { name: string; track: Track; count: number }>()
    for (const tr of allTracks) {
      const name = tr.artist || 'Unknown'
      const e = map.get(name)
      if (e) e.count++
      else map.set(name, { name, track: tr, count: 1 })
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [allTracks])

  const albums = useMemo(() => {
    const map = new Map<string, { name: string; tracks: Track[] }>()
    for (const tr of allTracks) {
      if (!tr.album) continue
      const e = map.get(tr.album)
      if (e) e.tracks.push(tr)
      else map.set(tr.album, { name: tr.album, tracks: [tr] })
    }
    return [...map.values()]
  }, [allTracks])

  const create = (): void => {
    const name = window.prompt(t('promptName'))?.trim()
    if (name) void createPlaylist(name)
  }

  const del = (e: React.MouseEvent, id: string, name: string): void => {
    e.stopPropagation()
    if (window.confirm(`${t('deletePlaylist')}: «${name}»?`)) void deletePlaylist(id)
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'playlists', label: t('playlists') },
    { id: 'tracks', label: t('tracks') },
    { id: 'artists', label: t('artists') },
    { id: 'albums', label: t('albums') }
  ]

  return (
    <div className="view">
      <header className="lib-head">
        <h1 className="display sm">{t('myLibrary')}</h1>
        <div className="home-avatar small" aria-hidden />
      </header>

      <div className="seg scroll">
        {TABS.map((x) => (
          <button
            key={x.id}
            className={'seg-btn' + (tab === x.id ? ' active' : '')}
            onClick={() => setTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'playlists' && (
        <>
          <button className="create-row" onClick={create}>
            <span className="create-plus">+</span>
            {t('newPlaylist')}
          </button>
          <ul className="pl-list">
            <li className="pl-item" onClick={() => onOpenDetail({ kind: 'likes' })}>
              <div className="pl-cover liked">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              </div>
              <div className="pl-meta">
                <div className="pl-name">{t('liked')}</div>
                <div className="pl-sub">{trk(likeCount)}</div>
              </div>
              <span className="pl-more">›</span>
            </li>
            <li className="pl-item" onClick={() => onOpenDetail({ kind: 'recent' })}>
              <div className="pl-cover recent-cover">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 4v4h4M12 8v4l3 2" />
                </svg>
              </div>
              <div className="pl-meta">
                <div className="pl-name">{t('recent')}</div>
                <div className="pl-sub">{trk(recent.length)}</div>
              </div>
              <span className="pl-more">›</span>
            </li>
            <li className="pl-item" onClick={() => onOpenDetail({ kind: 'local' })}>
              <div className="pl-cover local-cover">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V6l10-2v12" />
                  <circle cx="6" cy="18" r="2.4" />
                  <circle cx="16" cy="16" r="2.4" />
                </svg>
              </div>
              <div className="pl-meta">
                <div className="pl-name">{t('localFiles')}</div>
                <div className="pl-sub">{t('ownAudio')}</div>
              </div>
              <span className="pl-more">›</span>
            </li>
            {ymAuth && (
              <li className="pl-item" onClick={() => onOpenDetail({ kind: 'wave' })}>
                <div className="pl-cover wave-cover">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round">
                    <path d="M2 12h2M7 12h2M12 12h0M22 12h-2M17 12h-2" />
                    <path d="M4 8v8M9 5v14M14 7v10M20 8v8" />
                  </svg>
                </div>
                <div className="pl-meta">
                  <div className="pl-name">{t('myWave')}</div>
                  <div className="pl-sub">{t('waveSub')}</div>
                </div>
                <span className="pl-more">›</span>
              </li>
            )}
            <li className="pl-item" onClick={() => onOpenDetail({ kind: 'downloads' })}>
              <div className="pl-cover dl-cover">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
                </svg>
              </div>
              <div className="pl-meta">
                <div className="pl-name">{t('downloads')}</div>
                <div className="pl-sub">{t('offlineSub')}</div>
              </div>
              <span className="pl-more">›</span>
            </li>
            {playlists.map((p, i) => (
              <li key={p.id} className="pl-item" onClick={() => onOpenDetail({ kind: 'playlist', id: p.id })}>
                <div
                  className="pl-cover"
                  style={
                    p.tracks[0]?.artwork
                      ? undefined
                      : { background: `linear-gradient(150deg, hsl(${HUES[i % HUES.length]} 70% 45%), hsl(${HUES[i % HUES.length] + 40} 70% 28%))` }
                  }
                >
                  {p.tracks[0]?.artwork ? <img src={p.tracks[0].artwork} alt="" loading="lazy" /> : null}
                </div>
                <div className="pl-meta">
                  <div className="pl-name">{p.name}</div>
                  <div className="pl-sub">{trk(p.tracks.length)}</div>
                </div>
                <button className="pl-del" aria-label={t('deletePlaylist')} onClick={(e) => del(e, p.id, p.name)}>
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === 'tracks' &&
        (allTracks.length === 0 ? (
          <div className="empty">{t('empty')}</div>
        ) : (
          <ul className="track-list">
            {allTracks.map((tr, i) => (
              <TrackRow key={tr.id} track={tr} onPlay={() => playQueue(allTracks, i)} onArtist={onArtist} />
            ))}
          </ul>
        ))}

      {tab === 'artists' &&
        (artists.length === 0 ? (
          <div className="empty">{t('empty')}</div>
        ) : (
          <ul className="pl-list">
            {artists.map((a) => (
              <li key={a.name} className="pl-item" onClick={() => onArtist(a.track)}>
                <div className="pl-cover round">
                  {a.track.artwork ? <img src={a.track.artwork} alt="" loading="lazy" /> : <span>{a.name[0]}</span>}
                </div>
                <div className="pl-meta">
                  <div className="pl-name">{a.name}</div>
                  <div className="pl-sub">{trk(a.count)}</div>
                </div>
                <span className="pl-more">›</span>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'albums' &&
        (albums.length === 0 ? (
          <div className="empty">{t('empty')}</div>
        ) : (
          <ul className="pl-list">
            {albums.map((al) => (
              <li key={al.name} className="pl-item" onClick={() => playQueue(al.tracks, 0)}>
                <div className="pl-cover">
                  {al.tracks[0]?.artwork ? <img src={al.tracks[0].artwork} alt="" loading="lazy" /> : <span>♪</span>}
                </div>
                <div className="pl-meta">
                  <div className="pl-name">{al.name}</div>
                  <div className="pl-sub">{trk(al.tracks.length)}</div>
                </div>
                <span className="pl-more">›</span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
