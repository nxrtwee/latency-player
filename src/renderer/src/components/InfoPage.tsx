import { usePlayer } from '../store'
import { SoundCloudIcon, YandexIcon } from './Icons'
import type { InfoService } from '../store'

const INFO: Record<
  InfoService,
  { name: string; tagline: string; blurb: string; bullets: string[]; color: string; Icon: typeof SoundCloudIcon }
> = {
  soundcloud: {
    name: 'SoundCloud',
    tagline: 'The home of independent sound.',
    blurb:
      'Stream millions of tracks from rising artists and underground scenes. Search is live in latency — open Explore to start listening.',
    bullets: [
      'Discover unsigned artists before anyone else',
      'Endless remixes, sets and DJ mixes',
      'Progressive & HLS streaming supported'
    ],
    color: '#ff5500',
    Icon: SoundCloudIcon
  },
  yandex: {
    name: 'Yandex Music',
    tagline: 'Музыка без VPN в России.',
    blurb:
      'Поиск и воспроизведение работают без VPN. Без входа треки играют 30-секундные превью; после входа своим аккаунтом Яндекс — целиком, в рамках вашей подписки Яндекс Плюс. Откройте «Поиск», чтобы начать.',
    bullets: [
      'Доступ без VPN на территории России',
      'Без входа — превью 30 сек, после входа — полные треки',
      'Эквалайзер и живой визуализатор'
    ],
    color: '#ffcc00',
    Icon: YandexIcon
  }
}

export function InfoPage(): JSX.Element {
  const service = usePlayer((s) => s.infoService)
  const setSource = usePlayer((s) => s.setSource)
  const setSearchSource = usePlayer((s) => s.setSearchSource)
  const info = INFO[service]
  const { Icon } = info

  function openExplore(): void {
    setSearchSource(service === 'yandex' ? 'yandex' : 'soundcloud')
    setSource('explore')
  }

  return (
    <section className="tracklist info-page">
      <div className="ph-aurora" style={{ background: `radial-gradient(80% 70% at 72% -20%, ${info.color}33, transparent 60%)` }} />
      <div className="info-hero">
        <div className="info-icon" style={{ color: info.color, borderColor: `${info.color}55` }}>
          <Icon size={48} />
        </div>
        <span className="ph-label" style={{ color: info.color }}>
          Source
        </span>
        <h1 className="ph-title">{info.name}</h1>
        <p className="info-tagline">{info.tagline}</p>
        <p className="info-blurb">{info.blurb}</p>

        <ul className="info-bullets">
          {info.bullets.map((b) => (
            <li key={b}>
              <span className="info-dot" style={{ background: info.color }} />
              {b}
            </li>
          ))}
        </ul>

        <div className="info-actions">
          <button className="btn-play" onClick={openExplore}>
            Open Explore
          </button>
        </div>
      </div>
    </section>
  )
}
