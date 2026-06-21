// Shared track row used across Search / detail lists / local. Includes a "⋯"
// button that opens an add-to-playlist bottom sheet (toggle membership + create).
import { useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'
import { Portal } from './Portal'
import { downloadTrack, isDownloaded, removeDownload } from '../api/offline'

function fmt(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function TrackRow({
  track,
  onPlay,
  onArtist,
  dim,
  onOfflineChange
}: {
  track: Track
  onPlay: () => void
  onArtist?: (track: Track) => void
  dim?: boolean
  onOfflineChange?: () => void
}): JSX.Element {
  const currentId = usePlayer((s) => s.queue[s.currentIndex]?.id)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const [sheet, setSheet] = useState(false)
  const [dl, setDl] = useState<'idle' | 'busy' | 'done'>(() =>
    isDownloaded(track.id) ? 'done' : 'idle'
  )
  const current = track.id === currentId

  const toggleDownload = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (dl === 'busy') return
    if (dl === 'done') {
      await removeDownload(track.id)
      setDl('idle')
      onOfflineChange?.()
      return
    }
    setDl('busy')
    try {
      await downloadTrack(track)
      setDl('done')
    } catch {
      setDl('idle')
    }
    onOfflineChange?.()
  }

  return (
    <li className={'track-row' + (current ? ' playing' : '') + (dim ? ' dim' : '')} onClick={onPlay}>
      <div className="track-cover">
        {track.artwork ? <img src={track.artwork} alt="" loading="lazy" /> : <span>♪</span>}
        {current && (
          <span className={'track-eq' + (isPlaying ? ' on' : '')} aria-hidden>
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
      <div className="track-meta">
        <div className="track-title">{track.title}</div>
        <button
          className="track-artist as-link"
          onClick={(e) => {
            if (!onArtist) return
            e.stopPropagation()
            onArtist(track)
          }}
        >
          {track.artist || 'SoundCloud'}
        </button>
      </div>
      <div className="track-dur">{fmt(track.durationSec)}</div>
      <button
        className={'row-dl' + (dl === 'done' ? ' done' : '')}
        aria-label="Скачать"
        onClick={toggleDownload}
      >
        {dl === 'busy' ? (
          <span className="row-dl-spin" />
        ) : dl === 'done' ? (
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5 9-11" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
          </svg>
        )}
      </button>
      <button
        className="row-more"
        aria-label="…"
        onClick={(e) => {
          e.stopPropagation()
          setSheet(true)
        }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {sheet && <AddToPlaylistSheet track={track} onClose={() => setSheet(false)} />}
    </li>
  )
}

function AddToPlaylistSheet({ track, onClose }: { track: Track; onClose: () => void }): JSX.Element {
  const playlists = usePlayer((s) => s.playlists)
  const addToPlaylist = usePlayer((s) => s.addToPlaylist)
  const removeFromPlaylist = usePlayer((s) => s.removeFromPlaylist)
  const createPlaylist = usePlayer((s) => s.createPlaylist)
  const t = useT()
  const [name, setName] = useState('')

  const toggle = (id: string, has: boolean): void => {
    if (has) void removeFromPlaylist(id, track.id)
    else void addToPlaylist(id, track)
  }
  const createAndAdd = async (): Promise<void> => {
    const n = name.trim()
    if (!n) return
    const pl = await createPlaylist(n)
    await addToPlaylist(pl.id, track)
    setName('')
    onClose()
  }

  return (
    <Portal>
    <div className="sheet-backdrop" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-title">{t('addToPlaylist')}</div>
        <div className="sheet-track">{track.title}</div>
        <ul className="sheet-list">
          {playlists.length === 0 && <li className="empty">{t('noPlaylists')}</li>}
          {playlists.map((pl) => {
            const has = pl.tracks.some((x) => x.id === track.id)
            return (
              <li key={pl.id} className="sheet-item" onClick={() => toggle(pl.id, has)}>
                <span className={'sheet-check' + (has ? ' on' : '')}>{has ? '✓' : '+'}</span>
                <span className="sheet-name">{pl.name}</span>
                <span className="sheet-count">{pl.tracks.length}</span>
              </li>
            )
          })}
        </ul>
        <div className="sheet-create">
          <input
            placeholder={t('newPlaylist')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createAndAdd()}
          />
          <button className="lv-play" disabled={!name.trim()} onClick={createAndAdd}>
            {t('create')}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
