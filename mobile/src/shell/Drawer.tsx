import { useEffect, useRef } from 'react'
import { usePlayer } from '@renderer/store'
import { Sidebar } from '@renderer/components/Sidebar'

/**
 * The desktop Sidebar, whole, as a slide-over drawer.
 *
 * Nothing about the sidebar itself is re-implemented — same profile button, same
 * Discover / Your Music / Made For You / Recent Artists / Sources / Playlists
 * groups, same active states. Only its box is re-shaped (portrait.css §4), and
 * `collapsed` is never passed so the phone always gets the labelled version.
 *
 * It closes on the events a phone drawer must close on: a scrim tap, and any
 * navigation the drawer itself caused (a `source` change while it is open).
 */
export function Drawer({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const source = usePlayer((s) => s.source)
  const selectedPlaylistId = usePlayer((s) => s.selectedPlaylistId)
  const selectedMixId = usePlayer((s) => s.selectedMix?.id)
  const settingsOpen = usePlayer((s) => s.settingsOpen)
  const ref = useRef<HTMLElement>(null)

  // Any navigation from inside the drawer (nav item, playlist, mix, artist, or
  // the Settings button) dismisses it — otherwise the page you just opened is
  // hidden behind it. Guarded by `open` so it can't fight a manual reopen.
  useEffect(() => {
    if (open) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, selectedPlaylistId, selectedMixId, settingsOpen])

  // Scroll the drawer back to the top each time it opens, so it never reveals
  // itself mid-list.
  useEffect(() => {
    if (open && ref.current) ref.current.scrollTop = 0
  }, [open])

  // Re-tapping the page you're already on doesn't change `source`, so the effect
  // above wouldn't fire — dismiss on the tap itself for every navigating row.
  // The in-row affordances (delete, new-playlist, rescan) and the rename/create
  // inputs must NOT close it.
  const onDrawerClick = (e: React.MouseEvent): void => {
    const el = e.target as HTMLElement
    if (el.closest('.icon-btn, input, .folders')) return
    if (el.closest('.nav-item, .mix-item, .artist-mini, .pl-row, .sidebar-profile')) onClose()
  }

  return (
    <div className={`m-drawer ${open ? 'open' : ''}`} aria-hidden={!open} onClick={onDrawerClick}>
      <div className="m-scrim" onClick={onClose} />
      <Sidebar ref={ref} />
    </div>
  )
}
