import { describe, expect, it } from 'vitest'
import { buildGastosEmptyState } from '@/features/gastos/build-gastos-empty-state'

// Gap del modo INGRESO DINÁMICO (auditoría 2026-07-08): el variant
// `pending-confirm` pide "Confirma tu cobro" — una acción que no existe
// sin sueldo. En dinámico, ciclo vacío + actividad previa cae al empty
// neutro `global`.

const noop = () => {}

function build(overrides: Partial<Parameters<typeof buildGastosEmptyState>[0]> = {}) {
  return buildGastosEmptyState({
    expensesCount: 0,
    filteredCount: 0,
    hasAnyFilter: false,
    hasRecentExpensesOutsideCycle: true,
    onClearFilters: noop,
    onGoToHome: noop,
    ...overrides,
  })
}

describe('buildGastosEmptyState — modo INGRESO DINÁMICO', () => {
  it('fixed: ciclo vacío con actividad previa → pending-confirm (regresión)', () => {
    const model = build({ isDynamicIncome: false })
    expect(model?.kind).toBe('pending-confirm')
  })

  it('dinámico: ciclo vacío con actividad previa → empty neutro, sin "Confirma tu cobro"', () => {
    const model = build({ isDynamicIncome: true })
    expect(model?.kind).toBe('global')
    expect(model?.actionLabel).toBeUndefined()
  })

  it('default (sin flag) conserva el comportamiento fixed', () => {
    const model = build()
    expect(model?.kind).toBe('pending-confirm')
  })
})
