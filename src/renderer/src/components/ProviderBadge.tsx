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
    return <RealSoundCloudIcon size={size} className={`prov-badge ${className}`} />
  }
  if (provider === 'yandex') {
    return <RealYandexMusicIcon size={size} bg={false} className={`prov-badge ${className}`} />
  }
  return null
}
