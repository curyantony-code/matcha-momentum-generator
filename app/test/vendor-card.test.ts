import { describe, expect, it } from 'vitest'
import type { VendorInfo } from '../src/shared/api'
import { keepsFailure } from '../src/shared/vendor-card'

const card = (over: Partial<VendorInfo>): VendorInfo => ({ vendor: 'claude', state: 'missing', step: 'idle', ...over })

describe('keepsFailure', () => {
  it('keeps a failed install while the app is still missing', () => {
    expect(keepsFailure(card({ step: 'failed', problem: 'install_failed' }), card({}))).toBe(true)
  })
  it('keeps a free plan while the plan is still free', () => {
    expect(keepsFailure(card({ state: 'ready', step: 'failed', problem: 'free_plan', plan: 'free' }), card({ state: 'ready', plan: 'free' }))).toBe(true)
  })
  it('lets go once the app was installed, or the plan changed', () => {
    expect(keepsFailure(card({ step: 'failed' }), card({ state: 'signed_out' }))).toBe(false)
    expect(keepsFailure(card({ state: 'ready', step: 'failed', plan: 'free' }), card({ state: 'ready', plan: 'pro' }))).toBe(false)
  })
  it('never holds a card that did not fail', () => {
    expect(keepsFailure(card({ step: 'idle' }), card({}))).toBe(false)
    expect(keepsFailure(null, card({}))).toBe(false)
  })
})
