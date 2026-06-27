// SoundCloud timed comments for the current track, in a bottom sheet. Each
// comment is tappable to seek to its timestamp. Only SoundCloud tracks carry
// comments; other providers show a short note.
import { useEffect, useState } from 'react'
import type { Track } from '@shared/types'
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
  const isSc = track.providerId === 'soundcloud'
  const [comments, setComments] = useState<Comment[] | null>(null)

  useEffect(() => {
    if (!isSc) return
    let alive = true
    window.api
      .scComments(track.id)
      .then((c) => alive && setComments(c))
      .catch(() => alive && setComments([]))
    return () => {
      alive = false
    }
  }, [track.id, isSc])

  return (
    <Portal>
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grab" />
          <div className="sheet-title">{t('comments')}</div>
          {!isSc ? (
            <div className="empty">{t('commentsScOnly')}</div>
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
