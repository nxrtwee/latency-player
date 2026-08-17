import { usePlayer } from '@renderer/store'
import { useT } from '@renderer/i18n'
import { Logo } from '@renderer/components/Logo'
import {
  SearchIcon,
  SettingsIcon,
  ActivityIcon,
  CommentIcon,
  DownloadIcon,
  YandexMusicIcon
} from '@renderer/components/Icons'

/**
 * "Library" — the drawer opener. Books on a shelf, deliberately NOT a hamburger:
 * the drawer is no longer the app's navigation (every destination that is a
 * single page now has its own icon in the rail), it is the one place that holds
 * the LISTS — playlists, daily mixes, recent artists, the two source pages.
 * Local like Sidebar's CollapseIcon; Icons.tsx has no such glyph, because the
 * desktop has no drawer.
 */
function LibraryIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3.2 3.5v11M7.2 3.5v11M11.4 4.1l3.4 10.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Phone-only chrome: the first (non-scrolling) child of `main.content`.
 *
 * Carries the brand (which doubles as the current-page label, so a pushed page —
 * artist, album, playlist… — still says where you are) plus the icon rail.
 *
 * The rail is this shell's answer to the desktop's collapsed sidebar: there, the
 * sidebar folds to a 68px strip of icons. A phone has no room for a strip beside
 * the content, so the same icons move up here, next to search — which leaves the
 * drawer holding only what cannot be one icon (playlists, mixes, recent artists,
 * sources), reachable through the last button instead of a hamburger.
 *
 * `local` is the one sidebar destination with no icon here: the mobile bridge has
 * no filesystem, so `getLibrary` returns an empty library (mobile/src/api/shim.ts)
 * and the page would always be empty. `home` / `explore` / `likes` / `recent` /
 * `profile` are absent for the opposite reason — they are the bottom tabs.
 * Styling lives in portrait.css §3.
 */
export function TopBar({ onMenu }: { onMenu: () => void }): JSX.Element {
  const t = useT()
  const source = usePlayer((s) => s.source)
  const setSource = usePlayer((s) => s.setSource)
  const setSettingsOpen = usePlayer((s) => s.setSettingsOpen)
  const playlists = usePlayer((s) => s.playlists)
  const selectedPlaylistId = usePlayer((s) => s.selectedPlaylistId)
  const artistName = usePlayer((s) => s.selectedArtist?.name)
  const albumTitle = usePlayer((s) => s.selectedAlbum?.title)
  const mixTitle = usePlayer((s) => s.selectedMix?.title)
  const infoService = usePlayer((s) => s.infoService)
  // My Wave is a Yandex-account feature — the sidebar hides it without a token,
  // and so does the rail.
  const ymAuth = usePlayer((s) => s.ymAuth)

  // On 'home' the brand IS the title (like the desktop sidebar's brand); every
  // other page names itself, so the back-less drawer navigation stays legible.
  const title =
    source === 'home'
      ? 'Latency'
      : source === 'explore'
        ? t('explore')
        : source === 'activity'
          ? t('activity')
          : source === 'comments'
            ? t('commentsSidebar')
            : source === 'likes'
              ? t('yourLikes')
              : source === 'recent'
                ? t('recentlyPlayed')
                : source === 'local'
                  ? t('localFiles')
                  : source === 'offline'
                    ? t('downloaded')
                    : source === 'wave'
                      ? t('myWave')
                      : source === 'profile'
                        ? t('profile')
                        : source === 'artist'
                          ? artistName || t('artist')
                          : source === 'album'
                            ? albumTitle || t('album')
                            : source === 'mix'
                              ? mixTitle || t('madeForYou')
                              : source === 'info'
                                ? infoService === 'yandex'
                                  ? t('yandexMusic')
                                  : 'SoundCloud'
                                : source === 'playlist'
                                  ? playlists.find((p) => p.id === selectedPlaylistId)?.name ||
                                    t('playlists')
                                  : 'Latency'

  return (
    <div className="m-topbar">
      <div className="m-tb-brand">
        <Logo size={22} />
        <span className="m-tb-title">{title}</span>
      </div>
      <div className="m-tb-rail">
        <button
          className={`m-tb-btn ${source === 'activity' ? 'active' : ''}`}
          onClick={() => setSource('activity')}
          aria-label={t('activity')}
        >
          <ActivityIcon size={18} />
        </button>
        <button
          className={`m-tb-btn ${source === 'comments' ? 'active' : ''}`}
          onClick={() => setSource('comments')}
          aria-label={t('commentsSidebar')}
        >
          <CommentIcon size={18} />
        </button>
        <button
          className={`m-tb-btn ${source === 'offline' ? 'active' : ''}`}
          onClick={() => setSource('offline')}
          aria-label={t('downloaded')}
        >
          <DownloadIcon size={18} />
        </button>
        {ymAuth && (
          <button
            className={`m-tb-btn ${source === 'wave' ? 'active' : ''}`}
            onClick={() => setSource('wave')}
            aria-label={t('myWave')}
          >
            <YandexMusicIcon size={18} />
          </button>
        )}
        <button
          className={`m-tb-btn ${source === 'explore' ? 'active' : ''}`}
          onClick={() => setSource('explore')}
          aria-label={t('search')}
        >
          <SearchIcon size={18} />
        </button>
        <button className="m-tb-btn" onClick={onMenu} aria-label={t('playlists')}>
          <LibraryIcon />
        </button>
        <button
          className="m-tb-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label={t('settings')}
        >
          <SettingsIcon size={18} />
        </button>
      </div>
    </div>
  )
}
