import { useEffect, useState } from 'react'

const MinGlyph = (): JSX.Element => (
  <svg width="11" height="11" viewBox="0 0 11 11">
    <line x1="1" y1="5.5" x2="10" y2="5.5" stroke="currentColor" strokeWidth="1" />
  </svg>
)
const MaxGlyph = (): JSX.Element => (
  <svg width="11" height="11" viewBox="0 0 11 11">
    <rect x="1" y="1" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
)
const RestoreGlyph = (): JSX.Element => (
  <svg width="11" height="11" viewBox="0 0 11 11">
    <rect x="1" y="3" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
    <path d="M3 3 V1 H10 V8 H8" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
)
const CloseGlyph = (): JSX.Element => (
  <svg width="11" height="11" viewBox="0 0 11 11">
    <line x1="1.5" y1="1.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.1" />
    <line x1="9.5" y1="1.5" x2="1.5" y2="9.5" stroke="currentColor" strokeWidth="1.1" />
  </svg>
)

export function TitleBar(): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.api.windowIsMaximized().then(setMaximized)
    return window.api.onWindowMaximized(setMaximized)
  }, [])

  return (
    <div className="titlebar">
      <div className="tb-drag" />
      <div className="tb-controls">
        <button className="win-btn" title="Minimize" onClick={() => window.api.windowMinimize()}>
          <MinGlyph />
        </button>
        <button
          className="win-btn"
          title={maximized ? 'Restore' : 'Maximize'}
          onClick={() => window.api.windowToggleMaximize()}
        >
          {maximized ? <RestoreGlyph /> : <MaxGlyph />}
        </button>
        <button className="win-btn close" title="Close" onClick={() => window.api.windowClose()}>
          <CloseGlyph />
        </button>
      </div>
    </div>
  )
}
