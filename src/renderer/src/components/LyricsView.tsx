import { memo, type CSSProperties, type Ref, useEffect, useMemo, useRef, useState } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTime } from '../util'
import { Waveform } from './Waveform'
import { OverlayScrollbar } from './OverlayScrollbar'
import { grabScroll } from '../grabScroll'
import { extractPalette, type Palette } from '../palette'
import { useCover } from '../cover'
import { SyncEditor } from './SyncEditor'
import {
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
  ChevronDownIcon,
  ImageIcon,
  RefreshIcon,
  ClockIcon,
  CloseIcon,
  FilmIcon
} from './Icons'

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

// Deterministic 0..1 pseudo-random from an integer — so each letter's fall tilt /
// drift stays stable across re-renders (no reshuffle on every position tick).
function rand01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

// One synced karaoke line, split into per-character spans so a finished line can
// crumble: the glyphs tip, drift and drop away (via CSS on `.kary-line.past`)
// instead of the whole line snapping to a dimmed state.
//
// Memoized because LyricsView re-renders on every position tick (~5×/s), but a
// line's spans only need to rebuild when its text or active/past state actually
// changes — which happens once per line boundary. All props are stable between
// boundaries (seek is a stable store action; opacity/state derive from
// activeIndex), so memo skips the per-char work in-between.
const KaryLine = memo(function KaryLine({
  text,
  state,
  opacity,
  seed,
  timeSec,
  seek,
  progress,
  crumble,
  innerRef
}: {
  text: string
  state: 'active' | 'past' | 'future'
  opacity: number
  seed: number
  timeSec: number
  seek: (t: number) => void
  progress?: number
  crumble: boolean
  innerRef?: Ref<HTMLParagraphElement>
}): JSX.Element {
  const chars = useMemo(() => [...(text || '♪')], [text])
  // On the active line, letters "spend" (crumble) one after another as the song
  // moves through the line — driven by `progress` (0..1), not a fixed timer.
  // We finish the crumble a little BEFORE the line ends (progress hits 1 exactly
  // when the next line takes over): dividing by 0.85 makes every letter land by
  // ~85% through the line, so none are left mid-fall when it flips to `.past`
  // (which would then drop them late, after the next line already appeared).
  const spentCount =
    state === 'active' && typeof progress === 'number'
      ? Math.round(Math.min(1, progress / 0.85) * chars.length)
      : 0
  // Crumble disabled (settings toggle off): render the line as plain text — no
  // per-char spans — so it just dims/scales between states like before.
  if (!crumble) {
    return (
      <p
        ref={innerRef}
        className={`kary-line ${state === 'active' ? 'active' : ''} ${state === 'past' ? 'past' : ''}`}
        style={{ opacity }}
        onClick={() => seek(timeSec)}
      >
        {text || '♪'}
      </p>
    )
  }
  return (
    <p
      ref={innerRef}
      className={`kary-line ${state === 'active' ? 'active' : ''} ${state === 'past' ? 'past' : ''}`}
      style={{ opacity }}
      onClick={() => seek(timeSec)}
    >
      {chars.map((ch, i) => {
        const r = rand01(seed * 131 + i)
        const r2 = rand01(seed * 131 + i * 7 + 3)
        return (
          <span
            key={i}
            className={`kary-char ${state === 'active' && i < spentCount ? 'spent' : ''}`}
            style={
              {
                '--ki': i,
                '--kr': `${(r * 2 - 1) * 26}deg`,
                '--kx': `${(r2 * 2 - 1) * 0.3}em`
              } as CSSProperties
            }
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        )
      })}
    </p>
  )
})

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
  const karaokeCrumble = usePlayer((s) => s.karaokeCrumble)
  const toggleLyrics = usePlayer((s) => s.toggleLyrics)
  const openArtistFromTrack = usePlayer((s) => s.openArtistFromTrack)
  const openArtist = usePlayer((s) => s.openArtist)
  const customBg = usePlayer((s) => s.customBg)
  const bgKind = usePlayer((s) => s.bgKind)
  const bgPosX = usePlayer((s) => s.bgPosX)
  const bgPosY = usePlayer((s) => s.bgPosY)
  const bgZoom = usePlayer((s) => s.bgZoom)
  const bgScope = usePlayer((s) => s.bgScope)
  const setTrackCover = usePlayer((s) => s.setTrackCover)
  const resetTrackCover = usePlayer((s) => s.resetTrackCover)
  const cover = useCover(track)
  const hasCustomCover = usePlayer((s) => (track ? !!s.customCovers[track.id] : false))

  // Per-track karaoke background (image / video / youtube), independent of the
  // global interface background. Takes precedence in the fullscreen player. Falls
  // back to the all-tracks karaoke background when this track has no own entry.
  const perTrackBg = usePlayer((s) => (track ? s.karaokeBgs[track.id] : undefined))
  const karaokeBgAll = usePlayer((s) => s.karaokeBgAll)
  const karaokeBgScope = usePlayer((s) => s.karaokeBgScope)
  const setKaraokeImage = usePlayer((s) => s.setKaraokeImage)
  const setKaraokeVideoFile = usePlayer((s) => s.setKaraokeVideoFile)
  const resetKaraokeBg = usePlayer((s) => s.resetKaraokeBg)
  const resetKaraokeBgAll = usePlayer((s) => s.resetKaraokeBgAll)
  const setKaraokeBgScope = usePlayer((s) => s.setKaraokeBgScope)

  // Effective karaoke background: a per-track override wins; otherwise the shared
  // all-tracks one. `isPerTrackBg` gates the position-sync (see the video effect).
  const karaokeBg = perTrackBg ?? karaokeBgAll
  const isPerTrackBg = !!perTrackBg

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
  // in over the gradient base, so there's never a half-loaded flash on open. Video
  // backgrounds stream their own frames (nothing to pre-decode) so they show at once.
  useEffect(() => {
    if (!showFsBg || !customBg) {
      setBgReady(false)
      return
    }
    if (bgKind === 'video') {
      setBgReady(true)
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
  }, [customBg, showFsBg, bgKind])

  // Karaoke wants the whole window. If the app is running in a restored
  // (windowed) state, maximize it on open — a normal window maximize, never OS
  // fullscreen (F11). Guarded with `?.` so the mobile shim (no such method) is
  // unaffected. Idempotent in main: a no-op when already maximized.
  useEffect(() => {
    window.api?.windowMaximize?.()
  }, [])

  function requestClose(): void {
    setClosing(true)
    setTimeout(() => toggleLyrics(), 240)
  }
  const viewportRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLParagraphElement>(null)
  const karyScrollRef = useRef<HTMLDivElement>(null)
  const lyricsAreaRef = useRef<HTMLDivElement>(null)
  // Set by the "reset" button so the next fetch bypasses the cache and refetches.
  const forceRef = useRef(false)

  // Karaoke background controls (image / video file menu)
  const videoRef = useRef<HTMLVideoElement>(null)
  const kbgRef = useRef<HTMLDivElement>(null)
  const [kbgMenu, setKbgMenu] = useState(false)

  // close the karaoke-bg menu on an outside click
  useEffect(() => {
    if (!kbgMenu) return
    function onDoc(e: MouseEvent): void {
      if (kbgRef.current && !kbgRef.current.contains(e.target as Node)) setKbgMenu(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [kbgMenu])

  // --- video background sync: keep it looping; coarse seek follows the player ---
  // The clip is a decorative backdrop, so it loops continuously even while the
  // music is paused — pausing it froze the background, which read as a bug. We only
  // ensure playback is running; the `loop` attribute handles the restart.
  useEffect(() => {
    const v = videoRef.current
    if (!v || karaokeBg?.type !== 'video') return
    v.play().catch(() => {})
  }, [karaokeBg])

  useEffect(() => {
    const v = videoRef.current
    if (!v || karaokeBg?.type !== 'video') return
    // The all-tracks background is decorative/ambient — let it loop freely rather
    // than snapping to each song's position (which would jump on every track
    // change). Only a per-track clip, chosen to match that one song, follows the
    // playhead.
    if (!isPerTrackBg) return
    const dur = v.duration
    // Only map the song position onto the clip when the clip is long enough;
    // shorter clips/edits just loop. Correct only real drift (user seek / start).
    if (dur && isFinite(dur) && positionSec < dur && Math.abs(v.currentTime - positionSec) > 1.2) {
      v.currentTime = positionSec
    }
  }, [positionSec, karaokeBg, isPerTrackBg])

  const trackKey = track ? `${track.title}|${track.artist}` : ''

  // backdrop palette from cover art
  useEffect(() => {
    let cancelled = false
    if (cover) {
      extractPalette(cover).then((p) => !cancelled && setPalette(p))
    } else {
      setPalette(null)
    }
    return () => {
      cancelled = true
    }
  }, [cover])

  useEffect(() => {
    if (!track) {
      setLyrics(null)
      setStatus('idle')
      return
    }
    let cancelled = false
    const force = forceRef.current
    forceRef.current = false
    setStatus('loading')
    setLyrics(null)
    window.api
      .getLyrics(
        track.title,
        track.artist || '',
        track.durationSec,
        usePlayer.getState().geniusFallback,
        force
      )
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

  // How far we are THROUGH the active line, 0..1 — from its own timestamp to the
  // next line's (or the track end for the last line). Drives the active line's
  // letters crumbling away as they're sung, one after another.
  const activeProgress = useMemo(() => {
    if (activeIndex < 0 || activeIndex >= karyLines.length) return 0
    const start = karyLines[activeIndex].timeSec
    const end =
      activeIndex + 1 < karyLines.length
        ? karyLines[activeIndex + 1].timeSec
        : durationSec || start + 8
    if (end <= start) return 1
    return Math.max(0, Math.min(1, (positionSec - start) / (end - start)))
  }, [activeIndex, karyLines, positionSec, durationSec])

  // Block mouse-wheel scrolling inside the lyrics area entirely — wheel-scrolling
  // over the masked karaoke viewport while a backdrop-filter is in the frame
  // freezes Chromium's repaint (the karaoke "freeze" bug). Scrolling here is done
  // only by dragging the overlay scrollbar, which sets scrollTop on the main
  // thread and never triggers the freeze. Must be a non-passive listener so
  // preventDefault actually cancels the scroll.
  useEffect(() => {
    const el = lyricsAreaRef.current
    if (!el) return
    const block = (e: WheelEvent): void => e.preventDefault()
    el.addEventListener('wheel', block, { passive: false })
    return () => el.removeEventListener('wheel', block)
  }, [])

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

  // A per-track karaoke background takes precedence over the global one.
  const hasKaraokeBg = !!karaokeBg
  const fsHasBg = hasKaraokeBg || showFsBg

  return (
    <div
      className={`fsplayer ${closing ? 'closing' : ''} ${fsHasBg ? 'has-image' : ''}`}
      style={{ '--fs-glow': palette?.top } as CSSProperties}
    >
      {/* Opaque gradient base is ALWAYS present so that while the custom image
          decodes there's a neutral backdrop — never a flash of the UI behind. */}
      <div
        className="fsplayer-bg"
        style={{
          background: palette
            ? `linear-gradient(165deg, ${palette.top} 0%, ${palette.bottom} 70%, #060807 100%)`
            : 'linear-gradient(165deg, #141019, #070509)'
        }}
      />
      {/* Per-track karaoke background layer (image / video file). */}
      {karaokeBg?.type === 'image' && (
        <img className="fsplayer-bg-img" src={karaokeBg.url} alt="" />
      )}
      {karaokeBg?.type === 'video' && (
        <video
          ref={videoRef}
          className="fsplayer-bg-video"
          src={karaokeBg.url}
          autoPlay
          loop
          muted
          playsInline
        />
      )}
      {!hasKaraokeBg && showFsBg && bgReady && bgKind === 'video' && (
        <video
          className="fsplayer-bg-video"
          src={customBg!}
          autoPlay
          loop
          muted
          playsInline
        />
      )}
      {!hasKaraokeBg && showFsBg && bgReady && bgKind !== 'video' && (
        <img
          className="fsplayer-bg-img"
          src={customBg!}
          alt=""
          style={{ objectPosition: `${bgPosX}% ${bgPosY}%`, transform: `scale(${bgZoom})` }}
        />
      )}
      <div className={`fsplayer-scrim ${fsHasBg ? 'on-image' : ''}`} />

      <button className="fsplayer-close" title="Close" onClick={requestClose}>
        <ChevronDownIcon size={22} />
      </button>

      {/* Bottom-right corner stack: lyric actions (reset / sync) sit above the
          per-track background button, all as round icon buttons. */}
      {track && (
        <div className="fsplayer-corner">
          {(status === 'ok' || status === 'none') && (
            <>
              {isManual && (
                <button
                  className="fsplayer-bg-btn"
                  onClick={removeManual}
                  title={tr('removeManualSync')}
                >
                  <CloseIcon size={18} />
                </button>
              )}
              <button
                className="fsplayer-bg-btn"
                onClick={() => {
                  forceRef.current = true
                  setReloadKey((k) => k + 1)
                }}
                title={tr('resetLyrics')}
              >
                <RefreshIcon size={17} />
              </button>
              <button
                className="fsplayer-bg-btn"
                onClick={() => setEditing(true)}
                disabled={!seedText}
                title={isManual ? tr('editSync') : tr('syncManually')}
              >
                <ClockIcon size={18} />
              </button>
            </>
          )}
          <div className="fsplayer-kbg" ref={kbgRef}>
            <button
              className={`fsplayer-bg-btn kbg-toggle ${hasKaraokeBg ? 'on' : ''}`}
              title={tr('trackBackground')}
              onClick={() => setKbgMenu((v) => !v)}
            >
              <FilmIcon size={19} />
            </button>
            {kbgMenu && (
              <div className="kbg-menu" onClick={(e) => e.stopPropagation()}>
                <div className="kbg-menu-head">{tr('trackBackground')}</div>
                <div className="kbg-scope-label">{tr('kbgScope')}</div>
                <div className="mix-toggle kbg-scope">
                  <button
                    className={karaokeBgScope === 'track' ? 'active' : ''}
                    onClick={() => setKaraokeBgScope('track')}
                  >
                    {tr('kbgScopeTrack')}
                  </button>
                  <button
                    className={karaokeBgScope === 'all' ? 'active' : ''}
                    onClick={() => setKaraokeBgScope('all')}
                  >
                    {tr('kbgScopeAll')}
                  </button>
                </div>
                <button className="kbg-opt" onClick={() => { setKaraokeImage(track.id); setKbgMenu(false) }}>
                  {tr('kbgImage')}
                </button>
                <button className="kbg-opt" onClick={() => { setKaraokeVideoFile(track.id); setKbgMenu(false) }}>
                  {tr('kbgVideoFile')}
                </button>
                {!!perTrackBg && (
                  <button
                    className="kbg-opt danger"
                    onClick={() => { resetKaraokeBg(track.id); setKbgMenu(false) }}
                  >
                    {tr('kbgReset')}
                  </button>
                )}
                {!!karaokeBgAll && (
                  <button
                    className="kbg-opt danger"
                    onClick={() => { resetKaraokeBgAll(); setKbgMenu(false) }}
                  >
                    {tr('kbgResetAll')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="fsplayer-inner">
        <div className="fsplayer-side">
          <div className="fsplayer-art">
            {cover ? <img src={cover} alt="" /> : <span>♫</span>}
            {track && (
              <div className="cover-edit">
                <button
                  className="cover-edit-btn"
                  title={tr('changeCover')}
                  onClick={() => setTrackCover(track.id)}
                >
                  <ImageIcon size={16} />
                </button>
                {hasCustomCover && (
                  <button
                    className="cover-edit-btn"
                    title={tr('resetCover')}
                    onClick={() => resetTrackCover(track.id)}
                  >
                    <RefreshIcon size={16} />
                  </button>
                )}
              </div>
            )}
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

        <div className="fsplayer-lyrics" ref={lyricsAreaRef}>
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
                  <KaryLine
                    key={i}
                    innerRef={i === activeIndex ? activeRef : undefined}
                    text={line.text}
                    state={i === activeIndex ? 'active' : i < activeIndex ? 'past' : 'future'}
                    opacity={lineOpacity(i)}
                    seed={i}
                    timeSec={line.timeSec}
                    seek={seek}
                    progress={i === activeIndex ? activeProgress : undefined}
                    crumble={karaokeCrumble}
                  />
                ))}
              </div>
            </div>
          )}
          {status === 'ok' && karyLines.length === 0 && plainLines.length > 0 && (
            <div className="kary-viewport static">
              <div className="kary-scroll" ref={karyScrollRef} onMouseDown={grabScroll}>
                <div className="kary-static">
                {plainLines.map((line, i) => (
                  <p key={i} className="kary-line static">
                    {line || ' '}
                  </p>
                ))}
                </div>
              </div>
              <OverlayScrollbar scrollRef={karyScrollRef} />
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
