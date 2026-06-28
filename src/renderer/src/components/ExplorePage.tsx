import { useEffect, useRef, useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { SearchIcon, SoundCloudIcon, YandexIcon, ClockIcon, PlayIcon } from './Icons'
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
  const searchResults = usePlayer((s) => s.searchResults)
  const searchArtists = usePlayer((s) => s.searchArtists)
  const searchAlbums = usePlayer((s) => s.searchAlbums)
  const showSearchAlbums = usePlayer((s) => s.showSearchAlbums)
  const showSearchPlaylists = usePlayer((s) => s.showSearchPlaylists)
  const searchQuery = usePlayer((s) => s.searchQuery)
  const searchLoading = usePlayer((s) => s.searchLoading)
  const searchSource = usePlayer((s) => s.searchSource)
  const setSearchSource = usePlayer((s) => s.setSearchSource)
  const runSearch = usePlayer((s) => s.runSearch)
  const openArtist = usePlayer((s) => s.openArtist)
  const openAlbum = usePlayer((s) => s.openAlbum)
  const playQueue = usePlayer((s) => s.playQueue)
  const t = useT()
  // Status strings ("Searching {p}…") name the active provider.
  const providerName = searchSource === 'yandex' ? 'Yandex Music' : 'SoundCloud'

  const [mode, setMode] = useState<Mode>('tracks')

  // ----- Tracks mode (keyword search on the selected source) -----
  const [input, setInput] = useState(searchQuery)

  function submitSearch(q: string): void {
    setInput(q)
    runSearch(q)
  }
  function chooseSource(source: 'soundcloud' | 'yandex'): void {
    if (source === searchSource) return
    setSearchSource(source)
    // Re-run the keyword search on the new source; lyric mode re-resolves via effect.
    if (mode === 'tracks' && input.trim()) runSearch(input)
  }
  function play(index: number): void {
    playQueue(searchResults, index)
  }
  const hasResults = searchResults.length > 0
  // Albums/playlists section respects the Settings visibility toggles.
  const visibleAlbums = searchAlbums.filter((a) =>
    a.kind === 'playlist' ? showSearchPlaylists : showSearchAlbums
  )

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

  /** Resolve one Genius hit to a track on the selected source (best title match). */
  async function resolveHit(hit: LyricHit): Promise<ResolvedLyricHit | null> {
    try {
      const q = `${hit.artist} ${hit.title}`.trim()
      const results =
        searchSource === 'yandex' ? await window.api.ymSearch(q) : await window.api.scSearch(q)
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
  }, [debouncedLyric, mode, searchSource])

  function playResolved(index: number): void {
    playQueue(resolved.map((r) => r.track), index)
  }

  return (
    <section className="tracklist explore">
      <div className="ph-aurora explore-aurora" />

      <div className="ex-hero">
        <div className="ex-badge">
          {searchSource === 'yandex' ? <YandexIcon size={16} /> : <SoundCloudIcon size={16} />}
          <span>Powered by {searchSource === 'yandex' ? 'Yandex Music' : 'SoundCloud'}</span>
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

        <div className="ex-source">
          <button
            className={`ex-source-btn ${searchSource === 'soundcloud' ? 'active' : ''}`}
            onClick={() => chooseSource('soundcloud')}
          >
            <SoundCloudIcon size={15} />
            SoundCloud
          </button>
          <button
            className={`ex-source-btn ${searchSource === 'yandex' ? 'active' : ''}`}
            onClick={() => chooseSource('yandex')}
          >
            <YandexIcon size={15} />
            {t('yandexMusic')}
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
                  if (e.key === 'Enter') submitSearch(input)
                }}
              />
              <button
                className="ex-search-btn"
                onClick={() => submitSearch(input)}
                disabled={!input.trim()}
              >
                {t('search')}
              </button>
            </div>

            <div className="ex-chips">
              {GENRES.map((g) => (
                <button
                  key={g}
                  className={`ex-chip ${searchQuery === g ? 'active' : ''}`}
                  onClick={() => submitSearch(g)}
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
          {searchLoading && <div className="empty">{t('searching').replace('{p}', providerName)}</div>}

          {!searchLoading &&
            searchQuery &&
            !hasResults &&
            searchArtists.length === 0 &&
            searchAlbums.length === 0 && (
              <div className="empty">Nothing found for “{searchQuery}”.</div>
            )}

          {!searchLoading && searchArtists.length > 0 && (
            <div className="ex-profiles">
              <div className="ex-results-head">{t('profiles')}</div>
              <div className="profile-row">
                {searchArtists.map((u) => (
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

          {!searchLoading && visibleAlbums.length > 0 && (
            <div className="ex-albums">
              <div className="ex-results-head">{t('albumsAndPlaylists')}</div>
              <div className="similar-row">
                {visibleAlbums.map((al) => (
                  <button
                    key={`${al.provider}-${al.kind}-${al.id}`}
                    className="album-card"
                    onClick={() => openAlbum(al)}
                    title={al.title}
                  >
                    <div className="album-cover">
                      {al.cover ? <img src={al.cover} alt="" /> : <span>♪</span>}
                    </div>
                    <span className="album-title">{al.title}</span>
                    <span className="album-year">
                      {al.kind === 'playlist' ? t('playlist') : t('album')}
                      {al.artist ? ` · ${al.artist}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasResults && (
            <>
              <div className="ex-results-head">
                Tracks for <strong>{searchQuery}</strong> · {searchResults.length}
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
                {searchResults.map((track, i) => (
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
          {lyricLoading && <div className="empty">{t('openingTrack').replace('{p}', providerName)}</div>}
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
