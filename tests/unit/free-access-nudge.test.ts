import { describe, expect, it } from 'vitest'
import {
  shouldShowFreeAccessBanner,
  freeAccessBadgeLabel,
  TRIAL_NUDGE_THRESHOLDS,
} from '@/features/billing/free-access-nudge'

describe('shouldShowFreeAccessBanner', () => {
  it('solo para source==trial (familia/pago nunca ven el contador)', () => {
    expect(
      shouldShowFreeAccessBanner({ source: 'family', daysLeft: 1 }, null),
    ).toBe(false)
    expect(
      shouldShowFreeAccessBanner({ source: 'comped', daysLeft: 1 }, null),
    ).toBe(false)
  })

  it('no dispara fuera de los umbrales (días > 7)', () => {
    expect(
      shouldShowFreeAccessBanner({ source: 'trial', daysLeft: 20 }, null),
    ).toBe(false)
  })

  it('dispara una vez por umbral [7,3,1]', () => {
    expect(
      shouldShowFreeAccessBanner({ source: 'trial', daysLeft: 7 }, null),
    ).toBe(true)
    // ya mostrado en el umbral 7
    expect(
      shouldShowFreeAccessBanner({ source: 'trial', daysLeft: 7 }, 7),
    ).toBe(false)
    // bajó a 3 → nuevo umbral
    expect(
      shouldShowFreeAccessBanner({ source: 'trial', daysLeft: 3 }, 7),
    ).toBe(true)
    // último día
    expect(
      shouldShowFreeAccessBanner({ source: 'trial', daysLeft: 1 }, 3),
    ).toBe(true)
  })

  it('daysLeft null no rompe', () => {
    expect(
      shouldShowFreeAccessBanner({ source: 'trial', daysLeft: null }, null),
    ).toBe(false)
  })

  it('umbrales canónicos', () => {
    expect(TRIAL_NUDGE_THRESHOLDS).toEqual([7, 3, 1])
  })
})

describe('freeAccessBadgeLabel (copy neutro, NUNCA "Prueba"/"trial")', () => {
  it('plural', () => {
    expect(freeAccessBadgeLabel(12)).toBe('Acceso completo: 12 días restantes')
  })
  it('singular', () => {
    expect(freeAccessBadgeLabel(1)).toBe('Acceso completo: 1 día restante')
  })
  it('no contiene la palabra prohibida', () => {
    expect(freeAccessBadgeLabel(5).toLowerCase()).not.toContain('prueba')
  })
})
