import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../store'
import { MoreIcon, QueueIcon, PlusIcon } from './Icons'
import { useT } from '../i18n'
import type { Track } from '@shared/types'

/**
 * The "···" overflow menu for a whole track list (likes / recent / playlist / …).
 * Two actions: enqueue the entire list, or add the entire list to a playlist
 * (a small inline submenu of the user's playlists, with create-and-add).
 */
export function ListMenu({ tracks }: { tracks: Track[] }): JSX.Element {
  const t = useT()
  const playlists = usePlayer((s) => s.playlists)
  const enqueue = usePlayer((s) => s.enqueue)
  const addAllToPlaylist = usePlayer((s) => s.addAllToPlaylist)
  const createPlaylist = usePlayer((s) => s.createPlaylist)

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'root' | 'playlists'>('root')
  const [name, setName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Reset to the root view whenever the menu reopens.
  function toggleOpen(): void {
    setOpen((v) => {
      if (!v) setView('root')
      return !v
    })
  }

  const empty = tracks.length === 0

  async function addAll(id: string): Promise<void> {
    await addAllToPlaylist(id, tracks)
    setOpen(false)
  }

  async function createAndAddAll(): Promise<void> {
    const n = name.trim()
    if (!n) return
    const pl = await createPlaylist(n)
    await addAllToPlaylist(pl.id, tracks)
    setName('')
    setOpen(false)
  }

  return (
    <div className="pl-menu list-menu" ref={ref}>
      <button
        className="btn-round"
        title={t('moreActions')}
        disabled={empty}
        onClick={(e) => {
          e.stopPropagation()
          toggleOpen()
        }}
      >
        <MoreIcon size={18} />
      </button>

      {open && (
        <div className="pl-popover lm-popover" onClick={(e) => e.stopPropagation()}>
          {view === 'root' ? (
            <div className="pl-popover-list">
              <button
                className="pl-option lm-action"
                onClick={() => {
                  enqueue(tracks)
                  setOpen(false)
                }}
              >
                <QueueIcon size={16} />
                <span className="pl-option-name">{t('addAllToQueue')}</span>
              </button>
              <button className="pl-option lm-action" onClick={() => setView('playlists')}>
                <PlusIcon size={16} />
                <span className="pl-option-name">{t('addAllToPlaylist')}</span>
                <span className="lm-chevron">›</span>
              </button>
            </div>
          ) : (
            <>
              <button className="pl-popover-head lm-back" onClick={() => setView('root')}>
                ‹ {t('addAllToPlaylist')}
              </button>
              <div className="pl-popover-list">
                {playlists.length === 0 && <div className="pl-empty">{t('noPlaylistsYet')}</div>}
                {playlists.map((pl) => (
                  <button key={pl.id} className="pl-option" onClick={() => addAll(pl.id)}>
                    <span className="pl-option-name">{pl.name}</span>
                  </button>
                ))}
              </div>
              <div className="pl-create">
                <input
                  placeholder={t('newPlaylistPh')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createAndAddAll()
                  }}
                />
                <button onClick={createAndAddAll} disabled={!name.trim()}>
                  {t('add')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
