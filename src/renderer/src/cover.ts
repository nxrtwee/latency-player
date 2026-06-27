import { usePlayer } from './store'
import type { Track } from '@shared/types'

/**
 * Resolve a track's display cover: a user-set custom cover wins over the
 * provider artwork. Subscribes to the customCovers map, so a change re-renders
 * exactly the surfaces showing this track.
 */
export function useCover(track?: Track | null): string | undefined {
  return usePlayer((s) => {
    if (!track) return undefined
    return s.customCovers[track.id] ?? track.artwork
  })
}

/** Non-reactive resolver for places that already have customCovers in hand. */
export function coverOf(track: Track, customCovers: Record<string, string>): string | undefined {
  return customCovers[track.id] ?? track.artwork
}
