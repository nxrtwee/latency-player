// Capacitor native-storage plumbing, shared by the modules that keep files on the
// device: offline downloads (offline.ts) and imported local tracks (localfiles.ts).
//
// The plugins are reached through the global `Capacitor` bridge rather than a
// bundle import, so the web build (and the dev preview in a desktop browser) has
// no build-order coupling to the native plugins — `isNative()` is simply false
// there and every caller falls back to a browser-only path.

/** The subset of @capacitor/filesystem we use. */
export interface FilesystemPlugin {
  mkdir: (o: { path: string; directory: string; recursive?: boolean }) => Promise<void>
  deleteFile: (o: { path: string; directory: string }) => Promise<void>
  getUri: (o: { path: string; directory: string }) => Promise<{ uri: string }>
  stat: (o: { path: string; directory: string }) => Promise<{ size?: number }>
  // no encoding => data is the file's bytes as a base64 string, both ways
  readFile: (o: { path: string; directory: string }) => Promise<{ data: string }>
  writeFile: (o: {
    path: string
    directory: string
    data: string
    recursive?: boolean
  }) => Promise<{ uri: string }>
}

/** The subset of @capacitor/file-transfer we use (native streaming download). */
export interface FileTransferPlugin {
  // Downloads url -> an absolute file path (file:// from Filesystem.getUri),
  // streamed natively to disk, following redirects.
  downloadFile: (o: { url: string; path: string }) => Promise<{ path?: string }>
}

interface CapGlobal {
  isNativePlatform?: () => boolean
  convertFileSrc?: (uri: string) => string
  Plugins?: { Filesystem?: FilesystemPlugin; FileTransfer?: FileTransferPlugin }
}

/** Capacitor Directory.Data — private, app-scoped, survives restarts. */
export const DATA_DIR = 'DATA'

const cap = (): CapGlobal | undefined => (window as unknown as { Capacitor?: CapGlobal }).Capacitor

export const isNative = (): boolean => !!cap()?.isNativePlatform?.()
export const fsPlugin = (): FilesystemPlugin | undefined => cap()?.Plugins?.Filesystem
export const transferPlugin = (): FileTransferPlugin | undefined => cap()?.Plugins?.FileTransfer
export const convertSrc = (): ((uri: string) => string) | undefined => cap()?.convertFileSrc

/**
 * Biggest file we are willing to pull through the Capacitor bridge.
 *
 * `Filesystem.readFile` hands the bytes back as ONE base64 string, and on Android
 * that string is copied several times on its way out (Java String → JSON → the
 * `evaluateJavascript` payload → a JNI UTF-8 buffer) before JS ever sees it. For a
 * whole MP3 that is tens of megabytes of Java heap per read, and the WebView is
 * killed rather than throwing — which is why a downloaded track used to take the
 * app down with it, and kept doing it on every launch once the session was
 * restored onto that track. Media files must stream instead (`streamUrlFor`); this
 * cap only guards the last-resort fallback.
 */
export const MAX_BRIDGE_BYTES = 6 * 1024 * 1024

/**
 * A local-server URL (`https://localhost/_capacitor_file_/…`) turned back into the
 * `file://` URI it stands for; anything else is returned unchanged.
 *
 * That host only exists inside the WebView — nothing is listening on the port — so
 * code running OUTSIDE it (a native plugin loading a bitmap, say) has to be given
 * the plain file instead. This undoes the prefix swap convertFileSrc performs.
 */
export function toFileUri(url: string): string {
  const at = url.indexOf('/_capacitor_file_/')
  return at >= 0 ? `file://${url.slice(at + '/_capacitor_file_'.length)}` : url
}

/** Session cache for `streamUrlFor`: does the local server actually serve files? */
let serverServesFiles: boolean | null = null

/**
 * Can the page fetch this URL? A two-byte ranged GET, aborted as soon as the
 * headers land — enough to tell a working local file server from a dead one
 * without pulling the file into memory. 200 counts as well as 206: a server that
 * ignores `Range` still feeds `<audio>` fine (it just can't seek past the buffer).
 */
async function servesUrl(url: string): Promise<boolean> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 2500)
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-1' }, signal: ctl.signal })
    return res.ok || res.status === 206
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    ctl.abort()
  }
}

/**
 * A streamable http(s) URL for a file in app storage, or null.
 *
 * This is the way to play a local media file: Capacitor's own local server hands
 * the bytes straight to the WebView's media stack (range requests included) and
 * NOTHING crosses the JS bridge — see `MAX_BRIDGE_BYTES` for what happens when it
 * does. The URL is same-origin, so the Web Audio graph (equalizer, visualizer)
 * still attaches to it.
 *
 * The first call probes the server, because a `convertFileSrc` URL is silently
 * dead when there is none (that is what pushed offline playback onto the bridge in
 * the first place). The verdict is cached for the session; a missing file answers
 * 404 and returns null without poisoning it.
 */
export async function streamUrlFor(path: string): Promise<string | null> {
  const plugin = fsPlugin()
  const conv = convertSrc()
  if (!isNative() || !plugin || !conv) return null
  if (serverServesFiles === false) return null
  try {
    const { uri } = await plugin.getUri({ path, directory: DATA_DIR })
    const url = conv(uri)
    if (!/^https?:/i.test(url)) return null // custom scheme — fetch() can't judge it
    const ok = await servesUrl(url)
    if (!ok) {
      // Tell a broken server apart from a missing file: if a file we know exists
      // isn't served either, stop probing for the rest of the session.
      const st = await plugin.stat({ path, directory: DATA_DIR }).catch(() => null)
      if (st?.size) serverServesFiles = false
      return null
    }
    serverServesFiles = true
    return url
  } catch {
    return null
  }
}

/** base64 -> Blob (chunked to avoid building a huge argument list). */
export function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

/** Blob/File -> base64 (no data: prefix), for Filesystem.writeFile. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const s = String(fr.result || '')
      const comma = s.indexOf(',')
      resolve(comma >= 0 ? s.slice(comma + 1) : s)
    }
    fr.onerror = () => reject(fr.error || new Error('read failed'))
    fr.readAsDataURL(blob)
  })
}
