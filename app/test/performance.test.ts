import { describe, expect, it } from 'vitest'
import type { Insights, ScoredRow } from '../src/shared/results'
import { lengthBucket, performanceView } from '../src/main/performance'

const row = (slug: string, score: number | null, formula = '', growing = false): ScoredRow =>
  ({ slug, title: slug, hook: '', formula, result: { views: 1, rating: null, postedOn: '2026-11-01' }, score, growing }) as ScoredRow
const insights = (rows: ScoredRow[]): Insights => ({ scored: rows.length, median: 100, enough: true, rows, winners: [], flops: [], formulas: [] })

describe('what is performing', () => {
  it('groups scored videos by what they were made with, best average first', () => {
    const v = performanceView(
      insights([row('a', 2.4, 'Confession'), row('b', 1.6, 'Confession'), row('c', 0.5, 'Contrarian'), row('d', null, 'Result'), row('e', 3, 'Result', true)]),
      new Map([
        ['a', { editStyle: 'upscale', cards: 4, seconds: 45 }],
        ['b', { editStyle: null, cards: 0, seconds: 28 }],
        ['c', { editStyle: null, cards: 2, seconds: 70 }]
      ])
    )
    expect(v.videos.map((x) => x.slug)).toEqual(['a', 'b', 'c']) // unscored and still-growing videos are left out
    const by = Object.fromEntries(v.groups.map((g) => [g.dimension, g.rows]))
    expect(by.hook).toEqual([{ name: 'Confession', videos: 2, average: 2 }, { name: 'Contrarian', videos: 1, average: 0.5 }])
    expect(by.editStyle!.map((r) => r.name)).toEqual(['Upscale', 'Your look'])
    expect(by.cards).toEqual([{ name: 'With motion cards', videos: 2, average: 1.45 }, { name: 'Without', videos: 1, average: 1.6 }].sort((x, y) => y.average - x.average))
    expect(by.length!.map((r) => r.name)).toEqual(['30 to 60 s', 'Under 30 s', 'Over 60 s'])
  })

  it('leaves out a grouping that compares nothing (one bucket)', () => {
    const v = performanceView(insights([row('a', 1, 'Confession'), row('b', 2, 'Confession')]), new Map())
    expect(v.groups).toEqual([])
  })

  it('buckets length plainly', () => {
    expect([lengthBucket(null), lengthBucket(12), lengthBucket(30), lengthBucket(60), lengthBucket(61)]).toEqual([null, 'Under 30 s', '30 to 60 s', '30 to 60 s', 'Over 60 s'])
  })
})
