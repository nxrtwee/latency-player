// Search — real SoundCloud search wired to the shared store. Type a query (or
// tap a popular chip) → results stream in → tap a track to play it through the
// shared player core (same code path as desktop).
import { useState } from 'react'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'
import { TrackRow } from '../components/TrackRow'
import type { Track } from '@shared/types'

const POPULAR = ['sqwore', '17 seventeen', 'dream', 'yandere', 'greyrock', 'hikariii', 'phonk']

export function SearchScreen({ onArtist }: { onArtist?: (t: Track) => void }): JSX.Element {
  const [q, setQ] = useState('')
  const search = usePlayer((s) => s.searchSoundCloud)
  const results = usePlayer((s) => s.scResults)
  const loading = usePlayer((s) => s.scLoading)
  const error = usePlayer((s) => s.error)
  const query = usePlayer((s) => s.scQuery)
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

  const run = (term: string): void => {
    setQ(term)
    void search(term)
  }

  const hasSearched = query.trim().length > 0 || loading

  return (
    <div className="view">
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault()
          void search(q)
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchPh')}
          autoCorrect="off"
          autoCapitalize="off"
        />
        {q && (
          <button type="button" className="search-clear" onClick={() => run('')}>
            ✕
          </button>
        )}
      </form>

      <section>
        <h2>{t('popular')}</h2>
        <div className="chips">
          {POPULAR.map((c) => (
            <button key={c} className="chip" onClick={() => run(c)}>
              {c}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="error-banner">{error}</div>}

      {!hasSearched && recentArtists.length > 0 && (
        <section>
          <h2>{t('recentArtists')}</h2>
          <div className="artist-grid">
            {recentArtists.map((a) => (
              <button key={a.name} className="artist-cell" onClick={() => onArtist?.(a.track)}>
                <div className="artist-cell-av">
                  {a.track.artwork ? <img src={a.track.artwork} alt="" loading="lazy" /> : <span>{a.name[0]}</span>}
                </div>
                <span className="artist-cell-name">{a.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {hasSearched && (
        <section>
          <div className="section-head">
            <h2>{t('results')}</h2>
            {loading && <span className="spinner" aria-label="…" />}
          </div>
          {!loading && results.length === 0 && (
            <div className="empty">{t('nothingFound')}</div>
          )}
          <ul className="track-list">
            {results.map((tr, i) => (
              <TrackRow key={tr.id} track={tr} onPlay={() => playQueue(results, i)} onArtist={onArtist} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
