import { useState } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { SearchIcon, SoundCloudIcon, ClockIcon } from './Icons'
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

export function ExplorePage(): JSX.Element {
  const scResults = usePlayer((s) => s.scResults)
  const scUsers = usePlayer((s) => s.scUsers)
  const scQuery = usePlayer((s) => s.scQuery)
  const scLoading = usePlayer((s) => s.scLoading)
  const searchSoundCloud = usePlayer((s) => s.searchSoundCloud)
  const openArtist = usePlayer((s) => s.openArtist)
  const playQueue = usePlayer((s) => s.playQueue)
  const t = useT()

  const [input, setInput] = useState(scQuery)

  function runSearch(q: string): void {
    setInput(q)
    searchSoundCloud(q)
  }
  function play(index: number): void {
    playQueue(scResults, index)
  }

  const hasResults = scResults.length > 0

  return (
    <section className="tracklist explore">
      <div className="ph-aurora explore-aurora" />

      <div className="ex-hero">
        <div className="ex-badge">
          <SoundCloudIcon size={16} />
          <span>Powered by SoundCloud</span>
        </div>
        <h1 className="ex-title">{t('explore')}</h1>
        <p className="ex-sub">{t('exploreSub')}</p>

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
          <button className="ex-search-btn" onClick={() => runSearch(input)} disabled={!input.trim()}>
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
      </div>

      {scLoading && <div className="empty">{t('searching')}</div>}

      {!scLoading && scQuery && !hasResults && scUsers.length === 0 && (
        <div className="empty">Nothing found for “{scQuery}”.</div>
      )}

      {!scLoading && scUsers.length > 0 && (
        <div className="ex-profiles">
          <div className="ex-results-head">{t('profiles')}</div>
          <div className="profile-row">
            {scUsers.map((u) => (
              <button key={u.id} className="profile-chip" onClick={() => openArtist(u)} title={u.name}>
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
    </section>
  )
}
