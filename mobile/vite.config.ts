import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// Dev-only CORS escape hatch. The browser can't call api-v2.soundcloud.com (or
// scrape soundcloud.com for the client_id) directly — cross-origin. This
// middleware does the fetch server-side (Node), exactly like Electron's main
// process on desktop and CapacitorHttp will on-device. The client passes the
// real upstream URL via ?url= and any upstream headers via x-sc-headers (JSON).
function scFetchProxy(): Plugin {
  return {
    name: 'sc-fetch-proxy',
    configureServer(server) {
      server.middlewares.use('/__scfetch', async (req, res) => {
        try {
          const u = new URL(req.url || '', 'http://localhost')
          const target = u.searchParams.get('url')
          if (!target) {
            res.statusCode = 400
            res.end('missing url')
            return
          }
          const headers: Record<string, string> = { 'User-Agent': UA }
          const passed = req.headers['x-sc-headers']
          if (typeof passed === 'string') {
            try {
              Object.assign(headers, JSON.parse(passed))
            } catch {
              /* ignore malformed */
            }
          }
          const upstream = await fetch(target, { headers })
          const buf = Buffer.from(await upstream.arrayBuffer())
          res.statusCode = upstream.status
          const ct = upstream.headers.get('content-type')
          if (ct) res.setHeader('content-type', ct)
          res.end(buf)
        } catch (e) {
          res.statusCode = 502
          res.end(String(e))
        }
      })
    }
  }
}

// Mobile target. Runs on the already-installed Vite (no extra npm install needed
// for browser dev), so the Electron toolchain stays untouched. Reuses the
// desktop renderer sources via the same @renderer / @shared aliases.
//
// Dev on Windows:  npm run dev:mobile   ->  http://127.0.0.1:5273
// Open Chrome DevTools -> device toolbar -> iPhone to preview the phone layout.
export default defineConfig({
  root: resolve(__dirname),
  base: './',
  plugins: [react(), scFetchProxy()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, '../src/renderer/src'),
      '@shared': resolve(__dirname, '../src/shared'),
      '@mobile': resolve(__dirname, 'src')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: true,
    // Allow importing shared sources that live outside this folder.
    fs: { allow: [resolve(__dirname, '..')] }
  }
})
