import { useEffect, useRef, useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { SearchIcon, SoundCloudIcon, ClockIcon, PlayIcon } from './Icons'
import { TrackRow } from './TrackRow'

const GENRES = [
  'lofi',
  'phonk',
  'synthwave',
  'jazz',
  'lo-fi hip hop',
  'house',
  'drum and bass',
  'ambient',
  'chill',
  'remix'
]

interface LyricHit {
  title: string
  artist: string
  thumbnail?: string
  snippet?: string
  url: string
}

/** A Genius lyric match already resolved to a playable SoundCloud track. */
interface ResolvedLyricHit {
  /** the SoundCloud track to display + play (cover/title/artist come from SC) */
  track: Track
  /** the matched lyric line from Genius */
  snippet?: string
}

type Mode = 'tracks' | 'lyrics'

/** Debounce a value by `ms` milliseconds. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

export function ExplorePage(): JSX.Element {
  const scResults = usePlayer((s) => s.scResults)
  const scUsers = usePlayer((s) => s.scUsers)
  const scQuery = usePlayer((s) => s.scQuery)
  const scLoading = usePlayer((s) => s.scLoading)
  const searchSoundCloud = usePlayer((s) => s.searchSoundCloud)
  const openArtist = usePlayer((s) => s.openArtist)
  const playQueue = usePlayer((s) => s.playQueue)
  const t = useT()

  const [mode, setMode] = useState<Mode>('tracks')

  // ----- Tracks mode (SoundCloud keyword search) -----
  const [input, setInput] = useState(scQuery)

  function runSearch(q: string): void {
    setInput(q)
    searchSoundCloud(q)
  }
  function play(index: number): void {
    playQueue(scResults, index)
  }
  const hasResults = scResults.length > 0

  // ----- Lyrics mode (find a song by a remembered line) -----
  // Pipeline: Genius matches the line -> we take each song's title+artist and
  // resolve it on SoundCloud -> we show the SC track (cover/title/artist that
  // actually plays) plus the matched lyric snippet. Hits that don't resolve on
  // SoundCloud are dropped, so every shown result is guaranteed playable.
  const [lyricInput, setLyricInput] = useState('')
  const [resolved, setResolved] = useState<ResolvedLyricHit[]>([])
  const [lyricLoading, setLyricLoading] = useState(false)
  const lyricRef = useRef<HTMLInputElement>(null)

  const lyricQuery = lyricInput.trim()
  const debouncedLyric = useDebounced(lyricQuery, 420)

  useEffect(() => {
    if (mode === 'lyrics') lyricRef.current?.focus()
  }, [mode])

  /** Resolve one Genius hit to a SoundCloud track (best title match), or null. */
  async function resolveHit(hit: LyricHit): Promise<ResolvedLyricHit | null> {
    try {
      const q = `${hit.artist} ${hit.title}`.trim()
      const results = await window.api.scSearch(q)
      if (!results.length) return null
      const titleLc = hit.title.toLowerCase()
      const target =
        results.find((r) => r.title.toLowerCase().includes(titleLc)) ||
        results.find((r) => titleLc.includes(r.title.toLowerCase())) ||
        results[0]
      return target ? { track: target, snippet: hit.snippet } : null
    } catch {
      return null
    }
  }

  useEffect(() => {
    let cancelled = false
    if (mode !== 'lyrics' || debouncedLyric.length < 2) {
      if (debouncedLyric.length < 2) setResolved([])
      return
    }
    setLyricLoading(true)
    setResolved([])
    window.api
      .searchByLyrics(debouncedLyric)
      .then(async (genHits) => {
        if (cancelled) return
        // Resolve all Genius hits to SC in parallel, keep order, drop misses.
        const settled = await Promise.all(genHits.map(resolveHit))
        if (cancelled) return
        const seen = new Set<string>()
        const out: ResolvedLyricHit[] = []
        for (const r of settled) {
          if (r && !seen.has(r.track.id)) {
            seen.add(r.track.id)
            out.push(r)
          }
        }
        setResolved(out)
        setLyricLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setResolved([])
        setLyricLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debouncedLyric, mode])

  function playResolved(index: number): void {
    playQueue(resolved.map((r) => r.track), index)
  }

  return (
    <section className="tracklist explore">
      <div className="ph-aurora explore-aurora" />

      <div className="ex-hero">
        <div className="ex-badge">
          <SoundCloudIcon size={16} />
          <span>Powered by SoundCloud</span>
        </div>
        <h1 className="ex-title">{t('explore')}</h1>
        <p className="ex-sub">{mode === 'lyrics' ? t('lyricSearchHint') : t('exploreSub')}</p>

        <div className="ex-modes">
          <button
            className={`ex-mode ${mode === 'tracks' ? 'active' : ''}`}
            onClick={() => setMode('tracks')}
          >
            {t('searchModeTracks')}
          </button>
          <button
            className={`ex-mode ${mode === 'lyrics' ? 'active' : ''}`}
            onClick={() => setMode('lyrics')}
          >
            {t('searchModeLyrics')}
          </button>
        </div>

        {mode === 'tracks' ? (
          <>
            <div className="ex-search">
              <SearchIcon size={20} />
              <input
                autoFocus
                placeholder={t('explorePlaceholder')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSearch(input)
                }}
              />
              <button
                className="ex-search-btn"
                onClick={() => runSearch(input)}
                disabled={!input.trim()}
              >
                {t('search')}
              </button>
            </div>

            <div className="ex-chips">
              {GENRES.map((g) => (
                <button
                  key={g}
                  className={`ex-chip ${scQuery === g ? 'active' : ''}`}
                  onClick={() => runSearch(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="ex-search">
            <SearchIcon size={20} />
            <input
              ref={lyricRef}
              placeholder={t('lyricsPlaceholder')}
              value={lyricInput}
              onChange={(e) => setLyricInput(e.target.value)}
            />
            {lyricLoading && <span className="ex-spinner" />}
          </div>
        )}
      </div>

      {/* ---------- Tracks mode results ---------- */}
      {mode === 'tracks' && (
        <>
          {scLoading && <div className="empty">{t('searching')}</div>}

          {!scLoading && scQuery && !hasResults && scUsers.length === 0 && (
            <div className="empty">Nothing found for “{scQuery}”.</div>
          )}

          {!scLoading && scUsers.length > 0 && (
            <div className="ex-profiles">
              <div className="ex-results-head">{t('profiles')}</div>
              <div className="profile-row">
                {scUsers.map((u) => (
                  <button
                    key={u.id}
                    className="profile-chip"
                    onClick={() => openArtist(u)}
                    title={u.name}
                  >
                    <div className="profile-avatar">
                      {u.avatar ? <img src={u.avatar} alt="" /> : <span>{u.name[0] ?? '?'}</span>}
                    </div>
                    <span className="profile-name">{u.name}</span>
                    <span className="profile-sub">
                      {u.trackCount != null ? `${u.trackCount} tracks` : 'Artist'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasResults && (
            <>
              <div className="ex-results-head">
                Tracks for <strong>{scQuery}</strong> · {scResults.length}
              </div>
              <div className="tl-head">
                <span className="c-index">#</span>
                <span className="c-title">Title</span>
                <span className="c-artist">Artist</span>
                <span className="c-like" />
                <span className="c-time">
                  <ClockIcon size={15} />
                </span>
                <span className="c-more" />
              </div>
              <div className="rows">
                {scResults.map((track, i) => (
                  <TrackRow key={`${track.id}-${i}`} track={track} index={i} onPlay={play} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ---------- Lyrics mode results ---------- */}
      {mode === 'lyrics' && (
        <>
          {lyricLoading && <div className="empty">{t('openingTrack')}</div>}
          {!lyricLoading && lyricQuery.length >= 2 && resolved.length === 0 && (
            <div className="empty">{t('nothingFound')}</div>
          )}

          {!lyricLoading && resolved.length > 0 && (
            <div className="lyric-hits">
              {resolved.map((r, i) => (
                <button
                  key={r.track.id}
                  className="lyric-hit"
                  onClick={() => playResolved(i)}
                  title={`${r.track.title} — ${r.track.artist || ''}`}
                >
                  <span className="lyric-thumb">
                    {r.track.artwork ? <img src={r.track.artwork} alt="" /> : <span>☁</span>}
                  </span>
                  <span className="lyric-meta">
                    <span className="lyric-title">{r.track.title}</span>
                    <span className="lyric-artist">{r.track.artist || 'Unknown artist'}</span>
                    {r.snippet && <span className="lyric-snippet">“{r.snippet}”</span>}
                  </span>
                  <span className="lyric-action">
                    <PlayIcon size={18} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
