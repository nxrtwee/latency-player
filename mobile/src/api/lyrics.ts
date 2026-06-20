// Lyrics for mobile — ports main/lyrics.ts. Network goes through the same
// platform-aware path as SoundCloud (CapacitorHttp on device / Vite proxy in
// browser). Source: LRCLIB (free, returns time-synced LRC) with a Genius
// plain-text fallback. Cache + manual syncs live in localStorage.

export interface LyricsResult {
  source: 'lrclib' | 'genius' | 'manual'
  synced: boolean
  manual?: boolean
  lines: { timeSec: number; text: string }[]
  plain: string | null
}

const API = 'https://lrclib.net/api'
const UA = 'latency-player/0.1 (mobile)'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

/** Platform-aware fetch (native CapacitorHttp / dev proxy) — no CORS either way. */
async function netFetch(url: string, headers?: Record<string, string>): Promise<Response> {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } })
    .Capacitor
  if (cap?.isNativePlatform?.() && cap.Plugins?.CapacitorHttp) {
    const http = cap.Plugins.CapacitorHttp as {
      request: (o: { url: string; method: string; headers?: Record<string, string> }) => Promise<{ data: unknown; status: number }>
    }
    const res = await http.request({ url, method: 'GET', headers: headers || {} })
    const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    return new Response(body, { status: res.status })
  }
  const init: RequestInit = {}
  if (headers && Object.keys(headers).length) init.headers = { 'x-sc-headers': JSON.stringify(headers) }
  return fetch('/__scfetch?url=' + encodeURIComponent(url), init)
}

// short stable key for localStorage
function key(title: string, artist: string, dur?: number): string {
  const s = `${title}|${artist}|${dur ? Math.round(dur) : 0}`.toLowerCase()
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}
const cacheK = (k: string): string => `lp.m.lyr.${k}`
const manualK = (k: string): string => `lp.m.lyr.manual.${k}`

function read(storeKey: string): LyricsResult | null {
  try {
    const raw = localStorage.getItem(storeKey)
    return raw ? (JSON.parse(raw) as LyricsResult) : null
  } catch {
    return null
  }
}
function write(storeKey: string, value: LyricsResult): void {
  try {
    localStorage.setItem(storeKey, JSON.stringify(value))
  } catch {
    /* quota — non-fatal */
  }
}

function parseLrc(lrc: string): { timeSec: number; text: string }[] {
  const out: { timeSec: number; text: string }[] = []
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (!stamps.length) continue
    const text = raw.replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g, '').trim()
    for (const m of stamps) {
      const frac = m[3] ? Number(`0.${m[3]}`) : 0
      out.push({ timeSec: Number(m[1]) * 60 + Number(m[2]) + frac, text })
    }
  }
  return out.sort((a, b) => a.timeSec - b.timeSec)
}

function linesToPlain(lines: { timeSec: number; text: string }[]): string {
  return lines.map((l) => l.text).join('\n')
}

interface LrclibItem {
  duration?: number
  syncedLyrics?: string | null
  plainLyrics?: string | null
}
function toResult(item: LrclibItem): LyricsResult {
  const synced = !!item.syncedLyrics
  return {
    source: 'lrclib',
    synced,
    lines: synced ? parseLrc(item.syncedLyrics as string) : [],
    plain: item.plainLyrics || null
  }
}

