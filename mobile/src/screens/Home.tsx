// Home — greeting, quick-access (real counts + navigation), "Ваши миксы".
import { usePlayer } from '@renderer/store'
import type { Detail } from '../MobileApp'
import type { TabId } from '../components/TabBar'
import { useT } from '../i18n'
import { Logo } from '@renderer/components/Logo'

const ICONS: Record<string, JSX.Element> = {
  heart: (
    <path
      d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      fill="currentColor"
    />
  ),
  recent: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4M12 8v4l3 2" />
    </g>
  ),
  activity: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l3 8 4-16 3 8h4" />
    </g>
  ),
  search: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </g>
  )
}

function plural(n: number): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return 'треков'
  if (b > 1 && b < 5) return 'трека'
  if (b === 1) return 'трек'
  return 'треков'
}

export function HomeScreen({
  onOpenDetail,
  onOpenTab
}: {
  onOpenDetail: (d: Detail) => void
  onOpenTab: (t: TabId) => void
}): JSX.Element {
  const likes = usePlayer((s) => s.likes)
  const scLikes = usePlayer((s) => s.scLikes)
  const recent = usePlayer((s) => s.recentlyPlayed)
  const mixes = usePlayer((s) => s.mixes)
  const playlists = usePlayer((s) => s.playlists)
  const playQueue = usePlayer((s) => s.playQueue)
  const lang = usePlayer((s) => s.lang)
  const t = useT()
  const jumpBack = recent.slice(0, 10)
  // global likes = app likes + SoundCloud likes (deduped)
  const likeCount = new Set([...likes, ...scLikes].map((x) => x.id)).size

  const cnt = (n: number): string => (lang === 'ru' ? `${n} ${plural(n)}` : `${n} ${n === 1 ? 'track' : 'tracks'}`)
  const h = new Date().getHours()
  const greet =
    h < 5 ? t('greetNight') : h < 12 ? t('greetMorning') : h < 18 ? t('greetDay') : t('greetEvening')

  const quick = [
    { label: t('liked'), sub: cnt(likeCount), icon: 'heart', act: () => onOpenDetail({ kind: 'likes' }) },
    { label: t('recent'), sub: cnt(recent.length), icon: 'recent', act: () => onOpenDetail({ kind: 'recent' }) },
    { label: t('activity'), sub: t('stats'), icon: 'activity', act: () => onOpenDetail({ kind: 'activity' }) },
    { label: t('search'), sub: 'SoundCloud', icon: 'search', act: () => onOpenTab('search') }
  ]

  return (
    <div className="view">
      <header className="home-head">
        <div>
          <div className="eyebrow">{greet}</div>
          <h1 className="display">
            {t('whatListen1')}
            <br />
            <span className="accent">{t('whatListen2')}</span>
          </h1>
        </div>
        <div className="home-logo" aria-label="Latency">
          <Logo size={34} />
        </div>
      </header>

      <section className="quick-grid">
        {quick.map((q) => (
          <button key={q.label} className="quick-card" onClick={q.act}>
            <span className="quick-icon">
              <svg viewBox="0 0 24 24" width="19" height="19">
                {ICONS[q.icon]}
              </svg>
            </span>
            <span className="quick-text">
              <span className="quick-label">{q.label}</span>
              <span className="quick-sub">{q.sub}</span>
            </span>
          </button>
        ))}
      </section>

      <section>
        <div className="section-head">
          <h2>{t('yourMixes')}</h2>
        </div>
        {mixes.length > 0 ? (
          <div className="mix-row">
            {mixes.map((m) => (
              <div key={m.id} className="mix-card" onClick={() => onOpenDetail({ kind: 'mix', id: m.id })}>
                <div className="mix-cover">
                  {m.cover ? <img src={m.cover} alt="" loading="lazy" /> : null}
                  <span className="mix-badge">SC</span>
                </div>
                <div className="mix-name">{m.title}</div>
                <div className="mix-sub">{m.subtitle}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">{t('mixesEmpty')}</div>
        )}
      </section>

      {jumpBack.length > 0 && (
        <section>
          <div className="section-head">
            <h2>{t('jumpBack')}</h2>
            <button className="link" onClick={() => onOpenDetail({ kind: 'recent' })}>
              {t('all')}
            </button>
          </div>
          <div className="card-row">
            {jumpBack.map((tr, i) => (
              <button key={tr.id + i} className="sq-card" onClick={() => playQueue(recent, i)}>
                <div className="sq-cover">
                  {tr.artwork ? <img src={tr.artwork} alt="" loading="lazy" /> : <span>♪</span>}
                </div>
                <div className="sq-title">{tr.title}</div>
                <div className="sq-sub">{tr.artist || 'SoundCloud'}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {playlists.length > 0 && (
        <section>
          <div className="section-head">
            <h2>{t('yourPlaylists')}</h2>
          </div>
          <div className="card-row">
            {playlists.map((pl) => (
              <button
                key={pl.id}
                className="sq-card"
                onClick={() => onOpenDetail({ kind: 'playlist', id: pl.id })}
              >
                <div className="sq-cover">
                  {pl.tracks.find((x) => x.artwork)?.artwork ? (
                    <img src={pl.tracks.find((x) => x.artwork)?.artwork} alt="" loading="lazy" />
                  ) : (
                    <span>♪</span>
                  )}
                </div>
                <div className="sq-title">{pl.name}</div>
                <div className="sq-sub">{cnt(pl.tracks.length)}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="home-foot">{t('foot')}</div>
    </div>
  )
}
