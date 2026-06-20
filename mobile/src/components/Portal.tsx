// Render children into <body>, outside the per-screen DOM. Bottom sheets and
// modals live inside a screen, which sits in `.screen` (position:relative;
// z-index:0) — its own stacking context. A fixed overlay there, however high its
// z-index, is still trapped below the mini-player / tab bar (siblings of
// `.screen` with z-index 10/11). Portaling to <body> lets the overlay's z-index
// win. `position:fixed` resolves against the viewport regardless of mount point.
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

export function Portal({ children }: { children: ReactNode }): JSX.Element {
  return createPortal(children, document.body) as unknown as JSX.Element
}
