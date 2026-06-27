import { promises as fs } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { app } from 'electron'

// Lyrics come from LRCLIB (lrclib.net) — free, no key, and crucially returns
// time-synced LRC when available, so we don't have to do forced alignment.

const UA = 'latency-player/0.1 (https://github.com/latency-player)'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const API = 'https://lrclib.net/api'

/** fetch with a hard timeout so a slow lyrics source can't hang the request. */
async function fetchT(url: string, ms: number, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { headers, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

export interface LyricsResult {
  source: 'lrclib' | 'genius' | 'manual'
  synced: boolean
  /** true when the synced timing was created by the user (protected from auto-sync) */
  manual?: boolean
  /** Parsed synced lines (empty when only plain text is available). */
  lines: { timeSec: number; text: string }[]
  plain: string | null
  trackName?: string
  artistName?: string
}

const cacheDir = (): string => join(app.getPath('userData'), 'lyrics')

let ready = false
async function ensureDir(): Promise<void> {
  if (ready) return
  await fs.mkdir(cacheDir(), { recursive: true })
  ready = true
}

function cacheKey(title: string, artist: string, durationSec?: number): string {
  const dur = durationSec ? Math.round(durationSec) : 0
  return createHash('sha1').update(`${title}|${artist}|${dur}`.toLowerCase()).digest('hex')
}

/** Build an LRC string from synced lines (for export/storage). */
function linesToLrc(lines: { timeSec: number; text: string }[]): string {
  return lines
    .map((l) => {
      const m = Math.floor(l.timeSec / 60)
      const s = Math.floor(l.timeSec % 60)
      const cs = Math.round((l.timeSec - Math.floor(l.timeSec)) * 100)
      const stamp = `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}]`
      return `${stamp}${l.text}`
    })
    .join('\n')
}

/** Parse an LRC string into sorted {timeSec, text} lines. */
function parseLrc(lrc: string): { timeSec: number; text: string }[] {
  const out: { timeSec: number; text: string }[] = []
  for (const raw of lrc.split('\n')) {
    // a line may carry multiple timestamps: [00:12.34][01:02.00] text
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (stamps.length === 0) continue
    const text = raw.replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g, '').trim()
    for (const m of stamps) {
      const min = Number(m[1])
      const sec = Number(m[2])
      const frac = m[3] ? Number(`0.${m[3]}`) : 0
      out.push({ timeSec: min * 60 + sec + frac, text })
    }
  }
  out.sort((a, b) => a.timeSec - b.timeSec)
  return out
}

interface LrclibItem {
  trackName?: string
  artistName?: string
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
    plain: item.plainLyrics || null,
    trackName: item.trackName,
    artistName: item.artistName
  }
}

async function readCache(key: string): Promise<LyricsResult | null> {
  try {
    const raw = await fs.readFile(join(cacheDir(), `${key}.json`), 'utf-8')
    return JSON.parse(raw) as LyricsResult
  } catch {
    return null
  }
}

async function writeCache(key: string, result: LyricsResult): Promise<void> {
  try {
    await ensureDir()
    await fs.writeFile(join(cacheDir(), `${key}.json`), JSON.stringify(result), 'utf-8')
  } catch {
    /* best-effort */
  }
}

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

/** Extract the inner HTML of each Genius data-lyrics-container, handling nested divs. */
function extractContainers(html: string): string[] {
  const out: string[] = []
  const open = /<div[^>]+data-lyrics-container="true"[^>]*>/g
  let m: RegExpExecArray | null
  while ((m = open.exec(html))) {
    let depth = 1
    const tag = /<\/?div[^>]*>/g
    tag.lastIndex = m.index + m[0].length
    let t: RegExpExecArray | null
    let end = html.length
    while ((t = tag.exec(html))) {
      if (t[0].startsWith('</')) {
        depth--
        if (depth === 0) {
          end = t.index
          break
        }
      } else depth++
    }
    out.push(html.slice(m.index + m[0].length, end))
  }
  return out
}

