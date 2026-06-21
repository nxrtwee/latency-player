// Status bar: make the WKWebView draw edge-to-edge under the status bar and use
// light text on our dark UI. The user reported a black strip behind the clock —
// that happens when the web view sits below the status bar instead of under it.
//
// Uses the global Capacitor bridge (window.Capacitor.Plugins.StatusBar) so the
// web bundle needs no @capacitor/status-bar import; the native plugin is added
// via mobile/package.json and registered by `cap sync`. No-op in the browser.
export function installStatusBar(): void {
  const cap = (window as unknown as { Capacitor?: any }).Capacitor
  if (!cap?.isNativePlatform?.()) return
  const sb = cap.Plugins?.StatusBar
  if (!sb) return
  try {
    // draw web content under the status bar (edge-to-edge)
    sb.setOverlaysWebView?.({ overlay: true })
    // 'DARK' = light glyphs, for our dark background
    sb.setStyle?.({ style: 'DARK' })
  } catch {
    /* plugin missing / older runtime — ignore */
  }
}
