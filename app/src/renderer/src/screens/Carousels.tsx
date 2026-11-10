import { useCallback, useEffect, useState } from 'react'
import type { Carousel } from '../../../shared/carousel'
import { STYLE_LABELS } from '../../../shared/carousel'
import { NO_ASSETS, slideHtml } from '../../../shared/carousel-render'
import { niceDate, reel, userMessage } from '../api'
import { useNotify } from '../App'
import type { Go } from '../nav'
import { SlideFrame } from '../components/SlideFrame'
import { CarouselEditor } from './CarouselEditor'
import './Carousels.css'

interface CarouselsProps {
  go: Go
  id?: string
  /** The brand in use (sidebar switch): new carousels are made for it. */
  brandTitle: string | null
}

/** The Carousels page: the list, or one carousel's editor when `id` is set. */
export function Carousels({ go, id, brandTitle }: CarouselsProps) {
  if (id) return <CarouselEditor key={id} id={id} onBack={() => go({ name: 'carousels' })} />
  return <CarouselList go={go} brandTitle={brandTitle} />
}

function CarouselList({ go, brandTitle }: { go: Go; brandTitle: string | null }) {
  const notify = useNotify()
  const [list, setList] = useState<Carousel[] | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setList(await reel.carousels.list())
    } catch (e) {
      notify(userMessage(e), 'error')
    }
  }, [notify])
  useEffect(() => void load(), [load])

  const create = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      const c = await reel.carousels.create(title)
      go({ name: 'carousels', id: c.id })
    } catch (e) {
      notify(userMessage(e), 'error')
      setBusy(false)
    }
  }

  return (
    <div className="page" data-testid="carousels">
      <div className="page-head">
        <div>
          <h1>Carousels</h1>
          <p className="muted">
            5 to 7 slides: a hook, one idea per slide, one call to action.{brandTitle ? ` New ones are made for ${brandTitle}.` : ''}
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
          placeholder="What is it about? e.g. Your CV hides who you are"
          aria-label="New carousel topic"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="carousel-title"
        />
        <button className="btn primary" disabled={!title.trim() || busy} data-testid="carousel-create">
          New carousel
        </button>
      </form>
      {list && list.length === 0 && <p className="muted carousel-empty">No carousels yet. Type a topic above to start one.</p>}
      <div className="carousel-grid">
        {list?.map((c) => (
          <button key={c.id} className="carousel-card" onClick={() => go({ name: 'carousels', id: c.id })} data-testid={`carousel-${c.id}`}>
            {/* Thumbnails skip fonts and art (loaded per carousel in the editor): the shape and words are enough here. */}
            <SlideFrame html={slideHtml(c, 0, NO_ASSETS)} width={216} label={`${c.title}, first slide`} />
            <span className="carousel-card-title">{c.title}</span>
            <span className="muted-sm">
              {c.slides.length} slides · {STYLE_LABELS[c.style]} · {niceDate(c.updatedAt)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
