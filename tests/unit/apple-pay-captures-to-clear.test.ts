import { describe, expect, it } from 'vitest'
import { capturesToClear } from '../../mobile/features/apple-pay-capture/captures-to-clear'
import type { ReviewRow, ReviewRowKind } from '../../mobile/features/import-review/types'

function row(id: string, kind: ReviewRowKind): ReviewRow {
  return {
    id,
    kind,
    amount: 1000,
    description: `Comercio ${id}`,
    date: '2026-08-08',
    notes: null,
    categoryId: null,
    incomeKind: 'other',
    warnings: [],
    source: {
      origin: 'apple-pay',
      capture: {
        id,
        merchantRaw: `Comercio ${id}`,
        amountRaw: '$1.000',
        capturedAt: '2026-08-08T10:00:00Z',
      },
    },
  }
}

describe('capturesToClear', () => {
  it('descarta las capturas de las filas salteadas', () => {
    const rows = [row('c1', 'skip'), row('c2', 'expense'), row('c3', 'skip')]
    expect(capturesToClear(rows, ['c1', 'c2', 'c3'])).toEqual(['c1', 'c3'])
  })

  it('no descarta nada si el usuario no salteó ninguna', () => {
    const rows = [row('c1', 'expense'), row('c2', 'income')]
    expect(capturesToClear(rows, ['c1', 'c2'])).toEqual([])
  })

  it('descarta TODAS cuando el usuario salteó todo (el atajo de "Cerrar")', () => {
    const rows = [row('c1', 'skip'), row('c2', 'skip')]
    expect(capturesToClear(rows, ['c1', 'c2'])).toEqual(['c1', 'c2'])
  })

  it('nunca toca capturas fuera de la tanda drenada', () => {
    // `c9` está salteada en el sheet pero no salió de ESTE drenaje: no es
    // nuestra para limpiar.
    const rows = [row('c1', 'skip'), row('c9', 'skip')]
    expect(capturesToClear(rows, ['c1'])).toEqual(['c1'])
  })

  it('ignora los ids drenados que ya no tienen fila', () => {
    expect(capturesToClear([row('c1', 'skip')], ['c1', 'c2'])).toEqual(['c1'])
  })

  it('deja todo pendiente cuando el cierre no trae filas', () => {
    // Cierre que no es una decisión del usuario sobre un set de filas: sin
    // filas no hay nada que descartar y las capturas se vuelven a ofrecer.
    expect(capturesToClear(undefined, ['c1', 'c2'])).toEqual([])
  })

  it('deja todo pendiente con una tanda vacía', () => {
    expect(capturesToClear([], ['c1'])).toEqual([])
    expect(capturesToClear([row('c1', 'skip')], [])).toEqual([])
  })

  it('respeta el orden del drenaje, no el de las filas', () => {
    const rows = [row('c3', 'skip'), row('c1', 'skip')]
    expect(capturesToClear(rows, ['c1', 'c3'])).toEqual(['c1', 'c3'])
  })

  it('descarta la devolución que el usuario nunca tocó (borde conocido)', () => {
    // Las devoluciones nacen en `skip` por defecto desde
    // `map-captures-to-review-rows`: aunque el usuario no las toque, al
    // cerrar se limpian. Deliberado — la vio y no es un gasto.
    const refund = row('c1', 'skip')
    refund.warnings = ['refund']
    expect(capturesToClear([refund], ['c1'])).toEqual(['c1'])
  })
})
