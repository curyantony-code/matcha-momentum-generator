// How each posted video did, and what that says about the hooks that work for this person.
// Same method as the creator research (studio-script viral): every video is scored against the
// person's own median views, so one big week doesn't make every later video look like a flop.

/** What the person typed on a video's page. */
export interface VideoResult {
  views: number | null
  /** Their own 1-5 rating of how it went, when views don't tell the whole story. */
  rating: number | null
  /** YYYY-MM-DD, the day it went up. */
  postedOn: string | null
}

export const NO_RESULT: VideoResult = { views: null, rating: null, postedOn: null }
export const MAX_VIEWS = 10_000_000_000
/** Videos younger than this are still getting views: shown, never scored. */
export const GROWING_DAYS = 3
/** At least this many scored videos before any pattern is claimed. */
export const MIN_SCORED = 3
export const WIN_SCORE = 1.5
export const FLOP_SCORE = 0.6
const DAY = /^\d{4}-\d{2}-\d{2}$/

export function cleanResult(raw: unknown): VideoResult {
  if (typeof raw !== 'object' || raw === null) return NO_RESULT
  const r = raw as Record<string, unknown>
  const views = typeof r.views === 'number' && Number.isFinite(r.views) && r.views >= 0 && r.views <= MAX_VIEWS ? Math.round(r.views) : null
  const rating = typeof r.rating === 'number' && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5 ? r.rating : null
  const postedOn = typeof r.postedOn === 'string' && DAY.test(r.postedOn) && !Number.isNaN(Date.parse(r.postedOn)) ? r.postedOn : null
  return { views, rating, postedOn }
}

/** One posted video, as the learning reads it. */
export interface ResultRow {
  slug: string
  title: string
  /** The first spoken line: the script's hook, else the first words heard. */
  hook: string
  /** The hook shape the script writer named ("Confession"), '' when unknown. */
  formula: string
  result: VideoResult
}

export interface ScoredRow extends ResultRow {
  /** views / the person's median; null when it can't be scored yet. */
  score: number | null
  growing: boolean
}

export interface FormulaStat {
  formula: string
  videos: number
  /** Average score of its videos. */
  average: number
}

export interface Insights {
  /** Videos with views that are old enough to score. */
  scored: number
  median: number | null
  /** True once there are MIN_SCORED scored videos: before that, nothing is claimed. */
  enough: boolean
  rows: ScoredRow[]
  winners: ScoredRow[]
  flops: ScoredRow[]
  formulas: FormulaStat[]
}

const ageDays = (postedOn: string | null, today: Date): number | null =>
  postedOn ? Math.floor((today.getTime() - Date.parse(`${postedOn}T00:00:00Z`)) / 86_400_000) : null

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const round1 = (n: number): number => Math.round(n * 10) / 10

export function learn(rows: ResultRow[], today: Date = new Date()): Insights {
  const withAge = rows.map((r) => {
    const age = ageDays(r.result.postedOn, today)
    return { ...r, growing: age !== null && age < GROWING_DAYS }
  })
  const scorable = withAge.filter((r) => r.result.views !== null && !r.growing)
  const mid = median(scorable.map((r) => r.result.views as number))
  const scoredRows: ScoredRow[] = withAge.map((r) => ({
    ...r,
    score: mid && r.result.views !== null && !r.growing ? round1(r.result.views / mid) : null
  }))
  const enough = scorable.length >= MIN_SCORED && !!mid
  const byScore = (a: ScoredRow, b: ScoredRow): number => (b.score ?? 0) - (a.score ?? 0)
  const winners = enough ? scoredRows.filter((r) => (r.score ?? 0) >= WIN_SCORE).sort(byScore) : []
  const flops = enough ? scoredRows.filter((r) => r.score !== null && r.score <= FLOP_SCORE).sort((a, b) => byScore(b, a)) : []
  const groups = new Map<string, number[]>()
  for (const r of scoredRows) if (r.score !== null && r.formula) groups.set(r.formula, [...(groups.get(r.formula) ?? []), r.score])
  const formulas = enough
    ? [...groups].map(([formula, s]) => ({ formula, videos: s.length, average: round1(s.reduce((a, b) => a + b, 0) / s.length) }))
        .sort((a, b) => b.average - a.average)
    : []
  return { scored: scorable.length, median: mid, enough, rows: scoredRows, winners, flops, formulas }
}

