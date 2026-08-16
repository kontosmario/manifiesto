// Force the runtime TZ to America/Argentina/Buenos_Aires (UTC-3) so the
// timezone-sensitive assertions are deterministic across environments. El bug
// que estos tests fijan es de DÍA LOCAL contra día UTC: una compra de las
// 21:30 en Argentina cae al día UTC siguiente, y sin TZ fija no reproduce.
//
// IMPORTANT: This assignment must happen before any `Date` constructor runs in
// this module. Imports come AFTER so they don't capture the previous TZ.
process.env.TZ = 'America/Argentina/Buenos_Aires'

import { describe, expect, it } from 'vitest'
import { mapCapturesToReviewRows } from '../../mobile/features/apple-pay-capture/map-captures-to-review-rows'

const ctx = {
  today: '2026-08-08',
  history: [
    { description: 'Starbucks', categoryId: 'cafe', createdAt: '2026-08-01T12:00:00Z' },
  ],
}

describe('mapCapturesToReviewRows', () => {
  // Mismo bug que en el camino OCR: el placeholder satisfacía la validación.
  it('deja la descripción VACÍA cuando Apple Pay no entrega comercio', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c0', merchantRaw: '  ', amountRaw: '$1.000', capturedAt: '2026-08-08T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].description).toBe('')
    expect(rows[0].warnings).toContain('no-merchant')
  })

  it('mapea una captura normal a una fila de gasto lista', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c1', merchantRaw: 'STARBUCKS #12', amountRaw: '$4.500,00', capturedAt: '2026-08-08T10:00:00Z' }],
      ctx,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'c1',
      kind: 'expense',
      amount: 4500,
      description: 'STARBUCKS #12',
      date: '2026-08-08',
      categoryId: 'cafe',
      warnings: [],
    })
    expect(rows[0].source).toEqual({
      origin: 'apple-pay',
      capture: { id: 'c1', merchantRaw: 'STARBUCKS #12', amountRaw: '$4.500,00', capturedAt: '2026-08-08T10:00:00Z' },
    })
  })

  it('deja categoryId en null cuando el comercio es nuevo', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c2', merchantRaw: 'FARMACITY', amountRaw: '$1.000', capturedAt: '2026-08-08T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].categoryId).toBeNull()
  })

  it('marca las devoluciones como skip', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c3', merchantRaw: 'COTO', amountRaw: '-$500,00', capturedAt: '2026-08-08T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].kind).toBe('skip')
    expect(rows[0].warnings).toContain('refund')
    expect(rows[0].amount).toBe(500)
  })

  it('avisa cuando el monto no se pudo parsear y deja el campo en cero', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c4', merchantRaw: 'COTO', amountRaw: 'sin monto', capturedAt: '2026-08-08T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].amount).toBe(0)
    expect(rows[0].warnings).toContain('value-zero')
  })

  it('avisa cuando no hay comercio y deja la descripción vacía', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c5', merchantRaw: '', amountRaw: '$1.000', capturedAt: '2026-08-08T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].description).toBe('')
    expect(rows[0].categoryId).toBeNull()
    expect(rows[0].warnings).toContain('no-merchant')
  })

  it('ancla a hoy una captura con fecha futura', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c6', merchantRaw: 'COTO', amountRaw: '$100', capturedAt: '2026-09-01T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].date).toBe('2026-08-08')
    expect(rows[0].warnings).toContain('future-date')
  })

  it('usa la fecha de la captura cuando es pasada', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c7', merchantRaw: 'COTO', amountRaw: '$100', capturedAt: '2026-08-06T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].date).toBe('2026-08-06')
    expect(rows[0].warnings).toEqual([])
  })

  it('fecha una compra nocturna con el día LOCAL, no con el día UTC', () => {
    // 8/8 21:30 en Argentina = 9/8 00:30 UTC. Es una compra normalísima
    // (~1 de cada 8 pagos cae después de las 21:00): tiene que quedar
    // fechada el 8 y SIN warning. Cortando el ISO salía con `future-date`
    // esa misma noche, y fechada el 9 si se drenaba a la mañana siguiente.
    const rows = mapCapturesToReviewRows(
      [{ id: 'c8', merchantRaw: 'COTO', amountRaw: '$100', capturedAt: '2026-08-09T00:30:00Z' }],
      ctx,
    )
    expect(rows[0].date).toBe('2026-08-08')
    expect(rows[0].warnings).toEqual([])
  })

  it('respeta el offset cuando el instante no viene en UTC', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c9', merchantRaw: 'COTO', amountRaw: '$100', capturedAt: '2026-08-07T21:30:00-03:00' }],
      ctx,
    )
    expect(rows[0].date).toBe('2026-08-07')
    expect(rows[0].warnings).toEqual([])
  })

  it('cae a hoy cuando el instante de la captura es inválido', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c10', merchantRaw: 'COTO', amountRaw: '$100', capturedAt: 'no es una fecha' }],
      ctx,
    )
    expect(rows[0].date).toBe('2026-08-08')
    expect(rows[0].warnings).toEqual([])
  })
})
