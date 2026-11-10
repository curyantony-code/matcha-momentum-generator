import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Story, StoryPalette } from '../../../shared/story'
import { estimateTiming } from '../../../shared/story-logic'
import { storyHtml } from '../../../shared/story-render'
import { niceDate, reel, userMessage } from '../api'
import { useNotify } from '../App'
import type { Go } from '../nav'
import { EMPTY_STORY_ASSETS, StoryFrame } from '../components/StoryPlayer'
import { StoryEditor } from './StoryEditor'
import './Carousels.css'
import './Stories.css'

interface StoriesProps {
  go: Go
  id?: string
  /** The brand in use (sidebar switch): new stories are made for it. */
  brandTitle: string | null
}

const PALETTE_LABELS: Record<StoryPalette, string> = { brand: 'Brand colours', mono: 'Paper and ink' }
/** The poster shows the first scene a moment in, once its words have landed. */
const POSTER_S = 0.9
const POSTER_WIDTH = 126

/** The Stories page: the list, or one story's editor when `id` is set. */
export function Stories({ go, id, brandTitle }: StoriesProps) {
  if (id) return <StoryEditor key={id} id={id} onBack={() => go({ name: 'stories' })} />
  return <StoryList go={go} brandTitle={brandTitle} />
}

function Poster({ story }: { story: Story }) {
  // Posters skip fonts and art (loaded per story in the editor): the shape, colour and words are enough here.
  const html = useMemo(() => storyHtml(story, estimateTiming(story), EMPTY_STORY_ASSETS), [story])
  return <StoryFrame html={html} width={POSTER_WIDTH} t={POSTER_S} label={`${story.title}, first scene`} />
}

function StoryList({ go, brandTitle }: { go: Go; brandTitle: string | null }) {
  const notify = useNotify()
  const [list, setList] = useState<Story[] | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setList(await reel.stories.list())
    } catch (e) {
      notify(userMessage(e), 'error')
    }
  }, [notify])
  useEffect(() => void load(), [load])

  const create = async (): Promise<void> => {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      const s = await reel.stories.create(title)
      go({ name: 'stories', id: s.id })
    } catch (e) {
      notify(userMessage(e), 'error')
      setBusy(false)
    }
  }

  return (
    <div className="page" data-testid="stories">
      <div className="page-head">
        <div>
          <h1>Stories</h1>
          <p className="muted">
            A short with no camera: every line is a full-screen scene, timed to a voice.{brandTitle ? ` New ones are made for ${brandTitle}.` : ''}
          </p>
        </div>
      </div>
      <form
        className="panel row carousel-new"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <input
          className="input"
          placeholder="What is it about? e.g. Why recruiters skip your CV"
          aria-label="New story topic"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="story-title"
        />
        <button className="btn primary" disabled={!title.trim() || busy} data-testid="story-create">
          New story
        </button>
      </form>
      {list && list.length === 0 && <p className="muted carousel-empty">No stories yet. Type a topic above to start one.</p>}
      <ul className="story-list">
        {list?.map((s) => (
          <li key={s.id}>
            <button className="story-card" onClick={() => go({ name: 'stories', id: s.id })} data-testid={`story-${s.id}`}>
              <Poster story={s} />
              <span className="story-card-body">
                <span className="story-card-title">{s.title}</span>
                <span className="muted-sm">
                  {s.lines.length} lines · {PALETTE_LABELS[s.palette]} · {niceDate(s.updatedAt)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
