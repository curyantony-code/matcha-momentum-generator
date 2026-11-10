// Keyboard for every tab row and every set of choices in the app (WAI-ARIA tabs and radio group patterns), in one
// place instead of in each of the screens that draw one:
// - Left/Up, Right/Down, Home and End move to another option of the same group and pick it (as a click would);
// - only the picked option is a Tab stop ("roving tabindex"), so Tab goes into a group and straight out of it.
import { nextIndex } from '../../shared/keys'

const GROUP = '[role="tablist"], [role="radiogroup"]'
const OPTION = '[role="tab"], [role="radio"]'

const optionsOf = (group: Element): HTMLElement[] =>
  Array.from(group.querySelectorAll<HTMLElement>(OPTION)).filter((el) => el.closest(GROUP) === group && !el.hasAttribute('disabled'))

const isPicked = (el: HTMLElement): boolean => el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-checked') === 'true'

function onKey(e: KeyboardEvent): void {
  const option = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(OPTION)
  const group = option?.closest(GROUP)
  if (!option || !group || e.altKey || e.ctrlKey || e.metaKey) return
  const all = optionsOf(group)
  const next = nextIndex(e.key, all.indexOf(option), all.length)
  if (next < 0) return
  e.preventDefault()
  all[next]!.focus()
  all[next]!.click()
}

/** Only the picked option of each group is reachable with Tab (the first one when none is picked). */
export function updateTabStops(root: ParentNode = document): void {
  for (const group of root.querySelectorAll(GROUP)) {
    const all = optionsOf(group)
    const picked = all.find(isPicked) ?? all[0]
    for (const el of all) el.tabIndex = el === picked ? 0 : -1
  }
}

export function installGroupKeys(): () => void {
  document.addEventListener('keydown', onKey)
  let queued = false
  const observer = new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      updateTabStops()
    })
  })
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected', 'aria-checked', 'role'] })
  updateTabStops()
  return () => {
    document.removeEventListener('keydown', onKey)
    observer.disconnect()
  }
}
