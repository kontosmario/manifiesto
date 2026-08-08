import { describe, expect, it } from 'vitest'
import { mapCapturesToReviewRows } from '../../mobile/features/apple-pay-capture/map-captures-to-review-rows'

const ctx = {
  today: '2026-08-08',
  history: [
    { description: 'Starbucks', categoryId: 'cafe', createdAt: '2026-08-01T12:00:00Z' },
  ],
  noDescriptionLabel: 'Sin descripción',
}

describe('mapCapturesToReviewRows', () => {
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

  it('avisa cuando no hay comercio y usa la etiqueta de fallback', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c5', merchantRaw: '   ', amountRaw: '$100', capturedAt: '2026-08-08T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].description).toBe('Sin descripción')
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
})
