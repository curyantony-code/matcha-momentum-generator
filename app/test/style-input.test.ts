import { describe, expect, it } from 'vitest'
import { MAX_RULE_LENGTH, STARTER_RULES, cleanRuleInput } from '../src/shared/style'

describe('a rule typed on the My style page', () => {
  it('is trimmed to one line', () => {
    expect(cleanRuleInput('  keep the first cut\n under two seconds  ')).toBe('keep the first cut under two seconds')
  })

  it('is refused when empty, too long or not text', () => {
    expect(cleanRuleInput('   ')).toBeNull()
    expect(cleanRuleInput('x'.repeat(MAX_RULE_LENGTH + 1))).toBeNull()
    expect(cleanRuleInput('x'.repeat(MAX_RULE_LENGTH))).toHaveLength(MAX_RULE_LENGTH)
    expect(cleanRuleInput(42)).toBeNull()
    expect(cleanRuleInput({ text: 'hi' })).toBeNull()
  })

  it('offers starter ideas that are each a full sentence the store will keep as written', () => {
    for (const s of STARTER_RULES) {
      expect(cleanRuleInput(s)).toBe(s)
      expect(s).toMatch(/^[A-Z].*\.$/)
    }
  })
})
