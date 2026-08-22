// Ranged HTTP reads that are not subject to browser CORS, for the MP3-over-MSE
// player in mp3Mse.ts.
//
// Why this exists: the Yandex CDN sends no Access-Control-Allow-Origin, so an
// <audio> element pointed straight at it is cross-origin-tainted and the Web Audio
// graph answers with silence (see graphAudio.ts) — no equalizer, no normalization,
// no real visualizer on Android. Feeding the same bytes into a MediaSource fixes
// that (a MediaSource is same-origin by construction), but then WE have to do the
// fetching, and a plain fetch() hits the same CORS wall the element did.
//
// Two ways out, matching the rest of this folder:
//   • on device — CapacitorHttp, a real native request with no CORS notion at all
//     (the same door yandex.ts/soundcloud.ts use for the API).
//   • in browser dev — the Vite /__scfetch middleware, which fetches server-side
//     and forwards Range/Content-Range (see mobile/vite.config.ts).
//
// Everything here is a RANGE request, on purpose. The native bridge hands a
// response body to JS as one base64 string, and a whole media file that way is
// what used to kill the Android WebView (capfs.MAX_BRIDGE_BYTES tells that story),
// so a caller must never be able to pull an unbounded body: probeRanges() refuses
// to go on until the server has proved it honours a window (a HEAD that carries a
// Range — no body either way), and every read after it is capped by the window the
// caller asks for.

import { isNative } from './capfs'

/** One ranged read: the bytes, and the file's total size when the server says so. */
export interface RangeResult {
  /** Backed by a plain ArrayBuffer, so it can be appended to a SourceBuffer. */
  bytes: Uint8Array<ArrayBuffer>
  /** Total entity size from Content-Range, or null when it wasn't parseable. */
  total: number | null
  /** Response status — 206 for a real partial response. */
  status: number
}

interface CapHttpPlugin {
  request: (o: {
    url: string
    method: string
    headers?: Record<string, string>
    responseType?: string
    readTimeout?: number
    connectTimeout?: number
  }) => Promise<{ data: unknown; status: number; headers?: Record<string, string> }>
}

function httpPlugin(): CapHttpPlugin | undefined {
  const cap = (window as unknown as { Capacitor?: { Plugins?: { CapacitorHttp?: CapHttpPlugin } } })
    .Capacitor
  return cap?.Plugins?.CapacitorHttp
}

/** Case-insensitive header lookup — Android and the dev proxy differ in casing. */
function header(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined
  const want = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === want) return headers[key]
  }
  return undefined
}

/** Total size out of `Content-Range: bytes 0-511/1048576`. */
function totalFromContentRange(value: string | undefined): number | null {
  const m = (value || '').match(/\/\s*(\d+)\s*$/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** base64 -> bytes. Same shape as capfs.base64ToBlob, without the Blob wrapper. */
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** The dev-only same-origin tunnel; a no-op path on device. */
const proxyUrl = (url: string): string => '/__scfetch?url=' + encodeURIComponent(url)

/**
 * Turn a HEAD-with-Range answer into a verdict. A 206 is the proof itself — the
 * server honoured the window, and Content-Range carries the entity size. A 200
 * only counts when it advertises `Accept-Ranges: bytes`, because a server that
 * ignores Range replies exactly the same way and would hand a GET the whole file.
 */
function rangeVerdict(
  status: number,
  contentRange: string | undefined,
  acceptRanges: string | undefined,
  contentLength: string | undefined
): { total: number } | null {
  if (status === 206) {
    const total = totalFromContentRange(contentRange)
    return total ? { total } : null
  }
  if (status < 200 || status >= 300) return null
  if ((acceptRanges || '').toLowerCase().indexOf('bytes') < 0) return null
  const total = Number(contentLength)
  return Number.isFinite(total) && total > 0 ? { total } : null
}

/**
 * Does this URL support byte ranges, and how big is it? The answer has to be known
 * BEFORE any GET: a server that ignores Range would reply with the whole file, and
 * on Android that body crosses the JS bridge as a single base64 string and takes
 * the WebView with it.
 *
 * So the question is asked with a HEAD that itself carries a Range — no body comes
 * back either way, and a 206 settles it without having to trust `Accept-Ranges` to
 * be advertised.
 *
 * Returns null when ranges aren't confirmed, the size is unknown, or the request
 * fails — every one of which means "don't stream this yourself".
 */
export async function probeRanges(url: string): Promise<{ total: number } | null> {
  const probe = 'bytes=0-1'
  try {
    const plugin = httpPlugin()
    if (isNative() && plugin) {
      const res = await plugin.request({
        url,
        method: 'HEAD',
        headers: { Range: probe },
        responseType: 'text',
        connectTimeout: 8000,
        readTimeout: 8000
      })
      return rangeVerdict(
        res.status,
        header(res.headers, 'content-range'),
        header(res.headers, 'accept-ranges'),
        header(res.headers, 'content-length')
      )
    }
    const res = await fetch(proxyUrl(url), { headers: { 'x-sc-method': 'HEAD', range: probe } })
    return rangeVerdict(
      res.status,
      res.headers.get('content-range') || undefined,
      res.headers.get('accept-ranges') || undefined,
      res.headers.get('x-upstream-length') || res.headers.get('content-length') || undefined
    )
  } catch {
    return null
  }
}

/**
 * Read `[start, end]` inclusive. Rejects anything that isn't a 206: a 200 means
 * the server served the whole file instead of the window we asked for, and the
 * caller must stop rather than keep pulling entire files through the bridge.
 */
export async function fetchRange(url: string, start: number, end: number): Promise<RangeResult> {
  const range = `bytes=${start}-${end}`
  const plugin = httpPlugin()
  if (isNative() && plugin) {
    const res = await plugin.request({
      url,
      method: 'GET',
      headers: { Range: range },
      responseType: 'arraybuffer', // native answers with base64 in `data`
      connectTimeout: 10000,
      readTimeout: 20000
    })
    if (res.status !== 206) throw new Error(`range request answered ${res.status}`)
    const data = res.data
    const bytes =
      typeof data === 'string'
        ? base64ToBytes(data)
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : null
    if (!bytes) throw new Error('range request returned no bytes')
    return { bytes, total: totalFromContentRange(header(res.headers, 'content-range')), status: 206 }
  }
  const res = await fetch(proxyUrl(url), { headers: { range } })
  if (res.status !== 206) throw new Error(`range request answered ${res.status}`)
  const buf = await res.arrayBuffer()
  return {
    bytes: new Uint8Array(buf),
    total: totalFromContentRange(res.headers.get('content-range') || undefined),
    status: 206
  }
}
