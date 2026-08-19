// nativeEq.ts — mirror the shared EQ state into the iOS native filter.
//
// On iOS every track (stream and offline alike) plays through a native AVPlayer, so
// the renderer's Web Audio EQ has nothing in its path — moving a slider would shape
// silence. The filtering therefore lives in the native audio tap (EqSettings +
// TapContext.applyEq in AppDelegate.swift) and this module is the wire: it pushes
// the current curve at startup and again on every change.
//
// Android/browser needs none of this — there the `<audio>` element really does run
// through the Web Audio graph (see scProvider/localProvider), so the shared EQ
// filters it directly. getNativeAudio() is null off iOS and installNativeEq() is a
// no-op.

import { getEqState, onEqChange } from '@renderer/audio/analyser'
import { getNativeAudio } from './nativeAudio'

export function installNativeEq(): void {
  const native = getNativeAudio()
  if (!native) return

  const push = (state: { gains: number[]; enabled: boolean }): void => {
    void native.setEq(state.gains, state.enabled)
  }

  // The tap reads the curve when it is created, so a track started later already
  // gets it; this initial push covers a tap that is already running (app resumed
  // mid-playback with a restored queue).
  push(getEqState())
  onEqChange(push)
}
