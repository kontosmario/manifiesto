import { describe, expect, it } from 'vitest'
import { shouldBackfillToursAsSeen } from '@/features/tours/should-backfill-tours'

const TOURS_DEPLOYED_AT = '2026-05-27T00:00:00Z'

describe('shouldBackfillToursAsSeen', () => {
  it('false si el backfill ya se hizo (idempotencia)', () => {
    expect(
      shouldBackfillToursAsSeen({
        onboardingCompletedAt: '2026-01-01T00:00:00Z',
        toursDeployedAt: TOURS_DEPLOYED_AT,
        backfillAlreadyDone: true,
      }),
    ).toBe(false)
  })

  it('false si el usuario aún no completó el onboarding (mid-wizard)', () => {
    expect(
      shouldBackfillToursAsSeen({
        onboardingCompletedAt: null,
        toursDeployedAt: TOURS_DEPLOYED_AT,
        backfillAlreadyDone: false,
      }),
    ).toBe(false)
  })

  it('true si el onboarding se completó ANTES del deploy (usuario existente)', () => {
    expect(
      shouldBackfillToursAsSeen({
        onboardingCompletedAt: '2026-01-01T00:00:00Z',
        toursDeployedAt: TOURS_DEPLOYED_AT,
        backfillAlreadyDone: false,
      }),
    ).toBe(true)
  })

  it('false si el onboarding se completó DESPUÉS del deploy (usuario nuevo)', () => {
    expect(
      shouldBackfillToursAsSeen({
        onboardingCompletedAt: '2026-06-15T00:00:00Z',
        toursDeployedAt: TOURS_DEPLOYED_AT,
        backfillAlreadyDone: false,
      }),
    ).toBe(false)
  })
})
