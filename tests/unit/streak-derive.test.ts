import { describe, it, expect, vi } from 'vitest'

// Stub supabase + heavy hook deps porque use-streak.ts las importa
// inline (useExpenses, sendFamilyPush, etc). El test sólo usa funciones
// puras del módulo (deriveStreak, resolveAtRiskIntensity, LEVELS).
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/features/expenses/use-expenses', () => ({
  useExpenses: () => ({ data: [], isLoading: false, error: null }),
}))
vi.mock('@/features/home/home-snapshot-query-keys', () => ({
  homeSnapshotQueryKey: () => ['home-snapshot'],
}))

import {
  deriveStreak,
  resolveAtRiskIntensity,
  LEVELS,
  type StreakData,
} from '@/features/streaks/use-streak'

function makeData(over: Partial<StreakData> = {}): StreakData {
  return {
    currentStreak: 5,
    longestStreak: 10,
    totalDaysLogged: 20,
    hasLoggedToday: true,
    hasMarkedNoExpenseToday: false,
    freezeTokens: 0,
    weekActivity: [true, true, true, true, true, true, true],
    isBroken: false,
    streakBrokenAt: null,
    markedDaysIso: [],
    ...over,
  }
}

describe('resolveAtRiskIntensity', () => {
  it('5-11h → calm', () => {
    const d = new Date()
    d.setHours(8, 0, 0, 0)
    expect(resolveAtRiskIntensity(d)).toBe('calm')
    d.setHours(5, 0, 0, 0)
    expect(resolveAtRiskIntensity(d)).toBe('calm')
    d.setHours(11, 59, 0, 0)
    expect(resolveAtRiskIntensity(d)).toBe('calm')
  })

  it('12-15h → gentle', () => {
    const d = new Date()
    d.setHours(12, 0, 0, 0)
    expect(resolveAtRiskIntensity(d)).toBe('gentle')
    d.setHours(15, 59, 0, 0)
    expect(resolveAtRiskIntensity(d)).toBe('gentle')
  })

  it('16-19h → urgent', () => {
    const d = new Date()
    d.setHours(16, 0, 0, 0)
    expect(resolveAtRiskIntensity(d)).toBe('urgent')
    d.setHours(19, 59, 0, 0)
    expect(resolveAtRiskIntensity(d)).toBe('urgent')
  })

  it('20h en adelante y madrugada (0-4h) → critical', () => {
    const d = new Date()
    d.setHours(20, 0, 0, 0)
    expect(resolveAtRiskIntensity(d)).toBe('critical')
    d.setHours(23, 59, 0, 0)
    expect(resolveAtRiskIntensity(d)).toBe('critical')
    d.setHours(0, 0, 0, 0)
    expect(resolveAtRiskIntensity(d)).toBe('critical')
    d.setHours(4, 59, 0, 0)
    expect(resolveAtRiskIntensity(d)).toBe('critical')
  })
})

describe('deriveStreak — status', () => {
  it('isBroken=true → status broken', () => {
    const d = deriveStreak(makeData({ isBroken: true, currentStreak: 0 }))
    expect(d.status).toBe('broken')
  })

  it('hasLoggedToday=true + !isBroken → status active', () => {
    const d = deriveStreak(makeData({ hasLoggedToday: true }))
    expect(d.status).toBe('active')
    expect(d.atRiskIntensity).toBeNull()
  })

  it('hasLoggedToday=false + !isBroken → status at_risk con intensity', () => {
    const d = deriveStreak(makeData({ hasLoggedToday: false }))
    expect(d.status).toBe('at_risk')
    expect(d.atRiskIntensity).not.toBeNull()
  })
})

