// A carousel: 5 to 7 slides, a hook first, one idea per slide, a call to action last, one highlighted word each.
// The rules come from the carousel kits the person collected (Carousel Studio, "carousel structure"); the code is ours.

export type SlideRole = 'hook' | 'body' | 'cta'
export type CarouselStyle = 'cut-paper' | 'editorial' | 'midnight'

export interface Slide {
  role: SlideRole
  /** A small line above the headline ("Step 2", "The fix"); optional. */
  kicker: string
  headline: string
  /** One word (or short phrase) of the headline drawn in the accent colour. */
  highlight: string
  body: string
  /** A cut-paper illustration file name from the brand kit, or null. Never a path. */
  art: string | null
}

export interface Carousel {
  version: 1
  id: string
  title: string
  /** The brand it was made for (Brands tab id), or null. */
  brand: string | null
  style: CarouselStyle
  handle: string
  slides: Slide[]
  /** The text posted under the carousel (paragraphs kept), and its hashtags (each starting with #). */
  caption: string
  hashtags: string[]
  createdAt: string
  updatedAt: string
}

export const MIN_SLIDES = 5
export const MAX_SLIDES = 7
export const STYLES: readonly CarouselStyle[] = ['cut-paper', 'editorial', 'midnight']
export const STYLE_LABELS: Record<CarouselStyle, string> = { 'cut-paper': 'Cut-paper', editorial: 'Editorial', midnight: 'Midnight' }
const MAX_HEADLINE_WORDS = 12
const MAX_BODY_WORDS = 40
const LIMITS = { title: 120, kicker: 60, headline: 200, highlight: 60, body: 400, handle: 60, caption: 2200, hashtag: 40 }
const MAX_HASHTAGS = 8
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/
const ART = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(svg|png|jpe?g|webp)$/

export function slug(title: string): string {
  const s = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return s || 'carousel'
}

const blank = (role: SlideRole, headline: string, body = ''): Slide => ({ role, kicker: '', headline, highlight: '', body, art: null })

export interface NewCarousel {
  id: string
  title: string
  brand: string | null
  style: CarouselStyle
  handle: string
  now: string
}

export function newCarousel({ id, title, brand, style, handle, now }: NewCarousel): Carousel {
  return {
    version: 1,
    id,
    title,
    brand,
    style,
    handle,
    slides: [
      blank('hook', title),
      blank('body', 'The first idea', 'One idea per slide. Say it in a sentence.'),
      blank('body', 'The second idea'),
      blank('body', 'The third idea'),
      blank('body', 'The proof'),
      blank('cta', 'Follow for more', 'Waitlist link in bio.')
    ],
    caption: '',
    hashtags: [],
    createdAt: now,
    updatedAt: now
  }
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
/** A caption keeps its paragraphs; each line is cleaned like the rest. */
const caption = (v: unknown): string =>
  typeof v === 'string'
    ? v.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, LIMITS.caption)
    : ''
const hashtags = (v: unknown): string[] => {
  if (!Array.isArray(v)) return []
  const tags = v.flatMap((t) => {
    const clean = typeof t === 'string' ? t.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, LIMITS.hashtag) : ''
    return clean ? [`#${clean}`] : []
  })
  return Array.from(new Set(tags)).slice(0, MAX_HASHTAGS)
}

function cleanSlide(raw: unknown): Slide {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const role: SlideRole = r.role === 'hook' || r.role === 'cta' ? r.role : 'body'
  return {
    role,
    kicker: str(r.kicker, LIMITS.kicker),
    headline: str(r.headline, LIMITS.headline),
    highlight: str(r.highlight, LIMITS.highlight),
    body: str(r.body, LIMITS.body),
    art: typeof r.art === 'string' && ART.test(r.art) ? r.art : null
  }
}

