import { describe, expect, it } from 'vitest'
import { fernSizeForAge } from '@/features/garden/garden-model'
import {
  ADELANTO_MAX, BONO_CALMA, agrupaGastosPorDia, deriveAdelanto, deriveDayRings, deriveHeroState,
  etapaPorHoras, fernSizeForHours, horasDeCrecimiento,
} from '@/features/garden/crecimiento-model'

const TZ = 'America/Argentina/Buenos_Aires'
const gasto = (iso: string, hour = 12, commitmentId: string | null = null) =>
  ({ created_at: `${iso}T${String(hour).padStart(2, '0')}:00:00-03:00`, created_by: 'u1', commitment_id: commitmentId })

describe('compatibilidad con la curva actual', () => {
  it('con adelanto 0 la etapa por horas es idéntica a la etapa por edad, a cualquier hora', () => {
    for (const [age, esperado] of [[0, 'seed'], [1, 'seed'], [2, 'germ'], [6, 'germ'], [7, 'fern'], [30, 'fern']] as const) {
      for (const hora of [0, 6, 12, 23.99]) {
        expect(etapaPorHoras(horasDeCrecimiento({ ageDays: age, horaLocal: hora, adelanto: 0 }))).toBe(esperado)
      }
    }
  })
  it('fernSizeForHours(24*a) === fernSizeForAge(a) para todo a >= 7', () => {
    for (const a of [7, 8, 12, 20, 26, 27, 60]) expect(fernSizeForHours(24 * a)).toBe(fernSizeForAge(a))
  })
  it('el adelanto ADELANTA la etapa: un día lleno germina al día siguiente', () => {
    expect(etapaPorHoras(horasDeCrecimiento({ ageDays: 1, horaLocal: 0, adelanto: ADELANTO_MAX }))).toBe('germ')
    expect(etapaPorHoras(horasDeCrecimiento({ ageDays: 1, horaLocal: 0, adelanto: 0 }))).toBe('seed')
  })
  it('el día en calma germina HOY MISMO — ningún día de gasto puede', () => {
    expect(etapaPorHoras(horasDeCrecimiento({ ageDays: 0, horaLocal: 12, adelanto: BONO_CALMA }))).toBe('germ')
    expect(etapaPorHoras(horasDeCrecimiento({ ageDays: 0, horaLocal: 23.9, adelanto: ADELANTO_MAX }))).toBe('seed')
  })
})

describe('deriveAdelanto', () => {
  it('sin registros → 0', () => {
    expect(deriveAdelanto({ registros: 0, marcadoSinGastos: false })).toBe(0)
  })
  it('6h por registro, tope 24h en 4 registros', () => {
    expect(deriveAdelanto({ registros: 1, marcadoSinGastos: false })).toBe(6)
    expect(deriveAdelanto({ registros: 4, marcadoSinGastos: false })).toBe(ADELANTO_MAX)
    expect(deriveAdelanto({ registros: 9, marcadoSinGastos: false })).toBe(ADELANTO_MAX)
  })
  it('el día en calma vale el DOBLE del techo por registros', () => {
    expect(deriveAdelanto({ registros: 0, marcadoSinGastos: true, discrecionales: 0 })).toBe(BONO_CALMA)
    expect(BONO_CALMA).toBe(2 * ADELANTO_MAX)
  })
  it('un día con pagos de fijos igual puede estar en calma (el server lo permite)', () => {
    expect(deriveAdelanto({ registros: 2, marcadoSinGastos: true, discrecionales: 0 })).toBe(BONO_CALMA)
  })
  it('marcado con force sobre un día CON gastos discrecionales: día completo, NO calma', () => {
    // el bonus doble no se farmea marcando un día que tuvo compras
    expect(deriveAdelanto({ registros: 3, marcadoSinGastos: true, discrecionales: 3 })).toBe(ADELANTO_MAX)
  })
  it('es monótono no decreciente en registros — registrar NUNCA baja el aro', () => {
    let prev = -1
    for (const r of [0, 1, 2, 3, 4, 5, 20]) {
      const v = deriveAdelanto({ registros: r, marcadoSinGastos: false })
      expect(v).toBeGreaterThanOrEqual(prev); prev = v
    }
  })
})

describe('agrupaGastosPorDia', () => {
  it('cuenta todos (espejo de familyActivityDays) y aparte los discrecionales', () => {
    const r = agrupaGastosPorDia([
      gasto('2026-08-10'), gasto('2026-08-10', 13, 'c1'),
      { ...gasto('2026-08-10'), created_by: null }, gasto('2026-08-09'),
    ], TZ)
    expect(r.todos.get('2026-08-10')).toBe(2)          // el fijo cuenta, el created_by null no
    expect(r.discrecionales.get('2026-08-10')).toBe(1) // el fijo no es discrecional
    expect(r.todos.get('2026-08-09')).toBe(1)
  })
})