const quote = (r: ScoredRow): string => `"${r.hook}"${r.formula ? ` (${r.formula})` : ''}`

/** What the script writer and the idea finder read. Empty until there is enough to say anything. */
export function promptText(i: Insights): string {
  if (!i.enough) return ''
  const lines = [`Scored against their own median of ${Math.round(i.median ?? 0)} views across ${i.scored} posted videos.`]
  if (i.winners.length) lines.push('Hooks that over-performed (lean toward these shapes and topics, never copy the words):', ...i.winners.slice(0, 5).map((r) => `- ${r.score}x ${quote(r)}`))
  if (i.flops.length) lines.push('Hooks that under-performed (avoid these shapes unless the idea needs one):', ...i.flops.slice(0, 3).map((r) => `- ${r.score}x ${quote(r)}`))
  const rated = i.rows.filter((r) => r.result.rating === 5 && !i.winners.includes(r))
  if (rated.length) lines.push('They rated these 5/5 themselves:', ...rated.slice(0, 3).map((r) => `- ${quote(r)}`))
  if (i.formulas.length > 1) lines.push(`Hook shapes by average score: ${i.formulas.map((f) => `${f.formula} ${f.average}x (${f.videos})`).join(', ')}.`)
  return lines.join('\n')
}

export const SWIPE_START = '<!-- matcha-momentum-generator:my-outliers:start -->'
export const SWIPE_END = '<!-- matcha-momentum-generator:my-outliers:end -->'

/** The "My outliers" block for swipe.md (read by /studio-script), between markers so it can be replaced. */
export function swipeSection(i: Insights, today: Date = new Date()): string {
  const day = today.toISOString().slice(0, 10)
  const head = `## My outliers (from Matcha Momentum Generator, ${day})\n\nMy ${i.scored} posted videos, scored against my median of ${Math.round(i.median ?? 0)} views. Updated every time I add a result.\n`
  const table = (rows: ScoredRow[]): string =>
    ['| Score | Views | Hook | Formula |', '|---|---|---|---|', ...rows.map((r) => `| ${r.score}x | ${r.result.views} | "${r.hook.replace(/\|/g, '/')}" | ${r.formula || 'Unclassified'} |`)].join('\n')
  const parts = [SWIPE_START, head]
  if (i.winners.length) parts.push('**Over-performed**\n', table(i.winners.slice(0, 5)), '')
  if (i.flops.length) parts.push('**Under-performed**\n', table(i.flops.slice(0, 5)), '')
  if (!i.winners.length && !i.flops.length) parts.push('No clear outliers yet: every video sits near my median.\n')
  parts.push(SWIPE_END)
  return parts.join('\n')
}

/** swipe.md with the block put in (or replaced), right under the "# Swipe file" title. */
/** The markers written before the rename: a block between them is replaced too, never written twice. */
const OLD_MARKERS: readonly (readonly [string, string])[] = [['<!-- reelforge:my-outliers:start -->', '<!-- reelforge:my-outliers:end -->']]

export function withSwipeSection(swipe: string, section: string): string {
  for (const [from, to] of [[SWIPE_START, SWIPE_END] as const, ...OLD_MARKERS]) {
    const start = swipe.indexOf(from)
    const end = swipe.indexOf(to)
    if (start !== -1 && end > start) return swipe.slice(0, start) + section + swipe.slice(end + to.length)
  }
  const title = swipe.match(/^# .*\n/)
  if (!title) return `# Swipe file\n\n${section}\n\n${swipe}`.trimEnd() + '\n'
  const at = (title.index ?? 0) + title[0].length
  return `${swipe.slice(0, at)}\n${section}\n${swipe.slice(at)}`
}
