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
  trackName?: string
  artistName?: string
}

export interface LyricsCandidate {
  id: number
  trackName: string
  artistName: string
  albumName?: string
  duration?: number
  synced: boolean
  plain: boolean
  score: number
  syncedLyrics?: string | null
  plainLyrics?: string | null
}

export interface SearchCandidatesResult {
  candidates: LyricsCandidate[]
  isFallbackTitleOnly: boolean
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
  id?: number
  trackName?: string
  artistName?: string
  albumName?: string
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

/** Normalize to lowercase alphanumeric letters & digits for letter-by-letter matching. */
export function normalizeLetters(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * Clean a track title by separating core title from bracketed metadata
 * and extracting featured artist names.
 */
export function cleanTitle(rawTitle: string): { coreTitle: string; featArtists: string[] } {
  let title = (rawTitle || '').trim()
  const featArtists: string[] = []

  const bracketRegex = /[\(\[\{]([^\)\]\}]+)[\)\]\}]/g
  let m: RegExpExecArray | null
  while ((m = bracketRegex.exec(title)) !== null) {
    const inside = m[1]
    const featMatch = inside.match(/(?:feat\.?|ft\.?|featuring|with|prod\.?\s*by)\s*:?\s*(.+)/i)
    if (featMatch && featMatch[1]) {
      const parts = featMatch[1].split(/[,&/|]/).map((x) => x.trim()).filter(Boolean)
      featArtists.push(...parts)
    }
  }

  const trailingFeat = title.match(/\s+(?:feat\.?|ft\.?|featuring|with)\s+:?\s*(.+)$/i)
  if (trailingFeat && trailingFeat[1]) {
    const parts = trailingFeat[1]
      .replace(/[\(\[\{\)\]\}]/g, '')
      .split(/[,&/|]/)
      .map((x) => x.trim())
      .filter(Boolean)
    featArtists.push(...parts)
  }

  // Completely strip all square brackets [ ] and all text inside them (e.g. [FREE DL], [Remaster], [Official Video])
  const withoutSquare = title.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim()
  if (withoutSquare) {
    title = withoutSquare
  } else {
    // If the entire title was enclosed in square brackets, strip just the brackets
    title = title.replace(/[\[\]]/g, ' ').replace(/\s+/g, ' ').trim()
  }

  // Strip metadata round/curly brackets: (feat...), (prod...), (remix...), (official video...), etc.
  title = title
    .replace(
      /[\(\{](?:feat\.?|ft\.?|featuring|with|prod\.?\s*by|remix|official|audio|video|lyrics|explicit|deluxe|bonus|version|edit|mono|stereo|live|acoustic|instrumental)[^\)\}]+[\)\}]/gi,
      ' '
    )
    .replace(/\s+(?:feat\.?|ft\.?|featuring|with)\s+:?\s*.+$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!title) {
    title = rawTitle.replace(/\[[^\]]*\]/g, '').replace(/[\(\[\{\)\]\}]/g, '').trim() || rawTitle.trim()
  }

  return { coreTitle: title, featArtists }
}

function bigramDice(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0
  if (a.length === 1 && b.length === 1) return a === b ? 1 : 0
  if (a.length < 2 || b.length < 2) return a.includes(b) || b.includes(a) ? 0.8 : 0

  const bigramsA = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2)
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1)
  }
  let intersection = 0
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2)
    const count = bigramsA.get(bg) || 0
    if (count > 0) {
      bigramsA.set(bg, count - 1)
      intersection++
    }
  }
  return (2 * intersection) / (a.length - 1 + b.length - 1)
}

export function letterSimilarity(rawA: string, rawB: string): number {
  // Strip square brackets and any text inside them before comparing letters:
  const aClean = (rawA || '').replace(/\[[^\]]*\]/g, ' ').replace(/[\[\]]/g, ' ')
  const bClean = (rawB || '').replace(/\[[^\]]*\]/g, ' ').replace(/[\[\]]/g, ' ')
  const normA = normalizeLetters(aClean.trim() || rawA)
  const normB = normalizeLetters(bClean.trim() || rawB)
  if (!normA || !normB) return 0
  if (normA === normB) return 1

  if (normA.length >= 3 && normB.length >= 3) {
    if (normA.includes(normB) || normB.includes(normA)) {
      const minLen = Math.min(normA.length, normB.length)
      const maxLen = Math.max(normA.length, normB.length)
      return Math.max(0.75, minLen / maxLen)
    }
  }
  return bigramDice(normA, normB)
}