/** A carousel as saved: unknown fields dropped, text capped, a path never accepted as art. Null if it is not one. */
export function cleanCarousel(raw: unknown): Carousel | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !ID.test(r.id) || !Array.isArray(r.slides) || !r.slides.length) return null
  const brand = typeof r.brand === 'string' && ID.test(r.brand) ? r.brand : null
  return {
    version: 1,
    id: r.id,
    title: str(r.title, LIMITS.title) || 'Untitled carousel',
    brand,
    style: STYLES.includes(r.style as CarouselStyle) ? (r.style as CarouselStyle) : 'editorial',
    handle: str(r.handle, LIMITS.handle),
    slides: r.slides.slice(0, MAX_SLIDES).map(cleanSlide),
    caption: caption(r.caption),
    hashtags: hashtags(r.hashtags),
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date(0).toISOString()
  }
}

/** A new carousel with slide `from` moved to `to`; the same one when the move is out of range. */
export function moveSlide(c: Carousel, from: number, to: number): Carousel {
  if (from < 0 || to < 0 || from >= c.slides.length || to >= c.slides.length || from === to) return c
  const slides = [...c.slides]
  const [s] = slides.splice(from, 1)
  slides.splice(to, 0, s!)
  return { ...c, slides }
}

export type CheckRule = 'count' | 'hook-first' | 'cta-last' | 'empty' | 'highlight' | 'headline-long' | 'body-long'

export interface CheckNote {
  /** 1-based slide number, or null for the whole carousel. */
  slide: number | null
  rule: CheckRule
  text: string
}

const words = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0)

/** What breaks the carousel rules, slide by slide. Advice, not a lock: export still works. */
export function checkCarousel(c: Carousel): CheckNote[] {
  const notes: CheckNote[] = []
  const n = c.slides.length
  if (n < MIN_SLIDES || n > MAX_SLIDES) notes.push({ slide: null, rule: 'count', text: `Use ${MIN_SLIDES} to ${MAX_SLIDES} slides (now ${n}).` })
  if (c.slides[0]?.role !== 'hook') notes.push({ slide: 1, rule: 'hook-first', text: 'Slide 1 should be the hook: the line that stops the scroll.' })
  if (c.slides[n - 1]?.role !== 'cta') notes.push({ slide: null, rule: 'cta-last', text: 'The last slide should ask for one action (follow, waitlist).' })
  c.slides.forEach((s, i) => {
    const at = i + 1
    if (!s.headline) {
      notes.push({ slide: at, rule: 'empty', text: 'This slide has no headline.' })
      return
    }
    if (s.highlight && !s.headline.toLowerCase().includes(s.highlight.toLowerCase())) {
      notes.push({ slide: at, rule: 'highlight', text: `The highlighted word "${s.highlight}" is not in the headline.` })
    }
    if (words(s.headline) > MAX_HEADLINE_WORDS) notes.push({ slide: at, rule: 'headline-long', text: `Keep the headline to ${MAX_HEADLINE_WORDS} words: split the idea over two slides.` })
    if (words(s.body) > MAX_BODY_WORDS) notes.push({ slide: at, rule: 'body-long', text: `Keep the small text under ${MAX_BODY_WORDS} words.` })
  })
  return notes
}

/** The words of a draft (from the AI), without the slide's art: what applyDraft takes. */
export interface CarouselDraft {
  slides: Omit<Slide, 'art'>[]
  caption: string
  hashtags: string[]
}

/** A new carousel with the draft's words; each slide keeps the illustration it had in its place. */
export function applyDraft(c: Carousel, draft: CarouselDraft): Carousel {
  const slides = draft.slides.slice(0, MAX_SLIDES).map((d, i): Slide => ({ ...cleanSlide(d), art: c.slides[i]?.art ?? null }))
  return { ...c, slides, caption: caption(draft.caption), hashtags: hashtags(draft.hashtags) }
}

/** Still the starting slides newCarousel gave it: drafting over it loses nothing the person wrote. */
export function isUntouched(c: Carousel): boolean {
  const start = newCarousel({ id: c.id, title: c.title, brand: c.brand, style: c.style, handle: c.handle, now: c.createdAt }).slides
  const words = (s: Slide): string => [s.kicker, s.headline, s.body].join('|')
  return c.slides.length === start.length && c.slides.every((s, i) => i === 0 || words(s) === words(start[i]!))
}