/** Normalize a title/artist for fuzzy matching: lowercase, drop feat/brackets/punct. */
function normMatch(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\bfeat\.?\b|\bft\.?\b|\bprod\.?\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
function tokenSet(s: string): Set<string> {
  return new Set(normMatch(s).split(' ').filter((w) => w.length > 1))
}
/** Fraction of `need` tokens that appear in `have` (0..1). */
function tokenOverlap(need: Set<string>, have: Set<string>): number {
  if (need.size === 0) return 0
  let hit = 0
  for (const w of need) if (have.has(w)) hit++
  return hit / need.size
}

/** LRCLIB fetch with a sane timeout and one retry on network failure/timeout. */
async function lrclibFetch(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchT(url, 6000, { 'User-Agent': UA })
    } catch {
      if (attempt === 1) return null
    }
  }
  return null
}

/** Fallback: scrape plain lyrics from Genius (no official lyrics API). */
async function geniusLyrics(title: string, artist: string): Promise<string | null> {
  try {
    const q = `${title} ${artist}`.trim()
    const sres = await fetchT(
      `https://genius.com/api/search/multi?q=${encodeURIComponent(q)}`,
      6000,
      { 'User-Agent': BROWSER_UA }
    )
    if (!sres.ok) return null
    const sdata = (await sres.json()) as {
      response?: {
        sections?: Array<{
          hits?: Array<{
            type?: string
            result?: { url?: string; title?: string; full_title?: string; primary_artist?: { name?: string } }
          }>
        }>
      }
    }
    // Pick the BEST-matching song hit instead of the first one — Genius's search
    // happily returns unrelated songs, which is how random page text crept in.
    // Require a real title match so we never scrape an off-topic page.
    const qTitle = tokenSet(title)
    const qArtist = tokenSet(artist)
    let url: string | null = null
    let bestScore = 0
    for (const sec of sdata.response?.sections || []) {
      for (const hit of sec.hits || []) {
        const r = hit.result
        if (hit.type !== 'song' || !r?.url) continue
        const titleScore = tokenOverlap(qTitle, tokenSet(r.title || r.full_title || ''))
        if (titleScore < 0.5) continue
        const artistScore = qArtist.size ? tokenOverlap(qArtist, tokenSet(r.primary_artist?.name || '')) : 1
        const score = titleScore * 0.7 + artistScore * 0.3
        if (score > bestScore) {
          bestScore = score
          url = r.url
        }
      }
    }
    if (!url) return null

    const page = await fetchT(url, 7000, { 'User-Agent': BROWSER_UA })
    if (!page.ok) return null
    const html = await page.text()
    const parts = extractContainers(html)
    if (!parts.length) return null
    let text = decodeEntities(parts.join('\n')).replace(/<[^>]+>/g, '')
    // strip Genius preamble ("123 Contributors … Translations … <Song> Lyrics")
    if (/contributor/i.test(text.slice(0, 400))) {
      text = text.replace(/^[\s\S]*?\bLyrics\b[ \t]*/, '')
    }
    text = text
      .replace(/You might also like/gi, '')
      .replace(/\d*\s*Embed\s*$/i, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return text.length > 20 ? text : null
  } catch {
    return null
  }
}

export interface LyricSearchHit {
  title: string
  artist: string
  thumbnail?: string
  /** the matched lyric line (when Genius matched on lyrics rather than title) */
  snippet?: string
  url: string
}

interface GeniusHit {
  type?: string
  result?: {
    title?: string
    full_title?: string
    url?: string
    song_art_image_thumbnail_url?: string
    header_image_thumbnail_url?: string
    primary_artist?: { name?: string }
  }
  highlights?: Array<{ property?: string; value?: string }>
}

/**
 * Pull the matched lyric line out of a Genius hit's highlights. The raw value is
 * a multi-line snippet around the match; we collapse it and keep it short.
 */
function extractHighlight(h: GeniusHit): string | undefined {
  const hl = h.highlights?.find((x) => x.value && x.value.trim().length > 0)
  if (!hl?.value) return undefined
  const clean = decodeEntities(hl.value).replace(/\s*\n\s*/g, ' / ').replace(/\s+/g, ' ').trim()
  return clean.length > 140 ? `${clean.slice(0, 138)}…` : clean
}

/**
 * Find songs by a remembered lyric line. Uses Genius's multi-search, which
 * matches against lyrics and returns the matching snippet in `highlights`.
 * Returns title/artist/cover plus the matched line so the user can confirm.
 *
 * NB: the multi endpoint rejects per_page > 5, so we don't set it — Genius
 * returns its own fixed set of hits per section.
 */
export async function searchByLyrics(query: string, limit = 14): Promise<LyricSearchHit[]> {
  const q = query.trim()
  if (q.length < 2) return []
  try {
    const res = await fetchT(
      `https://genius.com/api/search/multi?q=${encodeURIComponent(q)}`,
      7000,
      { 'User-Agent': BROWSER_UA }
    )
    if (!res.ok) return []
    const data = (await res.json()) as {
      response?: { sections?: Array<{ type?: string; hits?: GeniusHit[] }> }
    }
    const out: LyricSearchHit[] = []
    const seen = new Set<string>()
    // The 'lyric' section is the lyric-match section; 'top_hit' and 'song' also
    // carry song hits. Prefer lyric/top_hit first so snippet-bearing hits win.
    const sections = data.response?.sections || []
    const order = (s: { type?: string }): number =>
      s.type === 'lyric' ? 0 : s.type === 'top_hit' ? 1 : s.type === 'song' ? 2 : 9
    for (const sec of [...sections].sort((a, b) => order(a) - order(b))) {
      if (sec.type !== 'lyric' && sec.type !== 'top_hit' && sec.type !== 'song') continue
      for (const h of sec.hits || []) {
        if (h.type !== 'song') continue // skip artist/album hits in top_hit
        const r = h.result
        if (!r?.url || seen.has(r.url)) continue
        if (!r.title && !r.full_title) continue
        seen.add(r.url)
        out.push({
          title: r.title || r.full_title || 'Unknown',
          artist: r.primary_artist?.name || '',
          thumbnail: r.song_art_image_thumbnail_url || r.header_image_thumbnail_url,
          snippet: extractHighlight(h),
          url: r.url
        })
      }
    }
    return out.slice(0, limit)
  } catch {
    return []
  }
}

/** Delete all cached lyrics (manual syncs are kept — they use a .manual suffix). */
export async function clearCache(): Promise<void> {
  try {
    const dir = cacheDir()
    const files = await fs.readdir(dir)
    await Promise.all(
      files
        .filter((f) => f.endsWith('.json') && !f.endsWith('.manual.json'))
        .map((f) => fs.unlink(join(dir, f)).catch(() => {}))
    )
  } catch {
    /* nothing to clear */
  }
}

/**
 * Hit the network (LRCLIB exact → LRCLIB search → Genius) and return the best
 * result, preferring SYNCED. Does NOT touch the cache — the caller decides what
 * to persist (so a plain result never blocks a later synced upgrade).
 */
async function fetchFromNetwork(
  cleanTitle: string,
  cleanArtist: string,
  durationSec: number | undefined,
  useGenius: boolean
): Promise<LyricsResult | null> {
  // Best plain-text seen so far. A SYNCED result always wins over this.
  let plainFallback: LyricsResult | null = null

  // LRCLIB exact /get and fuzzy /search hit the same host, so fire BOTH at once
  // instead of one-after-the-other — this roughly halves the LRCLIB wall-time,
  // which is where the "30+ seconds" came from (each call could time out + retry
  // sequentially). We still apply the same preference order on the results:
  // exact-synced > search-synced > any plain.
  const getParams = new URLSearchParams({ track_name: cleanTitle, artist_name: cleanArtist })
  if (durationSec) getParams.set('duration', String(Math.round(durationSec)))
  const searchParams = new URLSearchParams({ track_name: cleanTitle, artist_name: cleanArtist })
  const [getRes, searchRes] = await Promise.all([
    lrclibFetch(`${API}/get?${getParams}`),
    lrclibFetch(`${API}/search?${searchParams}`)
  ])

  // 1) exact get (uses duration for accuracy when available) — highest priority
  if (getRes && getRes.status === 200) {
    try {
      const result = toResult((await getRes.json()) as LrclibItem)
      if (result.synced) return result
      if (result.plain && !plainFallback) plainFallback = result
    } catch {
      /* malformed body — fall through to search */
    }
  }

  // 2) fuzzy search — pick best by synced availability, then closest duration
  if (searchRes && searchRes.status === 200) {
    try {
      const items = (await searchRes.json()) as LrclibItem[]
      if (Array.isArray(items) && items.length) {
        const scored = items
          .map((it) => ({
            it,
            synced: !!it.syncedLyrics,
            durDiff: durationSec && it.duration ? Math.abs(it.duration - durationSec) : 999
          }))
          .sort((a, b) => Number(b.synced) - Number(a.synced) || a.durDiff - b.durDiff)
        const result = toResult(scored[0].it)
        if (result.synced) return result
        if (result.plain && !plainFallback) plainFallback = result
      }
    } catch {
      /* give up on lrclib */
    }
  }

  // Nothing timed anywhere — use the best plain text we collected.
  if (plainFallback) return plainFallback

  // 3) Genius fallback (plain text only) — optional
  const genius = useGenius ? await geniusLyrics(cleanTitle, cleanArtist) : null
  if (genius) {
    return {
      source: 'genius',
      synced: false,
      lines: [],
      plain: genius,
      trackName: cleanTitle,
      artistName: cleanArtist
    }
  }

  return null
}

export async function fetchLyrics(
  title: string,
  artist: string,
  durationSec?: number,
  useGenius = true,
  force = false
): Promise<LyricsResult | null> {
  const cleanTitle = title.trim()
  const cleanArtist = (artist || '').trim()
  if (!cleanTitle) return null

  const key = cacheKey(cleanTitle, cleanArtist, durationSec)
  // a manually-synced version always wins over network sources
  const manual = await readCache(`${key}.manual`)
  if (manual) return manual

  // `force` (the karaoke "reset" button) bypasses the cache entirely.
  const cached = force ? null : await readCache(key)
  // A cached SYNCED result is authoritative — serve it without any network hit.
  if (cached?.synced) return cached

  // No cache, or only a PLAIN cache: go to the network and prefer synced. This is
  // the fix for "everything shows up unsynced" — a plain-only cache used to be
  // returned forever, so a track that later gained timing never upgraded.
  const fresh = await fetchFromNetwork(cleanTitle, cleanArtist, durationSec, useGenius)
  if (fresh?.synced) {
    await writeCache(key, fresh)
    return fresh
  }

  // No synced upstream: prefer an existing plain cache, else cache+return fresh plain.
  if (cached) return cached
  if (fresh) {
    await writeCache(key, fresh)
    return fresh
  }
  return null
}

/** Whether a user-made manual sync exists for this track. */
export async function hasManualSync(
  title: string,
  artist: string,
  durationSec?: number
): Promise<boolean> {
  const key = cacheKey(title.trim(), (artist || '').trim(), durationSec)
  return (await readCache(`${key}.manual`)) !== null
}

/** Save a user-made manual sync (protected — fetchLyrics returns it first). */
export async function saveManualSync(
  title: string,
  artist: string,
  durationSec: number | undefined,
  lines: { timeSec: number; text: string }[]
): Promise<void> {
  const key = cacheKey(title.trim(), (artist || '').trim(), durationSec)
  const sorted = [...lines].sort((a, b) => a.timeSec - b.timeSec)
  const result: LyricsResult = {
    source: 'manual',
    synced: true,
    manual: true,
    lines: sorted,
    plain: linesToLrc(sorted).replace(/\[\d{2}:\d{2}\.\d{2}\]/g, ''),
    trackName: title,
    artistName: artist
  }
  await writeCache(`${key}.manual`, result)
}

/** Remove a manual sync (revert to network lyrics). */
export async function deleteManualSync(
  title: string,
  artist: string,
  durationSec?: number
): Promise<void> {
  const key = cacheKey(title.trim(), (artist || '').trim(), durationSec)
  try {
    await fs.unlink(join(cacheDir(), `${key}.manual.json`))
  } catch {
    /* nothing to remove */
  }
}
