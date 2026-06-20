# Latency — mobile (iOS via Capacitor)

Mobile target. Reuses the desktop renderer sources (`../src/renderer/src`,
`../src/shared`) and reimplements the native `window.api` bridge for phones.
The desktop Electron build is untouched.

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
