# iOS native setup (Step 4–5)

The mobile app is web-first; these are the only native pieces needed, and they
land when the iOS project is created. Everything else (UI, SoundCloud, local
files, lock-screen transport via Media Session) already runs in the WebView.

## 1. Create the Capacitor iOS project (done once, on a Mac / CI)

```bash
cd mobile
npm i -D @capacitor/cli @capacitor/core @capacitor/ios   # dev deps; safe — separate from Electron
npm run build:mobile          # → mobile/dist  (what Capacitor ships)
npx cap add ios               # scaffolds mobile/ios (commit it)
npx cap sync ios
```

`capacitor.config.ts` is already present (appId `com.latency.app`, webDir `dist`).

## 2. Background audio — Info.plist

Add to `mobile/ios/App/App/Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>
```

Without this, WKWebView audio stops the moment the screen locks / app backgrounds.

## 3. Background audio — AVAudioSession (AppDelegate)

In `mobile/ios/App/App/AppDelegate.swift`, inside
`application(_:didFinishLaunchingWithOptions:)`:

```swift
import AVFoundation
// ...
do {
  try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
  try AVAudioSession.sharedInstance().setActive(true)
} catch {
  print("AVAudioSession error: \(error)")
}
```

`.playback` keeps audio going when the device is muted/locked and is what makes
the Media Session lock-screen controls authoritative.

## 4. Safe area

`viewport-fit=cover` is set in `index.html`; the CSS already pads with
`env(safe-area-inset-*)`. The notch / Dynamic Island is handled automatically on
device (it is NOT simulated in a desktop browser — that's expected).

## 5. SoundCloud on device — already handled

`src/api/soundcloud.ts` `scFetch()` auto-detects the platform: on device it uses
`CapacitorHttp` (native request, no CORS); in browser dev it uses the `/__scfetch`
Vite proxy. No code change needed — just ensure `@capacitor/core` is installed
(it provides the `CapacitorHttp` plugin / `window.Capacitor` global).

## 6. SoundCloud sign-in (personal mixes / likes) — native only

Public search/stream/artist/related already work (unauthenticated client_id).
Personal content (real mixes, your likes) needs the user's OAuth token, which the
desktop captures via Electron `session.webRequest.onBeforeSendHeaders` on an
in-app sign-in window. A WebView/browser **cannot** read it (cross-origin).

On iOS this requires a native WKWebView that intercepts requests to
`api-v2.soundcloud.com` and reads the `Authorization: OAuth …` header — i.e. a
small custom Capacitor plugin (WKWebView + `WKNavigationDelegate` /
`WKURLSchemeHandler`), since `@capacitor/browser` only opens the system browser
(no header access). Plan:
1. Plugin `scLogin()` opens a WKWebView at `soundcloud.com/signin`.
2. Sniff the OAuth token from outgoing api-v2 request headers; resolve it to JS.
3. Store it; mobile `scFetch` adds `Authorization: OAuth <token>` (CapacitorHttp).
4. The shim's `scLogin/scMe/scMyLikes/scPersonalMixes` (currently stubs) call it.

Until then the SoundCloud account section shows "Sign-in soon (needs native)".
Gray-area, on-device only — same stance as desktop.

## 7. Build the .ipa without a local Mac (Step 5)

Use a GitHub Actions macOS runner: checkout → `npm ci` in `mobile/` →
`npm run build:mobile` → `npx cap sync ios` → `xcodebuild` archive/export with a
free Apple ID signing cert. Install on the iPhone from Windows via AltStore /
Sideloadly (re-sign every 7 days on a free account).
