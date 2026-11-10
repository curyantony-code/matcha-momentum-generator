// Teleprompter timing. Speed is words a minute, the way people talk, not pixels a second.

export const MIN_WPM = 80
export const MAX_WPM = 260
export const DEFAULT_WPM = 150

const countWords = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length

export const wordCount = countWords

export function readSeconds(text: string, wpm: number): number {
  return Math.round((countWords(text) / wpm) * 60)
}

export function formatLength(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function clampSpeed(wpm: number): number {
  if (!Number.isFinite(wpm)) return MIN_WPM
  return Math.min(MAX_WPM, Math.max(MIN_WPM, wpm))
}

/** Where the text should be after `ms`: the full `maxOffset` is covered in the time the words take to say. */
export function nextOffset(offset: number, ms: number, wpm: number, words: number, maxOffset: number): number {
  if (words <= 0 || maxOffset <= 0) return offset
  const seconds = (words / wpm) * 60
  return Math.min(maxOffset, offset + (maxOffset / seconds) * (ms / 1000))
}

/** The hook, then each paragraph, as the lines to show. */
export function scriptLines(hook: string, script: string): string[] {
  return [hook, ...script.split(/\n+/)].map((l) => l.trim()).filter(Boolean)
}
