import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../store'
import { MoreIcon, RadioIcon } from './Icons'
import { useT } from '../i18n'
import type { Track } from '@shared/types'

/** Per-row "add to playlist" button with a popover that toggles membership. */
export function PlaylistMenu({ track }: { track: Track }): JSX.Element {
  const t = useT()
  const playlists = usePlayer((s) => s.playlists)
  const addToPlaylist = usePlayer((s) => s.addToPlaylist)
  const removeFromPlaylist = usePlayer((s) => s.removeFromPlaylist)
  const createPlaylist = usePlayer((s) => s.createPlaylist)
  const startTrackRadio = usePlayer((s) => s.startTrackRadio)
  const startArtistRadio = usePlayer((s) => s.startArtistRadio)
  const ymAuth = usePlayer((s) => s.ymAuth)

  // Seeded radio: Yandex rotor stations (needs a signed-in account), or a
  // SoundCloud related-seeded autopilot station. Not available for local files.
  const canTrackRadio =
    (track.providerId === 'yandex' && !!ymAuth) || track.providerId === 'soundcloud'
  const canArtistRadio =
    (track.providerId === 'yandex' && !!ymAuth && !!track.artistId) ||
    track.providerId === 'soundcloud'

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
          {(canTrackRadio || canArtistRadio) && (
            <div className="pl-radio">
              {canTrackRadio && (
                <button
                  className="pl-radio-btn"
                  onClick={() => {
                    void startTrackRadio(track)
                    setOpen(false)
                  }}
                >
                  <RadioIcon size={15} />
                  <span>{track.providerId === 'yandex' ? t('waveByTrack') : t('stationFromTrack')}</span>
                </button>
              )}
              {canArtistRadio && (
                <button
                  className="pl-radio-btn"
                  onClick={() => {
                    void startArtistRadio(track)
                    setOpen(false)
                  }}
                >
                  <RadioIcon size={15} />
                  <span>{track.providerId === 'yandex' ? t('waveByArtist') : t('stationFromArtist')}</span>
                </button>
              )}
            </div>
          )}
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
