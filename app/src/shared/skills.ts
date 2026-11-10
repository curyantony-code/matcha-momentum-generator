// Where every rule the script writer follows comes from: the installed writing skills, your own files and the
// research, the stage of a script each one shapes, and which of them a saved script actually used.
// The rules are restated in our own words (THIRD_PARTY.md); a skill's own folder name is read from disk at run time.
import type { SavedScript } from './api'

export const STAGES = [
  { id: 'research', label: 'Pick the idea' },
  { id: 'hook', label: 'Hook' },
  { id: 'script', label: 'Spoken script' },
  { id: 'screen', label: 'On screen' },
  { id: 'ending', label: 'Ending' },
  { id: 'check', label: 'Check' },
  { id: 'edit', label: 'Edit' },
  { id: 'study', label: 'Study reels' },
] as const
export type StageId = (typeof STAGES)[number]['id']

/** Where the app applies a rule. */
export type Where = 'Script writer' | 'AI phrase check' | 'Video editor' | 'Study reels' | 'Claude Code'

export interface SkillUse { stage: StageId; rule: string; where: Where }

export interface Source {
  id: string
  name: string
  /** skill: an installed skill; yours: your own files; research: the traction research. */
  kind: 'skill' | 'yours' | 'research'
  /** How to find it installed: a skill folder name, or the end of one. */
  folder?: string
  what: string
  uses: SkillUse[]
}

export const SOURCES: readonly Source[] = [
  {
    id: 'short-form-video-script', name: 'Short-form video script (WATCH)', kind: 'skill', folder: 'short-form-video-script',
    what: 'The craft of a vertical video that gets watched to the end.',
    uses: [
      { stage: 'hook', rule: 'The first second layers the picture, the text hook and the spoken hook', where: 'Script writer' },
      { stage: 'hook', rule: '5 hooks to test, each a different shape', where: 'Script writer' },
      { stage: 'script', rule: 'A re-hook about halfway, and a fifth of the draft cut', where: 'Script writer' },
      { stage: 'screen', rule: 'The muted version first: the on-screen text tells the story alone', where: 'Script writer' },
      { stage: 'ending', rule: 'The last line echoes the hook so a replay loops', where: 'Script writer' },
    ],
  },
  {
    id: 'copywriting-hooks', name: 'Copywriting hooks', kind: 'skill', folder: 'copywriting-hooks',
    what: 'Opening lines, checked against a list of openings that lose people.',
    uses: [
      { stage: 'hook', rule: 'No throat clearing, no name first, one specific curiosity gap', where: 'Script writer' },
      { stage: 'hook', rule: 'Every hook names the proven shape it uses', where: 'Script writer' },
    ],
  },
  {
    id: 'antislop-copywriting', name: 'Anti-slop copywriting', kind: 'skill', folder: 'antislop-copywriting',
    what: 'Finds the phrases and sentence shapes that read as written by AI.',
    uses: [
      { stage: 'script', rule: 'No AI filler, no em dashes, no runs of fragments', where: 'Script writer' },
      { stage: 'check', rule: 'Every draft is scanned and rewritten once if AI phrases are left', where: 'AI phrase check' },
    ],
  },
  {
    id: 'personal-brand', name: 'Personal brand', kind: 'skill', folder: 'personal-brand',
    what: 'Positioning: what you stand for, and an idea people can repeat.',
    uses: [{ stage: 'script', rule: 'Uses one of your own named ideas, said plainly enough to quote', where: 'Script writer' }],
  },
  {
    id: 'thought-leadership', name: 'Thought leadership', kind: 'skill', folder: '-thought-leadership',
    what: 'Building in public with proof, not claims.',
    uses: [
      { stage: 'script', rule: 'Real numbers and failures with what they cost; confession over résumé', where: 'Script writer' },
      { stage: 'ending', rule: 'One takeaway the viewer can use today', where: 'Script writer' },
    ],
  },
  {
    id: 'studio-script', name: 'Studio script', kind: 'skill', folder: 'studio-script',
    what: 'Your scriptwriter in Claude Code, and its viral research.',
    uses: [
      { stage: 'research', rule: 'Fills the concepts that over-perform in your niche (/studio-script viral)', where: 'Claude Code' },
      { stage: 'research', rule: 'The writer builds each script on the concept that fits the idea', where: 'Script writer' },
    ],
  },
  {
    id: 'reel-research', name: 'Reel research', kind: 'skill', folder: 'reel-research',
    what: 'The teardown method: hook, setup, claim, proof, payoff, ask, every cut.',
    uses: [{ stage: 'study', rule: 'Breaks a reel into its beats with timestamps, and a creator into patterns', where: 'Study reels' }],
  },
  {
    id: 'watch', name: 'Watch', kind: 'skill', folder: 'watch',
    what: 'Watching a video like an editor: cuts, pace, the first 10 seconds.',
    uses: [{ stage: 'study', rule: 'Cuts a minute, shot length, words a minute and the hook frames', where: 'Study reels' }],
  },
  {
    id: 'framework', name: 'Your framework', kind: 'yours',
    what: 'framework.md and the L.I.F.E. formula: themes, the climb, your sign-off.',
    uses: [
      { stage: 'script', rule: 'One theme, climbing Safe, Real, Raw, then purpose and why', where: 'Script writer' },
      { stage: 'ending', rule: 'One ask (a follow or the waitlist), then your sign-off word for word', where: 'Script writer' },
    ],
  },
  {
    id: 'results', name: 'Your results', kind: 'yours',
    what: 'Your posted videos, scored against your usual views.',
    uses: [{ stage: 'hook', rule: 'Prefers the hook shapes that beat your usual views', where: 'Script writer' }],
  },
  {
    id: 'rankings', name: 'Traction research', kind: 'research',
    what: 'rankings.md: hook shapes, templates, concepts and cards ranked by how they perform online.',
    uses: [
      { stage: 'research', rule: 'Ranks your templates, hooks and concepts for each idea', where: 'Script writer' },
      { stage: 'edit', rule: 'Lines written to land a motion card about every 8 to 12 seconds', where: 'Video editor' },
    ],
  },
]

