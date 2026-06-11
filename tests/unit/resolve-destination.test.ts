import { describe, expect, it } from 'vitest'
import { resolveDestination } from '@/features/auth-flow/resolve-destination'

describe('resolveDestination', () => {
  it('onboarding pendiente + setup biométrico no mostrado → biometric-setup', () => {
    expect(
      resolveDestination({ onboardingCompletedAt: null, hasFamily: false, showBiometricSetup: true }),
    ).toBe('/(app)/biometric-setup')
  })
  it('onboarding pendiente → onboarding', () => {
    expect(
      resolveDestination({ onboardingCompletedAt: null, hasFamily: false, showBiometricSetup: false }),
    ).toBe('/(app)/onboarding')
  })
  it('onboarding pendiente gana aunque haya familia (precedencia del gate viejo)', () => {
    expect(
      resolveDestination({ onboardingCompletedAt: null, hasFamily: true, showBiometricSetup: false }),
    ).toBe('/(app)/onboarding')
  })
  it('sin familia → join', () => {
    expect(
      resolveDestination({ onboardingCompletedAt: '2026-01-01', hasFamily: false, showBiometricSetup: false }),
    ).toBe('/(auth)/join')
  })
  it('todo verde → home', () => {
    expect(
      resolveDestination({ onboardingCompletedAt: '2026-01-01', hasFamily: true, showBiometricSetup: false }),
    ).toBe('/(app)/(tabs)/home')
  })
})
