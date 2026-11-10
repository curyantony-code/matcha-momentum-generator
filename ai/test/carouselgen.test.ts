import { describe, expect, it } from 'vitest'
import { parseCarouselDraft } from '../src/carouselgen'

const good = {
  slides: [
    { role: 'hook', kicker: '', headline: 'Your CV hides who you are', highlight: 'hides', body: '' },
    { role: 'body', kicker: 'The problem', headline: 'A job title is one line', highlight: 'one line', body: 'Nobody is just that.' },
    { role: 'body', headline: 'You have more sides than that', highlight: 'sides' },
    { role: 'body', headline: 'Write your own first impression', highlight: 'own' },
    { role: 'body', headline: 'Show the whole you', highlight: 'whole' },
    { role: 'cta', headline: 'Follow for more', highlight: 'Follow', body: 'Waitlist link in bio.' }
  ],
  caption: 'Nobody is just a job title.',
  hashtags: ['#careers', 'personalbrand', '#cv']
}

describe('parseCarouselDraft', () => {
  it('reads a good draft, filling the missing fields', () => {
    const d = parseCarouselDraft(good)!
    expect(d.slides).toHaveLength(6)
    expect(d.slides[2]).toEqual({ role: 'body', kicker: '', headline: 'You have more sides than that', highlight: 'sides', body: '' })
    expect(d.caption).toBe('Nobody is just a job title.')
    expect(d.hashtags).toEqual(['#careers', '#personalbrand', '#cv'])
  })

  it('refuses too few slides, and keeps only the first 7', () => {
    expect(parseCarouselDraft({ ...good, slides: good.slides.slice(0, 3) })).toBeNull()
    const nine = { ...good, slides: [...good.slides, ...good.slides.slice(1, 4)] }
    expect(parseCarouselDraft(nine)!.slides).toHaveLength(7)
  })

  it('makes the first slide the hook and the last the call to action', () => {
    const d = parseCarouselDraft({ ...good, slides: good.slides.map((s) => ({ ...s, role: 'body' })) })!
    expect(d.slides[0]!.role).toBe('hook')
    expect(d.slides[d.slides.length - 1]!.role).toBe('cta')
    expect(d.slides.slice(1, -1).every((s) => s.role === 'body')).toBe(true)
  })

  it('drops a highlight that is not in its headline', () => {
    const d = parseCarouselDraft({ ...good, slides: good.slides.map((s, i) => (i === 1 ? { ...s, highlight: 'résumé' } : s)) })!
    expect(d.slides[1]!.highlight).toBe('')
  })

  it('refuses a slide without a headline, and what is not a draft', () => {
    expect(parseCarouselDraft({ ...good, slides: good.slides.map((s, i) => (i === 2 ? { ...s, headline: ' ' } : s)) })).toBeNull()
    expect(parseCarouselDraft(null)).toBeNull()
    expect(parseCarouselDraft('slides')).toBeNull()
  })

  it('cleans the text: no line breaks, no emojis, capped lengths, at most 8 hashtags', () => {
    const d = parseCarouselDraft({
      ...good,
      slides: good.slides.map((s, i) => (i === 1 ? { ...s, headline: 'A job\ntitle 🚀 is one line', body: 'x'.repeat(900) } : s)),
      hashtags: Array.from({ length: 12 }, (_, i) => `tag${i}`)
    })!
    expect(d.slides[1]!.headline).toBe('A job title is one line')
    expect(d.slides[1]!.body.length).toBeLessThanOrEqual(400)
    expect(d.hashtags).toHaveLength(8)
  })
})

describe('caption', () => {
  it('keeps its paragraphs', () => {
    expect(parseCarouselDraft({ ...good, caption: 'Line one.\n\n\n\nLine  two.' })!.caption).toBe('Line one.\n\nLine two.')
  })
})

describe('more slides than a carousel takes', () => {
  it('keeps the real last slide as the call to action, dropping from the middle', () => {
    const many = { ...good, slides: [...good.slides.slice(0, 5), { role: 'body', headline: 'Extra one', highlight: 'one' }, { role: 'body', headline: 'Extra two', highlight: 'two' }, good.slides[5]] }
    const d = parseCarouselDraft(many)!
    expect(d.slides).toHaveLength(7)
    expect(d.slides[6]).toMatchObject({ role: 'cta', headline: 'Follow for more' })
  })
})
