// Force the runtime TZ to America/Argentina/Buenos_Aires (UTC-3) so the
// timezone-sensitive assertions are deterministic across environments. El bug
// que estos tests fijan es de CLAVES DE DÍA (medianoche vs mediodía local), así
// que sin TZ fija no reproduce igual en CI.
//
// IMPORTANT: This assignment must happen before any `Date` constructor runs in
// this module. Imports come AFTER so they don't capture the previous TZ.
process.env.TZ = 'America/Argentina/Buenos_Aires'

import { describe, expect, it } from 'vitest'
import { buildGastosSections } from '@/features/gastos/build-sections'
import type { GastosGroup } from '@/features/gastos/gastos-aggregates.model'
import type { Expense } from '@/features/expenses/use-expenses'
import type { IncomeEvent } from '@/features/income/use-income-events'

function expense(args: { id?: string; at: Date; price?: number }): Expense {
  return {
    id: args.id ?? Math.random().toString(36).slice(2),
    family_id: 'fam',
    created_by: 'u1',
    creator_display_name: 'tester',
    category_id: 'food',
    commitment_id: null,
    created_at: args.at.toISOString(),
    description: 'tx',
    notes: null,
    price: args.price ?? 1000,
  } as Expense
}

/** `event_date` es una fecha PLANA 'YYYY-MM-DD' (columna date), como la
 *  devuelve el server — no un timestamp. */
function income(args: {
  id?: string
  eventDate: string
  createdAt?: Date
  amount?: number
}): IncomeEvent {
  return {
    id: args.id ?? Math.random().toString(36).slice(2),
    family_id: 'fam',
    created_by: 'u1',
    amount: args.amount ?? 500_000,
    kind: 'salary',
    description: null,
    event_date: args.eventDate,
    created_at: (args.createdAt ?? new Date(2026, 6, 23, 9)).toISOString(),
  } as IncomeEvent
}

function group(args: { day: number; at: Date; items?: Expense[] }): GastosGroup {
  const items = args.items ?? [expense({ at: args.at })]
  return {
    label: `día ${args.day}`,
    day: args.day,
    total: items.reduce((s, e) => s + e.price, 0),
    items,
  } as GastosGroup
}

