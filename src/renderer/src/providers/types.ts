import type { ProviderId, Track } from '@shared/types'

/** Events a provider reports back to the player core during playback. */
export interface PlaybackCallbacks {
  onTime: (sec: number) => void
  onDuration: (sec: number) => void
  onPlayingChange: (playing: boolean) => void
  onEnded: () => void
  onError: (message: string) => void
}

/**
 * A live playback session for one track. The provider fully owns how the audio
 * is produced — `<audio>` for local files, the Spotify Web Playback SDK, a
 * YouTube iframe, etc. The core only speaks this interface.
 */
export interface PlaybackHandle {
  play: () => void
  pause: () => void
  seek: (sec: number) => void
  setVolume: (volume: number) => void
  /** Tear down resources (detach elements, stop network, etc.). */
  destroy: () => void
}

/**
 * A playback source. Adding SoundCloud/Spotify/YouTube later means implementing
 * this interface and registering it — nothing in the core changes.
 */
export interface PlaybackProvider {
  readonly id: ProviderId
  readonly name: string
  createPlayback: (track: Track, callbacks: PlaybackCallbacks) => PlaybackHandle
}
