import { useCallback } from 'react'

interface ResizerProps {
  width: number
  setWidth: (w: number) => void
  min: number
  max: number
  /** +1: dragging right grows the panel; -1: dragging left grows it. */
  dir: 1 | -1
  persistKey: string
}

/** A thin draggable divider that resizes an adjacent panel. */
export function Resizer({ width, setWidth, min, max, dir, persistKey }: ResizerProps): JSX.Element {
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = width
      let latest = width

      function move(ev: MouseEvent): void {
        const w = Math.min(max, Math.max(min, startW + (ev.clientX - startX) * dir))
        latest = w
        setWidth(w)
      }
      function up(): void {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        document.body.classList.remove('resizing')
        try {
          localStorage.setItem(persistKey, String(Math.round(latest)))
        } catch {
          /* non-fatal */
        }
      }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
      document.body.classList.add('resizing')
    },
    [width, min, max, dir, setWidth, persistKey]
  )

  return <div className="resizer" onMouseDown={onMouseDown} role="separator" />
}
