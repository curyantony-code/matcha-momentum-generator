import { describe, expect, it } from 'vitest'
import { NO_RESULT, SWIPE_END, SWIPE_START, cleanResult, learn, median, promptText, swipeSection, withSwipeSection, type ResultRow } from '../src/shared/results'

const TODAY = new Date('2026-11-20T12:00:00Z')
const row = (slug: string, views: number | null, extra: Partial<ResultRow> & { postedOn?: string; rating?: number } = {}): ResultRow => ({
  slug,
  title: slug,
  hook: `Hook of ${slug}`,
  formula: extra.formula ?? '',
  result: { views, rating: extra.rating ?? null, postedOn: extra.postedOn ?? '2026-11-01' }
})

describe('a result typed on a video page', () => {
  it('keeps only sane values', () => {
    expect(cleanResult({ views: 1234.6, rating: 4, postedOn: '2026-11-02' })).toEqual({ views: 1235, rating: 4, postedOn: '2026-11-02' })
    expect(cleanResult({ views: -1, rating: 6, postedOn: 'yesterday' })).toEqual(NO_RESULT)
    expect(cleanResult({ views: '500', rating: 2.5, postedOn: '2026-13-45' })).toEqual(NO_RESULT)
    expect(cleanResult(null)).toEqual(NO_RESULT)
  })
})

describe('learning from posted videos', () => {
  it('claims nothing until three videos are old enough to score', () => {
    const i = learn([row('a', 100), row('b', 900), row('c', 50, { postedOn: '2026-11-19' })], TODAY)
    expect(i.scored).toBe(2)
    expect(i.enough).toBe(false)
    expect(i.winners).toEqual([])
    expect(promptText(i)).toBe('')
    expect(i.rows.find((r) => r.slug === 'c')!.growing).toBe(true)
  })

  it('scores each video against the median and names winners and flops', () => {
    const i = learn([row('a', 100, { formula: 'Confession' }), row('b', 400, { formula: 'Contrarian' }), row('c', 200), row('d', 1000, { formula: 'Contrarian' }), row('e', 50)], TODAY)
    expect(i.median).toBe(200)
    expect(i.winners.map((r) => [r.slug, r.score])).toEqual([['d', 5], ['b', 2]])
    expect(i.flops.map((r) => [r.slug, r.score])).toEqual([['e', 0.3], ['a', 0.5]])
    expect(i.formulas[0]).toEqual({ formula: 'Contrarian', videos: 2, average: 3.5 })
    const text = promptText(i)
    expect(text).toMatch(/median of 200 views across 5/)
    expect(text).toMatch(/5x "Hook of d" \(Contrarian\)/)
    expect(text).toMatch(/0.3x "Hook of e"/)
  })

  it('leaves a video with no views out of the median but keeps its 5/5 rating', () => {
    const i = learn([row('a', 100), row('b', 200), row('c', 300), row('loved', null, { rating: 5 })], TODAY)
    expect(i.median).toBe(200)
    expect(i.rows.find((r) => r.slug === 'loved')!.score).toBeNull()
    expect(promptText(i)).toMatch(/rated these 5\/5 themselves:\n- "Hook of loved"/)
  })

  it('takes the middle of an even list', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe('the My outliers block in swipe.md', () => {
  const i = learn([row('a', 100), row('b', 200), row('c', 900, { formula: 'Confession' })], TODAY)

  it('goes right under the title the first time, and replaces itself after', () => {
    const swipe = '# Swipe file\n\n## Concepts\n\n### Day in the life\n'
    const once = withSwipeSection(swipe, swipeSection(i, TODAY))
    expect(once.indexOf(SWIPE_START)).toBeLessThan(once.indexOf('## Concepts'))
    expect(once).toMatch(/\| 4.5x \| 900 \| "Hook of c" \| Confession \|/)
    const twice = withSwipeSection(once, swipeSection(learn([row('a', 100), row('b', 200), row('c', 300)], TODAY), TODAY))
    expect(twice.split(SWIPE_START)).toHaveLength(2)
    expect(twice.split(SWIPE_END)).toHaveLength(2)
    expect(twice).not.toMatch(/Hook of c" \| Confession/)
    expect(twice).toMatch(/## Concepts\n\n### Day in the life/)
  })

  it('starts a swipe file when there is none', () => {
    expect(withSwipeSection('', swipeSection(i, TODAY))).toMatch(/^# Swipe file\n\n<!-- matcha-momentum-generator:my-outliers:start -->/)
  })

  it('keeps a pipe in a hook from breaking the table', () => {
    const s = swipeSection(learn([{ ...row('a', 900), hook: 'A | B' }, row('b', 100), row('c', 100)], TODAY), TODAY)
    expect(s).toMatch(/"A \/ B"/)
  })
})

describe('the outliers block from before the rename', () => {
  it('is replaced in place, not written a second time', () => {
    const old = '# Swipe file\n\n<!-- reelforge:my-outliers:start -->\nold\n<!-- reelforge:my-outliers:end -->\n\n## Concepts\n'
    const next = withSwipeSection(old, '<!-- matcha-momentum-generator:my-outliers:start -->\nnew\n<!-- matcha-momentum-generator:my-outliers:end -->')
    expect(next).toBe('# Swipe file\n\n<!-- matcha-momentum-generator:my-outliers:start -->\nnew\n<!-- matcha-momentum-generator:my-outliers:end -->\n\n## Concepts\n')
  })
})
