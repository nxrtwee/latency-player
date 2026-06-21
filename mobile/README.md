# Latency — mobile (iOS + Android via Capacitor)

Mobile target. Reuses the desktop renderer sources (`../src/renderer/src`,
`../src/shared`) and reimplements the native `window.api` bridge for phones.
The desktop Electron build is untouched.

The same web bundle ships to both platforms; the only per-platform pieces are
the scripted native patches (`scripts/patch-ios.sh`, `scripts/patch-android.sh`)
and the CI workflows. See `ios-notes.md` and `android-notes.md`.

## Dev (Windows — no Mac needed)

```bash
npm run dev:mobile        # → http://127.0.0.1:5273
```

Open in Chrome → DevTools (F12) → toggle the **device toolbar** (Ctrl+Shift+M) →
pick an iPhone. The whole UI + (later) SoundCloud logic is developed and
debugged here, with live reload, exactly like the desktop renderer.

On a wide desktop window the app is capped to a phone-width column and centered.

## Status

- **Step 1 (done):** Capacitor target scaffold, mobile shell — bottom tab bar
  (Главная / Поиск / Библиотека / Профиль), mini-player, screens styled to the
  concept. `window.api` shim: SoundCloud stubbed; likes/playlists in
  `localStorage`; window-chrome no-ops.
- **Step 2:** real SoundCloud via dev proxy (browser) / CapacitorHttp (device);
  wire screens to the shared zustand store.
- **Step 3:** full screen redesign per concept (incl. fullscreen player).
- **Step 4:** native background audio + lock-screen controls.
- **Step 5:** `.ipa` via GitHub Actions (cloud macOS) + sideload from Windows
  (AltStore / Sideloadly).
- **Step 6 (Android):** same web bundle on Android via Capacitor — manifest
  permissions + icon via `scripts/patch-android.sh`; debug `.apk` built on a
  Linux GitHub Actions runner (`.github/workflows/android.yml`), installs
  directly on any phone (no Mac, no signing secrets, no 7-day limit). The
  WebView's native Media Session drives the notification, so Android needs less
  native code than iOS — see `android-notes.md`.

## Layout

```
mobile/
  index.html            entry
  vite.config.ts        runs on the already-installed Vite; @renderer/@shared aliases
  src/
    main.tsx            installs window.api shim, mounts MobileApp
    MobileApp.tsx       shell: screen stack + mini-player + tab bar
    mobile.css          concept theme (dark + magenta)
    api/shim.ts         mobile window.api (stubs + localStorage)
    components/         TabBar, MiniPlayer
    screens/           Home, Search, Library, Profile
```
