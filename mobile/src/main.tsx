// Seed / migrate the shared store's localStorage prefs FIRST. The store reads
// every pref once, at module evaluation, and it is pulled in transitively by the
// shim (api/resolveCache imports it) — so anything that writes a default has to
// run before the shim, not after it.
import './defaults'
// Install the mobile window.api bridge before anything that might read it
// (the shared store/providers call window.api.*). Import order matters here.
import './api/shim'
// Override the streaming providers with mobile builds (must run after the shared
// registry has registered the desktop defaults). The desktop providers route
// audio through the Electron media:// proxy (for the EQ); that scheme doesn't
// exist on mobile, so these play the resolved CDN/blob URL directly.
import './api/localProvider'
import './api/scProvider'
import './api/ymProvider'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { MobileApp } from './MobileApp'

// The phone renders the DESKTOP stylesheets, in the desktop's own load order
// (later sheets override earlier ones by source order, not specificity), and
// then portrait.css LAST — that file is the entire phone adaptation and the only
// place a mobile-specific rule may live. See its header for the `html.m` scoping
// contract.
import '@renderer/styles.css'
import '@renderer/skin-nextgen.css'
import '@renderer/visual-universal.css'
import '@renderer/perf.css'
import './portrait.css'

// Marks the bundle as the phone one. Every portrait.css rule is scoped to it, so
// the class must be on <html> before the first paint.
document.documentElement.classList.add('m')

// Native-only marker. The old shell used it to switch off a dev-time phone-width
// centering; the portrait layer has no such affordance (the fixed chrome would
// escape the column anyway — preview at a phone viewport instead), but the flag
// stays because it's the only way CSS can tell a device from a dev browser.
const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
if (cap?.isNativePlatform?.()) document.documentElement.classList.add('cap-native')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MobileApp />
  </React.StrictMode>
)
