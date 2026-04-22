import { describe, expect, it } from 'vitest'
import { terms } from '@/lib/copy/glossary'
import { emptyStates, loadingLabels, errorMessages } from '@/lib/copy/states'

describe('copy glossary', () => {
  it('exposes canonical Spanish terminology', () => {
    expect(terms.expense).toBe('Gasto')
    expect(terms.currentCycle).toBe('Este ciclo')
    expect(terms.available).toBe('Disponible')
    expect(terms.margin).toBe('Margen')
    expect(terms.payday).toBe('Día de cobro')
    expect(terms.fixedExpense).toBe('Gasto fijo')
    expect(terms.history).toBe('Historial')
  })
})

describe('state templates', () => {
  it('expenses empty state is orientative with action', () => {
    const state = emptyStates.expensesThisCycle
    expect(state.title).toContain('gastos')
    expect(state.description.length).toBeGreaterThan(20)
    expect(state.action).toBeTruthy()
  })

  it('debt empty state is active, not passive', () => {
    const state = emptyStates.debt
    expect(state.title.toLowerCase()).not.toContain('cuando aparezca')
    expect(state.description.toLowerCase()).not.toContain('cuando aparezca')
    expect(state.action?.toLowerCase()).toMatch(/^(sumar|registrar|agregar|crear)/)
  })

  it('loading labels are specific, not bare', () => {
    for (const [key, label] of Object.entries(loadingLabels)) {
      expect(label, `loadingLabels.${key}`).not.toBe('Cargando...')
      expect(label, `loadingLabels.${key}`).toMatch(/\S/)
    }
  })

  it('error messages distinguish network vs server', () => {
    expect(errorMessages.network).toMatch(/conexi[óo]n/i)
    expect(errorMessages.server).toMatch(/servidor|fall/i)
  })
})
