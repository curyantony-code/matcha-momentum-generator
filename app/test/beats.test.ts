import { describe, expect, it } from 'vitest'
import { BUILT_IN_BEATS, DEFAULT_BEAT_TEMPLATE, MAX_BEATS, activeTemplate, allTemplates, cleanTemplate } from '../src/shared/beats'

describe('beat templates', () => {
  it('start with the L.I.F.E. climb: Safe, then Real, then Raw, then purpose, why and the ask', () => {
    expect(BUILT_IN_BEATS[0].id).toBe(DEFAULT_BEAT_TEMPLATE)
    const b = BUILT_IN_BEATS[0].beats
    const at = (w: string) => b.indexOf(w)
    expect(at('SAFE')).toBeLessThan(at('REAL'))
    expect(at('REAL')).toBeLessThan(at('RAW'))
    expect(at('RAW')).toBeLessThan(at('PURPOSE'))
    expect(at('PURPOSE')).toBeLessThan(at('WHY'))
    expect(at('WHY')).toBeLessThan(at('CTA'))
    expect(BUILT_IN_BEATS.every((t) => t.builtIn && t.name && t.hint && t.beats.split('\n').length >= 4)).toBe(true)
    expect(new Set(BUILT_IN_BEATS.map((t) => t.id)).size).toBe(BUILT_IN_BEATS.length)
  })

  it('keep a saved template only with a name and beats, trimmed and capped', () => {
    expect(cleanTemplate({ name: '  My   one-take ', beats: ' 1. Hook\r\n2. Proof ' }, 'm1')).toEqual({ id: 'm1', name: 'My one-take', hint: 'My own template.', beats: '1. Hook\n2. Proof' })
    expect(cleanTemplate({ name: '', beats: '1. Hook' }, 'm1')).toBeNull()
    expect(cleanTemplate({ name: 'X', beats: '   ' }, 'm1')).toBeNull()
    expect(cleanTemplate({ name: 'X', beats: 'b'.repeat(MAX_BEATS + 50) }, 'm1')!.beats).toHaveLength(MAX_BEATS)
  })

  it('list built-ins first, then theirs, and fall back to the climb when the active one is gone', () => {
    const mine = [{ id: 'm1', name: 'Mine', hint: '', beats: '1. Hook' }]
    expect(allTemplates(mine).at(-1)!.id).toBe('m1')
    expect(activeTemplate(mine, 'm1').id).toBe('m1')
    expect(activeTemplate(mine, 'deleted').id).toBe(DEFAULT_BEAT_TEMPLATE)
    expect(activeTemplate([], null).id).toBe(DEFAULT_BEAT_TEMPLATE)
  })
})
