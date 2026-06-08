import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock supabase chain: from('...').select(...).eq(...).eq(...).order(...).limit(...).maybeSingle()
type MaybeSingleResult = { data: unknown; error: unknown }
const maybeSingleMock = vi.fn<[], Promise<MaybeSingleResult>>()

// Builder genérico: cada llamada a `from()` devuelve un chainable que
// termina en `maybeSingle`. Evita verificar el shape de la query intermedia
// — solo nos importa el resultado y el comportamiento del fetcher puro.
function buildChainable() {
  const chain: Record<string, (...args: unknown[]) => unknown> = {}
  const methods = ['select', 'eq', 'order', 'limit'] as const
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn(() => maybeSingleMock())
  return chain
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => buildChainable()),
  },
}))

import { fetchCurrentCycleAcumulado } from '@/features/month-close/use-current-cycle-acumulado'

beforeEach(() => {
  maybeSingleMock.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('fetchCurrentCycleAcumulado', () => {
  it('returns null cuando familyId es undefined', async () => {
    const result = await fetchCurrentCycleAcumulado(undefined, '2026-06-01')
    expect(result).toBeNull()
    expect(maybeSingleMock).not.toHaveBeenCalled()
  })

  it('returns null cuando currentCycleAnchor es null', async () => {
    const result = await fetchCurrentCycleAcumulado('fam-1', null)
    expect(result).toBeNull()
    expect(maybeSingleMock).not.toHaveBeenCalled()
  })

  it('returns null cuando no hay decisiones acumular', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null })
    const result = await fetchCurrentCycleAcumulado('fam-1', '2026-06-01')
    expect(result).toBeNull()
  })

  it('returns null cuando period_end no matchea el anchor', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        decided_at: '2026-05-31T10:00:00Z',
        monthly_summary: {
          period_label: 'Mayo 2026',
          period_end: '2026-05-31', // ≠ anchor 2026-06-01
          monthly_income: 1_000_000,
          total_spent: 500_000,
          savings_delta: 0,
        },
      },
      error: null,
    })
    const result = await fetchCurrentCycleAcumulado('fam-1', '2026-06-01')
    expect(result).toBeNull()
  })

  it('returns {amount, periodLabel} cuando period_end matchea anchor y sobrante>0', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        decided_at: '2026-05-31T10:00:00Z',
        monthly_summary: {
          period_label: 'Mayo 2026',
          period_end: '2026-06-01',
          monthly_income: 1_000_000,
          total_spent: 600_000,
          savings_delta: 100_000,
        },
      },
      error: null,
    })
    const result = await fetchCurrentCycleAcumulado('fam-1', '2026-06-01')
    expect(result).toEqual({
      amount: 300_000, // 1M - 600k - 100k
      periodLabel: 'Mayo 2026',
    })
  })

  it('returns null cuando sobrante <= 0 (todo gastado)', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        decided_at: '2026-05-31T10:00:00Z',
        monthly_summary: {
          period_label: 'Mayo 2026',
          period_end: '2026-06-01',
          monthly_income: 1_000_000,
          total_spent: 1_000_000,
          savings_delta: 0,
        },
      },
      error: null,
    })
    const result = await fetchCurrentCycleAcumulado('fam-1', '2026-06-01')
    expect(result).toBeNull()
  })

  it('soporta monthly_summary como array (variant PostgREST embed)', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        decided_at: '2026-05-31T10:00:00Z',
        monthly_summary: [
          {
            period_label: 'Mayo 2026',
            period_end: '2026-06-01',
            monthly_income: '900000',
            total_spent: '500000',
            savings_delta: '0',
          },
        ],
      },
      error: null,
    })
    const result = await fetchCurrentCycleAcumulado('fam-1', '2026-06-01')
    expect(result).toEqual({
      amount: 400_000,
      periodLabel: 'Mayo 2026',
    })
  })

  it('throws cuando supabase devuelve error', async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: new Error('rls denied'),
    })
    await expect(
      fetchCurrentCycleAcumulado('fam-1', '2026-06-01'),
    ).rejects.toThrow(/rls denied/)
  })
})
