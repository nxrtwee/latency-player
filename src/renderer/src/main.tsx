import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'
import './skin-nextgen.css'
import './skin-postgen.css'
// Loaded last so [data-graphics] performance overrides win by source order.
import './perf.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
