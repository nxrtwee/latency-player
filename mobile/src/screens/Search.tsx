// Search — wired to the shared store's unified search (SoundCloud or Yandex
// Music, chosen with the source toggle). Two modes: "Tracks" (normal provider
// search) and "By lyrics" (type a remembered line → Genius finds the song →
// we resolve it to a playable track on the active source).
import { Fragment, useEffect, useRef, useState } from 'react'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'
import { TrackRow } from '../components/TrackRow'
import type { Track } from '@shared/types'
import type { Detail } from '../MobileApp'

// Seed suggestions shown until the user has their own search history.
const SEED = ['sqwore', '17 seventeen', 'dream', 'yandere', 'greyrock', 'hikariii', 'phonk']
const HISTORY_KEY = 'lp.m.searchHistory'

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as string[]
  } catch {
    return []
  }
}

type SearchMode = 'tracks' | 'lyrics'
interface LyricResolved {
  track: Track
  snippet?: string
}

export function SearchScreen({
  onArtist,
  onOpenDetail
}: {
  onArtist?: (t: Track) => void
  onOpenDetail?: (d: Detail) => void
}): JSX.Element {
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<SearchMode>('tracks')
  const [history, setHistory] = useState<string[]>(loadHistory)
  const [resolved, setResolved] = useState<LyricResolved[]>([])
  const [lyricLoading, setLyricLoading] = useState(false)

  const runSearch = usePlayer((s) => s.runSearch)
  const results = usePlayer((s) => s.searchResults)
  const foundArtists = usePlayer((s) => s.searchArtists)
  const foundAlbums = usePlayer((s) => s.searchAlbums)
  const loading = usePlayer((s) => s.searchLoading)
  const error = usePlayer((s) => s.error)
  const query = usePlayer((s) => s.searchQuery)
  const searchSource = usePlayer((s) => s.searchSource)
  const setSearchSource = usePlayer((s) => s.setSearchSource)
  const playQueue = usePlayer((s) => s.playQueue)
  const recent = usePlayer((s) => s.recentlyPlayed)
  const t = useT()

  // unique recent authors → quick re-entry to their pages
  const recentArtists = (() => {
    const seen = new Set<string>()
    const out: { name: string; track: typeof recent[number] }[] = []
    for (const tr of recent) {
      const name = tr.artist || ''
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      out.push({ name, track: tr })
      if (out.length >= 12) break
    }
    return out
  })()

  const record = (term: string): void => {
    const tt = term.trim()
    if (!tt) return
    setHistory((h) => {
      const next = [tt, ...h.filter((x) => x.toLowerCase() !== tt.toLowerCase())].slice(0, 12)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        /* quota — non-fatal */
      }
      return next
    })
  }

  const run = (term: string): void => {
    setQ(term)
    if (mode === 'tracks') {
      record(term)
      void runSearch(term)
    }
    // lyrics mode resolves reactively in the effect below
  }

  const chooseSource = (src: 'soundcloud' | 'yandex'): void => {
    if (src === searchSource) return
    setSearchSource(src)
    const term = q.trim()
    if (mode === 'tracks' && term) void runSearch(term)
    // lyrics mode re-resolves via the effect (searchSource is a dep)
  }

  // Resolve one Genius hit to a track on the active source (best title match).
  const resolveHit = async (hit: {
    title: string
    artist: string
    snippet?: string
  }): Promise<LyricResolved | null> => {
    try {
      const term = `${hit.artist} ${hit.title}`.trim()
      const found =
        searchSource === 'yandex'
          ? await window.api.ymSearch(term)
          : await window.api.scSearch(term)
      if (!found.length) return null
      const titleLc = hit.title.toLowerCase()
      const target =
        found.find((r) => r.title.toLowerCase().includes(titleLc)) ||
        found.find((r) => titleLc.includes(r.title.toLowerCase())) ||
        found[0]
      return target ? { track: target, snippet: hit.snippet } : null
    } catch {
      return null
    }
  }

  // By-lyrics resolution — debounced, re-runs on query/source change.
  const lyricSeq = useRef(0)
  useEffect(() => {
    if (mode !== 'lyrics') return
    const term = q.trim()
    if (term.length < 2) {
      setResolved([])
      setLyricLoading(false)
      return
    }
    const seq = ++lyricSeq.current
    setLyricLoading(true)
    const timer = setTimeout(() => {
      window.api
        .searchByLyrics(term)
        .then(async (hits) => {
          const settled = await Promise.all(hits.map(resolveHit))
          if (seq !== lyricSeq.current) return
          const seen = new Set<string>()
          const out: LyricResolved[] = []
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
          if (seq !== lyricSeq.current) return
          setResolved([])
          setLyricLoading(false)
        })
    }, 420)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, mode, searchSource])

  const hasSearched = mode === 'tracks' ? query.trim().length > 0 || loading : q.trim().length >= 2
  // personal chips — the user's own recent searches, seeded until they have any
  const chips = history.length > 0 ? history : SEED
  const chipsLabel = history.length > 0 ? t('recentSearches') : t('popular')
  const busy = mode === 'tracks' ? loading : lyricLoading

  return (
    <div className="view">
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault()
          run(q)
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
          }}
          placeholder={mode === 'lyrics' ? t('lyricSearchPh') : t('searchPh')}
          autoCorrect="off"
          autoCapitalize="off"
        />
        {q && (
          <button type="button" className="search-clear" onClick={() => run('')}>
            ✕
          </button>
        )}
      </form>

      {/* source + mode toggles */}
      <div className="search-toggles">
        <div className="seg">
          <button
            className={'seg-btn' + (searchSource === 'soundcloud' ? ' active' : '')}
            onClick={() => chooseSource('soundcloud')}
          >
            SoundCloud
          </button>
          <button
            className={'seg-btn' + (searchSource === 'yandex' ? ' active' : '')}
            onClick={() => chooseSource('yandex')}
          >
            Я.Музыка
          </button>
        </div>
        <div className="seg">
          <button
            className={'seg-btn' + (mode === 'tracks' ? ' active' : '')}
            onClick={() => setMode('tracks')}
          >
            {t('searchModeTracks')}
          </button>
          <button
            className={'seg-btn' + (mode === 'lyrics' ? ' active' : '')}
            onClick={() => setMode('lyrics')}
          >
            {t('searchModeLyrics')}
          </button>
        </div>
      </div>

      {mode === 'tracks' ? (
        <section>
          <h2>{chipsLabel}</h2>
          <div className="chips">
            {chips.map((c) => (
              <button key={c} className="chip" onClick={() => run(c)}>
                {c}
              </button>
            ))}
          </div>
        </section>
      ) : (
        !hasSearched && <p className="lyric-hint">{t('lyricSearchHint')}</p>
      )}

      {error && <div className="error-banner">{error}</div>}

      {mode === 'tracks' && !hasSearched && recentArtists.length > 0 && (
        <section>
          <h2>{t('recentArtists')}</h2>
          <div className="artist-grid">
            {recentArtists.map((a) => (
              <button key={a.name} className="artist-cell" onClick={() => onArtist?.(a.track)}>
                <div className="artist-cell-av">
                  {a.track.artwork ? (
                    <img src={a.track.artwork} alt="" loading="lazy" />
                  ) : (
                    <span>{a.name[0]}</span>
                  )}
                </div>
                <span className="artist-cell-name">{a.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {hasSearched && mode === 'tracks' && (
        <>
          {foundArtists.length > 0 && (
            <section>
              <h2>{t('artists')}</h2>
              <div className="artist-grid">
                {foundArtists.map((ar) => (
                  <button
                    key={ar.id}
                    className="artist-cell"
                    onClick={() => onOpenDetail?.({ kind: 'artist', artist: ar })}
                  >
                    <div className="artist-cell-av">
                      {ar.avatar ? <img src={ar.avatar} alt="" loading="lazy" /> : <span>{ar.name[0]}</span>}
                    </div>
                    <span className="artist-cell-name">{ar.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {foundAlbums.length > 0 && (
            <section>
              <h2>{t('albums')}</h2>
              <div className="card-row">
                {foundAlbums.map((al) => (
                  <button
                    key={al.id}
                    className="sq-card"
                    onClick={() => onOpenDetail?.({ kind: 'album', album: al })}
                  >
                    <div className="sq-cover">
                      {al.cover ? <img src={al.cover} alt="" loading="lazy" /> : <span>♪</span>}
                    </div>
                    <div className="sq-title">{al.title}</div>
                    {al.artist && <div className="sq-sub">{al.artist}</div>}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="section-head">
              <h2>{t('results')}</h2>
              {busy && <span className="spinner" aria-label="…" />}
            </div>
            {!busy && results.length === 0 && <div className="empty">{t('nothingFound')}</div>}
            <ul className="track-list">
              {results.map((tr, i) => (
                <TrackRow
                  key={tr.id}
                  track={tr}
                  onPlay={() => playQueue(results, i)}
                  onArtist={onArtist}
                />
              ))}
            </ul>
          </section>
        </>
      )}

      {hasSearched && mode === 'lyrics' && (
        <section>
          <div className="section-head">
            <h2>{t('results')}</h2>
            {busy && <span className="spinner" aria-label="…" />}
          </div>
          {!busy && resolved.length === 0 && <div className="empty">{t('nothingFound')}</div>}
          <ul className="track-list">
            {resolved.map((r, i) => (
              <Fragment key={r.track.id}>
                <TrackRow
                  track={r.track}
                  onPlay={() => playQueue(resolved.map((x) => x.track), i)}
                  onArtist={onArtist}
                />
                {r.snippet && <li className="lyric-snippet">«{r.snippet}»</li>}
              </Fragment>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
