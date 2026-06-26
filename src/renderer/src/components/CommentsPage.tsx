import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTime } from '../util'
import { RealSoundCloudIcon, RealYandexMusicIcon, FolderIcon, CommentIcon } from './Icons'

interface ScComment {
  timeSec: number
  body: string
  user: string
  avatar?: string
}

const WINDOW = 4.5
const EXIT_MS = 250

/**
 * Holds a fading-out comment for a brief exit animation. We keep a snapshot of the
 * last active key in a ref and, when it changes, mount a secondary bubble with an
 * "out" class that disappears after EXIT_MS.
 */

export function CommentsPage(): JSX.Element {
  const t = useT()
  const queue = usePlayer((s) => s.queue)
  const currentIndex = usePlayer((s) => s.currentIndex)
  const track = currentIndex >= 0 ? queue[currentIndex] : undefined
  const positionSec = usePlayer((s) => s.positionSec)
  const seek = usePlayer((s) => s.seek)
  const openArtistFromTrack = usePlayer((s) => s.openArtistFromTrack)

  const isSc = track?.providerId === 'soundcloud' && !!track?.id.startsWith('sc:')

  // Source label/icon for the header (was hardcoded to SoundCloud).
  const source =
    track?.providerId === 'yandex'
      ? { label: t('yandexMusic'), Icon: RealYandexMusicIcon }
      : track?.providerId === 'local'
        ? { label: t('localFiles'), Icon: FolderIcon }
        : { label: 'SoundCloud', Icon: RealSoundCloudIcon }

  const [comments, setComments] = useState<ScComment[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!isSc || !track) { setComments([]); return }
    setLoading(true)
    window.api.scComments(track.id.slice(3)).then(cs => {
      if (!cancelled) { setComments(cs); setLoading(false) }
    }).catch(() => {
      if (!cancelled) { setComments([]); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [track?.id])

  const activeIndex = useMemo(() => {
    let best = -1
    for (let i = 0; i < comments.length; i++) {
      if (comments[i].timeSec <= positionSec && positionSec - comments[i].timeSec <= WINDOW)
        best = i
      if (comments[i].timeSec > positionSec) break
    }
    return best
  }, [comments, positionSec])

  const active = activeIndex >= 0 ? comments[activeIndex] : null
  const activeKey = active ? `${active.timeSec}-${active.user}` : null

  // Exit animation: keep the previous bubble in DOM briefly with class "out".
  const [exitKey, setExitKey] = useState<string | null>(null)
  const prevKey = useRef<string | null>(null)
  useEffect(() => {
    if (activeKey !== prevKey.current) {
      if (prevKey.current) {
        setExitKey(prevKey.current)
        const id = setTimeout(() => setExitKey(null), EXIT_MS)
        return () => clearTimeout(id)
      }
      prevKey.current = activeKey
    }
  }, [activeKey])

  // Find the comment object for the exiting key.
  const exitComment = exitKey
    ? comments.find((c) => `${c.timeSec}-${c.user}` === exitKey) ?? null
    : null

  if (!track) {
    return (
      <section className="tracklist">
        <div className="ph-aurora" />
        <div className="empty">{t('nothingPlaying')}</div>
      </section>
    )
  }

  return (
    <section className="tracklist comments-page">
      <div className="ph-aurora" />

      <header className="ph">
        <div className="ph-cover">
          {track.artwork ? <img src={track.artwork} alt="" /> : <span className="ph-cover-glyph">♪</span>}
        </div>
        <div className="ph-info">
          <span className="ph-label">
            <source.Icon size={14} />
            <span>{source.label}</span>
          </span>
          <h1 className="ph-title comments-title">{track.title}</h1>
          <button className="artist-link" style={{ fontSize: 15, color: 'var(--muted)' }} onClick={() => openArtistFromTrack(track)}>
            {track.artist || 'Unknown artist'}
          </button>
        </div>
      </header>

      {/* Reserved bubble slot for the active comment. The seekable waveform that
          used to live here was removed — it duplicated the two progress bars
          already on screen (player bar + now-playing panel). */}
      <div className="cm-card">
        <div className="cm-bubble-slot">
          {exitComment && (
            <div className="cm-bubble out">
              <div className="cm-bubble-av">
                {exitComment.avatar ? <img src={exitComment.avatar} alt="" /> : <span>{exitComment.user[0] ?? '?'}</span>}
              </div>
              <div className="cm-bubble-body">
                <span className="cm-bubble-user">{exitComment.user}</span>
                <span className="cm-bubble-text">{exitComment.body}</span>
              </div>
            </div>
          )}
          {active && (
            <div className="cm-bubble in" key={activeKey}>
              <div className="cm-bubble-av">
                {active.avatar ? <img src={active.avatar} alt="" /> : <span>{active.user[0] ?? '?'}</span>}
              </div>
              <div className="cm-bubble-body">
                <span className="cm-bubble-user">{active.user}</span>
                <span className="cm-bubble-text">{active.body}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comment list */}
      <div className="cm-list-head">
        <span className="ph-label">{comments.length} {t('comments').toLowerCase()}</span>
      </div>

      {loading && <div className="empty">{t('commentsLoading')}</div>}
      {!loading && !isSc && (
        <div className="cm-empty">
          <span className="cm-empty-icon">
            <CommentIcon size={28} />
          </span>
          <span className="cm-empty-title">{t('commentsScOnly')}</span>
          <span className="cm-empty-sub">{t('commentsScOnlySub')}</span>
        </div>
      )}
      {!loading && isSc && comments.length === 0 && (
        <div className="cm-empty">
          <span className="cm-empty-icon">
            <CommentIcon size={28} />
          </span>
          <span className="cm-empty-title">{t('noComments')}</span>
          <span className="cm-empty-sub">{t('noCommentsSub')}</span>
        </div>
      )}

      {!loading && comments.length > 0 && (
        <div className="cm-list">
          {comments.map((c, i) => (
            <div
              key={`${c.timeSec}-${c.user}`}
              className={`cm-entry ${i === activeIndex ? 'active' : ''} ${i < activeIndex ? 'past' : ''}`}
              onClick={() => seek(c.timeSec)}
              title={`Jump to ${formatTime(c.timeSec)}`}
            >
              <div className="cm-avatar">
                {c.avatar ? <img src={c.avatar} alt="" /> : <span>{c.user[0] ?? '?'}</span>}
              </div>
              <div className="cm-meta">
                <span className="cm-user">{c.user}</span>
                <span className="cm-text">{c.body}</span>
              </div>
              <span className="cm-stamp">{formatTime(c.timeSec)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
