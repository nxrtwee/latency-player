// Local files — real import via the file picker, plays through the mobile blob
// provider (with live waveform). Session blobs are lost on reload, so tracks
// from prior sessions show as "переимпортировать".
import { useRef, useState } from 'react'
import { usePlayer } from '@renderer/store'
import type { Track } from '@shared/types'
import { importFiles, getKnownLocal, isAvailable, clearLocal } from '../api/localfiles'
import { useT } from '../i18n'

function fmt(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function LocalScreen({ onClose }: { onClose: () => void }): JSX.Element {
  const playQueue = usePlayer((s) => s.playQueue)
  const currentId = usePlayer((s) => s.queue[s.currentIndex]?.id)
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  // session import state, seeded with what we know from previous sessions
  const [tracks, setTracks] = useState<Track[]>(() => getKnownLocal())

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    if (!e.target.files?.length) return
    const imported = await importFiles(e.target.files)
    setTracks((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]))
      for (const t of imported) map.set(t.id, t)
      return [...map.values()]
    })
    e.target.value = ''
  }

  const playable = tracks.filter((t) => isAvailable(t.id))

  return (
    <div className="view">
      <header className="lv-head">
        <button className="np-icon" aria-label="Назад" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="lv-titles">
          <div className="lv-title">{t('localFiles')}</div>
          <div className="lv-sub">{playable.length} {t('available')}</div>
        </div>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.aac,.opus"
        multiple
        hidden
        onChange={onPick}
      />

      <div className="local-actions">
        <button className="lv-play" onClick={() => inputRef.current?.click()}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('addFiles')}
        </button>
        {playable.length > 0 && (
          <button className="ghost-btn" onClick={() => playQueue(playable, 0)}>
            {t('playAll')}
          </button>
        )}
      </div>

      {tracks.length === 0 ? (
        <div className="empty">{t('localEmpty')}</div>
      ) : (
        <ul className="track-list">
          {tracks.map((tr) => {
            const avail = isAvailable(tr.id)
            return (
              <li
                key={tr.id}
                className={'track-row' + (tr.id === currentId ? ' playing' : '') + (avail ? '' : ' dim')}
                onClick={() => avail && playQueue(playable, playable.findIndex((x) => x.id === tr.id))}
              >
                <div className="track-cover"><span>♪</span></div>
                <div className="track-meta">
                  <div className="track-title">{tr.title}</div>
                  <div className="track-artist">
                    {avail ? tr.artist || t('localFile') : t('unavailable')}
                  </div>
                </div>
                <div className="track-dur">{fmt(tr.durationSec)}</div>
              </li>
            )
          })}
        </ul>
      )}

      {tracks.length > 0 && (
        <button
          className="ghost-btn danger"
          style={{ marginTop: 18 }}
          onClick={() => {
            clearLocal()
            setTracks([])
          }}
        >
          {t('clearList')}
        </button>
      )}
    </div>
  )
}
