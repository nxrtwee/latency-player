// Volume normalization helper, shared between desktop and mobile.
//
// Given a track's integrated loudness (LUFS) and optional true peak, compute a
// makeup gain in dB that brings the track to a common target loudness — the same
// idea as ReplayGain. The gain is clamped to a sane range and, when a true peak
// is known, reduced so applying it can never push the signal past 0 dBFS
// (clipping). Tracks without loudness data get 0 dB (left untouched).

/** Default target integrated loudness. -14 LUFS matches most streaming services. */
export const DEFAULT_TARGET_LUFS = -14

/** Never boost/cut by more than this — avoids wild swings on odd metadata. */
const MAX_GAIN_DB = 12

const linToDb = (lin: number): number => 20 * Math.log10(lin)

/**
 * Makeup gain in dB to bring `lufs` to `target`, headroom-limited by `peak`.
 * Returns 0 when loudness is unknown/invalid.
 */
export function makeupGainDb(
  lufs: number | undefined,
  peak: number | undefined,
  target: number = DEFAULT_TARGET_LUFS
): number {
  if (lufs == null || !Number.isFinite(lufs)) return 0
  let gain = target - lufs
  // Don't let the gain drive the true peak above 0 dBFS.
  if (peak != null && Number.isFinite(peak) && peak > 0) {
    const headroomDb = -linToDb(peak) // dB of room before clipping
    gain = Math.min(gain, headroomDb)
  }
  return Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, gain))
}

/** Convert a dB gain to a linear multiplier for a Web Audio GainNode. */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20)
}
