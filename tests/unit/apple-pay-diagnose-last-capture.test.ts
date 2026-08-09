// El usuario configura la automatización en Atajos, que es una app ajena
// que no podemos inspeccionar: si la armó mal, la única evidencia que
// tenemos es la captura que llegó. Estos tests fijan qué se puede concluir
// de esa evidencia, porque de la conclusión depende QUÉ le decimos que
// toque en Atajos:
//
//  · monto ilegible + igual al comercio → los dos campos traen lo mismo
//    (insertó la variable sin elegir la propiedad);
//  · monto ilegible y distinto → sólo podemos mostrarle el texto crudo;
//  · monto legible → no se dice nada, aunque se parezca al comercio.

import { describe, expect, it } from 'vitest'

import { diagnoseLastCapture } from '@/features/apple-pay-capture/diagnose-last-capture'

function capture(amountRaw: string, merchantRaw: string) {
  return { capturedAt: '2026-08-08T15:00:00.000Z', amountRaw, merchantRaw }
}

describe('diagnoseLastCapture', () => {
  it('sin captura todavía no hay nada que diagnosticar', () => {
    expect(diagnoseLastCapture(null)).toEqual({ kind: 'ok' })
  })

  it('una captura sana no dice nada', () => {
    expect(diagnoseLastCapture(capture('$ 8.160,00', 'Makro Cordoba'))).toEqual({ kind: 'ok' })
  })

  it('el caso de device: el comercio llegó en los dos campos', () => {
    expect(diagnoseLastCapture(capture('Makro Cordoba', 'Makro Cordoba'))).toEqual({
      kind: 'same-value',
      raw: 'Makro Cordoba',
    })
  })

  it('la coincidencia tolera mayúsculas, acentos y espacios de Atajos', () => {
    expect(
      // Espacio no-rompible en un lado, acento y mayúsculas en el otro.
      diagnoseLastCapture(capture('  MAKRO CÓRDOBA ', 'makro cordoba')),
    ).toEqual({ kind: 'same-value', raw: 'MAKRO CÓRDOBA' })
  })

  it('un monto ilegible distinto del comercio manda el texto crudo', () => {
    expect(diagnoseLastCapture(capture('  1.234,567  ', 'Makro Cordoba'))).toEqual({
      kind: 'unreadable-amount',
      raw: '1.234,567',
    })
  })

  it('el monto vacío es su propio caso: no hay crudo para mostrar', () => {
    expect(diagnoseLastCapture(capture('   ', 'Makro Cordoba'))).toEqual({ kind: 'missing-amount' })
  })

  it('monto y comercio vacíos NO son "el mismo valor"', () => {
    // Dos vacíos coinciden trivialmente; concluir de ahí que los campos
    // traen lo mismo sería inventar un diagnóstico.
    expect(diagnoseLastCapture(capture('', ''))).toEqual({ kind: 'missing-amount' })
  })

  it('un monto legible que coincide con el comercio tampoco hace ruido', () => {
    // El comercio se llama "1000": los dos campos coinciden, pero el monto
    // se leyó bien y el gasto entró con su valor. No hay nada que arreglar.
    expect(diagnoseLastCapture(capture('1000', '1000'))).toEqual({ kind: 'ok' })
  })

  it('un monto en cero legible es un monto legible', () => {
    expect(diagnoseLastCapture(capture('$ 0,00', 'Makro Cordoba'))).toEqual({ kind: 'ok' })
  })

  it('el comercio vacío con monto ilegible no dispara la coincidencia', () => {
    expect(diagnoseLastCapture(capture('no es un monto', ''))).toEqual({
      kind: 'unreadable-amount',
      raw: 'no es un monto',
    })
  })
})
