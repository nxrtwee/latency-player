import { usePlayer } from './store'
import type { Track } from '@shared/types'

/**
 * Upgrade provider artwork URLs to high-resolution variants for crisp rendering
 * on Retina and high-DPI phone displays (Yandex: 1000x1000, SoundCloud: t500x500).
 */
export function upgradeCoverUrl(url?: string): string | undefined {
  if (!url) return undefined
  // Yandex: upgrade low-res 200x200, 300x300, 400x400 to 1000x1000
  if (url.includes('avatars.yandex.net') || url.includes('storage.yandex.net') || url.includes('.yandex.net/get-')) {
    return url.replace(/\/\d+x\d+([?$]|$)/, '/1000x1000$1')
  }
  // SoundCloud: upgrade low-res -large, -badge, -small to -t500x500
  if (url.includes('sndcdn.com')) {
    return url.replace(/-(large|badge|small|tiny|mini)\./, '-t500x500.')
  }
  return url
}

/**
 * Resolve a track's display cover: a user-set custom cover wins over the
 * provider artwork. Subscribes to the customCovers map, so a change re-renders
 * exactly the surfaces showing this track.
 */
export function useCover(track?: Track | null): string | undefined {
  return usePlayer((s) => {
    if (!track) return undefined
    const custom = s.customCovers[track.id]
    return custom ? custom : upgradeCoverUrl(track.artwork)
  })
}

/** Non-reactive resolver for places that already have customCovers in hand. */
export function coverOf(track: Track, customCovers: Record<string, string>): string | undefined {
  return customCovers[track.id] ?? upgradeCoverUrl(track.artwork)
}

