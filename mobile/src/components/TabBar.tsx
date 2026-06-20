import { useT, type TKey } from '../i18n'

export type TabId = 'home' | 'search' | 'library' | 'profile' | 'settings'

const TABS: { id: TabId; label: string; icon: JSX.Element }[] = [
  {
    id: 'home',
    label: 'Главная',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path
          d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    )
  },
  {
    id: 'search',
    label: 'Поиск',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    )
  },
  {
    id: 'library',
    label: 'Библиотека',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path d="M5 4v16M9 4v16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <rect
          x="13"
          y="4"
          width="6"
          height="16"
          rx="1.2"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      </svg>
    )
  },
  {
    id: 'profile',
    label: 'Профиль',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    )
  },
  {
    id: 'settings',
    label: 'Настройки',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    )
  }
]

export function TabBar({
  active,
  onChange
}: {
  active: TabId
  onChange: (id: TabId) => void
}): JSX.Element {
  const t = useT()
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={'tab' + (active === tab.id ? ' active' : '')}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          <span>{t(tab.id as TKey)}</span>
        </button>
      ))}
    </nav>
  )
}
