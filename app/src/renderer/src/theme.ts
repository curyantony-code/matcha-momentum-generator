// How the app looks: the dark edit bay (default), daylight, or the system's choice. The tokens live in styles.css
// under :root[data-theme="dark" | "light"]; this module only sets that attribute and follows the system when asked.
import { reel } from './api'

export type ThemeChoice = 'dark' | 'light' | 'system'

const dark = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)')

let current: ThemeChoice = 'dark'
let unfollow: (() => void) | null = null

function paint(choice: ThemeChoice): void {
  const resolved = choice === 'system' ? (dark().matches ? 'dark' : 'light') : choice
  document.documentElement.dataset.theme = resolved
}

/** Show `choice` now, and keep following the system while it is 'system'. */
export function applyTheme(choice: ThemeChoice): void {
  current = choice
  unfollow?.()
  unfollow = null
  paint(choice)
  if (choice === 'system') {
    const mq = dark()
    const onChange = (): void => paint(current)
    mq.addEventListener('change', onChange)
    unfollow = () => mq.removeEventListener('change', onChange)
  }
}

/** The saved choice, applied. Dark when nothing is saved or the read fails. */
export async function loadTheme(): Promise<ThemeChoice> {
  const t = await reel.theme.get().catch(() => 'dark' as const)
  applyTheme(t)
  return t
}

/** Save and show a new choice; on failure the previous one stays on screen and the error is thrown. */
export async function saveTheme(choice: ThemeChoice): Promise<ThemeChoice> {
  const before = current
  applyTheme(choice)
  try {
    const saved = await reel.theme.set(choice)
    applyTheme(saved)
    return saved
  } catch (e) {
    applyTheme(before)
    throw e
  }
}