describe('deriveDayRings', () => {
  const week = (i: number) => ['2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-08-16'][i]!
  const base = {
    counts: { todos: new Map<string, number>(), discrecionales: new Map<string, number>() },
    markedDaysIso: [] as string[], recoveredIso: new Set<string>(),
    todayIso: '2026-08-13', horaLocal: 15, tone: 'green' as const,
    startIso: null as string | null, weekDayIso: week,
  }
  const conGastos = (iso: string, n: number) => ({
    ...base,
    counts: { todos: new Map([[iso, n]]), discrecionales: new Map([[iso, n]]) },
  })
  it('pasados plantados van LLENOS (el backend ya contó el día)', () => {
    expect(deriveDayRings(conGastos('2026-08-10', 1))[0]).toMatchObject({ state: 'planted', pct: 1 })
  })
  it('hoy usa el pct del adelanto', () => {
    expect(deriveDayRings(conGastos('2026-08-13', 2))[3]).toMatchObject({ state: 'today', pct: 0.5 })
  })
  it('día marcado sin gastos discrecionales → calma', () => {
    const r = deriveDayRings({ ...base, markedDaysIso: ['2026-08-11'] })[1]!
    expect(r.state).toBe('calma')
    expect(r.noSpend).toBe(true)
  })
  it('marcado PERO con gastos discrecionales del hogar → planted, sin calma', () => {
    const r = deriveDayRings({ ...conGastos('2026-08-11', 2), markedDaysIso: ['2026-08-11'] })[1]!
    expect(r.state).toBe('planted')
    expect(r.noSpend).toBe(false)
  })
  it('HOY marcado en calma conserva state today PERO trae noSpend: la fila lo dibuja en calma', () => {
    const r = deriveDayRings({ ...base, markedDaysIso: ['2026-08-13'] })[3]!
    expect(r.state).toBe('today')
    expect(r.noSpend).toBe(true)
    expect(r.pct).toBe(1)
  })
  it('días previos al alta son pre, NUNCA missed (sin culpa)', () => {
    const r = deriveDayRings({ ...base, startIso: '2026-08-12' })
    expect(r[0]!.state).toBe('pre')
    expect(r[1]!.state).toBe('pre')
    expect(r[2]!.state).toBe('missed')
  })
  it('perdido, futuro y recuperado; el gasto orgánico le gana al recuperado', () => {
    const r = deriveDayRings(base)
    expect(r[0]!.state).toBe('missed')
    expect(r[4]!.state).toBe('future')
    expect(deriveDayRings({ ...base, recoveredIso: new Set(['2026-08-11']) })[1]).toMatchObject({ state: 'recovered', pct: 1 })
    expect(deriveDayRings({ ...conGastos('2026-08-11', 1), recoveredIso: new Set(['2026-08-11']) })[1]!.state).toBe('planted')
  })
  it('publica etapa y tamaño del brote por día (la fusión llega a la UI)', () => {
    // ageDays 3 (10 → 13 ago) + horaLocal 15 + adelanto 24 = 24*3 + 15 + 24 = 111h → germ
    const conAdelanto = deriveDayRings(conGastos('2026-08-10', 4))[0]!
    expect(conAdelanto.stage).toBe('germ')
    // el mismo día SIN adelanto: 24*3 + 15 = 87h → germ también, pero más chico
    const sinAdelanto = deriveDayRings(conGastos('2026-08-10', 1))[0]!
    expect(conAdelanto.brotSize).toBeGreaterThan(sinAdelanto.brotSize)
  })
  it('el día en calma arraiga ANTES que el día lleno de registros', () => {
    const week5 = (i: number) => ['2026-08-08','2026-08-09','2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14'][i]!
    const b = { ...base, todayIso: '2026-08-13', horaLocal: 12, weekDayIso: week5 }
    // 2026-08-08 es ageDays 5: 120h + 12h = 132h base
    const calma = deriveDayRings({ ...b, markedDaysIso: ['2026-08-08'] })[0]!       // +48 = 180h → fern
    const lleno = deriveDayRings({ ...b, counts: { todos: new Map([['2026-08-08', 4]]), discrecionales: new Map([['2026-08-08', 4]]) } })[0]! // +24 = 156h → germ
    expect(calma.stage).toBe('fern')
    expect(lleno.stage).toBe('germ')
  })
  it('el tono se propaga a los aros', () => {
    expect(deriveDayRings({ ...base, tone: 'amber' })[3]!.tone).toBe('amber')
  })
})

describe('deriveHeroState', () => {
  const base = { currentStreak: 4, isBroken: false, streakBrokenAt: null as string | null, plantedToday: false, hourLocal: 12, todayIso: '2026-08-11' }
  it('plantado hoy: <7 plantado, >=7 floreciendo, y gana a la hora', () => {
    expect(deriveHeroState({ ...base, plantedToday: true })).toBe('plantado')
    expect(deriveHeroState({ ...base, plantedToday: true, currentStreak: 12 })).toBe('floreciendo')
    expect(deriveHeroState({ ...base, plantedToday: true, hourLocal: 22 })).toBe('plantado')
  })
  it('racha viva sin plantar: <20h aTiempo, >=20h enRiesgo; 00-04 arranca aTiempo', () => {
    expect(deriveHeroState(base)).toBe('aTiempo')
    expect(deriveHeroState({ ...base, hourLocal: 20 })).toBe('enRiesgo')
    expect(deriveHeroState({ ...base, hourLocal: 2 })).toBe('aTiempo')
  })
  it('rota reciente → cortada; vieja → empezar; sin racha → empezar', () => {
    const b = { ...base, currentStreak: 0, isBroken: true }
    expect(deriveHeroState({ ...b, streakBrokenAt: '2026-08-09T02:59:00Z' })).toBe('cortada')
    expect(deriveHeroState({ ...b, streakBrokenAt: '2026-07-20T02:59:00Z' })).toBe('empezar')
    expect(deriveHeroState({ ...base, currentStreak: 0 })).toBe('empezar')
  })
  it('isBroken heurístico (streakBrokenAt null) es la rotura MÁS fresca → cortada', () => {
    // use-streak.ts:251-256: la heurística prende antes de que el cron estampe streak_broken_at
    expect(deriveHeroState({ ...base, isBroken: true, streakBrokenAt: null })).toBe('cortada')
  })
})
