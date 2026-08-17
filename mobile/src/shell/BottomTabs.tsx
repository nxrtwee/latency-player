import { usePlayer } from '@renderer/store'
import { useT } from '@renderer/i18n'
import { HomeIcon, CompassIcon, HeartIcon, ClockIcon } from '@renderer/components/Icons'

/** Profile glyph — Icons.tsx has none (the desktop shows the avatar instead). */
function UserIcon(): JSX.Element {
  return (
    <svg width="21" height="21" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="6.6" r="3.3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.6 17c0-3.3 2.9-5.2 6.4-5.2s6.4 1.9 6.4 5.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Five bottom tabs — the phone's primary navigation. They are NOT a separate
 * router: each one just sets the shared store `source`, exactly like the desktop
 * sidebar's nav items, so a tab and its drawer twin are the same destination and
 * light up together. Everything past these five (activity, comments, wave, mixes,
 * playlists, sources) lives in the drawer.
 *
 * Profile is last because it's the desktop sidebar's top-left corner — the one
 * place a phone user still expects it (bottom-right). Styling: portrait.css §5.
 */
export function BottomTabs(): JSX.Element {
  const t = useT()
  const source = usePlayer((s) => s.source)
  const setSource = usePlayer((s) => s.setSource)

  const tabs = [
    { id: 'home', label: t('home'), icon: <HomeIcon size={21} /> },
    { id: 'explore', label: t('search'), icon: <CompassIcon size={21} /> },
    { id: 'likes', label: t('likesTab'), icon: <HeartIcon size={21} /> },
    { id: 'recent', label: t('history'), icon: <ClockIcon size={21} /> },
    { id: 'profile', label: t('profile'), icon: <UserIcon /> }
  ] as const

  return (
    <nav className="m-tabbar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`m-tab ${source === tab.id ? 'active' : ''}`}
          onClick={() => setSource(tab.id)}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
