import { useState } from 'react'
import type { Carousel } from '../../../shared/carousel'
import { MAX_SLIDES, MIN_SLIDES, isUntouched } from '../../../shared/carousel'
import { reel, userMessage } from '../api'
import { useNotify } from '../App'

interface DraftPanelProps {
  carousel: Carousel
  /** Saves what is on screen first; false when that failed (then nothing is drafted). */
  beforeDraft: () => Promise<boolean>
  onDrafted: (next: Carousel) => void
  /** True while the AI writes: the editor stops edits, which the draft would otherwise overwrite. */
  onBusy: (busy: boolean) => void
}

const COUNTS = Array.from({ length: MAX_SLIDES - MIN_SLIDES + 1 }, (_, i) => MIN_SLIDES + i)

/** "Write it with AI": the AI writes every slide's words for the carousel's brand. */
export function DraftPanel({ carousel, beforeDraft, onDrafted, onBusy }: DraftPanelProps) {
  const notify = useNotify()
  const [topic, setTopic] = useState(carousel.title)
  const [count, setCount] = useState(Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, carousel.slides.length)))
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const run = async () => {
    setConfirming(false)
    setBusy(true)
    onBusy(true)
    try {
      if (!(await beforeDraft())) return
      onDrafted(await reel.carousels.draft(carousel.id, topic, count))
      notify('Done. Read every slide before you post: change any word that does not sound right.', 'info')
    } catch (e) {
      notify(userMessage(e), 'error')
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }
  const start = () => {
    if (!topic.trim() || busy) return
    // Drafting replaces the words: ask first once the person has written in the slides.
    if (!isUntouched(carousel)) return setConfirming(true)
    void run()
  }

  return (
    <section className="panel stack carousel-writer" aria-labelledby="writer-title" data-testid="carousel-writer">
      <h2 id="writer-title">Write it with AI</h2>
      <label className="stack carousel-field">
        <span className="field-label">What it is about</span>
        <textarea className="textarea" rows={2} value={topic} onChange={(e) => setTopic(e.target.value.replace(/\n/g, ' '))} disabled={busy} data-testid="writer-topic" />
      </label>
      <div className="row wrap">
        <label className="row">
          <span className="field-label">Slides</span>
          <select className="input carousel-count" value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={busy}>
            {COUNTS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <button className="btn primary" onClick={start} disabled={busy || !topic.trim()} data-testid="writer-run">
          {busy ? 'Writing… up to a minute' : 'Write the slides'}
        </button>
      </div>
      {confirming && (
        <div className="row wrap carousel-confirm" role="alert">
          <span>This replaces the words on every slide. The illustrations stay.</span>
          <span className="spacer" />
          <button className="btn small ghost" onClick={() => setConfirming(false)}>Keep mine</button>
          <button className="btn small primary" onClick={() => void run()} data-testid="writer-replace">Replace them</button>
        </div>
      )}
      <p className="muted-sm">In the brand’s voice, with its rules. It never invents numbers: check every fact before you post.</p>
    </section>
  )
}

interface CaptionPanelProps {
  carousel: Carousel
  onChange: (patch: Pick<Carousel, 'caption'> | Pick<Carousel, 'hashtags'>) => void
}

/** The text posted under the carousel, and its hashtags. Saved with it, and into caption.txt on export. */
export function CaptionPanel({ carousel, onChange }: CaptionPanelProps) {
  const notify = useNotify()
  const [tags, setTags] = useState(carousel.hashtags.join(' '))
  const full = [carousel.caption, carousel.hashtags.join(' ')].filter(Boolean).join('\n\n')
  const copy = async () => {
    try {
      await reel.app.copyText(full)
      notify('Caption copied.', 'info')
    } catch (e) {
      notify(userMessage(e), 'error')
    }
  }
  return (
    <section className="panel stack" aria-labelledby="caption-title" data-testid="carousel-caption">
      <div className="row">
        <h2 id="caption-title">Caption</h2>
        <span className="spacer" />
        <button className="btn small ghost" onClick={() => void copy()} disabled={!full}>Copy</button>
      </div>
      <textarea className="textarea" rows={5} aria-label="Caption" placeholder="The text under the post. Write it with AI fills it in." value={carousel.caption} onChange={(e) => onChange({ caption: e.target.value })} data-testid="caption-text" />
      <input
        className="input"
        aria-label="Hashtags"
        placeholder="#hashtags separated by spaces"
        value={tags}
        onChange={(e) => {
          setTags(e.target.value)
          onChange({ hashtags: e.target.value.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`)) })
        }}
      />
    </section>
  )
}
