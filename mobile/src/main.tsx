// Install the mobile window.api bridge BEFORE anything that might read it
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
import { initAccent } from './theme'
import './mobile.css'

// On a native device, mark <html> so the desktop-only phone-width centering in
// mobile.css is switched off and the app fills the whole screen. That centering
// is a dev affordance for wide desktop browsers; it misfires on large-screen
// devices (iPad, and low-density Android emulators that report a CSS viewport
// ≥ 520px wide), which would otherwise pin the UI to a narrow 430px column.
// Applies to both iOS and Android (any native platform). No-op in the browser.
const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
if (cap?.isNativePlatform?.()) document.documentElement.classList.add('cap-native')

// Apply the saved accent before the first paint so there's no colour flash.
initAccent()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MobileApp />
  </React.StrictMode>
)
