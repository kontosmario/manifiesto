import { describe, expect, it } from 'vitest'
import {
  evaluateAddExpenseGates,
  missingFieldsForStep,
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
  it('deja continuar y confirmar con monto, categoría válida y descripción', () => {
    const g = gates({})
    expect(g.missingFields).toEqual([])
    expect(g.canContinue).toBe(true)
    expect(g.canSubmit).toBe(true)
    expect(g.amount).toBe(1500)
  })
})

describe('evaluateAddExpenseGates — cada campo faltante por separado', () => {
  it('marca sólo `amount` cuando falta el monto', () => {
    const g = gates({ rawPrice: '' })
    expect(g.missingFields).toEqual<AddExpenseField[]>(['amount'])
    expect(g.canContinue).toBe(false)
    expect(g.canSubmit).toBe(false)
  })

  it('marca sólo `category` cuando no hay categoría elegida', () => {
    const g = gates({ categoryId: '' })
    expect(g.missingFields).toEqual<AddExpenseField[]>(['category'])
    expect(g.canContinue).toBe(false)
  })

  it('marca sólo `description` cuando la descripción está vacía', () => {
    const g = gates({ description: '' })
    expect(g.missingFields).toEqual<AddExpenseField[]>(['description'])
    expect(g.canContinue).toBe(false)
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
    expect(g.canContinue).toBe(false)
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
    expect(g.canContinue).toBe(false)
  })

  it('bloquea mientras la query de categorías todavía no hidrató', () => {
    const g = evaluateAddExpenseGates({
      rawPrice: '1500',
      categoryId: 'c1',
      description: 'Café',
      isCategoryIdValid: () => false,
    })
    expect(g.canContinue).toBe(false)
  })
})

describe('missingFieldsForStep', () => {
  const all: AddExpenseField[] = ['amount', 'category', 'description']

  it('devuelve los tres requeridos en el paso 1', () => {
    expect(missingFieldsForStep(all, 1)).toEqual(all)
  })

  it('no devuelve ninguno en el paso 2 (notas y fecha son opcionales)', () => {
    expect(missingFieldsForStep(all, 2)).toEqual([])
  })

  it('respeta el subconjunto que le pasan', () => {
    expect(missingFieldsForStep(['category'], 1)).toEqual(['category'])
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
