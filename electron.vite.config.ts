import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // music-metadata is ESM-only — bundle it into the CJS main output instead of
    // externalizing, otherwise require() of it fails at runtime.
    plugins: [externalizeDepsPlugin({ exclude: ['music-metadata'] })],
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // Pin to IPv4 — otherwise Vite may bind only on [::1] while Electron loads
    // http://localhost (IPv4) and gets ERR_CONNECTION_REFUSED.
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    plugins: [react()]
  }
})
