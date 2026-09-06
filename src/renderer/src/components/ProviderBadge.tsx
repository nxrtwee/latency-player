import type { ProviderId } from '@shared/types'
import { RealSoundCloudIcon, RealYandexMusicIcon } from './Icons'

/**
 * Small source badge with the real brand logo so users can tell at a glance which
 * service a track or artist comes from. Renders nothing for local files.
 */
export function ProviderBadge({
  provider,
  size = 14,
  className = ''
}: {
  provider: ProviderId
  size?: number
  className?: string
}): JSX.Element | null {
  if (provider === 'soundcloud') {
    // Neutral white so the badge reads as a clean monochrome mark over avatars and
    // thumbnails (the surrounding label color would otherwise tint it).
    return <RealSoundCloudIcon size={size} color="#fff" className={`prov-badge ${className}`} />
  }
  if (provider === 'yandex') {
    return <RealYandexMusicIcon size={size} bg={false} className={`prov-badge ${className}`} />
  }
  return null
}

/**
 * The corner mark on a mix cover. A real personal mix carries SoundCloud's own
 * logo (it IS a SoundCloud mix, so the brand says more than the letters "SC" did);
 * a generated one keeps the plain word, because it is assembled here out of likes
 * and recents and branding it would claim otherwise.
 */
export function MixBadge({ real }: { real: boolean }): JSX.Element {
  if (!real) return <span className="mix-badge">MIX</span>
  return (
    <span className="mix-badge brand" title="SoundCloud">
      <RealSoundCloudIcon size={13} color="#fff" />
    </span>
  )
}
