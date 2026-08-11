import { describe, expect, it } from 'vitest'
import { deriveAchievementProgress, isSecretAchievement, medalForCode, splitLogros } from '@/features/achievements/achievement-progress'

describe('deriveAchievementProgress', () => {
  const s = { currentStreak: 12, cycleNoSpendCount: 5 }
  it('streak_N usa currentStreak clampado', () => {
    expect(deriveAchievementProgress('streak_30', s)).toEqual({ current: 12, target: 30 })
    expect(deriveAchievementProgress('streak_7', s)).toEqual({ current: 7, target: 7 })
  })
  it('no_spend_cycle_N usa las marcas del ciclo; sin ventana → null', () => {
    expect(deriveAchievementProgress('no_spend_cycle_15', s)).toEqual({ current: 5, target: 15 })
    expect(deriveAchievementProgress('no_spend_cycle_15', { ...s, cycleNoSpendCount: null })).toBeNull()
  })
  it('sin fuente confiable → null (lifetime capado, goals, binarios)', () => {
    for (const c of ['no_spend_lifetime_50', 'goal_25', 'goal_completed', 'first_expense', 'first_cycle_under_budget'])
      expect(deriveAchievementProgress(c, s)).toBeNull()
  })
})

describe('isSecretAchievement', () => {
  it('legendary locked es secreto; earned o no-legendary no', () => {
    expect(isSecretAchievement({ tier: 'legendary', earned: false })).toBe(true)
    expect(isSecretAchievement({ tier: 'legendary', earned: true })).toBe(false)
    expect(isSecretAchievement({ tier: 'gold', earned: false })).toBe(false)
  })
})

describe('medalForCode (D3)', () => {
  it('los 4 hitos del jardín llevan Brot con su pose — SOLO desbloqueados', () => {
    expect(medalForCode('first_expense', true)).toEqual({ kind: 'brot', pose: 'seed' })
    expect(medalForCode('goal_completed', true)).toEqual({ kind: 'brot', pose: 'cheer' })
    expect(medalForCode('streak_90', true)).toEqual({ kind: 'brot', pose: 'radiant' })
    expect(medalForCode('no_spend_lifetime_50', true)).toEqual({ kind: 'brot', pose: 'zen' })
  })
  it('bloqueado NUNCA es Brot: no existe Brot en gris (D3)', () => {
    expect(medalForCode('first_expense', false)).toEqual({ kind: 'icon', code: 'first_expense', earned: false })
  })
  it('el resto usa el ícono existente, con su code y su estado', () => {
    expect(medalForCode('streak_7', true)).toEqual({ kind: 'icon', code: 'streak_7', earned: true })
    expect(medalForCode('no_spend_cycle_7', false)).toEqual({ kind: 'icon', code: 'no_spend_cycle_7', earned: false })
  })
})

describe('splitLogros', () => {
  const items = [
    { code: 'first_expense', tier: 'bronze', earned: true, sort_order: 10 },
    { code: 'streak_7', tier: 'bronze', earned: false, sort_order: 50 },
    { code: 'goal_25', tier: 'bronze', earned: false, sort_order: 96 },
    { code: 'streak_90', tier: 'legendary', earned: false, sort_order: 90 },
    { code: 'no_spend_lifetime_50', tier: 'legendary', earned: false, sort_order: 223 },
  ]
  const r = () => splitLogros(items, { currentStreak: 3, cycleNoSpendCount: 0 })
  it('particiona sin solapamiento ni pérdidas', () => {
    const s = r()
    expect(s.unlocked.map((i) => i.code)).toEqual(['first_expense'])
    expect(s.inProgress.map((i) => i.code)).toEqual(['streak_7', 'goal_25'])
    expect(s.secret.map((i) => i.code)).toEqual(['streak_90', 'no_spend_lifetime_50'])
    expect(s.unlocked.length + s.inProgress.length + s.secret.length).toBe(items.length)
  })
  it('las filas sin fuente de progreso van SIN barra', () => {
    expect(r().inProgress.find((i) => i.code === 'goal_25')?.progress).toBeUndefined()
    expect(r().inProgress.find((i) => i.code === 'streak_7')?.progress).toEqual({ current: 3, target: 7 })
  })
  it('el nudge es el de mayor avance relativo', () => {
    expect(r().nudgeCode).toBe('streak_7')
  })
})