describe('buildGastosSections · merge de ingresos por día local', () => {
  // REGRESIÓN. Los gastos bucketeaban por MEDIANOCHE local y los ingresos por
  // el valor crudo de `incomeHappenedAtMs` (MEDIODÍA local, truco anti
  // off-by-one de las fechas planas). Las claves diferían siempre en 12h
  // exactas, así que el `Map.get()` no acertaba NUNCA: cada ingreso abría su
  // propia sección aunque el día tuviera gastos.
  it('mergea el ingreso DENTRO de la sección del día que ya tiene gastos', () => {
    const day = new Date(2026, 6, 23, 18, 30) // 23 jul 18:30 ART
    const sections = buildGastosSections({
      groups: [group({ day: 23, at: day })],
      cycleIncomeEvents: [income({ id: 'inc', eventDate: '2026-07-23' })],
      selectedDay: null,
    })

    expect(sections).toHaveLength(1)
    expect(sections[0]!.incomes.map((i) => i.id)).toEqual(['inc'])
    // El ingreso va ARRIBA de los gastos dentro del mismo día.
    expect(sections[0]!.data.map((r) => r.kind)).toEqual(['income', 'expense'])
  })

  it('no duplica la sección del día ni la parte en dos encabezados', () => {
    const day = new Date(2026, 6, 23, 8)
    const sections = buildGastosSections({
      groups: [group({ day: 23, at: day })],
      cycleIncomeEvents: [income({ eventDate: '2026-07-23' })],
      selectedDay: null,
    })
    const dayKeys = sections.map((s) => s.dateMs)
    expect(new Set(dayKeys).size).toBe(dayKeys.length)
    // Y la clave es MEDIANOCHE local, no mediodía (invariante de `dayMsFromMs`).
    expect(new Date(sections[0]!.dateMs).getHours()).toBe(0)
  })

  it('un ingreso en un día SIN gastos sigue abriendo su propia sección', () => {
    const sections = buildGastosSections({
      groups: [group({ day: 23, at: new Date(2026, 6, 23, 10) })],
      cycleIncomeEvents: [income({ id: 'solo', eventDate: '2026-07-21' })],
      selectedDay: null,
    })
    expect(sections).toHaveLength(2)
    // Orden cronológico desc: 23 primero, 21 después.
    expect(sections[0]!.day).toBe(23)
    expect(sections[1]!.day).toBe(21)
    expect(sections[1]!.incomes.map((i) => i.id)).toEqual(['solo'])
    expect(sections[1]!.total).toBe(0)
  })

  it('un gasto de las 22:00 ART mergea con el ingreso del MISMO día local', () => {
    // 23 jul 22:00 ART = 24 jul 01:00 UTC. Si el bucketing se hiciera en UTC,
    // el gasto caería en el 24 y el merge fallaría.
    const sections = buildGastosSections({
      groups: [group({ day: 23, at: new Date(2026, 6, 23, 22) })],
      cycleIncomeEvents: [income({ id: 'noche', eventDate: '2026-07-23' })],
      selectedDay: null,
    })
    expect(sections).toHaveLength(1)
    expect(sections[0]!.incomes.map((i) => i.id)).toEqual(['noche'])
  })

  it('con hasNextPage omite ingresos MÁS VIEJOS que la ventana cargada', () => {
    const sections = buildGastosSections({
      groups: [group({ day: 23, at: new Date(2026, 6, 23, 10) })],
      cycleIncomeEvents: [
        income({ id: 'viejo', eventDate: '2026-07-01' }),
        income({ id: 'enVentana', eventDate: '2026-07-23' }),
      ],
      selectedDay: null,
      hasNextPage: true,
    })
    // El viejo no abre sección; el del día cargado mergea.
    expect(sections).toHaveLength(1)
    expect(sections[0]!.incomes.map((i) => i.id)).toEqual(['enVentana'])
  })

  it('sin hasNextPage el feed ES el ciclo entero: muestra todos los ingresos', () => {
    const sections = buildGastosSections({
      groups: [group({ day: 23, at: new Date(2026, 6, 23, 10) })],
      cycleIncomeEvents: [income({ id: 'viejo', eventDate: '2026-07-01' })],
      selectedDay: null,
      hasNextPage: false,
    })
    expect(sections).toHaveLength(2)
    expect(sections[1]!.incomes.map((i) => i.id)).toEqual(['viejo'])
  })
})

describe('buildGastosSections · modo día tappeado', () => {
  // REGRESIÓN. El filtro comparaba `incomeHappenedAtMs(i) === selectedDateMs`
  // (mediodía vs medianoche) → SIEMPRE vacío: tocabas un día en el que
  // cobraste y el ingreso desaparecía de la lista.
  it('incluye el ingreso del día en foco', () => {
    const sections = buildGastosSections({
      groups: [group({ day: 23, at: new Date(2026, 6, 23, 15) })],
      cycleIncomeEvents: [
        income({ id: 'delDia', eventDate: '2026-07-23' }),
        income({ id: 'otroDia', eventDate: '2026-07-22' }),
      ],
      selectedDay: 23,
    })
    expect(sections).toHaveLength(1)
    expect(sections[0]!.incomes.map((i) => i.id)).toEqual(['delDia'])
    expect(sections[0]!.data.map((r) => r.kind)).toEqual(['income', 'expense'])
  })

  it('no trae ingresos de otros días al día en foco', () => {
    const sections = buildGastosSections({
      groups: [group({ day: 23, at: new Date(2026, 6, 23, 15) })],
      cycleIncomeEvents: [income({ id: 'otroDia', eventDate: '2026-07-22' })],
      selectedDay: 23,
    })
    expect(sections[0]!.incomes).toEqual([])
    expect(sections[0]!.data.map((r) => r.kind)).toEqual(['expense'])
  })
})
