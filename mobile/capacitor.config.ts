import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor config shared by the iOS and Android builds. Consumed when a native
// project is created (`npx cap add ios|android`) and on each `npx cap sync`.
// webDir points at the Vite production build output (`npm run build:mobile` →
// mobile/dist); appId/appName/webDir are shared across both platforms.
//
// For background audio + lock-screen playback the iOS project also needs:
//   • Info.plist  → UIBackgroundModes = ["audio"]
//   • AppDelegate → AVAudioSession category .playback, setActive(true)
// (see ios-notes.md). On Android the system WebView drives the media
// notification itself; the only native pieces are the manifest permissions
// applied by scripts/patch-android.sh (see android-notes.md). Lock-screen /
// notification transport is already driven from JS via the Media Session API
// (src/api/mediaSession.ts) on both platforms.
const config: CapacitorConfig = {
  appId: 'com.latency.app',
  appName: 'Latency',
  webDir: 'dist',
  ios: {
    // keep the WKWebView audible; the native AVAudioSession is configured in
    // AppDelegate (ios-notes.md)
    backgroundColor: '#07070c'
  },
  android: {
    // matches the app's dark background so there's no white flash before the
    // web layer paints; background audio comes from the WebView MediaSession +
    // manifest permissions (android-notes.md)
    backgroundColor: '#07070c'
  }
  // For on-device live reload during development, point `server.url` at the
  // Windows dev machine's LAN IP, e.g. (works for both platforms; Android
  // needs `cleartext: true` for the plain-http dev server):
  // server: { url: 'http://192.168.1.50:5273', cleartext: true }
}

export default config