/** Strip artist prefix/suffix from a title if formatted as "Artist - Title" or "Title - Artist". */
export function stripArtistFromTitle(title: string, artist: string): string {
  let res = (title || '').trim()
  if (!artist) return res
  const normArtist = normalizeLetters(artist)
  if (!normArtist) return res

  const splitDash = res.split(/\s+[-—–]\s+/)
  if (splitDash.length >= 2) {
    if (normalizeLetters(splitDash[0]) === normArtist) {
      return splitDash.slice(1).join(' - ').trim()
    }
    if (normalizeLetters(splitDash[splitDash.length - 1]) === normArtist) {
      return splitDash.slice(0, -1).join(' - ').trim()
    }
  }
  return res
}

export function computeLetterMatchScore(
  targetTitle: string,
  targetArtist: string,
  candTitle: string,
  candArtist: string,
  targetDuration?: number,
  candDuration?: number
): number {
  const strippedCandTitle = stripArtistFromTitle(candTitle, candArtist || targetArtist)
  const cleaned = cleanTitle(targetTitle)
  const candCleaned = cleanTitle(strippedCandTitle)

  const titleScoreCore = letterSimilarity(cleaned.coreTitle, candCleaned.coreTitle)
  const titleScoreRaw = letterSimilarity(targetTitle, candTitle)
  const titleScoreStripped = letterSimilarity(cleaned.coreTitle, strippedCandTitle)
  const titleScore = Math.max(titleScoreCore, titleScoreRaw, titleScoreStripped)

  const targetArtists = [targetArtist, ...cleaned.featArtists].filter(Boolean)
  const candArtists = [candArtist, ...candCleaned.featArtists].filter(Boolean)

  let artistScore = 0
  if (targetArtists.length === 0) {
    artistScore = 0.8
  } else {
    const normCandArtistAll = normalizeLetters(candArtists.join(' '))
    let mainArtistMatched = false
    for (const tArtist of targetArtists) {
      const normT = normalizeLetters(tArtist)
      if (!normT) continue
      if (normCandArtistAll.includes(normT) || letterSimilarity(tArtist, candArtist) >= 0.7) {
        mainArtistMatched = true
        break
      }
    }
    if (mainArtistMatched) {
      artistScore = 0.9
      if (cleaned.featArtists.length > 0) {
        const featMatches = cleaned.featArtists.some((fa) =>
          normCandArtistAll.includes(normalizeLetters(fa))
        )
        if (featMatches) artistScore = 1.0
      }
    } else {
      artistScore = letterSimilarity(targetArtist, candArtist)
    }
  }

  let durationBonus = 0
  if (targetDuration && candDuration && candDuration > 0) {
    const diff = Math.abs(targetDuration - candDuration)
    if (diff <= 3) durationBonus = 0.05
    else if (diff <= 8) durationBonus = 0.02
    else if (diff > 45) durationBonus = -0.15
  }

  return Math.min(1, Math.max(0, titleScore * 0.65 + artistScore * 0.35 + durationBonus))
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

export async function searchLyricsCandidates(
  title: string,
  artist: string,
  durationSec?: number
): Promise<SearchCandidatesResult> {
  const clean = cleanTitle(title)
  const coreTitle = clean.coreTitle
  const rawArtist = (artist || '').trim()
  const isTitleOnly = !rawArtist

  const candidatesMap = new Map<number, LyricsCandidate>()

  const addItems = (items: LrclibItem[], isTitleOnlyFallback = false) => {
    for (const it of items) {
      if (!it.id || candidatesMap.has(it.id)) continue
      if (!it.syncedLyrics && !it.plainLyrics) continue

      let score: number
      if (isTitleOnlyFallback) {
        const stripped = stripArtistFromTitle(it.trackName || '', it.artistName || '');
        const tScore = Math.max(
          letterSimilarity(coreTitle, it.trackName || ''),
          letterSimilarity(coreTitle, stripped)
        )
        if (tScore < 0.45) continue
        score = tScore
      } else {
        score = computeLetterMatchScore(
          title,
          rawArtist,
          it.trackName || '',
          it.artistName || '',
          durationSec,
          it.duration
        )
        if (score < 0.45) continue
      }

      candidatesMap.set(it.id, {
        id: it.id,
        trackName: it.trackName || title,
        artistName: it.artistName || rawArtist,
        albumName: it.albumName,
        duration: it.duration,
        synced: !!it.syncedLyrics,
        plain: !!it.plainLyrics,
        score: Math.round(score * 100) / 100,
        syncedLyrics: it.syncedLyrics,
        plainLyrics: it.plainLyrics
      })
    }
  }

  if (!isTitleOnly) {
    // 1. First search pass: exact match endpoint + queries with artist
    const searchPromises: Promise<void>[] = []

    // 1a. Exact /api/get (returns authoritative match if found)
    const getParams = new URLSearchParams({ track_name: coreTitle, artist_name: rawArtist })
    if (durationSec) getParams.set('duration', String(Math.round(durationSec)))
    searchPromises.push(
      netFetch(`${API}/get?${getParams}`, { 'User-Agent': UA }).then(async (res) => {
        if (res && res.status === 200) {
          try {
            const item = (await res.json()) as LrclibItem
            if (item && item.id) addItems([item], false)
          } catch {}
        }
      })
    )

    // 1b. Field search /api/search?track_name=...&artist_name=...
    const fieldParams = new URLSearchParams({ track_name: coreTitle, artist_name: rawArtist })
    searchPromises.push(
      netFetch(`${API}/search?${fieldParams}`, { 'User-Agent': UA }).then(async (res) => {
        if (res && res.status === 200) {
          try {
            const items = (await res.json()) as LrclibItem[]
            if (Array.isArray(items)) addItems(items, false)
          } catch {}
        }
      })
    )

    // 1c. Flexible search queries
    const queries = [`${coreTitle} ${rawArtist}`]
    if (clean.featArtists.length > 0) {
      queries.push(`${coreTitle} ${rawArtist} ${clean.featArtists.join(' ')}`)
    }
    if (title.trim().toLowerCase() !== coreTitle.toLowerCase()) {
      queries.push(`${title.trim()} ${rawArtist}`)
    }

    const seenQueries = new Set<string>()
    for (const q of queries) {
      const trimmed = q.trim()
      if (!trimmed || seenQueries.has(trimmed.toLowerCase())) continue
      seenQueries.add(trimmed.toLowerCase())
      searchPromises.push(
        netFetch(`${API}/search?q=${encodeURIComponent(trimmed)}`, { 'User-Agent': UA }).then(
          async (res) => {
            if (res && res.status === 200) {
              try {
                const items = (await res.json()) as LrclibItem[]
                if (Array.isArray(items)) addItems(items, false)
              } catch {}
            }
          }
        )
      )
    }

    await Promise.all(searchPromises)

    const list = Array.from(candidatesMap.values())
    if (list.length > 0) {
      list.sort((a, b) => {
        if (a.synced !== b.synced) return a.synced ? -1 : 1
        if (Math.abs(b.score - a.score) > 0.12) return b.score - a.score
        if (durationSec && a.duration && b.duration) {
          const diffA = Math.abs(a.duration - durationSec)
          const diffB = Math.abs(b.duration - durationSec)
          if (Math.abs(diffA - diffB) > 3) return diffA - diffB
        }
        return b.score - a.score
      })
      return { candidates: list.slice(0, 10), isFallbackTitleOnly: false }
    }
  }

  // 2. Fallback: search strictly by title if artist + title returned 0 candidates, or if artist was empty
  if (coreTitle.length >= 2) {
    const titleRes = await netFetch(`${API}/search?q=${encodeURIComponent(coreTitle)}`, {
      'User-Agent': UA
    })
    if (titleRes && titleRes.status === 200) {
      try {
        const items = (await titleRes.json()) as LrclibItem[]
        if (Array.isArray(items)) addItems(items, true)
      } catch {}
    }
  }

  const fallbackList = Array.from(candidatesMap.values())
  fallbackList.sort((a, b) => {
    if (a.synced !== b.synced) return a.synced ? -1 : 1
    return b.score - a.score
  })

  return { candidates: fallbackList.slice(0, 10), isFallbackTitleOnly: true }
}

export function applyLyricsCandidate(
  title: string,
  artist: string,
  durationSec: number | undefined,
  cand: LyricsCandidate
): LyricsResult {
  const synced = !!cand.syncedLyrics
  const result: LyricsResult = {
    source: 'lrclib',
    synced,
    lines: synced && cand.syncedLyrics ? parseLrc(cand.syncedLyrics) : [],
    plain: cand.plainLyrics || null,
    trackName: cand.trackName,
    artistName: cand.artistName
  }
  const k = key((title || '').trim(), (artist || '').trim(), durationSec)
  write(cacheK(k), result)
  return result
}

export async function fetchLyrics(
  title: string,
  artist: string,
  durationSec?: number,
  useGenius = true,
  force = false
): Promise<LyricsResult | null> {
  const cleanTitle = (title || '').trim()
  const cleanArtist = (artist || '').trim()
  if (!cleanTitle) return null
  const k = key(cleanTitle, cleanArtist, durationSec)

  const manual = read(manualK(k))
  if (manual) return manual
  const cached = force ? null : read(cacheK(k))
  if (cached?.synced) return cached

  const { candidates } = await searchLyricsCandidates(cleanTitle, cleanArtist, durationSec)
  if (candidates.length > 0) {
    const top = candidates[0]
    const res: LyricsResult = {
      source: 'lrclib',
      synced: top.synced,
      lines: top.synced && top.syncedLyrics ? parseLrc(top.syncedLyrics) : [],
      plain: top.plainLyrics || null,
      trackName: top.trackName,
      artistName: top.artistName
    }
    write(cacheK(k), res)
    return res
  }

  if (cached) return cached

  const genius = useGenius ? await geniusLyrics(cleanTitle, cleanArtist) : null
  if (genius) {
    const result: LyricsResult = {
      source: 'genius',
      synced: false,
      lines: [],
      plain: genius,
      trackName: cleanTitle,
      artistName: cleanArtist
    }
    write(cacheK(k), result)
    return result
  }
  return null
}

// --- search tracks by a remembered lyric line --------------------------------
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

function extractHighlight(h: GeniusHit): string | undefined {
  const hl = h.highlights?.find((x) => x.value && x.value.trim().length > 0)
  if (!hl?.value) return undefined
  const clean = decodeEntities(hl.value).replace(/\s*\n\s*/g, ' / ').replace(/\s+/g, ' ').trim()
  return clean.length > 140 ? `${clean.slice(0, 138)}…` : clean
}

/**
 * Find songs by a remembered lyric line. Uses Genius's multi-search, which
 * matches against lyrics and returns the matching snippet in `highlights`.
 * Returns title/artist/cover plus the matched line so the caller can resolve it
 * to a playable track on the active provider.
 */
export async function searchByLyrics(query: string, limit = 14): Promise<LyricSearchHit[]> {
  const q = query.trim()
  if (q.length < 2) return []
  try {
    const res = await netFetch(`https://genius.com/api/search/multi?q=${encodeURIComponent(q)}`, {
      'User-Agent': BROWSER_UA
    })
    if (!res.ok) return []
    const data = (await res.json()) as {
      response?: { sections?: Array<{ type?: string; hits?: GeniusHit[] }> }
    }
    const out: LyricSearchHit[] = []
    const seen = new Set<string>()
    const sections = data.response?.sections || []
    const order = (s: { type?: string }): number =>
      s.type === 'lyric' ? 0 : s.type === 'top_hit' ? 1 : s.type === 'song' ? 2 : 9
    for (const sec of [...sections].sort((a, b) => order(a) - order(b))) {
      if (sec.type !== 'lyric' && sec.type !== 'top_hit' && sec.type !== 'song') continue
      for (const h of sec.hits || []) {
        if (h.type !== 'song') continue
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
