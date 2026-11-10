// What the active brand changes: the files the script writer reads, the look a new video starts in, and which
// My style rules apply. Pure, so main and the tests share it.
import { pendingOf, type BrandProfile } from './brand-profile'
import { STYLES, type CarouselStyle } from './carousel'

const fieldOf = (profile: BrandProfile, key: string): string | null => {
  for (const s of profile.sections) {
    const f = s.fields.find((x) => x.key === key)
    if (f) return f.pending || s.pending || !f.value ? null : f.value
  }
  return null
}

/** Who a profile is: a person speaking for themselves (a creator or influencer, like Alex) or a company brand
 * speaking as itself (like Nike). The script writer briefs itself differently for each (ai/src/speaker.ts). */
export type ProfileKind = 'person' | 'company'

export const KIND_LABEL: Record<ProfileKind, string> = {
  person: 'A person (creator, influencer)',
  company: 'A company brand'
}

/** "- kind: person" or "- kind: company"; a file from before that line is read from its "speaks as" line ("we", "the
 * product", "the brand", "the company", "faceless" mean a company), else it is a person. */
export function profileKind(profile: BrandProfile): ProfileKind {
  const kind = fieldOf(profile, 'kind')?.toLowerCase().trim()
  if (kind === 'company' || kind === 'brand') return 'company'
  if (kind === 'person' || kind === 'creator' || kind === 'influencer') return 'person'
  const speaks = fieldOf(profile, 'speaks as') ?? ''
  return /\bwe\b|\bthe (product|brand|company|team)\b|faceless/i.test(speaks) ? 'company' : 'person'
}

export interface BrandSettings {
  /** A person or a company brand (profileKind). */
  kind: ProfileKind
  voiceFile: string | null
  personalityFile: string | null
  scriptRulesFile: string | null
  /** The name of a saved look (Settings > Your look) new videos start in. */
  defaultLook: string | null
}

/** A saved look as settings keep it; only the name matters here. */
export interface NamedLook {
  id: string
  name: string
}

/** The brand whose rules stay in the original "My style.json" (they were written before brands existed). */
export const FIRST_BRAND = 'personal'


/** "~/x" or "/x" as an absolute path; anything else (a sentence, a placeholder) is not a file. */
const pathOf = (value: string | null, home: string): string | null => {
  if (!value) return null
  if (value === '~' || value.startsWith('~/')) return home + value.slice(1)
  return value.startsWith('/') ? value : null
}

export function brandSettings(profile: BrandProfile, home: string): BrandSettings {
  return {
    kind: profileKind(profile),
    voiceFile: pathOf(fieldOf(profile, 'voice file'), home),
    personalityFile: pathOf(fieldOf(profile, 'personality file'), home),
    scriptRulesFile: pathOf(fieldOf(profile, 'script rules'), home),
    defaultLook: fieldOf(profile, 'default look')
  }
}

/** Personal (or no brand) keeps My style.json; every other brand has its own rules file beside it. */
export function styleFileName(brandId: string | null): string {
  return !brandId || brandId === FIRST_BRAND ? 'My style.json' : `My style (${brandId}).json`
}

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase()

export function lookByName<T extends NamedLook>(templates: readonly T[], name: string | null): T | null {
  if (!name) return null
  return templates.find((t) => norm(t.name) === norm(name)) ?? null
}

/** The profile as the script writer reads it: lines, and whole sections, still waiting for an answer are left out. */
export function profileForWriting(text: string): string {
  let skipping = false
  return text
    .split(/\r?\n/)
    .filter((line) => {
      if (line.trim().startsWith('## ')) skipping = pendingOf(line) !== null
      return !skipping && pendingOf(line) === null
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * The first path written in a value ("cut-paper style, from ~/kit/cut-paper (the -dark ones)" → ~/kit/cut-paper).
 * A path may hold spaces ("~/My Kit/logo one.png"): it runs to the note in brackets, a ", " or the end.
 */
const pathInside = (value: string | null, home: string): string | null => {
  const m = value ? /(?:^|\s)(~\/.+?|\/.+?)(?=\s*\(|,\s|$)/.exec(value) : null
  return m ? pathOf(m[1]!.trim().replace(/[.,;:]+$/, ''), home) : null
}

export interface CarouselDefaults {
  style: CarouselStyle
  handle: string
  logo: string | null
  /** The folder of the brand's illustrations (cut-paper art). */
  artDir: string | null
}

/** What a new carousel for this brand starts with, from its profile (Look: carousels, Identity, the brand kit). */
export function carouselDefaults(profile: BrandProfile, home: string): CarouselDefaults {
  const preset = (fieldOf(profile, 'style preset') ?? '').toLowerCase()
  const style = STYLES.find((s) => preset.startsWith(s)) ?? 'editorial'
  const handle = /^@[\w.]+/.exec(fieldOf(profile, 'instagram') ?? '')?.[0] ?? ''
  return { style, handle, logo: pathInside(fieldOf(profile, 'logo'), home), artDir: pathInside(fieldOf(profile, 'illustration'), home) }
}

/** What the person says at the end of every video, from their profile: the first edit keeps it (ai firstEdit brief). */
export interface EditBrief {
  signoff?: string
  ask?: string
  /** Settings > Motion cards: the AI adds animated cards on numbers, lists, strong lines and typing. */
  motionCards?: boolean
}

/** The sign-off and the ask (Voice: "sign-off", "call to action"); a field still to fill is left out. */
export function editBrief(profile: BrandProfile): EditBrief {
  const signoff = fieldOf(profile, 'sign-off')
  const ask = fieldOf(profile, 'call to action')
  return { ...(signoff ? { signoff } : {}), ...(ask ? { ask } : {}) }
}
