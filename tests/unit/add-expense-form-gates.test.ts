import { describe, expect, it } from 'vitest'
import {
  evaluateAddExpenseGates,
  parseAddExpenseAmount,
  type AddExpenseField,
} from '@/features/expenses/use-add-expense-form'

const VALID_IDS = new Set(['c1', 'c2'])
const isCategoryIdValid = (id: string) => VALID_IDS.has(id)

function gates(overrides: Partial<{ rawPrice: string; categoryId: string; description: string }>) {
  return evaluateAddExpenseGates({
    rawPrice: '1500',
    categoryId: 'c1',
    description: 'Café',
    isCategoryIdValid,
    ...overrides,
  })
}

describe('parseAddExpenseAmount', () => {
  it('devuelve 0 con el input vacío (parsePrice da NaN)', () => {
    expect(parseAddExpenseAmount('')).toBe(0)
  })

  it('devuelve 0 con basura no numérica', () => {
    expect(parseAddExpenseAmount('abc')).toBe(0)
  })

  it('devuelve 0 con un cero explícito', () => {
    expect(parseAddExpenseAmount('0')).toBe(0)
  })

  it('parsea decimales con coma (convención del numpad propio)', () => {
    expect(parseAddExpenseAmount('1500,50')).toBe(1500.5)
  })
})

describe('evaluateAddExpenseGates — formulario completo', () => {
  it('deja confirmar con monto, categoría válida y descripción', () => {
    const g = gates({})
    expect(g.missingFields).toEqual([])
    expect(g.canSubmit).toBe(true)
    expect(g.amount).toBe(1500)
  })
})

describe('evaluateAddExpenseGates — cada campo faltante por separado', () => {
  it('marca sólo `amount` cuando falta el monto', () => {
    const g = gates({ rawPrice: '' })
    expect(g.missingFields).toEqual<AddExpenseField[]>(['amount'])
    expect(g.canSubmit).toBe(false)
  })

  it('marca sólo `category` cuando no hay categoría elegida', () => {
    const g = gates({ categoryId: '' })
    expect(g.missingFields).toEqual<AddExpenseField[]>(['category'])
    expect(g.canSubmit).toBe(false)
  })

  it('marca sólo `description` cuando la descripción está vacía', () => {
    const g = gates({ description: '' })
    expect(g.missingFields).toEqual<AddExpenseField[]>(['description'])
    expect(g.canSubmit).toBe(false)
  })

  it('cuenta como vacía una descripción de puros espacios', () => {
    const g = gates({ description: '   ' })
    expect(g.missingFields).toEqual<AddExpenseField[]>(['description'])
  })

  it('acumula los tres faltantes con el formulario en blanco', () => {
    const g = gates({ rawPrice: '', categoryId: '', description: '' })
    expect(g.missingFields).toEqual<AddExpenseField[]>(['amount', 'category', 'description'])
  })
})

describe('evaluateAddExpenseGates — monto inválido', () => {
  it('bloquea con monto 0', () => {
    const g = gates({ rawPrice: '0' })
    expect(g.amount).toBe(0)
    expect(g.hasValidAmount).toBe(false)
    expect(g.missingFields).toContain('amount')
  })

  it('bloquea con monto no parseable (NaN)', () => {
    const g = gates({ rawPrice: 'no soy un número' })
    expect(g.amount).toBe(0)
    expect(g.canSubmit).toBe(false)
  })
})

describe('evaluateAddExpenseGates — categoría inválida', () => {
  it('bloquea cuando el id NO existe entre las categorías cargadas', () => {
    // Categoría borrada por otro miembro / prefill viejo del Asistente: hay
    // "algo" en el campo, pero no resuelve. El gate viejo (`!== ''`) lo dejaba
    // pasar y el submit volvía en silencio.
    const g = gates({ categoryId: 'borrada-por-otro-miembro' })
    expect(g.isCategoryValid).toBe(false)
    expect(g.missingFields).toEqual<AddExpenseField[]>(['category'])
    expect(g.canSubmit).toBe(false)
  })

  it('bloquea mientras la query de categorías todavía no hidrató', () => {
    const g = evaluateAddExpenseGates({
      rawPrice: '1500',
      categoryId: 'c1',
      description: 'Café',
      isCategoryIdValid: () => false,
    })
    expect(g.canSubmit).toBe(false)
  })
})

/**
 * El alta se fusionó en UNA pantalla el 2026-08-17 (antes: wizard de 2 pasos).
 *
 * Los tests que afirmaban el reparto por paso (`missingFieldsForStep`) se
 * reemplazaron por estos: aquella función existía para responder "¿qué le falta
 * al paso 2?" —cuya respuesta era SIEMPRE `[]`, porque nota y fecha eran
 * opcional y de sólo lectura— y con ella se derivaba un `canSubmit` que en la
 * práctica valía lo mismo que `canContinue`. Lo que queda por verificar no es
 * el reparto sino la invariante que lo reemplaza: UN gate, derivado de
 * `missingFields` (regla 3 de `docs/sistemas/form-validation-pattern.md`).
 */
describe('evaluateAddExpenseGates — un solo gate, derivado de missingFields', () => {
  const CASES: Array<Partial<{ rawPrice: string; categoryId: string; description: string }>> = [
    {},
    { rawPrice: '' },
    { categoryId: '' },
    { description: '' },
    { rawPrice: '', categoryId: '' },
    { rawPrice: '', categoryId: '', description: '' },
  ]

  it('`canSubmit` es exactamente `missingFields.length === 0` en toda combinación', () => {
    // Si esto se rompe, el CTA y la línea que enumera los faltantes están
    // contando cosas distintas: el botón queda habilitado sin que ningún campo
    // se pinte, o atenuado sin nada que completar.
    for (const c of CASES) {
      const g = gates(c)
      expect(g.canSubmit).toBe(g.missingFields.length === 0)
    }
  })

  it('cada condición del gate corresponde 1:1 con una entrada de la lista', () => {
    for (const c of CASES) {
      const g = gates(c)
      expect(g.missingFields.includes('amount')).toBe(!g.hasValidAmount)
      expect(g.missingFields.includes('category')).toBe(!g.isCategoryValid)
      expect(g.missingFields.includes('description')).toBe(!g.isDescriptionValid)
    }
  })
})

describe('gates — identificación por enum, no por copy localizado', () => {
  it('los faltantes son tokens estables e independientes del idioma', () => {
    const g = gates({ rawPrice: '', categoryId: '', description: '' })
    // Si esto alguna vez devuelve strings de UI ("monto", "amount", …), el
    // resaltado del campo se rompe al cambiar de idioma o de copy.
    for (const field of g.missingFields) {
      expect(['amount', 'category', 'description']).toContain(field)
    }
  })
})
