// What's performing: the person's scored videos grouped by what they were made with, so they see which choices win.
// Only real results: a video counts once it has views and is old enough to score (shared/results.ts learn()).
import type { Insights } from '../shared/results'
import type { PerformanceGroup, PerformanceView } from '../shared/overview'

/** What a video was made with, read from its project. */
export interface VideoFeatures {
  editStyle: string | null
  /** animated cards placed on it */
  cards: number
  seconds: number | null
}

const round2 = (n: number): number => Math.round(n * 100) / 100

export const EDIT_STYLE_NAMES: Record<string, string> = { upscale: 'Upscale' }
export const lengthBucket = (s: number | null): string | null => (s === null ? null : s < 30 ? 'Under 30 s' : s <= 60 ? '30 to 60 s' : 'Over 60 s')

function group(dimension: PerformanceGroup['dimension'], label: string, pairs: { name: string | null; score: number }[]): PerformanceGroup | null {
  const by = new Map<string, number[]>()
  for (const p of pairs) if (p.name) by.set(p.name, [...(by.get(p.name) ?? []), p.score])
  if (by.size < 2) return null // one bucket compares nothing
  const rows = [...by].map(([name, s]) => ({ name, videos: s.length, average: round2(s.reduce((a, b) => a + b, 0) / s.length) }))
  return { dimension, label, rows: rows.sort((a, b) => b.average - a.average || b.videos - a.videos) }
}

export function performanceView(insights: Insights, features: Map<string, VideoFeatures>): PerformanceView {
  const scored = insights.rows.filter((r) => r.score !== null && !r.growing)
  const videos = scored.map((r) => {
    const f = features.get(r.slug)
    return {
      slug: r.slug,
      title: r.title,
      score: r.score as number,
      formula: r.formula,
      editStyle: f?.editStyle ? (EDIT_STYLE_NAMES[f.editStyle] ?? f.editStyle) : 'Your look',
      cards: f?.cards ?? 0,
      seconds: f?.seconds ?? null
    }
  })
  const groups = [
    group('hook', 'Hook shape', videos.map((v) => ({ name: v.formula || null, score: v.score }))),
    group('editStyle', 'Edit style', videos.map((v) => ({ name: v.editStyle, score: v.score }))),
    group('cards', 'Motion cards', videos.map((v) => ({ name: v.cards > 0 ? 'With motion cards' : 'Without', score: v.score }))),
    group('length', 'Length', videos.map((v) => ({ name: lengthBucket(v.seconds), score: v.score })))
  ].filter((g): g is PerformanceGroup => g !== null)
  return { insights, groups, videos }
}
