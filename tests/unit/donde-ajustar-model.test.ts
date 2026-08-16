import { describe, expect, it } from 'vitest'
import type { Category } from '../../mobile/features/categories/use-categories'
import type { Expense } from '../../mobile/features/expenses/use-expenses'
import {
  buildDondeAjustarModel,
  type DondeAjustarInput,
} from '../../mobile/features/insights/donde-ajustar-model'

const CYCLE_START = new Date(2026, 7, 1) // 1 ago 2026 local
const CYCLE_END = new Date(2026, 8, 1) // 1 sep 2026 local

const mkCat = (id: string, displayName: string): Category => ({
  id,
  family_id: null,
  name: displayName,
  displayName,
  // El shape real trae más campos; el modelo sólo lee id/name/displayName.
}) as Category

const mkExpense = (overrides: Partial<Expense> = {}): Expense => ({
  id: `e-${Math.random().toString(36).slice(2, 8)}`,
  category_id: 'cat-mercado',
  commitment_id: null,
  created_at: new Date(2026, 7, 10, 12).toISOString(),
  created_by: 'u1',
  creator_display_name: 'Mario',
  description: 'COTO',
  notes: null,
  family_id: 'f1',
  price: 1000,
  paid_in_arrears: false,
  ...overrides,
})

const baseInput = (overrides: Partial<DondeAjustarInput> = {}): DondeAjustarInput => ({
  mode: 'corto',
  expenses: [],
  categories: [mkCat('cat-mercado', 'Mercado'), mkCat('cat-comida', 'Comida')],
  cycleStart: CYCLE_START,
  cycleEnd: CYCLE_END,
  restanteMes: 240_000,
  sobrante: -1_300_000,
  diasRestantes: 20,
  promedioDiario: 44_000,
  fijosMes: 400_000,
  ingresoMes: 2_000_000,
  ...overrides,
})

describe('buildDondeAjustarModel', () => {
  it('el encabezado es el valor absoluto del sobrante proyectado', () => {
    const m = buildDondeAjustarModel(baseInput({ sobrante: -1_300_000 }))
    expect(m.headlineAmount).toBe(1_300_000)
    const m2 = buildDondeAjustarModel(baseInput({ mode: 'ajustado', sobrante: 80_000 }))
    expect(m2.headlineAmount).toBe(80_000)
  })

  it('el nuevo cupo reparte lo que queda entre los días restantes', () => {
    const m = buildDondeAjustarModel(baseInput({ restanteMes: 240_000, diasRestantes: 20 }))
    expect(m.nuevoCupo).toBe(12_000)
    expect(m.cupoAgotado).toBe(false)
  })

  it('con el presupuesto agotado el nuevo cupo es 0 y se marca cupoAgotado', () => {
    const m = buildDondeAjustarModel(baseInput({ restanteMes: -50_000 }))
    expect(m.nuevoCupo).toBe(0)
    expect(m.cupoAgotado).toBe(true)
  })

  it('sin días por delante no hay cupo que corregir (null)', () => {
    const m = buildDondeAjustarModel(baseInput({ diasRestantes: 0 }))
    expect(m.nuevoCupo).toBeNull()
  })

  it('rankea las categorías del ciclo por monto y calcula participación', () => {
    const m = buildDondeAjustarModel(
      baseInput({
        expenses: [
          mkExpense({ category_id: 'cat-mercado', price: 3000 }),
          mkExpense({ category_id: 'cat-mercado', price: 1000 }),
          mkExpense({ category_id: 'cat-comida', price: 6000 }),
        ],
      }),
    )
    expect(m.topCategories.map((c) => c.id)).toEqual(['cat-comida', 'cat-mercado'])
    expect(m.topCategories[0]).toMatchObject({ displayName: 'Comida', amount: 6000, sharePct: 60 })
    expect(m.topCategories[1]).toMatchObject({ amount: 4000, sharePct: 40 })
    expect(m.totalVariable).toBe(10_000)
    expect(m.otherAmount).toBe(0)
  })

  it('excluye fijos (commitment_id), precios inválidos y gastos fuera del ciclo', () => {
    const m = buildDondeAjustarModel(
      baseInput({
        expenses: [
          mkExpense({ price: 5000 }),
          // Fijo: no es ajustable desde acá.
          mkExpense({ commitment_id: 'fx-1', price: 90_000 }),
          // Corrupción de datos.
          mkExpense({ price: Number.NaN }),
          mkExpense({ price: -200 }),
          // Ciclo anterior y ciclo siguiente.
          mkExpense({ created_at: new Date(2026, 6, 20).toISOString(), price: 7000 }),
          mkExpense({ created_at: new Date(2026, 8, 2).toISOString(), price: 7000 }),
        ],
      }),
    )
    expect(m.totalVariable).toBe(5000)
    expect(m.topCategories).toHaveLength(1)
  })

  it('acumula en otherAmount lo que queda fuera del top 4', () => {
    const cats = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => mkCat(`cat-${k}`, k.toUpperCase()))
    const m = buildDondeAjustarModel(
      baseInput({
        categories: cats,
        expenses: [
          mkExpense({ category_id: 'cat-a', price: 6000 }),
          mkExpense({ category_id: 'cat-b', price: 5000 }),
          mkExpense({ category_id: 'cat-c', price: 4000 }),
          mkExpense({ category_id: 'cat-d', price: 3000 }),
          mkExpense({ category_id: 'cat-e', price: 2000 }),
          mkExpense({ category_id: 'cat-f', price: 1000 }),
        ],
      }),
    )
    expect(m.topCategories).toHaveLength(4)
    expect(m.otherAmount).toBe(3000)
  })

  it('marca el aviso de fijos con ≥35% del ingreso — mismo umbral que el reparto', () => {
    const bajo = buildDondeAjustarModel(baseInput({ fijosMes: 400_000, ingresoMes: 2_000_000 }))
    expect(bajo.fijosPct).toBe(20)
    expect(bajo.showFijosWarning).toBe(false)
    const alto = buildDondeAjustarModel(baseInput({ fijosMes: 800_000, ingresoMes: 2_000_000 }))
    expect(alto.fijosPct).toBe(40)
    expect(alto.showFijosWarning).toBe(true)
  })

  it('sin ingreso no divide por cero', () => {
    const m = buildDondeAjustarModel(baseInput({ ingresoMes: 0, fijosMes: 100 }))
    expect(m.fijosPct).toBe(0)
    expect(m.showFijosWarning).toBe(false)
  })

  it('sin gastos en el ciclo el desglose queda vacío', () => {
    const m = buildDondeAjustarModel(baseInput())
    expect(m.topCategories).toEqual([])
    expect(m.totalVariable).toBe(0)
  })
})
