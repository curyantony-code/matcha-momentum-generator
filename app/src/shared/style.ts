// My style rules typed on the My style page: one plain sentence the editor reads on every video.

export const MAX_RULE_LENGTH = 300

/** Ideas shown when the list is empty or short: one tap adds one. Each is a habit, not a one-off edit. */
export const STARTER_RULES = [
  'Cut every pause longer than half a second.',
  'Put the hook on screen in the first second.',
  'Keep subtitles to three words at a time.',
  'Keep music quiet under talking, louder only between lines.',
  'End on my last word, with no outro.'
] as const

/** The rule text from the page, trimmed to one line, or null when there is nothing usable in it. */
export function cleanRuleInput(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text || text.length > MAX_RULE_LENGTH) return null
  return text
}
