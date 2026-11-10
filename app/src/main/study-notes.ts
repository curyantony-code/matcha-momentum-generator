// Turning a studied video into things the rest of the system reads: a concept in swipe.md (the script writer builds
// on it), a beat template (the writer can follow it), and a research note (for /studio-script in Claude Code).
import type { BeatTemplate } from '../shared/beats'
import { MAX_TEMPLATE_NAME } from '../shared/beats'
import type { StudyReelDetail } from '../shared/study'

const who = (d: Pick<StudyReelDetail, 'creator' | 'platform'>): string => (d.creator ? `@${d.creator.replace(/^@/, '')}` : `a ${d.platform} creator`)
const line = (s: string): string => s.replace(/\s+/g, ' ').trim()
const views = (d: StudyReelDetail): string =>
  d.views === null ? '' : ` · ${d.views.toLocaleString('en-US')} views${d.vsUsual ? ` (${d.vsUsual}× their usual)` : ''}`

/** The concept block for swipe.md: a "### " heading the writer can name, then the shape and the proof. */
export function conceptBlock(d: StudyReelDetail): string {
  const s = d.study!
  return [
    `### ${line(s.formula.name || s.formula.concept || 'Studied video')} (studied: ${who(d)})`,
    `- The idea: ${line(s.formula.concept)}`,
    `- The shape: ${s.formula.steps.map(line).join(' → ')}`,
    `- Hook shape: ${line(s.formula.hookShape || s.script.hook.shape)}`,
    ...(s.why.length ? [`- Why it works: ${s.why.map(line).join(' ')}`] : []),
    `- Proof: ${d.url}${views(d)}`,
  ].join('\n')
}

/** swipe.md with the block added at the end of its "## Concepts" section (made when missing). Unchanged when a
 * concept with the same heading is already there. */
export function withConcept(swipe: string, block: string): string {
  const heading = block.split('\n')[0]!
  if (swipe.split('\n').some((l) => l.trim() === heading.trim())) return swipe
  const lines = swipe.replace(/\s+$/, '').split('\n')
  const start = lines.findIndex((l) => /^## Concepts\s*$/.test(l))
  if (start < 0) return `${swipe.replace(/\s+$/, '')}${swipe.trim() ? '\n\n' : ''}## Concepts\n\n${block}\n`
  let next = lines.findIndex((l, i) => i > start && /^## /.test(l))
  if (next < 0) next = lines.length
  let at = next
  while (at > start + 1 && !lines[at - 1]!.trim()) at--
  return [...lines.slice(0, at), '', block, ...(next < lines.length ? ['', ...lines.slice(next)] : [])].join('\n') + '\n'
}

/** A beat template from the formula's steps, marked with where it came from. */
export function templateFrom(d: StudyReelDetail): Omit<BeatTemplate, 'id'> {
  const s = d.study!
  const steps = s.formula.steps.length ? s.formula.steps : s.script.beats.map((b) => `${b.role}: ${b.note}`)
  const name = line(s.formula.name || 'Studied video').slice(0, MAX_TEMPLATE_NAME)
  return {
    name,
    hint: line(s.formula.concept || s.summary).slice(0, 140),
    beats: [...steps.map((t, i) => `${i + 1}. ${line(t)}`), `${steps.length + 1}. CTA: one ask (a follow, or your link).`, `${steps.length + 2}. Sign-off.`].join('\n'),
    basedOn: `${who(d)}'s ${d.platform === 'youtube' ? 'Short' : d.platform === 'tiktok' ? 'TikTok' : 'reel'}`,
  }
}

const mmss = (t: number): string => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`

/** The whole study as a research note, the same shape as video-agent/research teardowns. */
export function researchNote(d: StudyReelDetail, today: string): string {
  const s = d.study!
  const m = d.measure
  const out = [
    `# Study · ${who(d)} · ${today}`,
    '',
    `${d.url}${views(d)}`,
    m ? `${m.durationSec.toFixed(1)} s · ${m.cuts.length} cuts (${m.cutsPerMin.toFixed(1)} a minute) · ${Math.round(m.wpm)} wpm · ${m.musicLikely ? 'music under the voice' : 'voice only'}` : '',
    '',
    `**${line(s.summary)}**`,
    '',
    '## Script',
    `- **${mmss(s.script.hook.at)} hook (${line(s.script.hook.shape)}):** "${line(s.script.hook.text)}" ${line(s.script.hook.why)}`,
    ...s.script.beats.filter((b) => b.role !== 'hook').map((b) => `- **${mmss(b.at)} ${b.role}:** "${line(b.said)}" ${line(b.note)}`),
    ...(s.script.rehook ? [`- Re-hook at ${mmss(s.script.rehook.at)}: "${line(s.script.rehook.text)}"`] : []),
    `- Payoff: ${line(s.script.payoff)}`,
    `- Ask (${s.script.cta.kind}): ${line(s.script.cta.text) || 'none'}`,
    `- Loop: ${s.script.loop.loops ? 'yes' : 'no'}. ${line(s.script.loop.how)}`,
    '',
    `## Formula: ${line(s.formula.name)}`,
    ...s.formula.steps.map((t, i) => `${i + 1}. ${line(t)}`),
    `- Concept: ${line(s.formula.concept)}`,
    `- Closest template: ${line(s.formula.closestTemplate.name) || 'none'} (${s.formula.closestTemplate.fit}). ${line(s.formula.closestTemplate.diff)}`,
    '',
    '## Edit',
    ...Object.entries(s.edit).map(([k, v]) => `- ${k}: ${line(v)}`),
    '',
    '## Why it works',
    ...s.why.map((w) => `- ${line(w)}`),
    '',
    '## Borrow',
    ...s.borrow.map((w) => `- ${line(w)}`),
    '',
    '## Don\'t copy',
    ...s.avoid.map((w) => `- ${line(w)}`),
    '',
    `## Try this\n${line(s.tryThis.idea)}\nOpening: "${line(s.tryThis.hook)}"`,
    '',
    'Learn the shape, never the words.',
  ]
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n') + '\n'
}

/** A safe file name for the note. */
export function noteName(d: Pick<StudyReelDetail, 'creator' | 'platform' | 'id'>, today: string): string {
  const c = (d.creator || d.platform).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'creator'
  return `${today}-study-${c}-${d.id.slice(0, 6)}.md`
}
