import { describe, expect, it } from 'vitest'
import { MAX_VALUE_LENGTH, applyBrandEdits, parseBrandProfile, pendingOf, teammateOf } from '../src/shared/brand-profile'

const FILE = [
  '# Brand profile: Personal (Sam)',
  '',
  'Edit the values after the colons.',
  '',
  '## Identity',
  '- name: Sam Rivera',
  '- instagram: {{to fill}} @handle',
  '',
  '## Voice: {{Alex}}',
  '- tone: {{Alex}}',
  '',
  '## Editing rules',
  '- When I list things out loud, every item gets its own card.',
  '- Animation cards (stat, quote): Aubergine card, Pearl words.',
  ''
].join('\n')

describe('pendingOf', () => {
  it('names who still has to answer', () => {
    expect(pendingOf('{{to fill}} @handle')).toBe('you')
    expect(pendingOf('{{Alex}} to confirm')).toBe('teammate')
    expect(pendingOf('Sam Rivera')).toBeNull()
  })
})

describe('parseBrandProfile', () => {
  const p = parseBrandProfile(FILE)

  it('reads the title without the "Brand profile:" prefix, and the intro', () => {
    expect(p.title).toBe('Personal (Sam)')
    expect(p.intro).toEqual(['Edit the values after the colons.'])
  })

  it('reads key: value lines as fields, with their line numbers', () => {
    expect(p.sections[0]!.heading).toBe('Identity')
    expect(p.sections[0]!.fields).toEqual([
      { line: 5, key: 'name', value: 'Sam Rivera', pending: null },
      { line: 6, key: 'instagram', value: '{{to fill}} @handle', pending: 'you' }
    ])
  })

  it('strips the placeholder from a heading and marks the section', () => {
    expect(p.sections[1]!.heading).toBe('Voice')
    expect(p.sections[1]!.pending).toBe('teammate')
  })

  it('keeps sentences as items, even when they hold a colon', () => {
    expect(p.sections[2]!.fields).toEqual([])
    expect(p.sections[2]!.items.map((i) => i.text)).toEqual([
      'When I list things out loud, every item gets its own card.',
      'Animation cards (stat, quote): Aubergine card, Pearl words.'
    ])
  })

  it('counts what is left to fill, per person', () => {
    expect(p.pending).toEqual({ you: 1, teammate: 2 })
  })
})

describe('a teammate named in the blank', () => {
  it('any {{Name}} but {{to fill}} is a teammate, named as the file writes it', () => {
    expect(teammateOf('{{Alex}} to confirm')).toBe('Alex')
    expect(teammateOf('{{ Sam Lee }}')).toBe('Sam Lee')
    expect(teammateOf('{{to fill}} @handle')).toBeNull()
    expect(teammateOf('no blank')).toBeNull()
    expect(pendingOf('{{Sam}}')).toBe('teammate')
    expect(parseBrandProfile(FILE).teammate).toBe('Alex')
    expect(parseBrandProfile('# Brand profile: X\n- name: {{to fill}}\n').teammate).toBeNull()
  })
})

describe('applyBrandEdits', () => {
  it('changes only the edited values and keeps every other line', () => {
    const out = applyBrandEdits(FILE, [
      { line: 6, value: '@samrivera' },
      { line: 12, value: 'When I list things, one card each.' }
    ])
    const lines = out.split('\n')
    expect(lines[6]).toBe('- instagram: @samrivera')
    expect(lines[12]).toBe('- When I list things, one card each.')
    expect(lines.filter((_, i) => i !== 6 && i !== 12)).toEqual(FILE.split('\n').filter((_, i) => i !== 6 && i !== 12))
  })

  it('does not change the text it was given', () => {
    const before = FILE
    applyBrandEdits(FILE, [{ line: 5, value: 'Someone else' }])
    expect(FILE).toBe(before)
  })

  it('trims values', () => {
    expect(applyBrandEdits(FILE, [{ line: 5, value: '  Sam  ' }]).split('\n')[5]).toBe('- name: Sam')
  })

  it('refuses a line that is not a field or an item', () => {
    expect(() => applyBrandEdits(FILE, [{ line: 4, value: 'x' }])).toThrow()
    expect(() => applyBrandEdits(FILE, [{ line: 99, value: 'x' }])).toThrow()
  })

  it('refuses new lines and values that are too long', () => {
    expect(() => applyBrandEdits(FILE, [{ line: 5, value: 'a\n## Injected' }])).toThrow()
    expect(() => applyBrandEdits(FILE, [{ line: 5, value: 'a'.repeat(MAX_VALUE_LENGTH + 1) }])).toThrow()
  })

  it('refuses to empty an item, which would leave a bare dash', () => {
    expect(() => applyBrandEdits(FILE, [{ line: 12, value: '   ' }])).toThrow()
  })

  it('keeps each line’s own ending in a file that mixes them, and the line’s indentation', () => {
    const mixed = '# Brand profile: X\r\n## A\n  - name: Old\r\n- other: Keep\n'
    expect(applyBrandEdits(mixed, [{ line: 2, value: 'New' }])).toBe('# Brand profile: X\r\n## A\n  - name: New\r\n- other: Keep\n')
  })

  it('reads a lowercase link item as an item, not as a field', () => {
    const p = parseBrandProfile('# Brand profile: X\n## Links\n- https://acme.com\n')
    expect(p.sections[0]!.fields).toEqual([])
    expect(p.sections[0]!.items[0]!.text).toBe('https://acme.com')
  })

  it('keeps Windows line endings', () => {
    const crlf = FILE.replace(/\n/g, '\r\n')
    expect(applyBrandEdits(crlf, [{ line: 5, value: 'A' }])).toBe(crlf.replace('- name: Sam Rivera', '- name: A'))
  })
})

describe('hyphenated keys', () => {
  it('reads "sign-off: …" as a setting, not a rule', () => {
    const p = parseBrandProfile('# Brand profile: X\n## Voice\n- sign-off: That\'s me, briefly.\n- When I list things, one card each.\n')
    expect(p.sections[0]!.fields).toEqual([{ line: 2, key: 'sign-off', value: "That's me, briefly.", pending: null }])
    expect(p.sections[0]!.items.map((i) => i.text)).toEqual(['When I list things, one card each.'])
  })
})
