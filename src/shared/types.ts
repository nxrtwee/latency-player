// Types shared between the main and renderer processes.

/** Identifier of a playback source. Each maps to a PlaybackProvider in the renderer. */
export type ProviderId = 'local' | 'soundcloud' | 'yandex'

/**
 * A track is provider-agnostic metadata plus a `uri` the owning provider knows
 * how to play. For local files the uri is a `media://` URL; future providers
 * (SoundCloud, etc.) put their own locator there.
 */
export interface Track {
  id: string
  providerId: ProviderId
  uri: string
  title: string
  artist?: string
  /** provider artist/user id, when navigable (e.g. SoundCloud user id) */
  artistId?: string
  /**
   * All credited artists with navigable ids, when the source lists more than one
   * (e.g. Yandex tracks with features). `artist`/`artistId` stay as the joined
   * display string + first id for back-compat; this lets the UI open any of them.
   */
  artists?: { id?: string; name: string }[]
  album?: string
  durationSec?: number
  /** data URL of embedded cover art, if extracted */
  artwork?: string
  /** total play count, when the source exposes it (SoundCloud `playback_count`) */
  playCount?: number
}

/** A navigable artist/creator profile. */
export interface Artist {
  id: string
  name: string
  provider: ProviderId
  avatar?: string
  /** SoundCloud followers count */
  followers?: number
  /** Yandex Music monthly listeners (`stats.lastMonthListeners`) */
  monthlyListeners?: number
  trackCount?: number
}

/** A navigable album or playlist/set. `id` is the bare provider id (for Yandex
 *  playlists it's `ownerUid:kind`). */
export interface Album {
  id: string
  provider: ProviderId
  title: string
  artist?: string
  cover?: string
  year?: number
  trackCount?: number
  /** album (default) or a user/editorial playlist — changes the page label + fetch */
  kind?: 'album' | 'playlist'
}

/** Persisted library state owned by the main process. */
export interface LibraryState {
  folders: string[]
  tracks: Track[]
}

/** A user playlist. Stores full tracks so SoundCloud entries stay playable. */
export interface Playlist {
  id: string
  name: string
  tracks: Track[]
}
