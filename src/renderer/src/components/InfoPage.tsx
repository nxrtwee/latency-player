import { usePlayer } from '../store'
import { SoundCloudIcon, SpotifyIcon, YouTubeIcon } from './Icons'
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
  spotify: {
    name: 'Spotify',
    tagline: 'Music for everyone.',
    blurb:
      'Connect your Spotify account to bring your playlists and Premium playback into latency. Official Web Playback integration is on the roadmap.',
    bullets: [
      'Your playlists and saved songs in one place',
      'Premium-quality streaming via official SDK',
      'Seamless hand-off across your devices'
    ],
    color: '#1ed760',
    Icon: SpotifyIcon
  },
  youtube: {
    name: 'YouTube Music',
    tagline: 'The world is listening.',
    blurb:
      'Tap into the largest catalog of official tracks, live versions and rare uploads. Embedded playback support is planned for a future release.',
    bullets: [
      'Official releases, live sets and covers',
      'Music videos alongside audio',
      'Massive long-tail catalog'
    ],
    color: '#ff0033',
    Icon: YouTubeIcon
  }
}

export function InfoPage(): JSX.Element {
  const service = usePlayer((s) => s.infoService)
  const setSource = usePlayer((s) => s.setSource)
  const info = INFO[service]
  const { Icon } = info

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
          {service === 'soundcloud' ? (
            <button className="btn-play" onClick={() => setSource('explore')}>
              Open Explore
            </button>
          ) : (
            <button className="btn-play soon" disabled>
              Connect — coming soon
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
