// Bottom-sheet "more actions" for a track list: add the whole list to the queue,
// or add it all to a playlist (with a create sub-view). Mirrors the desktop
// ListMenu; backed by the shared store's enqueue / addAllToPlaylist.
import { useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'
import { Portal } from './Portal'

export function ListMenu({ tracks, onClose }: { tracks: Track[]; onClose: () => void }): JSX.Element {
  const enqueue = usePlayer((s) => s.enqueue)
  const playlists = usePlayer((s) => s.playlists)
  const addAllToPlaylist = usePlayer((s) => s.addAllToPlaylist)
  const createPlaylist = usePlayer((s) => s.createPlaylist)
  const t = useT()
  const [view, setView] = useState<'root' | 'playlists'>('root')
  const [name, setName] = useState('')

  const addToQueue = (): void => {
    enqueue(tracks)
    onClose()
  }
  const addAll = async (id: string): Promise<void> => {
    await addAllToPlaylist(id, tracks)
    onClose()
  }
  const createAndAdd = async (): Promise<void> => {
    const n = name.trim()
    if (!n) return
    const pl = await createPlaylist(n)
    await addAllToPlaylist(pl.id, tracks)
    setName('')
    onClose()
  }

  return (
    <Portal>
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grab" />
          {view === 'root' ? (
            <>
              <div className="sheet-title">{t('moreActions')}</div>
              <ul className="sheet-list">
                <li className="sheet-item" onClick={addToQueue}>
                  <span className="sheet-name">{t('addAllToQueue')}</span>
                </li>
                <li className="sheet-item" onClick={() => setView('playlists')}>
                  <span className="sheet-name">{t('addAllToPlaylist')}</span>
                  <span className="sheet-count">›</span>
                </li>
              </ul>
            </>
          ) : (
            <>
              <div className="sheet-title">{t('addAllToPlaylist')}</div>
              <ul className="sheet-list">
                {playlists.length === 0 && <li className="empty">{t('noPlaylists')}</li>}
                {playlists.map((pl) => (
                  <li key={pl.id} className="sheet-item" onClick={() => void addAll(pl.id)}>
                    <span className="sheet-check">+</span>
                    <span className="sheet-name">{pl.name}</span>
                    <span className="sheet-count">{pl.tracks.length}</span>
                  </li>
                ))}
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
            </>
          )}
        </div>
      </div>
    </Portal>
  )
}
