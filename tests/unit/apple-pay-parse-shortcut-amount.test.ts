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

  it('parsea decimales de UN dígito sin multiplicar por diez', () => {
    // Atajos coerciona el monto numérico a texto con el estilo decimal de
    // la locale, que NO rellena con ceros:
    // `(4500.5).toLocaleString('es-AR')` === '4.500,5'. O sea que este es
    // el formato más probable en producción.
    expect(parseShortcutAmount('25,9')).toEqual({ value: 25.9, isRefund: false })
    expect(parseShortcutAmount('4500,5')).toEqual({ value: 4500.5, isRefund: false })
    expect(parseShortcutAmount('1.234,5')).toEqual({ value: 1234.5, isRefund: false })
    expect(parseShortcutAmount('4.5')).toEqual({ value: 4.5, isRefund: false })
    expect(parseShortcutAmount('$1,234.5')).toEqual({ value: 1234.5, isRefund: false })
  })

  it('devuelve null ante decimales de 3 dígitos: no es formato de moneda', () => {
    // Ambiguo de verdad (¿1234,567 o 1.234567?). Preferimos `null` —la fila
    // entra con warning y el usuario completa el monto— antes que adivinar.
    expect(parseShortcutAmount('1.234,567')).toBeNull()
    expect(parseShortcutAmount('1234.5678')).toBeNull()
    // Mismo separador dos veces con cola de 2 no lo escribe ninguna locale.
    expect(parseShortcutAmount('4.500.00')).toBeNull()
  })

  it('ignora código de moneda y espacios', () => {
    expect(parseShortcutAmount('ARS 4.500,00')).toEqual({ value: 4500, isRefund: false })
    expect(parseShortcutAmount('US$ 25.00')).toEqual({ value: 25, isRefund: false })
    expect(parseShortcutAmount('  $ 1.000  ')).toEqual({ value: 1000, isRefund: false })
  })

  it('ignora los espacios no-rompibles que mete iOS', () => {
    // U+00A0 (no-rompible) y U+202F (no-rompible angosto): los formateadores
    // de iOS los meten entre el símbolo de moneda y el número.
    expect(parseShortcutAmount('$\u00A04.500,00')).toEqual({ value: 4500, isRefund: false })
    expect(parseShortcutAmount('4.500,00\u202FARS')).toEqual({ value: 4500, isRefund: false })
    expect(parseShortcutAmount('\u00A0$\u00A01.000\u00A0')).toEqual({ value: 1000, isRefund: false })
    expect(parseShortcutAmount('-$\u00A025,90')).toEqual({ value: 25.9, isRefund: true })
  })

  it('marca los negativos como devolución y devuelve el valor positivo', () => {
    expect(parseShortcutAmount('-$4.500,00')).toEqual({ value: 4500, isRefund: true })
    expect(parseShortcutAmount('$-4.500,00')).toEqual({ value: 4500, isRefund: true })
    expect(parseShortcutAmount('ARS -4.500,00')).toEqual({ value: 4500, isRefund: true })
  })

  it('trata los paréntesis envolventes como negativo (formato contable)', () => {
    // `Intl.NumberFormat('es-AR', { currencySign: 'accounting' })` escribe
    // los importes negativos así. Leerlo como gasto registraba una
    // devolución al revés.
    expect(parseShortcutAmount('($ 4.500,00)')).toEqual({ value: 4500, isRefund: true })
    expect(parseShortcutAmount('(-$4.500,00)')).toEqual({ value: 4500, isRefund: true })
  })

  it('no toma por signo un guion del medio de la cadena', () => {
    // El guion es de los últimos dígitos de la tarjeta, no del monto. Y la
    // cola pegoteada rompe la forma del número: `null`, no un monto inventado.
    expect(parseShortcutAmount('$1.500,00 (Visa ****-1234)')).toBeNull()
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
