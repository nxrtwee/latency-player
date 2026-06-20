// Install the mobile window.api bridge BEFORE anything that might read it
// (the shared store/providers call window.api.*). Import order matters here.
import './api/shim'
// Override the 'local' provider with the mobile blob-based one (must run after
// the shared registry has registered the desktop default).
import './api/localProvider'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { MobileApp } from './MobileApp'
import { initAccent } from './theme'
import './mobile.css'

// Apply the saved accent before the first paint so there's no colour flash.
initAccent()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MobileApp />
  </React.StrictMode>
)
