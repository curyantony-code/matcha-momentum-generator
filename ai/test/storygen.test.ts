import { describe, expect, it } from 'vitest'
import { parseStoryDraft } from '../src/storygen'

const line = (shown: string, extra: Record<string, unknown> = {}, scene: Record<string, unknown> = {}) => ({
  shown,
  spoken: '',
  ...extra,
  scene: { type: 'line', world: 'paper', transition: 'cut', params: {}, ...scene }
})

const good = {
  title: 'Why a CV hides you',
  lines: [
    line('Nobody tells you how a CV hides you', {}, { type: 'title', world: 'ink', params: { hero: 'hides', kicker: 'The CV' } }),
    line('A job title is one line', {}, { world: 'paper', transition: 'zoom', params: { hero: 'one line' } }),
    line('Only 27% of CVs get read', { spoken: 'Only twenty-seven percent of CVs get read' }, { type: 'stat', world: 'clay', transition: 'flash', params: { value: '27%', label: 'of CVs get read' } }),
    line('You have more sides than that', {}, { world: 'grey', transition: 'whip', params: { hero: 'sides' } }),
    line('Show the whole you', {}, { type: 'highlight', world: 'black', transition: 'wipe', params: { phrase: 'whole you' } }),
    line('Follow for more', {}, { world: 'brand', transition: 'cut', params: { hero: 'Follow' } })
  ],
  caption: 'Nobody is just a job title.\n\nShow the whole you.',
  hashtags: ['#careers', 'personalbrand', '#careers']
}

describe('parseStoryDraft', () => {
  it('reads a good draft', () => {
    const d = parseStoryDraft(good)!
    expect(d.title).toBe('Why a CV hides you')
    expect(d.lines).toHaveLength(6)
    expect(d.lines[2].spoken).toBe('Only twenty-seven percent of CVs get read')
    expect(d.lines[2].scene).toEqual({ type: 'stat', world: 'clay', transition: 'flash', params: { value: '27%', label: 'of CVs get read' } })
    expect(d.caption).toBe('Nobody is just a job title.\n\nShow the whole you.')
    expect(d.hashtags).toEqual(['#careers', '#personalbrand'])
  })

  it('refuses a non-draft, too few lines, or a line with no words', () => {
    expect(parseStoryDraft(null)).toBeNull()
    expect(parseStoryDraft({ lines: 'x' })).toBeNull()
    expect(parseStoryDraft({ ...good, lines: good.lines.slice(0, 5) })).toBeNull()
    expect(parseStoryDraft({ ...good, lines: [...good.lines.slice(0, 5), line('  ')] })).toBeNull()
  })

  it('keeps the first and the true last line when there are more than 20', () => {
    const many = Array.from({ length: 25 }, (_, i) => line(`Line ${i}`, {}, { world: i % 2 ? 'ink' : 'paper' }))
    const d = parseStoryDraft({ ...good, lines: many })!
    expect(d.lines).toHaveLength(20)
    expect(d.lines[0].shown).toBe('Line 0')
    expect(d.lines[19].shown).toBe('Line 24')
  })

  it('whitelists type, world and transition', () => {
    const d = parseStoryDraft({ ...good, lines: good.lines.map((l) => ({ ...l, scene: { ...l.scene, type: 'confetti', world: 'neon', transition: 'crossfade' } })) })!
    expect(d.lines[0].scene.type).toBe('line')
    expect(d.lines[0].scene.world).toBe('paper')
    expect(d.lines.every((l) => l.scene.transition === 'cut')).toBe(true)
  })

  it('cleans text: no emojis, no line breaks, capped', () => {
    const d = parseStoryDraft({ ...good, lines: [line('Hello 🚀\n  world', { spoken: 'x'.repeat(900) }), ...good.lines.slice(1)] })!
    expect(d.lines[0].shown).toBe('Hello world')
    expect(d.lines[0].spoken.length).toBe(240) // the app's limit (story-logic LIMITS.spoken)
  })

  it('drops a hero or phrase the line does not hold', () => {
    const d = parseStoryDraft({
      ...good,
      lines: [
        line('Real words here', {}, { params: { hero: 'missing' } }),
        line('Real words here', {}, { type: 'highlight', world: 'ink', params: { phrase: 'not in it' } }),
        ...good.lines.slice(2)
      ]
    })!
    expect(d.lines[0].scene.params).toEqual({})
    expect(d.lines[1].scene.params).toEqual({})
  })

  it('turns a stat without a value into a line', () => {
    const d = parseStoryDraft({ ...good, lines: [line('Most people stay quiet', {}, { type: 'stat', params: { label: 'quiet' } }), ...good.lines.slice(1)] })!
    expect(d.lines[0].scene.type).toBe('line')
    expect(d.lines[0].scene.params.value).toBeUndefined()
  })

  it('fixes a world repeated back to back by taking the next one', () => {
    const same = good.lines.map((l) => ({ ...l, scene: { ...l.scene, world: 'ink' } }))
    const d = parseStoryDraft({ ...good, lines: same })!
    for (let i = 1; i < d.lines.length; i++) expect(d.lines[i].scene.world).not.toBe(d.lines[i - 1].scene.world)
    expect(d.lines[1].scene.world).toBe('clay')
  })

  it('caps list items at 5 and turns a list of fewer than 2 into a line', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const d = parseStoryDraft({ ...good, lines: [line('a b c d e f g', {}, { type: 'list', params: { items } }), line('One thing', {}, { type: 'list', world: 'ink', params: { items: ['one'] } }), ...good.lines.slice(2)] })!
    expect(d.lines[0].scene.params.items).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(d.lines[1].scene.type).toBe('line')
  })

  it('keeps at most 8 hashtags', () => {
    const d = parseStoryDraft({ ...good, hashtags: Array.from({ length: 12 }, (_, i) => `tag${i}`) })!
    expect(d.hashtags).toHaveLength(8)
  })
})

describe('limits the app keeps', () => {
  it('turns a stat whose number is too long to show into a plain line, never a cut number', () => {
    const lines = good.lines.map((l, i) => (i === 2 ? line('It cost $1,250,000 per year', {}, { type: 'stat', world: 'clay', params: { value: '$1,250,000 per year', label: 'cost' } }) : l))
    expect(parseStoryDraft({ ...good, lines })!.lines[2].scene.type).toBe('line')
  })

  it('trims a long line at a word, within the app’s 160 characters', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
    const d = parseStoryDraft({ ...good, lines: good.lines.map((l, i) => (i === 1 ? line(long) : l)) })!
    expect(d.lines[1].shown.length).toBeLessThanOrEqual(160)
    expect(long.startsWith(d.lines[1].shown)).toBe(true)
    expect(/word\d+$/.test(d.lines[1].shown)).toBe(true)
  })

  it('keeps the hero within the app’s 40 characters', () => {
    const hero = 'x'.repeat(50)
    const d = parseStoryDraft({ ...good, lines: good.lines.map((l, i) => (i === 3 ? line(`You have ${hero}`, {}, { world: 'grey', params: { hero } }) : l)) })!
    expect(d.lines[3].scene.params.hero ?? '').not.toBe(hero)
  })
})
