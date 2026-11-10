import { useState } from 'react'
import type { Story } from '../../../shared/story'
import { isUntouchedStory } from '../../../shared/story-logic'
import { reel, userMessage } from '../api'
import { useNotify } from '../App'

const MIN_DRAFT_LINES = 10
const MAX_DRAFT_LINES = 16
const DEFAULT_DRAFT_LINES = 12
const COUNTS = Array.from({ length: MAX_DRAFT_LINES - MIN_DRAFT_LINES + 1 }, (_, i) => MIN_DRAFT_LINES + i)

/** True once the person has written their own lines (anything beyond the starting lines newStory gave it). */
export function hasOwnWords(s: Story): boolean {
  return !isUntouchedStory(s)
}

interface DraftPanelProps {
  story: Story
  /** Saves what is on screen first; false when that failed (then nothing is drafted). */
  beforeDraft: () => Promise<boolean>
  onDrafted: (next: Story) => void
  /** True while the AI writes: the editor stops edits, which the draft would otherwise overwrite. */
  onBusy: (busy: boolean) => void
}

/** "Write it with AI": the AI writes every line and picks its scene, for the story's brand. */
export function StoryWriter({ story, beforeDraft, onDrafted, onBusy }: DraftPanelProps) {
  const notify = useNotify()
  const [topic, setTopic] = useState(story.title)
  const [count, setCount] = useState(DEFAULT_DRAFT_LINES)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const run = async (): Promise<void> => {
    setConfirming(false)
    setBusy(true)
    onBusy(true)
    try {
      if (!(await beforeDraft())) return
      onDrafted(await reel.stories.draft(story.id, topic, count))
      notify('Done. Read every line and listen to it before you post: change any word that does not sound right.', 'info')
    } catch (e) {
      notify(userMessage(e), 'error')
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }
  const start = (): void => {
    if (!topic.trim() || busy) return
    // Drafting replaces the lines: ask first once the person has written in them.
    if (hasOwnWords(story)) return setConfirming(true)
    void run()
  }

  return (
    <section className="panel stack" aria-labelledby="story-writer-title" data-testid="story-writer">
      <h2 id="story-writer-title">Write it with AI</h2>
      <label className="stack carousel-field">
        <span className="field-label">What it is about</span>
        <textarea className="textarea" rows={2} value={topic} onChange={(e) => setTopic(e.target.value.replace(/\n/g, ' '))} disabled={busy} data-testid="story-topic" />
      </label>
      <div className="row wrap">
        <label className="row">
          <span className="field-label">Lines</span>
          <select className="input carousel-count" value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={busy} data-testid="story-count">
            {COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="spacer" />
        <button className="btn primary" onClick={start} disabled={busy || !topic.trim()} data-testid="story-write">
          {busy ? 'Writing… up to a minute' : 'Write the lines'}
        </button>
      </div>
      {confirming && (
        <div className="row wrap carousel-confirm" role="alert">
          <span>This replaces every line you have written, and the voice will need making again.</span>
          <span className="spacer" />
          <button className="btn small ghost" onClick={() => setConfirming(false)}>Keep mine</button>
          <button className="btn small primary" onClick={() => void run()} data-testid="story-replace">Replace them</button>
        </div>
      )}
      <p className="muted-sm">About 30 to 50 seconds. In the brand’s voice, with its rules. It never invents numbers: check every fact before you post.</p>
    </section>
  )
}

interface CaptionPanelProps {
  story: Story
  onChange: (patch: Partial<Pick<Story, 'caption' | 'hashtags'>>) => void
}

/** The text posted under the story, and its hashtags. Saved with it, and into renders/caption.txt on export. */
export function StoryCaption({ story, onChange }: CaptionPanelProps) {
  const notify = useNotify()
  const [tags, setTags] = useState(story.hashtags.join(' '))
  const full = [story.caption, story.hashtags.join(' ')].filter(Boolean).join('\n\n')
  const copy = async (): Promise<void> => {
    try {
      await reel.app.copyText(full)
      notify('Caption copied.', 'info')
    } catch (e) {
      notify(userMessage(e), 'error')
    }
  }
  return (
    <section className="panel stack" aria-labelledby="story-caption-title" data-testid="story-caption">
      <div className="row">
        <h2 id="story-caption-title">Caption</h2>
        <span className="spacer" />
        <button className="btn small ghost" onClick={() => void copy()} disabled={!full}>Copy</button>
      </div>
      <textarea className="textarea" rows={5} aria-label="Caption" placeholder="The text under the post. Write it with AI fills it in." value={story.caption} onChange={(e) => onChange({ caption: e.target.value })} data-testid="story-caption-text" />
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