export const sourceById = (id: string): Source | undefined => SOURCES.find((s) => s.id === id)

/** What a built-in template is based on: the sources behind it and the research it was drawn from. */
export const TEMPLATE_BASIS: Record<string, { sources: string[]; from: string }> = {
  'life-climb': { sources: ['framework'], from: 'Your framework (the L.I.F.E. formula)' },
  'one-take-proof': { sources: ['reel-research', 'watch', 'rankings'], from: 'The reference reels study (Robert Gutierrez)' },
  'page-intro': { sources: ['reel-research', 'watch'], from: 'The reference reels study (twocoatsdeep, creatormate)' },
  'making-of': { sources: ['studio-script'], from: 'Studio script, making-of mode' },
  'hot-take': { sources: ['studio-script', 'rankings'], from: 'Studio script, divisive funnel' },
  'teach-one-fix': { sources: ['studio-script', 'rankings'], from: 'Studio script, Teach' },
  'ranked-three': { sources: ['rankings'], from: 'Traction research' },
  'day-in-life': { sources: ['rankings'], from: 'Traction research' },
}

/** Every script also goes through these, whatever its template. */
export const ALWAYS = ['short-form-video-script', 'copywriting-hooks', 'antislop-copywriting'] as const

export interface UsedSkill { source: string; stage: StageId; what: string }

type ScriptFacts = Pick<SavedScript, 'hookFormula' | 'hooks' | 'firstFrame' | 'onScreenText' | 'slop' | 'concept' | 'cards' | 'ranked'>

const NONE = /^\s*(none)?\s*$/i

/** What a saved script shows of each source, read from what the writer returned (nothing is guessed). */
export function skillsUsedBy(s: Partial<ScriptFacts>): UsedSkill[] {
  const out: UsedSkill[] = []
  const add = (source: string, stage: StageId, what: string): void => void out.push({ source, stage, what })
  if (s.concept && !NONE.test(s.concept)) add('studio-script', 'research', `Built on "${s.concept}"`)
  const ranked = s.ranked ? s.ranked.templates.length + s.ranked.hooks.length + s.ranked.concepts.length : 0
  if (ranked) add('rankings', 'research', 'Templates, hooks and concepts ranked for this idea')
  if (s.hookFormula) add('copywriting-hooks', 'hook', `Hook shape: ${s.hookFormula}`)
  if (s.hooks?.length) add('short-form-video-script', 'hook', `${s.hooks.length} more ${s.hooks.length === 1 ? 'hook' : 'hooks'} to test`)
  if (s.firstFrame) add('short-form-video-script', 'hook', `First frame: ${s.firstFrame}`)
  if (s.onScreenText?.length) add('short-form-video-script', 'screen', `Muted version: ${s.onScreenText.length} on-screen ${s.onScreenText.length === 1 ? 'line' : 'lines'}`)
  if (s.slop) add('antislop-copywriting', 'check', s.slop.length ? `${s.slop.length} AI ${s.slop.length === 1 ? 'phrase' : 'phrases'} left to fix` : 'No AI phrases left')
  if (s.cards?.length) add('rankings', 'edit', `${s.cards.length} motion ${s.cards.length === 1 ? 'card' : 'cards'} written in`)
  return out
}

/** The installed folder for a source, from the skill folder names found on this computer; null when not installed. */
export function installedFolder(src: Source, folders: readonly string[]): string | null {
  if (src.kind !== 'skill' || !src.folder) return null
  const f = src.folder
  return folders.find((n) => (f.startsWith('-') ? n.endsWith(f) : n === f)) ?? null
}
