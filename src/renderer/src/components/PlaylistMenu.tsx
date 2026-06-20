import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../store'
import { MoreIcon } from './Icons'
import type { Track } from '@shared/types'

/** Per-row "add to playlist" button with a popover that toggles membership. */
export function PlaylistMenu({ track }: { track: Track }): JSX.Element {
  const playlists = usePlayer((s) => s.playlists)
  const addToPlaylist = usePlayer((s) => s.addToPlaylist)
  const removeFromPlaylist = usePlayer((s) => s.removeFromPlaylist)
  const createPlaylist = usePlayer((s) => s.createPlaylist)

  const [open, setOpen] = useState(false)
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

  function toggle(playlistId: string, has: boolean): void {
    if (has) removeFromPlaylist(playlistId, track.id)
    else addToPlaylist(playlistId, track)
  }

  async function createAndAdd(): Promise<void> {
    const n = name.trim()
    if (!n) return
    const pl = await createPlaylist(n)
    await addToPlaylist(pl.id, track)
    setName('')
    setOpen(false)
  }

  return (
    <div className="pl-menu" ref={ref}>
      <button
        className="row-add"
        title="Add to playlist"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <MoreIcon size={18} />
      </button>

      {open && (
        <div className="pl-popover" onClick={(e) => e.stopPropagation()}>
          <div className="pl-popover-head">Add to playlist</div>
          <div className="pl-popover-list">
            {playlists.length === 0 && <div className="pl-empty">No playlists yet</div>}
            {playlists.map((pl) => {
              const has = pl.tracks.some((t) => t.id === track.id)
              return (
                <button key={pl.id} className="pl-option" onClick={() => toggle(pl.id, has)}>
                  <span className={`pl-check ${has ? 'on' : ''}`}>{has ? '✓' : ''}</span>
                  <span className="pl-option-name">{pl.name}</span>
                </button>
              )
            })}
          </div>
          <div className="pl-create">
            <input
              placeholder="New playlist…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createAndAdd()
              }}
            />
            <button onClick={createAndAdd} disabled={!name.trim()}>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
