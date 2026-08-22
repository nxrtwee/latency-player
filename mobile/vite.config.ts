import { cpSync, existsSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// Dev-only CORS escape hatch. The browser can't call api-v2.soundcloud.com (or
// scrape soundcloud.com for the client_id) directly — cross-origin. This
// middleware does the fetch server-side (Node), exactly like Electron's main
// process on desktop and CapacitorHttp will on-device. The client passes the
// real upstream URL via ?url= and any upstream headers via x-sc-headers (JSON).
//
// It also carries byte ranges, which is what makes the MP3-over-MediaSource
// feeder (mobile/src/api/mp3Mse.ts) testable in a desktop browser: `Range` goes
// upstream, and the upstream status, `Content-Range` and `Accept-Ranges` come back
// untouched. The entity size rides along as `x-upstream-length`, because
// `Content-Length` has to describe THIS response (a HEAD proxied through here has
// no body at all).
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
          if (typeof req.headers['range'] === 'string') headers.Range = req.headers['range']
          // Method/body passthrough — Yandex rotor feedback is POSTed. The caller
          // signals the upstream method via x-sc-method and streams the body.
          const method =
            (typeof req.headers['x-sc-method'] === 'string' && req.headers['x-sc-method']) || 'GET'
          let body: string | undefined
          if (method !== 'GET' && method !== 'HEAD') {
            body = await new Promise<string>((resolveBody) => {
              const chunks: Buffer[] = []
              req.on('data', (c) => chunks.push(c as Buffer))
              req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf-8')))
              req.on('error', () => resolveBody(''))
            })
          }
          const upstream = await fetch(target, { method, headers, body })
          const buf = Buffer.from(await upstream.arrayBuffer())
          res.statusCode = upstream.status
          const ct = upstream.headers.get('content-type')
          if (ct) res.setHeader('content-type', ct)
          for (const h of ['content-range', 'accept-ranges']) {
            const v = upstream.headers.get(h)
            if (v) res.setHeader(h, v)
          }
          const len = upstream.headers.get('content-length')
          if (len) res.setHeader('x-upstream-length', len)
          res.end(buf)
        } catch (e) {
          res.statusCode = 502
          res.end(String(e))
        }
      })
    }
  }
}

// Copies the bundled wallpaper pack (mobile/assets/wallpapers, 12 phone-res
// PNGs) into the build output, so `npx cap sync` carries it into the .apk / .ipa.
//
// Nothing in the app imports them: they used to feed a mobile-only preset picker
// that the desktop-parity revamp replaced, and they are kept in the package on
// purpose. A plain file copy — not an ESM import — is what makes that survive:
// Rollup drops an asset whose import result is never used, so an "unused"
// wallpapers.ts would quietly stop shipping them again.
function bundleWallpapers(): Plugin {
  const src = resolve(__dirname, 'assets/wallpapers')
  let outDir = resolve(__dirname, 'dist')
  return {
    name: 'bundle-wallpapers',
    apply: 'build',
    configResolved(config) {
      // build.outDir stays as written in the config ('dist' by default), so it
      // has to be resolved against the Vite root and not the caller's CWD —
      // `npm run build:mobile` runs from the repo root, one level up.
      outDir = resolve(config.root, config.build.outDir)
    },
    // closeBundle, not generateBundle: run after Vite has written (and possibly
    // emptied) outDir, otherwise the copy gets wiped.
    closeBundle() {
      if (!existsSync(src)) {
        this.warn(`wallpaper pack not found at ${src} — build ships without it`)
        return
      }
      cpSync(src, resolve(outDir, 'wallpapers'), { recursive: true })
      this.info(`bundled ${readdirSync(src).length} wallpapers`)
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
  plugins: [react(), scFetchProxy(), bundleWallpapers()],
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
