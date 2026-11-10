import { useCallback, useEffect, useRef, useState } from 'react'
import type { SavedScript } from '../../../shared/api'
import { clampSpeed, DEFAULT_WPM, formatLength, MAX_WPM, MIN_WPM, nextOffset, readSeconds, scriptLines, wordCount } from '../../../shared/teleprompter'
import { reel } from '../api'
import type { Go } from '../nav'

const SPEED_STEP = 10
const MIN_TEXT = 28
const MAX_TEXT = 72
const DEFAULT_TEXT = 44

/** Full-window reader. The text moves with a transform only, so scrolling never re-lays out the page. */
export function Teleprompter({ go, scriptId }: { go: Go; scriptId: string }) {
  const [script, setScript] = useState<SavedScript | null>(null)
  const [missing, setMissing] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [wpm, setWpm] = useState(DEFAULT_WPM)
  const [size, setSize] = useState(DEFAULT_TEXT)
  const [mirror, setMirror] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLDivElement>(null)
  const offset = useRef(0)

  useEffect(() => {
    reel.script
      .list()
      .then((all) => {
        const found = all.find((s) => s.id === scriptId) ?? null
        setScript(found)
        setMissing(!found)
      })
      .catch(() => setMissing(true))
  }, [scriptId])

  const lines = script ? scriptLines(script.hook, script.script) : []
  const words = wordCount(lines.join(' '))

  const place = useCallback((y: number) => {
    offset.current = y
    if (text.current) text.current.style.transform = `translateY(${-y}px)`
  }, [])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const max = Math.max(0, (text.current?.offsetHeight ?? 0) - (stage.current?.clientHeight ?? 0) / 2)
      const next = nextOffset(offset.current, now - last, wpm, words, max)
      last = now
      place(next)
      if (next >= max) setPlaying(false)
      else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, wpm, words, place])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
      } else if (e.key === 'ArrowUp') setWpm((w) => clampSpeed(w + SPEED_STEP))
      else if (e.key === 'ArrowDown') setWpm((w) => clampSpeed(w - SPEED_STEP))
      else if (e.key === 'Escape') go({ name: 'script' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  if (missing) {
    return (
      <div className="page narrow">
        <p className="muted">I could not find that script.</p>
        <button className="btn" onClick={() => go({ name: 'script' })}>
          Back to my scripts
        </button>
      </div>
    )
  }

  return (
    <section className="prompter" aria-label="Teleprompter" data-testid="teleprompter">
      <div className="prompter-stage" ref={stage}>
        <div className="prompter-line" aria-hidden="true" />
        <div className={mirror ? 'prompter-flip' : undefined}>
          <div className="prompter-text" ref={text} style={{ fontSize: size }}>
            {lines.map((l, i) => (
              <p key={i} className={i === 0 ? 'prompter-hook' : undefined}>
                {l}
              </p>
            ))}
          </div>
        </div>
      </div>
      <div className="prompter-bar">
        <button className="btn primary" onClick={() => setPlaying((p) => !p)} data-testid="prompter-play">
          {playing ? 'Pause' : 'Start'}
        </button>
        <button
          className="btn"
          onClick={() => {
            setPlaying(false)
            place(0)
          }}
        >
          Back to the top
        </button>
        <label>
          Speed
          <input type="range" min={MIN_WPM} max={MAX_WPM} step={SPEED_STEP} value={wpm} onChange={(e) => setWpm(clampSpeed(Number(e.target.value)))} />
        </label>
        <label>
          Text size
          <input type="range" min={MIN_TEXT} max={MAX_TEXT} step={2} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </label>
        <label>
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Mirror
        </label>
        <span className="spacer" />
        <span data-testid="prompter-length">About {formatLength(readSeconds(lines.join(' '), wpm))}</span>
        <button className="btn" onClick={() => go({ name: 'new', scriptId })}>
          I filmed it
        </button>
        <button className="btn ghost" onClick={() => go({ name: 'script' })}>
          Close
        </button>
      </div>
    </section>
  )
}
