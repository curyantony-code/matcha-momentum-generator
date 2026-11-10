import type { VendorInfo } from './api'

/**
 * Settings > Your AI editor: a card that failed (the install did not finish, a free plan) keeps its message when a fresh
 * look finds the app in the same state, so clicking back into the window does not wipe it. It changes once something
 * really did: the app got installed or signed in, or the plan changed.
 */
export const keepsFailure = (shown: VendorInfo | null, fresh: VendorInfo): boolean =>
  !!shown && shown.step === 'failed' && shown.state === fresh.state && shown.plan === fresh.plan
