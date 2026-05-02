import { describe, expect, it } from 'vitest'
import { shouldDismissAuthTransition } from '@/lib/auth-transition-dismiss-gate'

describe('shouldDismissAuthTransition', () => {
  it('returns true when the splash is visible and loading has finished', () => {
    expect(
      shouldDismissAuthTransition({ isLoading: false, splashVisible: true }),
    ).toBe(true)
  })

  it('returns false while still loading even if the splash is visible', () => {
    expect(
      shouldDismissAuthTransition({ isLoading: true, splashVisible: true }),
    ).toBe(false)
  })

  it('returns false when the splash is already hidden', () => {
    expect(
      shouldDismissAuthTransition({ isLoading: false, splashVisible: false }),
    ).toBe(false)
  })

  it('returns false when both conditions are false', () => {
    expect(
      shouldDismissAuthTransition({ isLoading: true, splashVisible: false }),
    ).toBe(false)
  })
})
