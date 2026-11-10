import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { STORY_HEIGHT, STORY_WIDTH, type StoryAssets } from '../../../shared/story'

/** No fonts, logo or pictures: what posters and the editor use until a story's own assets arrive. */
export const EMPTY_STORY_ASSETS: StoryAssets = {
  fonts: { display: '', text: '', textBold: '', serif: '', condensed: '' },
  logo: null,
  art: {},
  images: {}
}

/** A short, fast fingerprint of the film's HTML (FNV-1a): each version of it gets its own frame (see SlideFrame). */
function fingerprint(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

interface StoryFrameProps {
  /** The film's HTML (shared/story-render.ts storyHtml). */
  html: string
  /** Shown width in CSS pixels; the film keeps its 9:16 shape. */
  width: number
  label: string
  /** The moment shown, in seconds. The frame is driven only by postMessage({type:'seek', t}). */
  t: number
  frameRef?: RefObject<HTMLIFrameElement | null>
}

/** The film in a sandboxed frame (scripts only: no navigation, no network), drawn at 1080 × 1920 and scaled down. */
export const StoryFrame = memo(function StoryFrame({ html, width, label, t, frameRef }: StoryFrameProps) {
  const own = useRef<HTMLIFrameElement | null>(null)
  const ref = frameRef ?? own
  const tRef = useRef(t)
  tRef.current = t
  const scale = width / STORY_WIDTH
  const key = useMemo(() => fingerprint(html), [html])
  const post = useCallback(() => ref.current?.contentWindow?.postMessage({ type: 'seek', t: tRef.current }, '*'), [ref])
  useEffect(() => post(), [t, key, post])
  return (
    <div className="story-frame" style={{ width, height: STORY_HEIGHT * scale }} role="img" aria-label={label}>
      <iframe
        ref={ref}
        key={key}
        title={label}
        sandbox="allow-scripts"
        tabIndex={-1}
        srcDoc={html}
        width={STORY_WIDTH}
        height={STORY_HEIGHT}
        style={{ transform: `scale(${scale})` }}
        onLoad={post}
      />
    </div>
  )
})

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const STEP_S = 1

interface StoryPlayerProps {
  html: string
  /** Length of the film in seconds (the scenes' end, tail included). */
  duration: number
  /** The voiceover (reel-media: URL), or null: then it plays silently on the estimated timing. */
  audioUrl: string | null
  /** Move the playhead here (a new `n` moves it again to the same time). */
  jumpTo?: { t: number; n: number }
  width?: number
}

/** The preview: play/pause, a scrub bar and the time. Keeps the film in step with the voice's own clock. */
export function StoryPlayer({ html, duration, audioUrl, jumpTo, width = 324 }: StoryPlayerProps) {
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const clock = useRef({ base: 0, at: 0 })
  const tRef = useRef(0)
  const length = Math.max(0.1, duration)

  const move = useCallback(
    (next: number) => {
      const v = Math.min(length, Math.max(0, next))
      tRef.current = v
      setT(v)
      clock.current = { base: v, at: performance.now() }
      const a = audio.current
      if (a && Number.isFinite(a.duration) && v < a.duration) a.currentTime = v
    },
    [length]
  )

  useEffect(() => {
    if (jumpTo) move(jumpTo.t)
  }, [jumpTo, move])

  // A shorter film (lines removed) never leaves the playhead past its end.
  useEffect(() => {
    if (tRef.current > length) move(length)
  }, [length, move])

  useEffect(() => {
    const a = audio.current
    if (!playing) {
      a?.pause()
      return
    }
    if (tRef.current >= length) move(0)
    clock.current = { base: tRef.current, at: performance.now() }
    if (a && a.currentTime < (a.duration || 0)) void a.play().catch(() => {})
    let raf = 0
    const tick = (): void => {
      const voice = audio.current
      const next = voice && !voice.paused && !voice.ended ? voice.currentTime : clock.current.base + (performance.now() - clock.current.at) / 1000
      if (voice && !voice.paused && !voice.ended) clock.current = { base: next, at: performance.now() }
      if (next >= length) {
        tRef.current = length
        setT(length)
        setPlaying(false)
        return
      }
      tRef.current = next
      setT(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, length, move])

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'range') {
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
      }
      return // the range handles the arrows itself
    }
    if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault()
      setPlaying((p) => !p)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      move(tRef.current - STEP_S)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      move(tRef.current + STEP_S)
    }
  }

  return (
    <div className="story-player" role="group" aria-label="Preview player" onKeyDown={onKey} data-testid="story-player">
      <StoryFrame html={html} width={width} label="Story preview" t={t} />
      {audioUrl && <audio key={audioUrl} ref={audio} src={audioUrl} preload="auto" />}
      <div className="story-controls">
        <button className="btn small" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'} data-testid="story-play">
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          className="story-scrub"
          type="range"
          min={0}
          max={length}
          step={0.05}
          value={t}
          aria-label="Position"
          aria-valuetext={`${fmt(t)} of ${fmt(length)}`}
          onChange={(e) => move(Number(e.target.value))}
          data-testid="story-scrub"
        />
        <span className="muted-sm story-time" data-testid="story-time">{fmt(t)} / {fmt(length)}</span>
      </div>
      <p className="muted-sm">{audioUrl ? 'With the voice.' : 'No voice yet: playing silently at an estimated pace.'} Space plays, ← → move a second.</p>
    </div>
  )
}
