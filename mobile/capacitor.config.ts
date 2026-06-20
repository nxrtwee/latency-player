import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor config for the iOS build. Consumed when the native project is
// created (`npx cap add ios`) and on each `npx cap sync`. webDir points at the
// Vite production build output (`npm run build:mobile` → mobile/dist).
//
// For background audio + lock-screen playback the iOS project also needs:
//   • Info.plist  → UIBackgroundModes = ["audio"]
//   • AppDelegate → AVAudioSession category .playback, setActive(true)
// (see ios-notes.md). Lock-screen transport is already driven from JS via the
// Media Session API (src/api/mediaSession.ts).
const config: CapacitorConfig = {
  appId: 'com.latency.app',
  appName: 'Latency',
  webDir: 'dist',
  ios: {
    // keep the WKWebView audible; the native AVAudioSession is configured in
    // AppDelegate (ios-notes.md)
    backgroundColor: '#07070c'
  }
  // For on-device live reload during development, point `server.url` at the
  // Windows dev machine's LAN IP, e.g.:
  // server: { url: 'http://192.168.1.50:5273', cleartext: true }
}

export default config
