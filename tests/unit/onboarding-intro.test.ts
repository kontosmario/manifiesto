import { beforeEach, describe, expect, it, vi } from 'vitest'

// Store in-memory para el mock de persistent-kv (vi.hoisted: disponible antes
// de que se evalúe el factory de vi.mock y en los tests).
const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }))

vi.mock('@/lib/persistent-kv', () => ({
  getPersistentValue: vi.fn(async (k: string) => store.get(k) ?? null),
  setPersistentValue: vi.fn(async (k: string, v: string) => {
    store.set(k, v)
  }),
  deletePersistentValue: vi.fn(async (k: string) => {
    store.delete(k)
  }),
}))

import {
  getIntroSeen,
  markIntroSeen,
  resetIntroSeen,
} from '@/features/onboarding-intro/intro-seen'
import {
  INTRO_FIJOS_PROPS,
  INTRO_HERO_METRICS,
  INTRO_INCOME_PROPS,
  INTRO_WEEK_CLOSE,
} from '@/features/onboarding-intro/illustrative-data'

describe('intro-seen — flag device-local del intro pre-auth', () => {
  beforeEach(() => store.clear())

  it('arranca en false (nunca visto) → el machine manda a /(auth)/intro', async () => {
    expect(await getIntroSeen()).toBe(false)
  })

  it('markIntroSeen() persiste → getIntroSeen() true; resetIntroSeen() vuelve a false', async () => {
    await markIntroSeen()
    expect(await getIntroSeen()).toBe(true)
    await resetIntroSeen()
    expect(await getIntroSeen()).toBe(false)
  })

  it('reset usa delete (no string vacío) → la clave queda ausente', async () => {
    await markIntroSeen()
    await resetIntroSeen()
    expect(store.has('pre-auth-intro-seen')).toBe(false)
  })
})

describe('datos ilustrativos del intro — coherentes con los componentes reales', () => {
  it('hero: disponible y cupo positivos, ingreso configurado, proyección confiable', () => {
    expect(INTRO_HERO_METRICS.availableToday).toBeGreaterThan(0)
    expect(INTRO_HERO_METRICS.dailyBudget).toBeGreaterThan(0)
    expect(INTRO_HERO_METRICS.incomeConfigured).toBe(true)
    expect(INTRO_HERO_METRICS.projectionReliable).toBe(true)
    // cycleDay dentro del ciclo
    expect(INTRO_HERO_METRICS.cycleDay).toBeGreaterThanOrEqual(1)
    expect(INTRO_HERO_METRICS.cycleDay).toBeLessThanOrEqual(INTRO_HERO_METRICS.cycleTotalDays)
  })

  it('cierre de semana: 7 brotes, score coherente con los días registrados, stage y letras válidas', () => {
    expect(INTRO_WEEK_CLOSE.days).toHaveLength(7)
    // score = cantidad de días registrados (dataset coherente para el preview).
    const registered = INTRO_WEEK_CLOSE.days.filter((d) => d.registered).length
    expect(INTRO_WEEK_CLOSE.score).toBe(registered)
    expect(INTRO_WEEK_CLOSE.score).toBeGreaterThanOrEqual(0)
    expect(INTRO_WEEK_CLOSE.score).toBeLessThanOrEqual(7)
    const validStage = new Set(['none', 'seed', 'germ', 'fern'])
    expect(validStage.has(INTRO_WEEK_CLOSE.stage)).toBe(true)
    for (const d of INTRO_WEEK_CLOSE.days) {
      expect(d.letter.length).toBeGreaterThan(0)
      expect(typeof d.registered).toBe('boolean')
    }
  })

  it('fijos + ingreso ilustrativos positivos y con % de sueldo sano', () => {
    expect(INTRO_FIJOS_PROPS.totalFijos).toBeGreaterThan(0)
    expect(INTRO_FIJOS_PROPS.porcentajeSueldo).toBeGreaterThan(0)
    expect(INTRO_FIJOS_PROPS.porcentajeSueldo).toBeLessThanOrEqual(100)
    expect(INTRO_INCOME_PROPS.amount).toBeGreaterThan(0)
  })
})
