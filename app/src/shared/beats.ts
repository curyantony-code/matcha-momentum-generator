// Beat templates: the order a script is built in. The person picks one on the Scripts page (it goes to the script
// writer as their format), or edits one and saves it as their own. Built-ins never change; theirs are kept in
// settings (main/settings.ts beatTemplates).

export interface BeatTemplate {
  id: string
  name: string
  /** One line on when to use it. */
  hint: string
  /** The beats, one per line, in their own words: what the writer follows. */
  beats: string
  /** A built-in can't be edited or deleted, only copied. */
  builtIn?: boolean
  /** What it was made from, when it came from Study reels ("@creator's reel"). */
  basedOn?: string
}

export const MAX_TEMPLATE_NAME = 40
export const MAX_BEATS = 4000
export const MAX_BEAT_TEMPLATES = 20
export const DEFAULT_BEAT_TEMPLATE = 'life-climb'

export const BUILT_IN_BEATS: readonly BeatTemplate[] = [
  {
    id: 'life-climb', builtIn: true, name: 'L.I.F.E. climb',
    hint: 'Every reel: one theme, Safe → Real → Raw, then why. Made for a daily series.',
    beats: [
      '1. Hook (0-2 s): one line, 12 words or fewer, the stake or twist first.',
      '2. Intro (2-5 s): "I\'m [your name]" plus one line that sets up the day.',
      '3. SAFE (5-10 s): the relatable surface of the theme. What everyone sees.',
      '4. REAL (10-25 s): under the surface, 2 or 3 scene beats, and what it cost.',
      '5. RAW (25-33 s): the one uncomfortable truth, said once, straight to camera.',
      '6. PURPOSE: what I\'m doing about it. Today on [what you are building].',
      '7. WHY: why it matters to you. One thing to take, said once.',
      '8. Tomorrow: tease the next day.',
      '9. CTA: one ask (a follow, or your link).',
      '10. Sign-off: your own line, the same every day.',
    ].join('\n'),
  },
  {
    id: 'one-take-proof', builtIn: true, name: 'One-take proof',
    hint: 'One take, fast, proof on screen on every number (like Robert Gutierrez).',
    beats: [
      '1. Hook: a number and a result. "This is how I got X in Y, and you can do the same."',
      '2. Intro: who I am, one line.',
      '3. Step 1, with its proof on screen.',
      '4. Step 2, with its proof on screen.',
      '5. Re-hook (about 40%): "But here\'s the part 99% of people skip."',
      '6. The honest admission: "Yes, it\'s manual. No, it doesn\'t scale."',
      '7. Step 3, and the rule to keep doing it.',
      '8. CTA: follow, or the waitlist.',
      '9. Sign-off.',
    ].join('\n'),
  },
  {
    id: 'page-intro', builtIn: true, name: 'Page intro ("a message to")',
    hint: 'The pinned video: who I am, every side of me, the stake, the series.',
    beats: [
      '1. "This is a message to everyone who ___."',
      '2. My name, with a twist in the same line.',
      '3. List montage: every side of me, one word each.',
      '4. Where I\'m from, and what people get wrong about me.',
      '5. "But that\'s not the part nobody sees."',
      '6. What I\'m building, and the honest numbers.',
      '7. The belief behind it, in one line.',
      '8. The series promise and the stake (the goal, the date).',
      '9. CTA: follow for all of it.',
      '10. Sign-off.',
    ].join('\n'),
  },
  {
    id: 'making-of', builtIn: true, name: 'Making-of story',
    hint: 'Something I did, with a real result. The lesson only at the end.',
    beats: [
      '1. Hook: the result, or the moment it went wrong.',
      '2. Intro.',
      '3. The setting: where, when, who.',
      '4. What I did, concretely.',
      '5. The result, in my numbers.',
      '6. The twist or what it cost.',
      '7. The moral, one line.',
      '8. CTA.',
      '9. Sign-off.',
    ].join('\n'),
  },
  {
    id: 'hot-take', builtIn: true, name: 'Hot take',
    hint: 'A position against the usual advice, defended fairly.',
    beats: [
      '1. Hook: the claim in one sentence. "My hot take is ___."',
      '2. Intro.',
      '3. Why most people believe the opposite (fairly).',
      '4. My reason, with one real example.',
      '5. The honest admission: where I might be wrong.',
      '6. What to do instead.',
      '7. CTA.',
      '8. Sign-off.',
    ].join('\n'),
  },
  {
    id: 'teach-one-fix', builtIn: true, name: 'Teach: one fix',
    hint: 'One problem, one fix the viewer can use today.',
    beats: [
      '1. Hook: the mistake, or the problem in their words.',
      '2. Intro.',
      '3. Why it happens.',
      '4. The fix, as 1 to 3 steps.',
      '5. Proof it works (mine, real).',
      '6. What changes when you do it.',
      '7. CTA.',
      '8. Sign-off.',
    ].join('\n'),
  },
  {
    id: 'ranked-three', builtIn: true, name: 'Ranked: this one, this one, this one',
    hint: 'Three things side by side, one-word verdicts, the winner last.',
    beats: [
      '1. Hook: what I\'m ranking and the stake.',
      '2. Intro.',
      '3. Number 3, and a one-word verdict.',
      '4. Number 2, and a one-word verdict.',
      '5. Number 1, the winner, and why.',
      '6. CTA.',
      '7. Sign-off.',
    ].join('\n'),
  },
  {
    id: 'day-in-life', builtIn: true, name: 'Day in the life (no talking)',
    hint: 'A very specific label on screen, then fast shots of the real day.',
    beats: [
      '1. On screen from second 0: who + where ("Student athlete in Montreal").',
      '2. 8 to 15 fast shots of the real day, no voice, soft music.',
      '3. One line of text at the end.',
      '4. The ask in the caption: follow, or the waitlist.',
    ].join('\n'),
  },
]

/** A template the person saved, made safe: a name and beats within limits, or null. */
export function cleanTemplate(raw: unknown, id: string): BeatTemplate | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.replace(/\s+/g, ' ').trim().slice(0, MAX_TEMPLATE_NAME) : ''
  const beats = typeof r.beats === 'string' ? r.beats.replace(/\r\n/g, '\n').trim().slice(0, MAX_BEATS) : ''
  if (!name || !beats) return null
  const hint = typeof r.hint === 'string' ? r.hint.trim().slice(0, 140) : 'My own template.'
  const basedOn = typeof r.basedOn === 'string' ? r.basedOn.replace(/\s+/g, ' ').trim().slice(0, 140) : ''
  return basedOn ? { id, name, hint, beats, basedOn } : { id, name, hint, beats }
}

/** Built-ins first, then theirs. */
export function allTemplates(mine: readonly BeatTemplate[]): BeatTemplate[] {
  return [...BUILT_IN_BEATS, ...mine]
}

/** The active template, falling back to the L.I.F.E. climb. */
export function activeTemplate(mine: readonly BeatTemplate[], id: string | null | undefined): BeatTemplate {
  const all = allTemplates(mine)
  return all.find((t) => t.id === id) ?? all[0]
}
