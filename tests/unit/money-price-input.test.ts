import { describe, it, expect } from 'vitest'
import { formatPriceInputValue, parsePrice, serializePrice } from '@/utils/money'

// Regresión 2026-06-23: el sheet "Sumar reserva al mes" (NumericEditSheet)
// mostraba el campo MONTO A USAR VACÍO cuando el monto pre-cargado tenía
// decimales. La reserva real era 139107.83 → serializePrice = "139107,83"
// → la rama no-focused de formatPriceInputValue hacía Number("139107,83")
// = NaN → '' → campo vacío. El save igual funcionaba (parsePrice sí hace
// el replace coma→punto). El fix alinea el display con parsePrice.
describe('formatPriceInputValue — montos con decimales', () => {
  it('serializePrice de un float produce coma decimal (formato AR)', () => {
    expect(serializePrice(139107.83)).toBe('139107,83')
  })

  it('NO devuelve vacío para un valor con coma decimal en modo no-focused', () => {
    const raw = serializePrice(139107.83) // "139107,83"
    const display = formatPriceInputValue(raw, false)
    expect(display).not.toBe('')
    // 139.107,83 o 139.108 según redondeo del formatter, pero NUNCA vacío.
    expect(display).toMatch(/139\.10[78]/)
  })

  it('formatea un entero sin decimales', () => {
    expect(formatPriceInputValue('139108', false)).toMatch(/139\.108/)
  })

  it('preserva el valor tipeado en modo focused (con decimales)', () => {
    const display = formatPriceInputValue('1234,56', true)
    expect(display).toContain('1.234')
    expect(display).toContain('56')
  })

  it('round-trip serialize → parse preserva el monto con decimales', () => {
    expect(parsePrice(serializePrice(139107.83))).toBeCloseTo(139107.83, 2)
  })
})
