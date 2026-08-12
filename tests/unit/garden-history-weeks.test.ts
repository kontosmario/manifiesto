import { describe, expect, it } from 'vitest'
import {
  deriveHistoryWeeks,
  familyActivityWithCounts,
} from '@/features/garden/garden-model'

const TZ = 'America/Argentina/Buenos_Aires'

// Mediodía local (gotcha timestamptz off-by-one): 15:00Z = 12:00 en AR.
const at = (isoDate: string) => `${isoDate}T15:00:00.000Z`

describe('familyActivityWithCounts — una sola pasada', () => {
  it('devuelve el MISMO set que familyActivityDays y además los counts', () => {
    const { activity, counts } = familyActivityWithCounts(
      [
        { created_at: at('2026-07-06'), created_by: 'yo', commitment_id: null },
        { created_at: at('2026-07-06'), created_by: 'mi-pareja', commitment_id: null },
        { created_at: at('2026-07-07'), created_by: 'yo', commitment_id: null },
      ],
      ['2026-07-05'],
      TZ,
    )
    expect([...activity].sort()).toEqual(['2026-07-05', '2026-07-06', '2026-07-07'])
    expect(counts.todos.get('2026-07-06')).toBe(2)
    expect(counts.todos.get('2026-07-07')).toBe(1)
    // El día marcado no tiene gastos: no entra a los counts.
    expect(counts.todos.get('2026-07-05')).toBeUndefined()
  })

  it('los pagos de fijos cuentan en `todos` pero NO en `discrecionales`', () => {
    // El guard del server (`mark_no_expense_day`) excluye commitment_id: un día
    // con un pago de fijo y nada más SIGUE siendo un día "sin gastos".
    const { counts } = familyActivityWithCounts(
      [
        { created_at: at('2026-07-06'), created_by: 'yo', commitment_id: 'fijo-1' },
        { created_at: at('2026-07-06'), created_by: 'yo', commitment_id: null },
      ],
      [],
      TZ,
    )
    expect(counts.todos.get('2026-07-06')).toBe(2)
    expect(counts.discrecionales.get('2026-07-06')).toBe(1)
  })

  it('excluye created_by null de la actividad Y de los counts', () => {
    const { activity, counts } = familyActivityWithCounts(
      [{ created_at: at('2026-07-06'), created_by: null, commitment_id: null }],
      [],
      TZ,
    )
    expect(activity.size).toBe(0)
    expect(counts.todos.size).toBe(0)
  })
})

describe('deriveHistoryWeeks — semanas anteriores', () => {
  // 2026-07-08 fue MIÉRCOLES: el lunes de su semana es el 2026-07-06 y la
  // semana pasada va del 2026-06-29 (lunes) al 2026-07-05 (domingo).
  const todayIso = '2026-07-08'

  const base = {
    todayIso,
    activityIso: new Set<string>(),
    markedDaysIso: new Set<string>(),
    discrecionalesPorDia: new Map<string, number>(),
    recoveredIso: new Set<string>(),
    startIso: '2026-06-01',
  }

  it('sin historial en la primera semana', () => {
    expect(deriveHistoryWeeks({ ...base, weeksShown: 1 })).toEqual([])
  })

  it('topea en 4 filas y la más reciente va primero', () => {
    const rows = deriveHistoryWeeks({
      ...base,
      weeksShown: 12,
      activityIso: new Set(['2026-06-29']),
    })
    expect(rows).toHaveLength(4)
    // rows[0] = semana pasada, y su lunes (29/6) es el día plantado.
    expect(rows[0]![0]).toBe('full')
    expect(rows[1]!.every((d) => d === 'missed')).toBe(true)
  })

  it('el día marcado SIN gastos discrecionales es calma; con gastos, full', () => {
    const rows = deriveHistoryWeeks({
      ...base,
      weeksShown: 2,
      activityIso: new Set(['2026-06-29', '2026-06-30']),
      markedDaysIso: new Set(['2026-06-29', '2026-06-30']),
      discrecionalesPorDia: new Map([['2026-06-30', 2]]),
    })
    expect(rows[0]![0]).toBe('calma') // lunes 29: marcado y sin gastos
    expect(rows[0]![1]).toBe('full') // martes 30: marcado PERO con gastos
  })

  it('los días previos al primer brote nunca se pintan como perdidos', () => {
    const rows = deriveHistoryWeeks({
      ...base,
      weeksShown: 3,
      startIso: '2026-07-01',
      activityIso: new Set(['2026-07-01']),
    })
    // Semana del 29/6 al 5/7: lunes/martes son previos al alta, el miércoles
    // (1/7) es el primer brote.
    expect(rows[0]!.slice(0, 2)).toEqual(['pre', 'pre'])
    expect(rows[0]![2]).toBe('full')
    // La semana anterior es entera previa al alta.
    expect(rows[1]!.every((d) => d === 'pre')).toBe(true)
  })

  it('sin ningún brote todavía, todo es previo (jardín sin culpa)', () => {
    const rows = deriveHistoryWeeks({ ...base, weeksShown: 2, startIso: null })
    expect(rows[0]!.every((d) => d === 'pre')).toBe(true)
  })

  it('el día recuperado por escudo no es ni perdido ni plantado', () => {
    const rows = deriveHistoryWeeks({
      ...base,
      weeksShown: 2,
      recoveredIso: new Set(['2026-07-02']),
    })
    // Jueves 2/7 = índice 3 de la semana pasada (L→D).
    expect(rows[0]![3]).toBe('recovered')
  })

  it('un gasto back-dateado sobre un día recuperado gana (logged-first)', () => {
    const rows = deriveHistoryWeeks({
      ...base,
      weeksShown: 2,
      activityIso: new Set(['2026-07-02']),
      recoveredIso: new Set(['2026-07-02']),
    })
    expect(rows[0]![3]).toBe('full')
  })
})
