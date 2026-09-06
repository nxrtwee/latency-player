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
  /**
   * Per-track loudness makeup gain in dB (0 = untouched). On desktop and for
   * local files this rides a Web Audio gain node; on mobile cross-origin streams
   * it's a no-op (Web Audio can't tap them).
   */
  setNormalization: (db: number) => void
  /**
   * Crossfade gain 0..1, optionally ramped over `rampSec` seconds. Composed with
   * the user volume. Drives smooth track-to-track transitions.
   */
  setFade: (value: number, rampSec?: number) => void
  /**
   * Whether a second handle from this provider can play AT THE SAME TIME as this
   * one. Default (undefined) is yes — every `<audio>`-based path makes one element
   * per track.
   *
   * iOS is the exception: playback there is a single process-wide AVPlayer
   * (mobile/src/api/nativeAudio.ts), so a second handle does not add a voice, it
   * REPLACES the item on the one player — and tearing the old handle down pauses
   * the player the new track is now using. A `false` here tells the core to fade
   * out, switch, then fade in instead of overlapping the two.
   */
  canOverlap?: boolean
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
