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
pick an iPhone. The whole UI + SoundCloud/Yandex logic is developed and debugged
here, with live reload, exactly like the desktop renderer.

Preview at a phone viewport, not a wide window: the phone chrome (capsule, tab
bar, drawer) is `position: fixed` against the viewport, so it can't be corralled
into a centred phone-width column the way the old shell was.

```bash
npm run typecheck:mobile   # tsc over mobile/src + every desktop source it reuses
npm run build:mobile       # → mobile/dist (what Capacitor syncs)
```

## Status

- **Step 1 (done):** Capacitor target scaffold, mobile shell, `window.api` shim.
- **Step 2 (done):** real SoundCloud + Yandex Music via dev proxy (browser) /
  CapacitorHttp (device), wired to the shared zustand store.
- **Step 3 (done):** native background audio + lock-screen controls.
- **Step 4 (done):** `.ipa` via GitHub Actions (cloud macOS) + sideload from
  Windows (AltStore / Sideloadly).
- **Step 5 (Android, done):** same web bundle on Android via Capacitor — manifest
  permissions + icon via `scripts/patch-android.sh`; debug `.apk` built on a
  Linux GitHub Actions runner (`.github/workflows/android.yml`), installs
  directly on any phone (no Mac, no signing secrets, no 7-day limit). The
  WebView's native Media Session drives the notification, so Android needs less
  native code than iOS — see `android-notes.md`.
- **Step 6 (current): desktop-parity visual.** The bespoke phone screens are
  gone. The phone now renders the *desktop* components and the desktop DOM
  (nextgen skin + universal visual), and `src/portrait.css` — loaded last, every
  rule scoped to `html.m` — is the entire phone adaptation. Adding a screen means
  adding it on the desktop; the phone gets it for free.

## Layout

```
mobile/
  index.html            entry (viewport-fit=cover)
  vite.config.ts        runs on the already-installed Vite; @renderer/@shared aliases
  src/
    main.tsx            shim → prefs → provider overrides → desktop CSS → portrait.css
    defaults.ts         seeds/migrates the shared store's localStorage prefs
    MobileApp.tsx       desktop DOM + the desktop page router, plus phone chrome
    portrait.css        THE phone adaptation — the only place a mobile-only rule lives
    shell/              phone-only chrome: TopBar, Drawer, BottomTabs, PlayerDock,
                        TokenSheet (paste-a-token sign-in; desktop uses an OAuth window)
    api/shim.ts         mobile window.api (same interface as ../src/preload)
    api/                soundcloud, yandex, lyrics, offline, mediaSession, …
```

Everything else — pages, lists, settings, fullscreen player, karaoke — is
imported from `../src/renderer/src` unchanged.
