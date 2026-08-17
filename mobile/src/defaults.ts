// One-time mobile seeding + migration of the SHARED store's localStorage keys.
//
// The phone shell now renders the desktop UI, so it also uses the desktop's
// persisted prefs (`lp.*`) instead of the old mobile-only ones (`lp.m.*`). This
// module must be imported BEFORE anything that pulls in @renderer/store: the
// store reads every key below once, at module evaluation, inside its initial
// state (see store.ts's `lp.theme` / `lp.visual` / `lp.playerBarH` reads).
// main.tsx enforces that order.

/** Write only if the key was never set, so a user's own choice always wins. */
function seed(key: string, value: string): void {
  try {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
  } catch {
    /* private mode — the store falls back to its own defaults */
  }
}

try {
  // The store derives its initial volume from Number(localStorage['lp.volume']),
  // and Number(null) === 0 passes its 0..1 range check — a fresh install would
  // start silent, with no volume slider on the phone to recover with.
  seed('lp.volume', '0.85')

  // The app shipped in Russian; the store's own default is 'en'.
  seed('lp.lang', 'ru')

  // The phone look is the desktop's nextgen skin + Universal visual (the store
  // already defaults skin to nextgen; visual defaults to 'default'). Seeded, not
  // forced: Settings can still switch either one.
  seed('lp.visual', 'universal')

  // The player bar's height is a desktop percentage pref (default 100). At >72
  // nextgen swaps the seek row for a 96-bar waveform (PlayerBar's `compactSeek`),
  // which on a phone is both unseekable and a pointless GPU cost — pin it low so
  // the capsule gets the real slider.
  seed('lp.playerBarH', '64')

  // --- migrations from the pre-rewrite mobile shell ---------------------------
  // Accent: the old mobile theme.ts wrote the 4 accent variables straight onto
  // <html> and persisted its own {id, accent, accent2}. The desktop drives the
  // accent through the store instead (theme='custom' + --accent, with --accent-2
  // / --accent-soft / --accent-ink derived in CSS via color-mix), so carry the
  // chosen colour over once and let the store own it from then on.
  const legacyAccent = localStorage.getItem('lp.m.accent')
  if (legacyAccent && localStorage.getItem('lp.customAccent') === null) {
    const { accent } = JSON.parse(legacyAccent) as { accent?: string }
    if (accent && /^#[0-9a-f]{3,8}$/i.test(accent)) {
      localStorage.setItem('lp.customAccent', accent)
      localStorage.setItem('lp.theme', 'custom')
    }
    localStorage.removeItem('lp.m.accent')
  }

  // Wallpaper: same image, different key (the store's `customBg` + framing).
  const legacyBg = localStorage.getItem('lp.m.bg')
  if (legacyBg && localStorage.getItem('lp.bg') === null) {
    localStorage.setItem('lp.bg', legacyBg)
    localStorage.setItem('lp.bgKind', 'image')
    try {
      const raw = localStorage.getItem('lp.m.bg.frame')
      if (raw) {
        const f = JSON.parse(raw) as { posX?: number; posY?: number; zoom?: number }
        if (Number.isFinite(f.posX)) localStorage.setItem('lp.bgPosX', String(f.posX))
        if (Number.isFinite(f.posY)) localStorage.setItem('lp.bgPosY', String(f.posY))
        if (Number.isFinite(f.zoom)) localStorage.setItem('lp.bgZoom', String(f.zoom))
      }
    } catch {
      /* keep the image, drop the framing */
    }
    // The data: URL is big (often >1MB of the quota) — don't keep two copies.
    localStorage.removeItem('lp.m.bg')
    localStorage.removeItem('lp.m.bg.frame')
  }
} catch {
  /* any storage failure just means defaults apply */
}
