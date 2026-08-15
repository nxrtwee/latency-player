// SoundCloud timed comments for the current track, in a bottom sheet. Each
// comment is tappable to seek to its timestamp. SoundCloud tracks carry their
// own comments; for other providers (Yandex/local) the user can find a matching
// SoundCloud track and borrow its comments (the link is persisted, with a reset).
import { useEffect, useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayer } from '@renderer/store'
import { useT } from '../i18n'
import { Portal } from './Portal'

interface Comment {
  timeSec: number
  body: string
  user: string
  avatar?: string
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Abbreviated play count (1_200 → "1.2K").
function fmtCount(n?: number): string {
  if (n == null) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function CommentsSheet({
  track,
  onSeek,
  onClose
}: {
  track: Track
  onSeek: (sec: number) => void
  onClose: () => void
}): JSX.Element {
  const t = useT()
  const scCommentLinks = usePlayer((s) => s.scCommentLinks)
  const linkScComments = usePlayer((s) => s.linkScComments)
  const unlinkScComments = usePlayer((s) => s.unlinkScComments)

  const isSc = track.providerId === 'soundcloud'
  // A non-SC track (Yandex/local) can borrow a SoundCloud track's comments.
  const linkedScId = !isSc ? scCommentLinks[track.id] : undefined
  // The SC track id whose comments we render (its own for a real SC track, or
  // the linked one for a borrowed stream). getComments strips any `sc:` prefix.
  const commentScId = isSc ? track.id : linkedScId
  const canFind = !isSc && !linkedScId

  const [comments, setComments] = useState<Comment[] | null>(null)
  const [results, setResults] = useState<Track[] | null>(null)

  useEffect(() => {
    if (!commentScId) return
    let alive = true
    setComments(null)
    window.api
      .scComments(commentScId)
      .then((c) => alive && setComments(c))
      .catch(() => alive && setComments([]))
    return () => {
      alive = false
    }
  }, [commentScId])

  // Auto-search SoundCloud for a match so the user can borrow its comments.
  useEffect(() => {
    if (!canFind) { setResults(null); return }
    let alive = true
    const title = track.title?.trim() ?? ''
    const primary = [title, track.artist].filter(Boolean).join(' ').trim()
    if (!primary) { setResults([]); return }
    setResults(null)
    // Primary query is title + artist; fall back to title-only if that finds
    // nothing (artist may differ across services or be missing on SoundCloud).
    ;(async () => {
      try {
        let r = await window.api.scSearch(primary)
        if (alive && r.length === 0 && title && title !== primary) {
          r = await window.api.scSearch(title)
        }
        if (alive) setResults(r.slice(0, 12))
      } catch {
        if (alive) setResults([])
      }
    })()
    return () => {
      alive = false
    }
  }, [canFind, track.id])

  return (
    <Portal>
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grab" />
          <div className="sheet-title">
            {t('comments')}
            {linkedScId && (
              <button className="cm-unlink" onClick={() => unlinkScComments(track.id)}>
                {t('commentsResetLink')}
              </button>
            )}
          </div>

          {canFind ? (
            <div className="cm-find">
              <div className="empty">{t('commentsScOnly')}</div>
              <div className="cm-find-sub">{t('commentsFindSub')}</div>
              {results === null ? (
                <div className="lyr-msg"><span className="spinner" /></div>
              ) : results.length === 0 ? (
                <div className="empty">{t('commentsNoMatches')}</div>
              ) : (
                <ul className="cm-list">
                  {results.map((r) => (
                    <li
                      key={r.id}
                      className="cm-item"
                      onClick={() => linkScComments(track.id, r.id.slice(3))}
                    >
                      <div className="cm-av">
                        {r.artwork ? <img src={r.artwork} alt="" loading="lazy" /> : <span>♪</span>}
                      </div>
                      <div className="cm-body">
                        <div className="cm-meta">
                          <span className="cm-user">{r.title}</span>
                          {r.playCount != null && (
                            <span className="cm-time">▶ {fmtCount(r.playCount)}</span>
                          )}
                        </div>
                        <div className="cm-text">{r.artist || 'Unknown artist'}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : comments === null ? (
            <div className="lyr-msg"><span className="spinner" /></div>
          ) : comments.length === 0 ? (
            <div className="empty">{t('noComments')}</div>
          ) : (
            <ul className="cm-list">
              {comments.map((c, i) => (
                <li key={i} className="cm-item" onClick={() => { onSeek(c.timeSec); onClose() }}>
                  <div className="cm-av">
                    {c.avatar ? <img src={c.avatar} alt="" loading="lazy" /> : <span>{c.user[0]}</span>}
                  </div>
                  <div className="cm-body">
                    <div className="cm-meta">
                      <span className="cm-user">{c.user}</span>
                      <span className="cm-time">{fmt(c.timeSec)}</span>
                    </div>
                    <div className="cm-text">{c.body}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Portal>
  )
}
