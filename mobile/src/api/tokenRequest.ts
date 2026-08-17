// A promise-based bridge between the `window.api` shim and a React sheet.
//
// Desktop signs into SoundCloud / Yandex through an Electron OAuth window, so
// `scLogin()` / `ymLogin()` resolve to a user all by themselves and the shared
// ProfilePage just awaits them. A phone has no such window (auto-capture needs a
// native WebView — see ios-notes / android-notes), so the user pastes a
// web-session token instead.
//
// Keeping that as a *request* means the shim can still implement the exact
// desktop contract — `scLogin(): Promise<Artist | null>` — and the shared
// ProfilePage / store flow (spinner via `scConnecting`, `scAuth: null` on
// cancel) works unchanged. The alternative, a mobile-only connect button, would
// have meant forking a desktop component.
//
// No React here on purpose: the shim is imported before React in main.tsx.

export type TokenService = 'sc' | 'ym'

export interface TokenRequest {
  service: TokenService
  /**
   * Applies the pasted text and reports whether it authenticated. The sheet
   * stays open (showing an error) while this returns false, so a typo doesn't
   * cost the user the whole flow. Implemented by the shim, which owns the
   * setToken/getMe pair and reverts a token that didn't work.
   */
  verify: (raw: string) => Promise<boolean>
  /** Resolves the requester: the accepted text, or null if dismissed. */
  resolve: (value: string | null) => void
}

let handler: ((req: TokenRequest) => void) | null = null

/** Called by <TokenSheet /> on mount; passing null on unmount. */
export function setTokenPromptHandler(h: ((req: TokenRequest) => void) | null): void {
  handler = h
}

/**
 * Ask the user for a token. Resolves null when no sheet is mounted, which makes
 * the connect button a no-op rather than a hang.
 */
export function requestToken(
  service: TokenService,
  verify: (raw: string) => Promise<boolean>
): Promise<string | null> {
  const h = handler
  if (!h) return Promise.resolve(null)
  return new Promise<string | null>((resolve) => h({ service, verify, resolve }))
}
