import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTime } from '../util'
import { Waveform } from './Waveform'
import { extractPalette, type Palette } from '../palette'
import { SyncEditor } from './SyncEditor'
import { PlayIcon, PauseIcon, PrevIcon, NextIcon, ChevronDownIcon, ImageIcon } from './Icons'

interface Lyrics {
  source: string
  synced: boolean
  manual?: boolean
  lines: { timeSec: number; text: string }[]
  plain: string | null
}

/** Tidy plain (Genius / LRCLIB-plain) lyrics: trim and collapse blank runs. */
function cleanPlain(plain: string): string[] {
  const lines = plain.split('\n').map((l) => l.trim())
  const cleaned: string[] = []
  for (const l of lines) {
    if (l === '' && cleaned[cleaned.length - 1] === '') continue
    cleaned.push(l)
  }
  while (cleaned.length && cleaned[cleaned.length - 1] === '') cleaned.pop()
  return cleaned
}

export function LyricsView(): JSX.Element {
  const tr = useT()
  const track = usePlayer((s) => (s.currentIndex >= 0 ? s.queue[s.currentIndex] : undefined))
  const positionSec = usePlayer((s) => s.positionSec)
  const durationSec = usePlayer((s) => s.durationSec)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const next = usePlayer((s) => s.next)
  const prev = usePlayer((s) => s.prev)
  const seek = usePlayer((s) => s.seek)
  const toggleLyrics = usePlayer((s) => s.toggleLyrics)
  const openArtistFromTrack = usePlayer((s) => s.openArtistFromTrack)
  const openArtist = usePlayer((s) => s.openArtist)
  const customBg = usePlayer((s) => s.customBg)
  const bgPosX = usePlayer((s) => s.bgPosX)
  const bgPosY = usePlayer((s) => s.bgPosY)
  const bgZoom = usePlayer((s) => s.bgZoom)
  const bgScope = usePlayer((s) => s.bgScope)
  const pickBackground = usePlayer((s) => s.pickBackground)
  const openFraming = usePlayer((s) => s.openFraming)

  // The image shows in fullscreen for 'fullscreen' and 'global' scopes.
  const showFsBg = !!customBg && bgScope !== 'interface'

  const [lyrics, setLyrics] = useState<Lyrics | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'none' | 'ok'>('idle')
  const [offset, setOffset] = useState(0)
  const [palette, setPalette] = useState<Palette | null>(null)
  const [editing, setEditing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [closing, setClosing] = useState(false)
  const [bgReady, setBgReady] = useState(false)

  // Only reveal the custom background once it's fully decoded — then it crossfades
  // in over the gradient base, so there's never a half-loaded flash on open.
  useEffect(() => {
    if (!showFsBg || !customBg) {
      setBgReady(false)
      return
    }
    let cancelled = false
    setBgReady(false)
    const img = new Image()
    img.src = customBg
    const done = (): void => {
      if (!cancelled) setBgReady(true)
    }
    img.decode().then(done).catch(done)
    return () => {
      cancelled = true
    }
  }, [customBg, showFsBg])

  function requestClose(): void {
    setClosing(true)
    setTimeout(() => toggleLyrics(), 240)
  }
  const viewportRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLParagraphElement>(null)

  const trackKey = track ? `${track.title}|${track.artist}` : ''

  // backdrop palette from cover art
  useEffect(() => {
    let cancelled = false
    if (track?.artwork) {
      extractPalette(track.artwork).then((p) => !cancelled && setPalette(p))
    } else {
      setPalette(null)
    }
    return () => {
      cancelled = true
    }
  }, [track?.artwork])

  useEffect(() => {
    if (!track) {
      setLyrics(null)
      setStatus('idle')
      return
    }
    let cancelled = false
    setStatus('loading')
    setLyrics(null)
    window.api
      .getLyrics(track.title, track.artist || '', track.durationSec, usePlayer.getState().geniusFallback)
      .then((res) => {
        if (cancelled) return
        if (res && (res.synced || res.plain)) {
          setLyrics(res as Lyrics)
          setStatus('ok')
        } else {
          setStatus('none')
        }
      })
      .catch(() => !cancelled && setStatus('none'))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey, reloadKey])

  // Karaoke only for REAL synced lyrics (LRCLIB-synced or a manual sync). Genius
  // and other plain lyrics have no timestamps, so we no longer fake the timing —
  // they're shown as static text (the user can sync them by hand if they want).
  const karyLines = useMemo(() => {
    if (!lyrics) return []
    if (lyrics.synced && lyrics.lines.length) return lyrics.lines
    return []
  }, [lyrics])
  const plainLines = useMemo(() => {
    if (!lyrics || lyrics.synced) return []
    return lyrics.plain ? cleanPlain(lyrics.plain) : []
  }, [lyrics])

  const activeIndex = useMemo(() => {
    const lines = karyLines
    if (lines.length === 0) return -1
    let lo = 0
    let hi = lines.length - 1
    let ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (lines[mid].timeSec <= positionSec + 0.15) {
        ans = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return ans
  }, [karyLines, positionSec])

  // keep the active line centered in the karaoke viewport
  useEffect(() => {
    const vp = viewportRef.current
    const el = activeRef.current
    if (vp && el) setOffset(vp.clientHeight / 2 - (el.offsetTop + el.offsetHeight / 2))
  }, [activeIndex, status])

  function lineOpacity(i: number): number {
    if (activeIndex < 0) return i < 3 ? 0.5 : 0.2
    const d = Math.abs(i - activeIndex)
    return [1, 0.5, 0.28, 0.12][d] ?? 0
  }

  const isManual = !!lyrics?.manual
  const seedText = lyrics?.plain || karyLines.map((l) => l.text).join('\n') || ''

  async function removeManual(): Promise<void> {
    if (!track) return
    await window.api.deleteManualSync(track.title, track.artist || '', track.durationSec)
    setReloadKey((k) => k + 1)
  }

  return (
    <div className={`fsplayer ${closing ? 'closing' : ''} ${showFsBg ? 'has-image' : ''}`}>
      {/* Opaque gradient base is ALWAYS present so that while the custom image
          decodes there's a neutral backdrop — never a flash of the UI behind. */}
      <div
        className="fsplayer-bg"
        style={{
          background: palette
            ? `linear-gradient(165deg, ${palette.top} 0%, ${palette.bottom} 70%, #060807 100%)`
            : 'linear-gradient(165deg, #16241d, #080b0a)'
        }}
      />
      {showFsBg && bgReady && (
        <img
          className="fsplayer-bg-img"
          src={customBg!}
          alt=""
          style={{ objectPosition: `${bgPosX}% ${bgPosY}%`, transform: `scale(${bgZoom})` }}
        />
      )}
      <div className={`fsplayer-scrim ${showFsBg ? 'on-image' : ''}`} />

      <button className="fsplayer-close" title="Close" onClick={requestClose}>
        <ChevronDownIcon size={22} />
      </button>

      <button
        className="fsplayer-bg-btn"
        title={tr('changeBackground')}
        onClick={() => (customBg ? openFraming() : pickBackground())}
        onContextMenu={(e) => {
          // right-click to replace the image outright when one is already set
          e.preventDefault()
          pickBackground()
        }}
      >
        <ImageIcon size={19} />
      </button>

      <div className="fsplayer-inner">
        <div className="fsplayer-side">
          <div className="fsplayer-art">
            {track?.artwork ? <img src={track.artwork} alt="" /> : <span>♫</span>}
          </div>
          <div className="fsplayer-title">{track?.title ?? tr('nothingPlaying')}</div>
          {track && (
            <div className="fsplayer-artist">
              {track.artists && track.artists.length > 0 ? (
                track.artists.map((a, idx) => (
                  <span key={`${a.id ?? a.name}-${idx}`}>
                    {idx > 0 && <span className="artist-sep">, </span>}
                    <button
                      className="artist-link"
                      onClick={() =>
                        a.id
                          ? openArtist({ id: a.id, name: a.name, provider: track.providerId })
                          : openArtistFromTrack(track)
                      }
                    >
                      {a.name}
                    </button>
                  </span>
                ))
              ) : (
                <button className="artist-link" onClick={() => openArtistFromTrack(track)}>
                  {track.artist || 'Unknown artist'}
                </button>
              )}
            </div>
          )}
          {isManual && <span className="sync-badge side">{tr('manualSynced')}</span>}
        </div>

        <div className="fsplayer-lyrics">
          {status === 'loading' && <div className="lyrics-msg">{tr('searchingLyrics')}</div>}
          {status === 'none' && (
            <div className="lyrics-msg">
              {tr('noLyrics')}
              <span className="lyrics-sub">{tr('checkedSources')}</span>
            </div>
          )}
          {status === 'ok' && karyLines.length > 0 && (
            <div className="kary-viewport" ref={viewportRef}>
              <div className="kary" style={{ transform: `translateY(${offset}px)` }}>
                {karyLines.map((line, i) => (
                  <p
                    key={i}
                    ref={i === activeIndex ? activeRef : null}
                    className={`kary-line ${i === activeIndex ? 'active' : ''} ${
                      i < activeIndex ? 'past' : ''
                    }`}
                    style={{ opacity: lineOpacity(i) }}
                    onClick={() => seek(line.timeSec)}
                  >
                    {line.text || '♪'}
                  </p>
                ))}
              </div>
            </div>
          )}
          {status === 'ok' && karyLines.length === 0 && plainLines.length > 0 && (
            <div className="kary-viewport static">
              <div className="kary-scroll">
                <div className="kary-static">
                {plainLines.map((line, i) => (
                  <p key={i} className="kary-line static">
                    {line || ' '}
                  </p>
                ))}
                </div>
              </div>
              <div className="kary-note" title={tr('plainLyricsNote')}>
                {tr('plainLyricsNote')} · {lyrics?.source}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fsplayer-controls">
        <span className="pb-time">{formatTime(positionSec)}</span>
        <Waveform
          className="fsplayer-wave"
          seed={track?.id ?? 'latency'}
          positionSec={positionSec}
          durationSec={durationSec}
          onSeek={seek}
          bars={120}
          reactivity={0.85}
        />
        <span className="pb-time">{formatTime(durationSec)}</span>
        <div className="fsplayer-transport">
          <button className="icon-btn" title="Previous" onClick={prev}>
            <PrevIcon size={22} />
          </button>
          <button className="play-btn" title="Play/Pause" onClick={togglePlay}>
            {isPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          <button className="icon-btn" title="Next" onClick={next}>
            <NextIcon size={22} />
          </button>
        </div>
      </div>

      {track && (status === 'ok' || status === 'none') && (
        <div className="sync-corner">
          {isManual && (
            <button className="sync-corner-btn ghost" onClick={removeManual} title="Remove manual sync">
              {tr('remove')}
            </button>
          )}
          <button
            className="sync-corner-btn"
            onClick={() => setEditing(true)}
            disabled={!seedText}
          >
            {isManual ? tr('editSync') : tr('syncManually')}
          </button>
        </div>
      )}

      {editing && track && (
        <SyncEditor
          track={track}
          seedText={seedText}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            setReloadKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
