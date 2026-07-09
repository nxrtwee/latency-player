import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../store'
import { WindowControls } from './WindowControls'
import { useT } from '../i18n'
import { Logo } from './Logo'
import {
  SearchIcon,
  HomeIcon,
  CompassIcon,
  ActivityIcon,
  CommentIcon,
  SettingsIcon
} from './Icons'

/**
 * postgen shell — top deck.
 *
 * A transparent strip of framed "islands": brand · nav tabs · (spacer) · global
 * search · settings + window controls. The full transport (cover, title/artist,
 * controls, progress, volume) lives in the floating bottom capsule (PlayerBar,
 * styled as a capsule under [data-skin='postgen']), mirroring nextgen. Only
 * renders when `skin === 'postgen'` (App.tsx gate).
 */

const NAV_TABS = [
  { id: 'home', icon: HomeIcon, key: 'home' },
  { id: 'explore', icon: CompassIcon, key: 'explore' },
  { id: 'activity', icon: ActivityIcon, key: 'activity' },
  { id: 'comments', icon: CommentIcon, key: 'commentsSidebar' }
] as const

export function PostgenTopBar(): JSX.Element {
  const source = usePlayer((s) => s.source)
  const setSource = usePlayer((s) => s.setSource)
  const runSearch = usePlayer((s) => s.runSearch)
  const searchQuery = usePlayer((s) => s.searchQuery)
  const setSettingsOpen = usePlayer((s) => s.setSettingsOpen)

  const t = useT()

  const [q, setQ] = useState(searchQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setQ(searchQuery)
  }, [searchQuery])

  function submitSearch(): void {
    const query = q.trim()
    if (!query) return
    if (source !== 'explore') setSource('explore')
    runSearch(query)
  }

  return (
    <header className="pg-top">
      <div className="pg-top-brand pg-island">
        <span className="pg-brand-logo">
          <Logo size={26} />
        </span>
        <span className="pg-brand-name">Latency</span>
      </div>

      <nav className="pg-nav pg-island">
        {NAV_TABS.map((tab) => {
          const Icon = tab.icon
          const active = source === tab.id
          return (
            <button
              key={tab.id}
              className={`pg-nav-tab ${active ? 'active' : ''}`}
              onClick={() => setSource(tab.id)}
              title={t(tab.key)}
            >
              <Icon size={17} />
              <span>{t(tab.key)}</span>
            </button>
          )
        })}
      </nav>

      <div className="pg-top-spacer" />

      <div className="pg-search pg-island">
        <SearchIcon size={16} />
        <input
          ref={inputRef}
          value={q}
          placeholder={t('searchPlaceholder')}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitSearch()
            if (e.key === 'Escape') inputRef.current?.blur()
          }}
        />
      </div>

      <div className="pg-top-icons pg-island">
        <button className="icon-btn" title={t('settings')} onClick={() => setSettingsOpen(true)}>
          <SettingsIcon size={16} />
        </button>
        <WindowControls />
      </div>
    </header>
  )
}
