import { useCallback, useMemo, useState } from 'react'
import { usePlayer } from '../store'
import { formatTotal } from '../util'
import { PlayIcon, SearchIcon, ShuffleIcon, ClockIcon, DownloadIcon, MoreIcon } from './Icons'
import { TrackRow } from './TrackRow'
import { useT } from '../i18n'
import { useVirtualRows } from '../useVirtualRows'
import type { Track } from '@shared/types'

// Pinned .trow heights (see styles.css) — windowing math depends on them.
const ROW_H_NORMAL = 54
const ROW_H_COMPACT = 38

export function TrackList(): JSX.Element {
  const t = useT()
  const source = usePlayer((s) => s.source)
  const tracks = usePlayer((s) => s.tracks)
  const loading = usePlayer((s) => s.loading)
  const likes = usePlayer((s) => s.likes)
  const scLikes = usePlayer((s) => s.scLikes)
  const offlineTracks = usePlayer((s) => s.offlineTracks)
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed)
  const playlists = usePlayer((s) => s.playlists)
  const selectedPlaylistId = usePlayer((s) => s.selectedPlaylistId)
  const playQueue = usePlayer((s) => s.playQueue)
  const shuffle = usePlayer((s) => s.shuffle)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)

  const [textQuery, setTextQuery] = useState('')

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId)

  const baseList = useMemo(() => {
    if (source === 'likes') {
      // app likes + the signed-in user's real SoundCloud likes, deduped
      const seen = new Set<string>()
      const merged: Track[] = []
      for (const t of [...likes, ...scLikes]) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          merged.push(t)
        }
      }
      return merged
    }
    if (source === 'recent') return recentlyPlayed
    if (source === 'offline') return offlineTracks
    if (source === 'playlist') return selectedPlaylist?.tracks ?? []
    return tracks
  }, [source, likes, scLikes, offlineTracks, recentlyPlayed, selectedPlaylist, tracks])

  const metaMap: Partial<Record<string, { label: string; title: string; desc: string }>> = {
    likes: { label: t('playlist'), title: t('yourLikes'), desc: t('likesDesc') },
    recent: { label: t('history'), title: t('recentlyPlayed'), desc: t('recentDesc') },
    local: { label: t('library'), title: t('localFiles'), desc: t('localDesc') },
    offline: { label: t('library'), title: t('downloaded'), desc: t('downloadedDesc') },
    playlist: { label: t('playlist'), title: selectedPlaylist?.name ?? t('playlist'), desc: '' }
  }
  const meta = metaMap[source] ?? { label: '', title: '', desc: '' }
  const title = meta.title

  const list = useMemo(() => {
    const q = textQuery.trim().toLowerCase()
    if (!q) return baseList
    return baseList.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.artist || '').toLowerCase().includes(q) ||
        (t.album || '').toLowerCase().includes(q)
    )
  }, [baseList, textQuery])

  const headerCover = list.find((t) => t.artwork)?.artwork
  const totalSec = list.reduce((sum, t) => sum + (t.durationSec ?? 0), 0)

  const compact = usePlayer((s) => s.compact)
  const ROW_H = compact ? ROW_H_COMPACT : ROW_H_NORMAL
  const { containerRef, win } = useVirtualRows(list.length, ROW_H, '.cscroll-view')

  // Stable so React.memo on TrackRow can skip re-rendering rows during scroll.
  const play = useCallback(
    (index: number): void => {
      playQueue(list, index)
    },
    [playQueue, list]
  )
  function shufflePlay(): void {
    if (!list.length) return
    if (!shuffle) toggleShuffle()
    play(Math.floor(Math.random() * list.length))
  }

  function emptyText(): string {
    if (source === 'likes') return t('emptyLikes')
    if (source === 'recent') return t('emptyRecent')
    if (source === 'offline') return t('emptyOffline')
    if (source === 'playlist') return t('emptyPlaylist')
    return loading ? t('scanning') : t('emptyLocal')
  }

  return (
    <section className="tracklist">
      <div className="ph-aurora" />

      <header className="ph">
        <div className="ph-cover">
          {headerCover ? <img src={headerCover} alt="" /> : <span className="ph-cover-glyph">♪</span>}
        </div>
        <div className="ph-info">
          {meta.label && <span className="ph-label">{meta.label}</span>}
          <h1 className="ph-title">{title}</h1>
          <div className="ph-meta">
            <span>
              {list.length} {t('tracks')}
            </span>
            {totalSec > 0 && (
              <>
                <span className="dot">•</span>
                <span>{formatTotal(totalSec)}</span>
              </>
            )}
          </div>
          {meta.desc && <p className="ph-desc">{meta.desc}</p>}

          <div className="ph-actions">
            <button className="btn-play" onClick={() => play(0)} disabled={!list.length}>
              <PlayIcon size={18} />
              <span>{t('play')}</span>
            </button>
            <button className="btn-round" title="Shuffle" onClick={shufflePlay} disabled={!list.length}>
              <ShuffleIcon size={18} />
            </button>
            <button className="btn-round soon" title="Coming soon">
              <DownloadIcon size={18} />
            </button>
            <button className="btn-round soon" title="Coming soon">
              <MoreIcon size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="tl-toolbar">
        <div className="search-box">
          <SearchIcon size={16} />
          <input
            className="search"
            placeholder={t('filterTracks')}
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="tl-head">
        <span className="c-index">#</span>
        <span className="c-title">{t('title')}</span>
        <span className="c-artist">{t('artist')}</span>
        <span className="c-like" />
        <span className="c-time">
          <ClockIcon size={15} />
        </span>
        <span className="c-more" />
      </div>

      {list.length === 0 ? (
        <div className="empty">{emptyText()}</div>
      ) : (
        <div className="rows" ref={containerRef}>
          {win.start > 0 && <div style={{ height: win.start * ROW_H, flexShrink: 0 }} />}
          {list.slice(win.start, win.end).map((track, i) => {
            const idx = win.start + i
            return <TrackRow key={`${track.id}-${idx}`} track={track} index={idx} onPlay={play} />
          })}
          {win.end < list.length && (
            <div style={{ height: (list.length - win.end) * ROW_H, flexShrink: 0 }} />
          )}
        </div>
      )}

      {list.length > 0 && (
        <div className="tl-footer">
          {list.length} {t('tracks')}
          {totalSec > 0 ? `, ${formatTotal(totalSec)}` : ''}
        </div>
      )}
    </section>
  )
}
