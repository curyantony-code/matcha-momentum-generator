// Which option an arrow key moves to in a tab row or set of choices (renderer/src/a11y-keys.ts).

/** The next option for a key, or -1 when the key does not move. */
export function nextIndex(key: string, at: number, count: number): number {
  if (count < 1) return -1
  if (key === 'ArrowRight' || key === 'ArrowDown') return (at + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (at - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return -1
}
