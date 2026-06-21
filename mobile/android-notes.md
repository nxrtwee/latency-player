# Android native setup

The mobile app is web-first; like iOS, only a few native pieces are needed, and
they land when the Android project is created. Everything else (UI, SoundCloud,
local files, lock-screen/notification transport via Media Session) already runs
in the WebView, unchanged from the iOS target.

Android actually needs **less** native glue than iOS — see §3.

## 1. Create the Capacitor Android project (regenerated in CI)

```bash
cd mobile
npm i -D @capacitor/cli @capacitor/core @capacitor/android   # dev deps; separate from Electron
npm run build:mobile          # → mobile/dist  (what Capacitor ships)
npx cap add android           # scaffolds mobile/android (NOT committed — see ../.gitignore)
npx cap sync android
```

`capacitor.config.ts` is shared with iOS (appId `com.latency.app`, webDir `dist`,
plus an `android` section). The `mobile/android/` project is regenerated on every
CI run, so the native tweaks below are scripted in `scripts/patch-android.sh`.

## 2. Background audio + media notification — manifest permissions

`scripts/patch-android.sh` adds these to
`mobile/android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

(`INTERNET` is already in the Capacitor template.) `POST_NOTIFICATIONS` is the
Android 13+ runtime permission for the media notification.

## 3. Why no MainActivity / native transport code (unlike iOS)

The Android **System WebView implements the Media Session API natively**: when
the page sets `navigator.mediaSession` metadata + action handlers (already done
in `src/api/mediaSession.ts`), the WebView shows a media notification with
artwork and the transport buttons, and keeps audio playing in the background.

So, in contrast to iOS:
- No `AVAudioSession`-equivalent setup is required.
- No native ±10s-skip suppression timer (the iOS `AppDelegate.swift` trick): the
  notification shows exactly the actions JS registers — play/pause + prev/next,
  and intentionally **no** seek handler — so prev/next track buttons appear, not
  the ±10s skip buttons.

⚠️ **Verify on a real device** (the one thing that needs hardware): play a track,
lock the screen / background the app, and confirm audio keeps going and the
notification shows prev/next. If the OS suspends background audio on some
device/OEM, the fallback is a small native foreground service (a `Service` with
`startForeground` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`), added as a follow-up.
Start with the minimal manifest-only approach.

## 4. App icon

`scripts/patch-android.sh` resizes `mobile/assets/appicon-source.png` into the
`res/mipmap-*` launcher icons (legacy square/round) and the adaptive-icon
foreground layer (logo padded into the safe zone so the system mask doesn't clip
it), and tints the adaptive background to the app's dark color (`#07070c`).
ImageMagick (`convert`) ships on the CI runner. Missing tool/source → keep the
default Capacitor icon (non-fatal), same stance as `patch-ios.sh`.

## 5. Safe area / edge-to-edge

`viewport-fit=cover` (index.html) + `env(safe-area-inset-*)` CSS handle the
status-bar / gesture areas on device. The `@capacitor/status-bar` plugin
(`src/api/statusBar.ts`) draws the web layer under the status bar with light
glyphs — identical to iOS, no Android-specific code.

## 6. SoundCloud on device — already handled

`src/api/soundcloud.ts` `scFetch()` (and `lyrics.ts`) auto-detect the platform:
on device they use `CapacitorHttp` (native request, no CORS); in browser dev they
use the `/__scfetch` Vite proxy. This is platform-agnostic — works on Android
exactly as on iOS, no code change.

## 7. SoundCloud sign-in (personal mixes / likes) — native only, still "soon"

Same status as iOS (`ios-notes.md` §6): public search/stream/artist/related work
unauthenticated. Personal content needs the user's OAuth token, which a plain
WebView can't read cross-origin. On Android this would be a small custom
Capacitor plugin using a native `WebView` + `WebViewClient.shouldInterceptRequest`
(or `onLoadResource`) to sniff the `Authorization: OAuth …` header off outgoing
`api-v2.soundcloud.com` requests, then hand it to JS (mirrors the iOS WKWebView
plan). Until then the account section shows "Sign-in soon (needs native)".
Gray-area, on-device only — same stance as desktop/iOS.

## 8. Build the .apk without Android Studio

GitHub Actions Linux runner (`.github/workflows/android.yml`): checkout →
`npm ci` (root) → `npm run build:mobile` → `npm ci` in `mobile/` →
`npx cap add android` + `npx cap sync android` → `bash scripts/patch-android.sh`
→ `./gradlew assembleDebug`. The result is `app-debug.apk`, debug-signed by
Gradle's auto keystore. Download it from the run's artifacts and install on the
phone (enable "install from unknown sources"). No Mac, no signing secrets, and
no 7-day re-sign limit (that constraint was iOS-only).