describe('deriveStreak — level mapping', () => {
  it('currentStreak=0 → arranque', () => {
    const d = deriveStreak(makeData({ currentStreak: 0, hasLoggedToday: false, isBroken: true }))
    expect(d.level).toBe('arranque')
    expect(d.levelLabel).toBe('Arranque')
  })

  it('currentStreak=7 → constante (first day of next band)', () => {
    const d = deriveStreak(makeData({ currentStreak: 7 }))
    expect(d.level).toBe('constante')
  })

  it('currentStreak=30 → imparable', () => {
    const d = deriveStreak(makeData({ currentStreak: 30 }))
    expect(d.level).toBe('imparable')
  })

  it('currentStreak=120 → leyenda (sin next level)', () => {
    const d = deriveStreak(makeData({ currentStreak: 120 }))
    expect(d.level).toBe('leyenda')
    expect(d.nextLevelLabel).toBe('Leyenda')
    expect(d.daysToNextLevel).toBe(0)
  })

  it('daysToNextLevel calcula gap correcto', () => {
    const d = deriveStreak(makeData({ currentStreak: 5 }))
    // 5 → next es constante (from=7) → faltan 2
    expect(d.daysToNextLevel).toBe(2)
  })

  it('progressPct está en [0,1]', () => {
    const d = deriveStreak(makeData({ currentStreak: 10 }))
    expect(d.progressPct).toBeGreaterThanOrEqual(0)
    expect(d.progressPct).toBeLessThanOrEqual(1)
  })
})

describe('deriveStreak — copy', () => {
  it('active + hasMarkedNoExpenseToday emite copy específico', () => {
    const d = deriveStreak(
      makeData({ currentStreak: 5, hasLoggedToday: true, hasMarkedNoExpenseToday: true }),
    )
    expect(d.copyHeadline).toContain('sin gastos')
  })

  it('active con daysToNextLevel pequeño emite "Casi en ..."', () => {
    // currentStreak=5 → faltan 2 para constante (7) → "Casi en Constante"
    const d = deriveStreak(makeData({ currentStreak: 5, hasLoggedToday: true }))
    expect(d.copyHeadline).toContain('Casi en')
  })

  it('active con currentStreak >= 2 y lejos del próximo nivel → headline con días seguidos', () => {
    // currentStreak=10 → en constante (7..14), faltan 4 al próximo → headline streak
    const d = deriveStreak(makeData({ currentStreak: 10, hasLoggedToday: true }))
    expect(d.copyHeadline).toContain('10 días seguidos')
  })

  it('active con currentStreak=1 → headline "Empezaste tu racha"', () => {
    const d = deriveStreak(
      makeData({ currentStreak: 1, hasLoggedToday: true }),
    )
    // No estamos cerca de next (next at 7, diff=6) → headline streak
    expect(d.copyHeadline).toBe('Empezaste tu racha')
  })

  it('at_risk sin escudos menciona "se corta"', () => {
    const d = deriveStreak(
      makeData({ currentStreak: 5, hasLoggedToday: false, freezeTokens: 0 }),
    )
    expect(d.copyMessage).toContain('se corta')
  })

  it('at_risk con escudos menciona "escudo"', () => {
    const d = deriveStreak(
      makeData({ currentStreak: 5, hasLoggedToday: false, freezeTokens: 2 }),
    )
    expect(d.copyMessage).toMatch(/escudos?/i)
  })

  it('broken con longestStreak >= 7 menciona la marca personal', () => {
    const d = deriveStreak(
      makeData({ currentStreak: 0, longestStreak: 12, isBroken: true }),
    )
    expect(d.copyMessage).toContain('12')
  })

  it('broken con longestStreak < 7 emite copy genérico', () => {
    const d = deriveStreak(
      makeData({ currentStreak: 0, longestStreak: 3, isBroken: true }),
    )
    expect(d.copyHeadline).toBe('La racha se cortó')
    expect(d.copyMessage).toContain('día 1')
  })
})

describe('LEVELS — invariants', () => {
  it('6 niveles ordenados de menor a mayor', () => {
    expect(LEVELS).toHaveLength(6)
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i]!.from).toBeGreaterThan(LEVELS[i - 1]!.from)
    }
  })

  it('último nivel no tiene techo (to=null)', () => {
    expect(LEVELS[LEVELS.length - 1]!.to).toBeNull()
  })
})
