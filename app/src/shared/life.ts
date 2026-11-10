// The L.I.F.E. formula: every reel script has one theme (Love, Identity, Fitness, Earnings) and one level (Safe,
// Real, Raw). The definitions the script writer follows are in ai/prompts/writeScript.md.

export const THEMES = ['Love', 'Identity', 'Fitness', 'Earnings'] as const
export const LEVELS = ['Safe', 'Real', 'Raw'] as const
export type Theme = (typeof THEMES)[number]
export type Level = (typeof LEVELS)[number]

export const THEME_HINT: Record<Theme, string> = {
  Love: 'relationships and hobbies',
  Identity: 'culture, sex, age, faith',
  Fitness: 'mind, body and spirit',
  Earnings: 'career, clients and skills'
}
export const LEVEL_HINT: Record<Level, string> = {
  Safe: 'light and relatable, no risk',
  Real: 'honest, with something at stake',
  Raw: 'the uncomfortable truth, said once'
}

export const isTheme = (v: unknown): v is Theme => (THEMES as readonly unknown[]).includes(v)
export const isLevel = (v: unknown): v is Level => (LEVELS as readonly unknown[]).includes(v)

/** Every reel climbs Safe → Real → Raw, then its purpose, why it matters, and the ask. */
export const CLIMB = ['Safe', 'Real', 'Raw', 'Purpose', 'Why', 'CTA'] as const

/** The theme a script is about, or '' when it has none yet (the level is the same climb for every reel). */
export const lifeLabel = (theme: unknown): string => (isTheme(theme) ? theme : '')
