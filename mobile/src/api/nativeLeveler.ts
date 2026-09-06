// nativeLeveler.ts — mirror the loudness-leveling config into the iOS native chain.
//
// Same reason nativeEq.ts exists: on iOS every track plays through a native AVPlayer,
// so the renderer's Web Audio leveler (audio/leveler.ts) has nothing in its path. The
// AGC, compressor and limiter therefore live in the audio tap (LevelerSettings +
// Leveler in AppDelegate.swift), and this module is the wire — it pushes the config at
// startup and on every change.
//
// Android/browser needs none of this: there the `<audio>` element really does run
// through the graph, so the shared leveler processes it directly. getNativeAudio() is
// null off iOS, which makes installNativeLeveler() a no-op.

import { getLevelerConfig, onLevelerChange, type LevelerConfig } from '@renderer/audio/analyser'
import { getNativeAudio } from './nativeAudio'

export function installNativeLeveler(): void {
  const native = getNativeAudio()
  if (!native) return

  const push = (cfg: LevelerConfig): void => {
    void native.setLeveler(cfg.enabled, cfg.targetLufs, cfg.strength)
  }

  // The tap reads the config on every buffer, so a track that starts later is already
  // covered; this first push is for a tap that is running right now (app resumed
  // mid-playback with a restored queue).
  push(getLevelerConfig())
  onLevelerChange(push)
}