// --- Genius plain-text fallback (scrape) --------------------------------------
function decodeEntities(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}
function extractContainers(html: string): string[] {
  const out: string[] = []
  const open = /<div[^>]+data-lyrics-container="true"[^>]*>/g
  let m: RegExpExecArray | null
  while ((m = open.exec(html))) {
    let depth = 1
    const tag = /<\/?div[^>]*>/g
    tag.lastIndex = m.index + m[0].length
    let tEx: RegExpExecArray | null
    let end = html.length
    while ((tEx = tag.exec(html))) {
      if (tEx[0].startsWith('</')) {
        if (--depth === 0) {
          end = tEx.index
          break
        }
      } else depth++
    }
    out.push(html.slice(m.index + m[0].length, end))
  }
  return out
}
async function geniusLyrics(title: string, artist: string): Promise<string | null> {
  try {
    const q = `${title} ${artist}`.trim()
    const sres = await netFetch(`https://genius.com/api/search/multi?q=${encodeURIComponent(q)}`, {
      'User-Agent': BROWSER_UA
    })
    if (!sres.ok) return null
    const sdata = (await sres.json()) as {
      response?: { sections?: Array<{ hits?: Array<{ type?: string; result?: { url?: string } }> }> }
    }
    let url: string | null = null
    for (const sec of sdata.response?.sections || []) {
      for (const hit of sec.hits || []) {
        if (hit.type === 'song' && hit.result?.url) {
          url = hit.result.url
          break
        }
      }
      if (url) break
    }
    if (!url) return null
    const page = await netFetch(url, { 'User-Agent': BROWSER_UA })
    if (!page.ok) return null
    const parts = extractContainers(await page.text())
    if (!parts.length) return null
    let text = decodeEntities(parts.join('\n')).replace(/<[^>]+>/g, '')
    if (/contributor/i.test(text.slice(0, 400))) text = text.replace(/^[\s\S]*?\bLyrics\b[ \t]*/, '')
    text = text.replace(/You might also like/gi, '').replace(/\d*\s*Embed\s*$/i, '').replace(/\n{3,}/g, '\n\n').trim()
    return text.length > 20 ? text : null
  } catch {
    return null
  }
}

export async function fetchLyrics(
  title: string,
  artist: string,
  durationSec?: number,
  useGenius = true
): Promise<LyricsResult | null> {
  const cleanTitle = (title || '').trim()
  const cleanArtist = (artist || '').trim()
  if (!cleanTitle) return null
  const k = key(cleanTitle, cleanArtist, durationSec)

  const manual = read(manualK(k))
  if (manual) return manual
  const cached = read(cacheK(k))
  if (cached) return cached

  // 1) exact get
  try {
    const params = new URLSearchParams({ track_name: cleanTitle, artist_name: cleanArtist })
    if (durationSec) params.set('duration', String(Math.round(durationSec)))
    const res = await netFetch(`${API}/get?${params}`, { 'User-Agent': UA })
    if (res.status === 200) {
      const result = toResult((await res.json()) as LrclibItem)
      if (result.synced || result.plain) {
        write(cacheK(k), result)
        return result
      }
    }
  } catch {
    /* fall through */
  }

  // 2) fuzzy search — prefer synced, then closest duration
  try {
    const params = new URLSearchParams({ track_name: cleanTitle, artist_name: cleanArtist })
    const res = await netFetch(`${API}/search?${params}`, { 'User-Agent': UA })
    if (res.status === 200) {
      const items = (await res.json()) as LrclibItem[]
      if (Array.isArray(items) && items.length) {
        const best = items
          .map((it) => ({
            it,
            synced: !!it.syncedLyrics,
            durDiff: durationSec && it.duration ? Math.abs(it.duration - durationSec) : 999
          }))
          .sort((a, b) => Number(b.synced) - Number(a.synced) || a.durDiff - b.durDiff)[0].it
        const result = toResult(best)
        if (result.synced || result.plain) {
          write(cacheK(k), result)
          return result
        }
      }
    }
  } catch {
    /* give up on lrclib */
  }

  // 3) Genius (plain only)
  const genius = useGenius ? await geniusLyrics(cleanTitle, cleanArtist) : null
  if (genius) {
    const result: LyricsResult = { source: 'genius', synced: false, lines: [], plain: genius }
    write(cacheK(k), result)
    return result
  }
  return null
}

export function hasManualSync(title: string, artist: string, durationSec?: number): boolean {
  return read(manualK(key((title || '').trim(), (artist || '').trim(), durationSec))) !== null
}

export function saveManualSync(
  title: string,
  artist: string,
  durationSec: number | undefined,
  lines: { timeSec: number; text: string }[]
): void {
  const sorted = [...lines].sort((a, b) => a.timeSec - b.timeSec)
  write(manualK(key((title || '').trim(), (artist || '').trim(), durationSec)), {
    source: 'manual',
    synced: true,
    manual: true,
    lines: sorted,
    plain: linesToPlain(sorted)
  })
}

export function deleteManualSync(title: string, artist: string, durationSec?: number): void {
  try {
    localStorage.removeItem(manualK(key((title || '').trim(), (artist || '').trim(), durationSec)))
  } catch {
    /* nothing */
  }
}

export function clearCache(): void {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('lp.m.lyr.') && !k.startsWith('lp.m.lyr.manual.')) localStorage.removeItem(k)
    }
  } catch {
    /* nothing */
  }
}
