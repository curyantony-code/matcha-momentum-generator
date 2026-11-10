import { describe, expect, it } from 'vitest'
import { MAX_SLIDES, MIN_SLIDES, checkCarousel, cleanCarousel, moveSlide, newCarousel, slug } from '../src/shared/carousel'

const base = () => newCarousel({ id: 'c1', title: 'Why your CV hides you', brand: 'acme', style: 'cut-paper', handle: '@acme', now: '2026-11-05T10:00:00.000Z' })

describe('newCarousel', () => {
  it('starts with a hook, four ideas and a call to action', () => {
    const c = base()
    expect(c.slides.map((s) => s.role)).toEqual(['hook', 'body', 'body', 'body', 'body', 'cta'])
    expect(c.slides[0]!.headline).toBe('Why your CV hides you')
    expect(c).toMatchObject({ version: 1, id: 'c1', brand: 'acme', style: 'cut-paper', handle: '@acme', createdAt: '2026-11-05T10:00:00.000Z' })
  })
})

describe('slug', () => {
  it('makes a safe folder name', () => {
    expect(slug('Why your CV hides you!')).toBe('why-your-cv-hides-you')
    expect(slug('  ')).toBe('carousel')
    expect(slug('Ça va? Été 2026')).toBe('ca-va-ete-2026')
  })
})

describe('cleanCarousel', () => {
  it('keeps a good carousel as it is', () => {
    const c = base()
    expect(cleanCarousel(c)).toEqual(c)
  })

  it('refuses what is not a carousel', () => {
    expect(cleanCarousel(null)).toBeNull()
    expect(cleanCarousel({ id: 'x' })).toBeNull()
    expect(cleanCarousel({ ...base(), id: '../up' })).toBeNull()
  })

  it('fixes the parts it can: unknown style, roles, long text, too many slides, art names', () => {
    const many = Array.from({ length: 12 }, () => ({ role: 'nope', headline: 'x'.repeat(500), highlight: 7, body: 'b', kicker: '', art: '../../etc/passwd' }))
    const c = cleanCarousel({ ...base(), style: 'neon', slides: many })!
    expect(c.style).toBe('editorial')
    expect(c.slides).toHaveLength(MAX_SLIDES)
    expect(c.slides[0]!.role).toBe('body')
    expect(c.slides[0]!.headline.length).toBeLessThanOrEqual(200)
    expect(c.slides[0]!.highlight).toBe('')
    expect(c.slides[0]!.art).toBeNull()
  })

  it('keeps an art file name, never a path', () => {
    const c = base()
    const withArt = { ...c, slides: c.slides.map((s, i) => (i === 0 ? { ...s, art: '06-heart-dark.svg' } : s)) }
    expect(cleanCarousel(withArt)!.slides[0]!.art).toBe('06-heart-dark.svg')
  })
})

describe('moveSlide', () => {
  it('moves one slide and returns a new carousel', () => {
    const c = base()
    const moved = moveSlide(c, 1, 2)
    expect(moved.slides[2]).toBe(c.slides[1])
    expect(c.slides[1]!.role).toBe('body')
    expect(moved).not.toBe(c)
    expect(moveSlide(c, 0, -1)).toBe(c)
  })
})

describe('checkCarousel', () => {
  it('has nothing to say about a carousel that follows the rules', () => {
    const c = base()
    const good = {
      ...c,
      slides: c.slides.map((s, i) => ({ ...s, headline: i === 0 ? 'Your CV hides who you are' : `Idea number ${i} here`, highlight: i === 0 ? 'hides' : 'Idea' }))
    }
    expect(checkCarousel(good)).toEqual([])
  })

  it('names each broken rule with its slide', () => {
    const c = base()
    const bad = {
      ...c,
      slides: [
        { ...c.slides[1]!, headline: 'A body first', highlight: 'missing' },
        { ...c.slides[0]!, headline: 'One two three four five six seven eight nine ten eleven twelve thirteen', highlight: 'two' },
        { ...c.slides[5]!, headline: '', highlight: '' }
      ]
    }
    const notes = checkCarousel(bad).map((n) => `${n.slide ?? '-'}:${n.rule}`)
    expect(notes.sort()).toEqual(['-:count', '1:highlight', '1:hook-first', '2:headline-long', '3:empty'])
    const noCta = { ...c, slides: c.slides.map((s) => ({ ...s, role: 'body' as const })) }
    expect(checkCarousel(noCta).map((n) => n.rule)).toContain('cta-last')
  })

  it('counts slides in the allowed range', () => {
    expect(MIN_SLIDES).toBe(5)
    expect(MAX_SLIDES).toBe(7)
  })
})

describe('caption and hashtags', () => {
  it('start empty and are cleaned like the rest', () => {
    const c = base()
    expect(c.caption).toBe('')
    expect(c.hashtags).toEqual([])
    const cleaned = cleanCarousel({ ...c, caption: 'Line one.\n\nLine two.', hashtags: ['#a', 7, 'b c', '#a'] })!
    expect(cleaned.caption).toBe('Line one.\n\nLine two.')
    expect(cleaned.hashtags).toEqual(['#a', '#bc'])
  })
})

describe('applyDraft', () => {
  const draft = {
    slides: [
      { role: 'hook' as const, kicker: '', headline: 'Your CV hides you', highlight: 'hides', body: '' },
      { role: 'body' as const, kicker: '', headline: 'One', highlight: 'One', body: '' },
      { role: 'body' as const, kicker: '', headline: 'Two', highlight: 'Two', body: '' },
      { role: 'body' as const, kicker: '', headline: 'Three', highlight: 'Three', body: '' },
      { role: 'cta' as const, kicker: '', headline: 'Join', highlight: 'Join', body: 'Waitlist link in bio.' }
    ],
    caption: 'Cap.',
    hashtags: ['#cv']
  }

  it('puts the words in, keeps each slide’s illustration, and returns a new carousel', async () => {
    const { applyDraft } = await import('../src/shared/carousel')
    const c = base()
    const withArt = { ...c, slides: c.slides.map((s, i) => (i === 0 ? { ...s, art: '06-heart-dark.svg' } : s)) }
    const out = applyDraft(withArt, draft)
    expect(out.slides).toHaveLength(5)
    expect(out.slides[0]).toEqual({ role: 'hook', kicker: '', headline: 'Your CV hides you', highlight: 'hides', body: '', art: '06-heart-dark.svg' })
    expect(out.slides[4]!.art).toBeNull()
    expect(out).toMatchObject({ caption: 'Cap.', hashtags: ['#cv'], id: c.id, style: c.style })
    expect(withArt.slides).toHaveLength(6)
  })

  it('tells a fresh carousel from one the person wrote in', async () => {
    const { isUntouched } = await import('../src/shared/carousel')
    const c = base()
    expect(isUntouched(c)).toBe(true)
    expect(isUntouched({ ...c, slides: c.slides.map((s, i) => (i === 2 ? { ...s, headline: 'Mine' } : s)) })).toBe(false)
  })
})
