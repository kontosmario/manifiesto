import { describe, expect, it } from 'vitest'
import { parseShortcutAmount } from '../../mobile/features/apple-pay-capture/parse-shortcut-amount'

describe('parseShortcutAmount', () => {
  it('parsea formato argentino con miles y decimales', () => {
    expect(parseShortcutAmount('$4.500,00')).toEqual({ value: 4500, isRefund: false })
  })

  it('parsea formato estadounidense con miles y decimales', () => {
    expect(parseShortcutAmount('$4,500.00')).toEqual({ value: 4500, isRefund: false })
  })

  it('parsea sin decimales, tratando el separador como miles', () => {
    expect(parseShortcutAmount('$4.500')).toEqual({ value: 4500, isRefund: false })
    expect(parseShortcutAmount('$4,500')).toEqual({ value: 4500, isRefund: false })
  })

  it('parsea decimales sin separador de miles', () => {
    expect(parseShortcutAmount('1.234,56')).toEqual({ value: 1234.56, isRefund: false })
    expect(parseShortcutAmount('25,90')).toEqual({ value: 25.9, isRefund: false })
    expect(parseShortcutAmount('25.90')).toEqual({ value: 25.9, isRefund: false })
  })

  it('ignora código de moneda y espacios', () => {
    expect(parseShortcutAmount('ARS 4.500,00')).toEqual({ value: 4500, isRefund: false })
    expect(parseShortcutAmount('US$ 25.00')).toEqual({ value: 25, isRefund: false })
    expect(parseShortcutAmount('  $ 1.000  ')).toEqual({ value: 1000, isRefund: false })
  })

  it('marca los negativos como devolución y devuelve el valor positivo', () => {
    expect(parseShortcutAmount('-$4.500,00')).toEqual({ value: 4500, isRefund: true })
    expect(parseShortcutAmount('$-4.500,00')).toEqual({ value: 4500, isRefund: true })
  })

  it('trata varios separadores de miles', () => {
    expect(parseShortcutAmount('$1.234.567,89')).toEqual({ value: 1234567.89, isRefund: false })
    expect(parseShortcutAmount('$1,234,567.89')).toEqual({ value: 1234567.89, isRefund: false })
  })

  it('devuelve null cuando no hay dígitos', () => {
    expect(parseShortcutAmount('')).toBeNull()
    expect(parseShortcutAmount('   ')).toBeNull()
    expect(parseShortcutAmount('$')).toBeNull()
    expect(parseShortcutAmount('sin monto')).toBeNull()
  })

  it('acepta cero', () => {
    expect(parseShortcutAmount('$0,00')).toEqual({ value: 0, isRefund: false })
  })
})
