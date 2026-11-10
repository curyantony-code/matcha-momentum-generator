// A brand profile is a plain markdown file (content/brands/<id>.md) that the person edits by hand or on the Brands
// tab. Sections are "## Heading" lines; "- key: value" lines are settings; other "- " lines are list items (rules).
// Edits rewrite only the edited lines, so the file stays theirs: comments, order and spacing never move.

/** Who still has to answer a value: the person ({{to fill}}) or a teammate, named in the blank itself ({{Sam}}). */
export type Placeholder = 'you' | 'teammate'

export interface BrandField {
  line: number
  key: string
  value: string
  pending: Placeholder | null
}

export interface BrandItem {
  line: number
  text: string
  pending: Placeholder | null
}

export interface BrandSection {
  heading: string
  pending: Placeholder | null
  fields: BrandField[]
  items: BrandItem[]
}

export interface BrandProfile {
  title: string
  intro: string[]
  sections: BrandSection[]
  pending: Record<Placeholder, number>
  /** The teammate the file's blanks are for, as written ("Sam" for {{Sam}}); null when there are none. */
  teammate: string | null
}

/** One changed value: the 0-based line it is on and its new text. */
export interface BrandEdit {
  line: number
  value: string
}

/** A brand file as the Brands tab sees it. `text` is sent back on save so a file changed elsewhere is not overwritten. */
export interface BrandDoc {
  id: string
  path: string
  text: string
  profile: BrandProfile
}

export interface BrandList {
  folder: string
  brands: BrandDoc[]
}

export const MAX_VALUE_LENGTH = 2000
export const PROFILE_HEADER = '# Brand profile:'

// A key is short, lowercase and plain ("instagram", "default look"), so a rule sentence with a colon stays a rule.
// The colon has to end the key ("key: value" or a bare "key:"), so "- https://x" stays an item.
// Keys may hold a hyphen ("sign-off", "short-form"): still lowercase and short, so a rule sentence stays a rule.
const FIELD = /^- ([a-z][a-z0-9 -]{0,39}):(?: (.*))?$/
const ITEM = /^- (.+)$/
// {{to fill}} is the person's own blank; any other {{Name}} is a teammate's, named as the file writes it
const PLACEHOLDER = /\{\{\s*([^{}\n]{1,40}?)\s*\}\}/

export function pendingOf(text: string): Placeholder | null {
  const m = PLACEHOLDER.exec(text)
  if (!m) return null
  return m[1]!.toLowerCase() === 'to fill' ? 'you' : 'teammate'
}

/** The teammate named in a blank ("Sam" for {{Sam}}), or null for the person's own {{to fill}} or no blank. */
export function teammateOf(text: string): string | null {
  const m = PLACEHOLDER.exec(text)
  return m && m[1]!.toLowerCase() !== 'to fill' ? m[1]! : null
}

// Split on \n only: a line keeps its own \r (Windows ending), so a file that mixes endings is written back as it was.
const splitLines = (text: string): string[] => text.split('\n')
const bodyOf = (raw: string): string => raw.replace(/\r$/, '')

const cleanHeading = (raw: string): string => raw.replace(PLACEHOLDER, '').replace(/[:\s]+$/, '').trim()

export function parseBrandProfile(text: string): BrandProfile {
  const lines = splitLines(text).map(bodyOf)
  const sections: BrandSection[] = []
  const intro: string[] = []
  let title = ''

  lines.forEach((raw, line) => {
    const s = raw.trim()
    if (s.startsWith('# ') && !title) {
      title = s.slice(2).replace(/^Brand profile:\s*/i, '').trim()
      return
    }
    if (s.startsWith('## ')) {
      const h = s.slice(3)
      sections.push({ heading: cleanHeading(h), pending: pendingOf(h), fields: [], items: [] })
      return
    }
    const current = sections[sections.length - 1]
    if (!current) {
      if (s) intro.push(s)
      return
    }
    const f = FIELD.exec(s)
    if (f) {
      const value = (f[2] ?? '').trim()
      current.fields.push({ line, key: f[1]!, value, pending: pendingOf(value) })
      return
    }
    const it = ITEM.exec(s)
    if (it) current.items.push({ line, text: it[1]!.trim(), pending: pendingOf(it[1]!) })
  })

  const pending: Record<Placeholder, number> = { you: 0, teammate: 0 }
  let teammate: string | null = null
  for (const sec of sections) {
    if (sec.pending) pending[sec.pending]++
    for (const x of [...sec.fields, ...sec.items]) if (x.pending) pending[x.pending]++
  }
  for (const line of splitLines(text)) teammate ??= teammateOf(line)
  return { title, intro, sections, pending, teammate }
}

/** Returns the new file text. Throws a RangeError for an edit on a line that is not a value, or a bad value. */
export function applyBrandEdits(text: string, edits: readonly BrandEdit[]): string {
  const lines = splitLines(text)
  const next = [...lines]
  for (const { line, value } of edits) {
    const v = value.trim()
    if (/[\r\n]/.test(value)) throw new RangeError('A value has to fit on one line.')
    if (v.length > MAX_VALUE_LENGTH) throw new RangeError(`Keep each value under ${MAX_VALUE_LENGTH} characters.`)
    const raw = lines[line]
    if (raw === undefined) throw new RangeError('That line is not a value you can edit here.')
    const body = bodyOf(raw)
    // The line keeps its indentation and its own ending.
    const indent = /^\s*/.exec(body)![0]
    const cr = raw.endsWith('\r') ? '\r' : ''
    const f = FIELD.exec(body.trim())
    if (f) {
      next[line] = `${indent}${v ? `- ${f[1]}: ${v}` : `- ${f[1]}:`}${cr}`
      continue
    }
    if (ITEM.test(body.trim())) {
      if (!v) throw new RangeError('A rule cannot be empty. Delete it in the file instead.')
      next[line] = `${indent}- ${v}${cr}`
      continue
    }
    throw new RangeError('That line is not a value you can edit here.')
  }
  return next.join('\n')
}
