import type { ProviderId } from '@shared/types'
import type { PlaybackProvider } from './types'
import { localProvider } from './local'
import { soundcloudProvider } from './soundcloud'
import { yandexProvider } from './yandex'

// The registry is the single extension point: register a provider here and the
// rest of the app can play its tracks. Future: soundcloudProvider, etc.
const providers = new Map<ProviderId, PlaybackProvider>()

export function registerProvider(provider: PlaybackProvider): void {
  providers.set(provider.id, provider)
}

export function getProvider(id: ProviderId): PlaybackProvider | undefined {
  return providers.get(id)
}

registerProvider(localProvider)
registerProvider(soundcloudProvider)
registerProvider(yandexProvider)
