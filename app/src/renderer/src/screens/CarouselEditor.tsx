import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Carousel, CarouselStyle, Slide, SlideRole } from '../../../shared/carousel'
import { MAX_SLIDES, STYLES, STYLE_LABELS, checkCarousel, moveSlide } from '../../../shared/carousel'
import { NO_ASSETS, slideHtml, type CarouselAssets } from '../../../shared/carousel-render'
import { useDebounced } from '../hooks/useDebounced'
import { reel, userMessage } from '../api'
import { useNotify } from '../App'
import { SlideFrame } from '../components/SlideFrame'
import { CaptionPanel, DraftPanel } from './CarouselWriter'

const SAVE_DELAY_MS = 500
const ROLES: { id: SlideRole; label: string }[] = [
  { id: 'hook', label: 'Hook' },
  { id: 'body', label: 'Idea' },
  { id: 'cta', label: 'Call to action' }
]
type SaveState = 'saved' | 'dirty' | 'saving' | 'error'
/** The preview redraws once typing pauses this long: each redraw is a new frame with the fonts inlined. */
const PREVIEW_DELAY_MS = 150

interface SlideFormProps {
  slide: Slide
  art: string[]
  assets: CarouselAssets
  onChange: (patch: Partial<Slide>) => void
}

function SlideForm({ slide, art, assets, onChange }: SlideFormProps) {
  const words = Array.from(new Set(slide.headline.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean)))
  return (
    <div className="stack" data-testid="slide-form">
      <div className="seg" role="group" aria-label="What this slide does">
        {ROLES.map((r) => (
          <button key={r.id} className={`tab${slide.role === r.id ? ' active' : ''}`} aria-pressed={slide.role === r.id} onClick={() => onChange({ role: r.id })}>
            {r.label}
          </button>
        ))}
      </div>
      <label className="stack carousel-field">
        <span className="field-label">Small line above (optional)</span>
        <input className="input" value={slide.kicker} onChange={(e) => onChange({ kicker: e.target.value })} placeholder="e.g. Step 2" />
      </label>
      <label className="stack carousel-field">
        <span className="field-label">Headline</span>
        <textarea className="textarea carousel-headline" rows={2} value={slide.headline} onChange={(e) => onChange({ headline: e.target.value.replace(/\n/g, ' ') })} data-testid="slide-headline" />
      </label>
      {words.length > 0 && (
        <div className="stack carousel-field">
          <span className="field-label" id="hl-label">Highlighted word (one per slide)</span>
          <div className="row wrap" role="group" aria-labelledby="hl-label">
            {words.map((w) => (
              <button key={w} className={`chip small${slide.highlight.toLowerCase() === w.toLowerCase() ? ' active' : ''}`} aria-pressed={slide.highlight.toLowerCase() === w.toLowerCase()} onClick={() => onChange({ highlight: slide.highlight.toLowerCase() === w.toLowerCase() ? '' : w })}>
                {w}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="stack carousel-field">
        <span className="field-label">Small text (optional)</span>
        <textarea className="textarea" rows={3} value={slide.body} onChange={(e) => onChange({ body: e.target.value.replace(/\n/g, ' ') })} data-testid="slide-body" />
      </label>
      {art.length > 0 && (
        <div className="stack carousel-field">
          <span className="field-label" id="art-label">Illustration (at most one)</span>
          <div className="carousel-art" role="group" aria-labelledby="art-label">
            <button className={`carousel-art-none${slide.art === null ? ' active' : ''}`} aria-pressed={slide.art === null} onClick={() => onChange({ art: null })}>
              None
            </button>
            {art.map((n) => (
              <button key={n} className={slide.art === n ? 'active' : ''} aria-pressed={slide.art === n} aria-label={n.replace(/^\d+-|-dark|\.\w+$/g, '').replace(/-/g, ' ')} onClick={() => onChange({ art: n })}>
                <img src={assets.art[n]} alt="" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function CarouselEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const notify = useNotify()
  const [c, setC] = useState<Carousel | null>(null)
  const [assets, setAssets] = useState<CarouselAssets>(NO_ASSETS)
  const [sel, setSel] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [saveError, setSaveError] = useState('')
  const latest = useRef<Carousel | null>(null)
  latest.current = c
  /** What is on disk: the carousel as last saved (or loaded). Anything else is unsaved. */
  const saved = useRef<Carousel | null>(null)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const deleted = useRef(false)

  useEffect(() => {
    let live = true
    Promise.all([reel.carousels.list(), reel.carousels.assets(id)])
      .then(([all, a]) => {
        if (!live) return
        const found = all.find((x) => x.id === id) ?? null
        saved.current = found
        setC(found)
        setAssets(a)
        setLoaded(true)
      })
      .catch((e) => {
        notify(userMessage(e), 'error')
        setLoaded(true)
      })
    return () => {
      live = false
    }
  }, [id, notify])

  /**
   * Saves what is on screen. One save at a time (main reads then writes, so two at once could put old text back);
   * true when what is on screen is on disk. A failure stops the autosave until the next edit or Retry.
   */
  const saveNow = useCallback(async (): Promise<boolean> => {
    while (inFlight.current) await inFlight.current
    const cur = latest.current
    if (!cur || deleted.current) return true
    if (saved.current === cur) return true
    setSaveState('saving')
    const run = reel.carousels.save(cur).then(
      () => {
        saved.current = cur
        setSaveError('')
        setSaveState(latest.current === cur ? 'saved' : 'dirty')
        return true
      },
      (e: unknown) => {
        setSaveError(userMessage(e))
        setSaveState('error')
        return false
      }
    )
    inFlight.current = run
    try {
      return await run
    } finally {
      if (inFlight.current === run) inFlight.current = null
    }
  }, [])

  useEffect(() => {
    if (saveState !== 'dirty') return
    const t = setTimeout(() => void saveNow(), SAVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [c, saveState, saveNow])

  // Leaving the page (another tab, the back link) still keeps the last edit.
  useEffect(
    () => () => {
      const cur = latest.current
      if (cur && !deleted.current && saved.current !== cur) void reel.carousels.save(cur).catch(() => {})
    },
    []
  )

  // The preview follows the editor once typing pauses; a slide whose HTML did not change keeps its frame.
  const shown = useDebounced(c, PREVIEW_DELAY_MS)
  const pages = useMemo(() => (shown ? shown.slides.map((_, i) => slideHtml(shown, i, assets)) : []), [shown, assets])

  if (!c) {
    return (
      <div className="page">
        {loaded && (
          <div className="panel stack" data-testid="carousel-missing">
            <p className="muted">That carousel is gone. It may have been deleted or moved.</p>
            <div className="row"><button className="btn small" onClick={onBack}>Back to Carousels</button></div>
          </div>
        )}
      </div>
    )
  }

  const update = (fn: (x: Carousel) => Carousel) => {
    setC((x) => (x ? fn(x) : x))
    setSaveState('dirty')
    setExported(null)
  }
  const setSlide = (patch: Partial<Slide>) => update((x) => ({ ...x, slides: x.slides.map((s, i) => (i === sel ? { ...s, ...patch } : s)) }))
  const addSlide = () => {
    update((x) => ({ ...x, slides: [...x.slides.slice(0, sel + 1), { role: 'body', kicker: '', headline: 'A new idea', highlight: '', body: '', art: null }, ...x.slides.slice(sel + 1)] }))
    setSel(sel + 1)
  }
  const removeSlide = () => {
    update((x) => ({ ...x, slides: x.slides.filter((_, i) => i !== sel) }))
    setSel(Math.max(0, sel - 1))
  }
  const move = (to: number) => {
    update((x) => moveSlide(x, sel, to))
    setSel(to)
  }
  const back = async () => {
    if (await saveNow()) onBack()
  }
  const doExport = async () => {
    setExporting(true)
    try {
      // Main draws the slides from the file on disk: never export from a save that did not happen.
      if (!(await saveNow())) return
      const r = await reel.carousels.export(c.id)
      setExported(r.files.length)
    } catch (e) {
      notify(userMessage(e), 'error')
    } finally {
      setExporting(false)
    }
  }
  const remove = async () => {
    try {
      deleted.current = true
      await reel.carousels.remove(c.id)
      onBack()
    } catch (e) {
      deleted.current = false
      notify(userMessage(e), 'error')
    }
  }

  const slide = c.slides[sel] ?? c.slides[0]!
  // A slide just added has no preview page yet (the preview waits for typing to pause): draw it now.
  const pageOf = (i: number): string => pages[i] ?? slideHtml(c, i, assets)
  const notes = checkCarousel(c)
  const artNames = Object.keys(assets.art)
  return (
    <div className="page carousel-editor" data-testid="carousel-editor">
      <div className="page-head">
        <div className="stack carousel-head">
          <button className="link" onClick={() => void back()}>← Carousels</button>
          <input className="input carousel-name" aria-label="Carousel name" disabled={drafting} value={c.title} onChange={(e) => update((x) => ({ ...x, title: e.target.value }))} />
        </div>
        <span className="row carousel-save" aria-live="polite">
          {saveState === 'error' ? (
            <>
              <span className="carousel-save-error" data-testid="carousel-save-state">Not saved: {saveError}</span>
              <button className="btn small" onClick={() => void saveNow()}>Retry</button>
            </>
          ) : (
            <span className="muted-sm" data-testid="carousel-save-state">{saveState === 'saved' ? 'Saved' : 'Saving…'}</span>
          )}
        </span>
      </div>

      <div className="carousel-layout">
        <section className="carousel-preview" aria-label="Preview">
          <SlideFrame html={pageOf(sel)} width={432} label={`Slide ${sel + 1} of ${c.slides.length}`} />
          <div className="carousel-strip" role="group" aria-label="Slides">
            {c.slides.map((_, i) => (
              <button key={i} className={`carousel-thumb${i === sel ? ' active' : ''}`} aria-pressed={i === sel} aria-label={`Slide ${i + 1}`} onClick={() => setSel(i)} data-testid={`thumb-${i + 1}`}>
                <SlideFrame html={pageOf(i)} width={72} label={`Slide ${i + 1}`} />
              </button>
            ))}
          </div>
          <div className="row wrap">
            <button className="btn small ghost" onClick={() => move(sel - 1)} disabled={drafting || sel === 0}>← Move</button>
            <button className="btn small ghost" onClick={() => move(sel + 1)} disabled={drafting || sel === c.slides.length - 1}>Move →</button>
            <span className="spacer" />
            <button className="btn small" onClick={addSlide} disabled={drafting || c.slides.length >= MAX_SLIDES} data-testid="slide-add">Add slide</button>
            <button className="btn small ghost danger" onClick={removeSlide} disabled={drafting || c.slides.length <= 1}>Remove</button>
          </div>
        </section>

        <div className="stack carousel-side-col">
        <DraftPanel
          carousel={c}
          onBusy={setDrafting}
          beforeDraft={saveNow}
          onDrafted={(next) => {
            saved.current = next
            setC(next)
            setSel(0)
            setSaveState('saved')
            setExported(null)
          }}
        />
        {/* While the AI writes, the words are its job: edits here would be overwritten, so they wait. */}
        <fieldset className="carousel-fieldset stack" disabled={drafting} aria-busy={drafting}>
        <section className="panel stack carousel-side" aria-label={`Slide ${sel + 1}`}>
          <div className="row wrap">
            <div className="seg" role="group" aria-label="Style">
              {STYLES.map((s: CarouselStyle) => (
                <button key={s} className={`tab${c.style === s ? ' active' : ''}`} aria-pressed={c.style === s} onClick={() => update((x) => ({ ...x, style: s }))} data-testid={`style-${s}`}>
                  {STYLE_LABELS[s]}
                </button>
              ))}
            </div>
            <input className="input carousel-handle" aria-label="Handle" placeholder="@handle" value={c.handle} onChange={(e) => update((x) => ({ ...x, handle: e.target.value }))} />
          </div>
          <h2>Slide {sel + 1}</h2>
          <SlideForm key={`${sel}-${c.updatedAt}`} slide={slide} art={artNames} assets={assets} onChange={setSlide} />
        </section>
        <CaptionPanel key={c.updatedAt} carousel={c} onChange={(patch) => update((x) => ({ ...x, ...patch }))} />
        </fieldset>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="panel carousel-notes" data-testid="carousel-notes">
          <strong>Before you post</strong>
          <ul>
            {notes.map((n, i) => (
              <li key={i}>
                {n.slide ? <button className="link" onClick={() => setSel(n.slide! - 1)}>Slide {n.slide}</button> : null} {n.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row carousel-actions">
        <button className="btn primary" onClick={() => void doExport()} disabled={exporting || drafting} data-testid="carousel-export">
          {exporting ? 'Making the slides…' : 'Export slides (PNG)'}
        </button>
        {exported !== null && (
          <>
            <span className="muted-sm" data-testid="carousel-exported">{exported} slides saved.</span>
            <button className="btn small ghost" onClick={() => void reel.carousels.reveal(c.id)}>Open folder</button>
          </>
        )}
        <span className="spacer" />
        {confirmDelete ? (
          <>
            <span className="muted-sm">Delete this carousel and its slides?</span>
            <button className="btn small danger-solid" onClick={() => void remove()}>Delete</button>
            <button className="btn small ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </>
        ) : (
          <button className="btn small ghost danger" onClick={() => setConfirmDelete(true)}>Delete…</button>
        )}
      </div>
    </div>
  )
}
