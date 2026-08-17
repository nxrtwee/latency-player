import { usePlayer } from '@renderer/store'
import { PlayerBar } from '@renderer/components/PlayerBar'

// Anything inside the capsule that owns its own tap. Everything else is dead
// space that opens the fullscreen player — the gesture every phone player has.
//
// On a phone that list is the three transport buttons and the like heart.
// portrait.css §6 makes the rest of the capsule inert on purpose (`.pb-now` gets
// `pointer-events: none` — the heart opts back in — the visualizer too, and
// `.pb-right` is gone): a title that opens comments and per-artist links are
// mis-tap bait right where a thumb reaches for "expand", and both exist full-size
// one tap deeper. `button` still has to be listed — prev/play/next and the heart
// are buttons — while `.pb-title` / `.pb-seek` / `.pb-wave` / `.pb-volume` no
// longer do, since nothing there takes a tap any more.
const INTERACTIVE = 'button, a, input'

/**
 * The desktop PlayerBar, unmodified, docked as the phone capsule (portrait.css
 * §6-7 re-flows it to two rows). The wrapper adds the one behaviour a phone
 * needs and a mouse doesn't: tapping the bar itself expands to the fullscreen
 * player. That gesture is now the ONLY way up from the capsule — the desktop's
 * own expand button is hidden with the rest of `.pb-right`, which is what frees
 * the width for the title.
 *
 * The wrapper is a plain <div> with no transform/filter of its own: `.playerbar`
 * is `position: fixed` under nextgen and must keep resolving against the
 * viewport, not against this element.
 */
export function PlayerDock(): JSX.Element {
  const toggleLyrics = usePlayer((s) => s.toggleLyrics)

  const onClick = (e: React.MouseEvent): void => {
    const el = e.target as HTMLElement
    if (el.closest(INTERACTIVE)) return
    if (usePlayer.getState().currentIndex < 0) return
    toggleLyrics()
  }

  return (
    <div className="m-dock" onClick={onClick}>
      <PlayerBar />
    </div>
  )
}
