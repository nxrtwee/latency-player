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
}

/** A navigable artist/creator profile. */
export interface Artist {
  id: string
  name: string
  provider: ProviderId
  avatar?: string
  followers?: number
  trackCount?: number
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
