import { describe, expect, it } from 'vitest'
import { terms } from '@/lib/copy/glossary'
import { emptyStates, loadingLabels, errorMessages } from '@/lib/copy/states'
import i18n from '@/lib/i18n'

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

// The copy itself now lives in the `states` i18n namespace; the
// `states.ts` maps are KEY-ONLY. We resolve each key through
// `i18n.t('states:...')` (the test runs in 'es' via the
// expo-localization stub) and assert on the rendered Spanish copy,
// preserving each test's original intent.
describe('state templates', () => {
  it('expenses empty state is orientative with action', () => {
    const key = emptyStates.expensesThisCycle
    const title = i18n.t(`states:empty.${key}.title`)
    const description = i18n.t(`states:empty.${key}.description`)
    const action = i18n.t(`states:empty.${key}.action`)
    expect(title).toContain('gastos')
    expect(description.length).toBeGreaterThan(20)
    expect(action).toBeTruthy()
  })

  it('debt empty state is active, not passive', () => {
    const key = emptyStates.debt
    const title = i18n.t(`states:empty.${key}.title`)
    const description = i18n.t(`states:empty.${key}.description`)
    const action = i18n.t(`states:empty.${key}.action`)
    expect(title.toLowerCase()).not.toContain('cuando aparezca')
    expect(description.toLowerCase()).not.toContain('cuando aparezca')
    expect(action?.toLowerCase()).toMatch(/^(sumar|registrar|agregar|crear)/)
  })

  it('loading labels are specific, not bare', () => {
    for (const [key, mapKey] of Object.entries(loadingLabels)) {
      const label = i18n.t(`states:loading.${mapKey}`)
      expect(label, `loadingLabels.${key}`).not.toBe('Cargando...')
      expect(label, `loadingLabels.${key}`).toMatch(/\S/)
    }
  })

  it('error messages distinguish network vs server', () => {
    expect(i18n.t(`states:error.${errorMessages.network}`)).toMatch(/conexi[óo]n/i)
    expect(i18n.t(`states:error.${errorMessages.server}`)).toMatch(/servidor|fall/i)
  })
})
