import { describe, expect, it } from 'vitest'
import {
  collectRevertablePaymentIds,
  isOptimisticPaymentId,
  pickLatestRevertablePaymentId,
} from '@/features/fixed-expenses/fixed-expense-payment.model'

describe('isOptimisticPaymentId', () => {
  it('detecta el id optimista optimistic-<iso>-<fixedExpenseId>', () => {
    // Formato exacto de use-fixed-expenses.ts (optimisticPaymentId)
    expect(
      isOptimisticPaymentId('optimistic-2026-06-04T10:00:00Z-fx-opt'),
    ).toBe(true)
  })

  it('trata un uuid de payment real como NO optimista', () => {
    expect(
      isOptimisticPaymentId('061ecf9d-3385-4c77-8662-d25e0527b6c0'),
    ).toBe(false)
  })

  it('no confunde otros ids sinteticos (temp-) ni strings arbitrarios', () => {
    expect(isOptimisticPaymentId('temp-1783908129165-swsfiz')).toBe(false)
    expect(isOptimisticPaymentId('')).toBe(false)
    expect(isOptimisticPaymentId('pay-1')).toBe(false)
  })
})

describe('pickLatestRevertablePaymentId — el Deshacer se acota al ciclo vigente', () => {
  const windowStartIso = '2026-08-10T00:00:00.000Z'
  const windowEndIso = '2026-09-10T00:00:00.000Z'
  const pay = (id: string, fixedExpenseId: string, paidAt: string) => ({
    id,
    fixedExpenseId,
    paidAt,
  })
  const pick = (
    paymentLists: Parameters<typeof pickLatestRevertablePaymentId>[0]['paymentLists'],
    fixedExpenseId = 'fx-1',
  ) =>
    pickLatestRevertablePaymentId({
      paymentLists,
      fixedExpenseId,
      windowStartIso,
      windowEndIso,
    })

  it('elige el pago real más reciente del fijo dentro de la ventana', () => {
    const lists = [
      [
        pay('a', 'fx-1', '2026-08-12T10:00:00.000Z'),
        pay('b', 'fx-1', '2026-08-15T10:00:00.000Z'),
      ],
    ]
    expect(pick(lists)).toBe('b')
  })

  it('saltea los ids optimistas aunque sean los más recientes', () => {
    const lists = [
      [
        pay('real', 'fx-1', '2026-08-12T10:00:00.000Z'),
        pay('optimistic-2026-08-15T10:00:00Z-fx-1', 'fx-1', '2026-08-15T10:00:00.000Z'),
      ],
    ]
    expect(pick(lists)).toBe('real')
  })

  it('ignora pagos de otros fijos', () => {
    const lists = [[pay('ajeno', 'fx-2', '2026-08-15T10:00:00.000Z')]]
    expect(pick(lists)).toBeNull()
  })

  it('un pago real de un ciclo ANTERIOR no es candidato (bug del cache viejo con gcTime 24h)', () => {
    // Escenario del bug: el pago recién registrado sigue optimista (se
    // saltea) y el único real en caches es de la ventana pasada. Antes se
    // devolvía ese id y el Deshacer revertía el pago del ciclo anterior;
    // ahora no hay candidato y el caller avisa "todavía sincronizando".
    const lists = [
      [
        pay('viejo-real', 'fx-1', '2026-07-15T12:00:00.000Z'),
        pay('optimistic-2026-08-16T10:00:00Z-fx-1', 'fx-1', '2026-08-16T10:00:00.000Z'),
      ],
    ]
    expect(pick(lists)).toBeNull()
  })

  it('ventana [inicio, fin): el inicio entra, el fin queda afuera', () => {
    expect(pick([[pay('en-inicio', 'fx-1', windowStartIso)]])).toBe('en-inicio')
    expect(pick([[pay('en-fin', 'fx-1', windowEndIso)]])).toBeNull()
  })

  it('tolera caches undefined o con shape inesperado', () => {
    const lists = [undefined, [pay('ok', 'fx-1', '2026-08-12T10:00:00.000Z')]]
    expect(pick(lists)).toBe('ok')
  })

  it('excludeIds: un pago real de la MISMA ventana conocido al mostrar el toast no es candidato (catch-up de dos cuotas)', () => {
    // Escenario: el usuario paga la cuota de julio (catch-up) y enseguida la
    // de agosto. Al mostrarse el toast del segundo pago, el único real en
    // cache es el primero — excluirlo evita revertir la cuota equivocada.
    const lists = [[pay('cuota-1-real', 'fx-1', '2026-08-16T10:00:00.000Z')]]
    expect(
      pickLatestRevertablePaymentId({
        paymentLists: lists,
        fixedExpenseId: 'fx-1',
        windowStartIso,
        windowEndIso,
        excludeIds: ['cuota-1-real'],
      }),
    ).toBeNull()
  })

  it('excludeIds: el pago NUEVO que aparece tras el refetch sí es candidato', () => {
    const lists = [
      [
        pay('cuota-1-real', 'fx-1', '2026-08-16T10:00:00.000Z'),
        pay('cuota-2-real', 'fx-1', '2026-08-16T10:00:40.000Z'),
      ],
    ]
    expect(
      pickLatestRevertablePaymentId({
        paymentLists: lists,
        fixedExpenseId: 'fx-1',
        windowStartIso,
        windowEndIso,
        excludeIds: ['cuota-1-real'],
      }),
    ).toBe('cuota-2-real')
  })
})

describe('collectRevertablePaymentIds — snapshot de los reales en ventana al mostrar el toast', () => {
  const windowStartIso = '2026-08-10T00:00:00.000Z'
  const windowEndIso = '2026-09-10T00:00:00.000Z'
  const pay = (id: string, fixedExpenseId: string, paidAt: string) => ({
    id,
    fixedExpenseId,
    paidAt,
  })

  it('junta los ids reales del fijo dentro de la ventana; saltea optimistas, otros fijos y fuera de ventana', () => {
    const lists = [
      [
        pay('en-ventana', 'fx-1', '2026-08-12T10:00:00.000Z'),
        pay('optimistic-2026-08-15T10:00:00Z-fx-1', 'fx-1', '2026-08-15T10:00:00.000Z'),
        pay('otro-fijo', 'fx-2', '2026-08-15T10:00:00.000Z'),
        pay('ciclo-viejo', 'fx-1', '2026-07-15T10:00:00.000Z'),
      ],
      undefined,
    ]
    expect(
      collectRevertablePaymentIds({
        paymentLists: lists,
        fixedExpenseId: 'fx-1',
        windowStartIso,
        windowEndIso,
      }),
    ).toEqual(['en-ventana'])
  })
})
