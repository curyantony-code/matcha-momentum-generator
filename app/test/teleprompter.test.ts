import { describe, expect, it } from 'vitest'
import { clampSpeed, formatLength, MAX_WPM, MIN_WPM, nextOffset, readSeconds, scriptLines } from '../src/shared/teleprompter'

describe('teleprompter', () => {
  it('estimates reading time from the word count', () => {
    expect(readSeconds('one two three', 180)).toBe(1)
    expect(readSeconds('', 180)).toBe(0)
    expect(readSeconds('   ', 180)).toBe(0)
  })

  it('shows the length in plain time', () => {
    expect(formatLength(45)).toBe('45 seconds')
    expect(formatLength(60)).toBe('1:00')
    expect(formatLength(95)).toBe('1:35')
  })

  it('keeps the speed inside what a person can read', () => {
    expect(clampSpeed(1)).toBe(MIN_WPM)
    expect(clampSpeed(9999)).toBe(MAX_WPM)
    expect(clampSpeed(Number.NaN)).toBe(MIN_WPM)
    expect(clampSpeed(160)).toBe(160)
  })

  it('moves so that the whole text takes the reading time', () => {
    // 600 px of scrolling for 60 words at 60 wpm: 60 s, so 10 px each second.
    expect(nextOffset(0, 1000, 60, 60, 600)).toBe(10)
  })

  it('stops at the end and stays still when there is nothing to scroll', () => {
    expect(nextOffset(595, 1000, 60, 60, 600)).toBe(600)
    expect(nextOffset(600, 1000, 60, 60, 600)).toBe(600)
    expect(nextOffset(0, 1000, 60, 0, 600)).toBe(0)
    expect(nextOffset(0, 1000, 60, 60, 0)).toBe(0)
  })

  it('reads the hook first, then each paragraph', () => {
    expect(scriptLines('Hook', 'One\n\nTwo\n')).toEqual(['Hook', 'One', 'Two'])
    expect(scriptLines('', 'One')).toEqual(['One'])
  })
})
