import { describe, expect, it } from 'vitest'
import { shouldShowBiometricSetup } from '@/features/auth/should-show-biometric-setup'

describe('shouldShowBiometricSetup', () => {
  const base = {
    sessionUserId: 'u1',
    onboardingCompletedAt: null,
    biometricSetupShown: false,
    biometricSetupFlagLoaded: true,
  } as const

  it('true when session valid + onboarding incomplete + flag false + loaded', () => {
    expect(shouldShowBiometricSetup(base)).toBe(true)
  })

  it('false when no session', () => {
    expect(shouldShowBiometricSetup({ ...base, sessionUserId: null })).toBe(false)
  })

  it('false when sessionUserId is undefined', () => {
    expect(shouldShowBiometricSetup({ ...base, sessionUserId: undefined })).toBe(false)
  })

  it('false when onboarding completed', () => {
    expect(
      shouldShowBiometricSetup({
        ...base,
        onboardingCompletedAt: '2026-05-01T00:00:00Z',
      }),
    ).toBe(false)
  })

  it('false when flag already shown', () => {
    expect(shouldShowBiometricSetup({ ...base, biometricSetupShown: true })).toBe(false)
  })

  it('false when flag not yet loaded (avoid premature redirect)', () => {
    expect(
      shouldShowBiometricSetup({ ...base, biometricSetupFlagLoaded: false }),
    ).toBe(false)
  })

  it('true when onboardingCompletedAt is undefined (treated as incomplete)', () => {
    expect(
      shouldShowBiometricSetup({ ...base, onboardingCompletedAt: undefined }),
    ).toBe(true)
  })

  it('false when every input is empty/false', () => {
    expect(
      shouldShowBiometricSetup({
        sessionUserId: null,
        onboardingCompletedAt: null,
        biometricSetupShown: false,
        biometricSetupFlagLoaded: false,
      }),
    ).toBe(false)
  })
})
