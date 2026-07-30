import { describe, expect, it } from 'vitest'

import {
  deriveHomeBrotPose,
  deriveHomeMoment,
  type DeriveHomeBrotPoseInput,
} from '@/features/home/derive-brot-pose'

/** Base sin ninguna señal de racha — cae al fallback del momento. */
const base: DeriveHomeBrotPoseInput = {
  hasLoggedToday: false,
  isPerfectWeek: false,
  isBroken: false,
  atRiskLevel: 'none',
  hour: 15,
}

describe('deriveHomeMoment — bandas alineadas con getGreeting (home-dashboard-model)', () => {
  it.each([
    [0, 'noche'],
    [5, 'noche'],
    [6, 'manana'],
    [12, 'manana'],
    [13, 'tarde'],
    [19, 'tarde'],
    [20, 'noche'],
    [23, 'noche'],
  ] as const)('hour %i → %s', (hour, expected) => {
    expect(deriveHomeMoment(hour)).toBe(expected)
  })

  it('hora no finita cae al estado base del mockup (tarde)', () => {
    expect(deriveHomeMoment(Number.NaN)).toBe('tarde')
  })
})

describe('deriveHomeBrotPose — matriz de precedencia (racha manda sobre horario)', () => {
  it('registró hoy de día → love, aun con todas las otras señales prendidas', () => {
    expect(
      deriveHomeBrotPose({
        hasLoggedToday: true,
        isPerfectWeek: true,
        isBroken: true,
        atRiskLevel: 'critical',
        hour: 10,
      }),
    ).toBe('love')
  })

  it('semana perfecta (sin registrar hoy) → cheer, gana a sad/worried', () => {
    expect(
      deriveHomeBrotPose({
        ...base,
        isPerfectWeek: true,
        isBroken: true,
        atRiskLevel: 'critical',
        hour: 22,
      }),
    ).toBe('cheer')
  })

  it('racha cortada → sad, gana a worried/idle', () => {
    expect(
      deriveHomeBrotPose({ ...base, isBroken: true, atRiskLevel: 'critical' }),
    ).toBe('sad')
    expect(
      deriveHomeBrotPose({ ...base, isBroken: true, atRiskLevel: 'calm', hour: 9 }),
    ).toBe('sad')
  })

  it('at_risk urgent/critical → worried', () => {
    expect(deriveHomeBrotPose({ ...base, atRiskLevel: 'urgent', hour: 17 })).toBe('worried')
    expect(deriveHomeBrotPose({ ...base, atRiskLevel: 'critical', hour: 22 })).toBe('worried')
  })

  it('at_risk calm/gentle → idle (racha activa, día temprano)', () => {
    expect(deriveHomeBrotPose({ ...base, atRiskLevel: 'calm', hour: 9 })).toBe('idle')
    expect(deriveHomeBrotPose({ ...base, atRiskLevel: 'gentle', hour: 13 })).toBe('idle')
  })

  it('worried/idle ganan al fallback del momento (racha > horario)', () => {
    // Mañana (fallback sería wave) pero at_risk calm → idle.
    expect(deriveHomeBrotPose({ ...base, atRiskLevel: 'calm', hour: 8 })).toBe('idle')
    // Mañana con at_risk urgent (combinación sintética) → worried, no wave.
    expect(deriveHomeBrotPose({ ...base, atRiskLevel: 'urgent', hour: 8 })).toBe('worried')
  })
})

describe('deriveHomeBrotPose — sleep nocturno SOLO si ya registró (README:53)', () => {
  it('registró hoy + noche → sleep (ambas franjas nocturnas)', () => {
    expect(deriveHomeBrotPose({ ...base, hasLoggedToday: true, hour: 22 })).toBe('sleep')
    expect(deriveHomeBrotPose({ ...base, hasLoggedToday: true, hour: 3 })).toBe('sleep')
  })

  it('registró hoy fuera de la noche → love (mañana y tarde)', () => {
    expect(deriveHomeBrotPose({ ...base, hasLoggedToday: true, hour: 10 })).toBe('love')
    expect(deriveHomeBrotPose({ ...base, hasLoggedToday: true, hour: 15 })).toBe('love')
  })

  it('noche SIN registrar nunca es sleep — cae a worried (at_risk) o idle (sin racha)', () => {
    expect(deriveHomeBrotPose({ ...base, atRiskLevel: 'critical', hour: 22 })).toBe('worried')
    expect(deriveHomeBrotPose({ ...base, atRiskLevel: 'none', hour: 22 })).toBe('idle')
  })

  it('el slot "registró hoy" resuelve por momento incluso con semana perfecta', () => {
    // Documentado en el módulo: registró+noche → sleep aunque isPerfectWeek.
    expect(
      deriveHomeBrotPose({ ...base, hasLoggedToday: true, isPerfectWeek: true, hour: 22 }),
    ).toBe('sleep')
  })
})

describe('deriveHomeBrotPose — fallback por momento (sin señales de racha)', () => {
  it('mañana → wave', () => {
    expect(deriveHomeBrotPose({ ...base, hour: 8 })).toBe('wave')
  })

  it('tarde → idle', () => {
    expect(deriveHomeBrotPose({ ...base, hour: 15 })).toBe('idle')
  })

  it('noche → idle (no sleep: no registró)', () => {
    expect(deriveHomeBrotPose({ ...base, hour: 21 })).toBe('idle')
    expect(deriveHomeBrotPose({ ...base, hour: 2 })).toBe('idle')
  })
})
