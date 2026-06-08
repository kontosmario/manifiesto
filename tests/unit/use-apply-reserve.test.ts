import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}))

import {
  buildApplyReserveMutation,
  type ApplyReserveInput,
} from '@/features/month-close/use-apply-reserve'

let qc: QueryClient

function makeObserver(familyId?: string) {
  return new MutationObserver<void, Error, ApplyReserveInput, unknown>(
    qc,
    buildApplyReserveMutation(qc, familyId),
  )
}

beforeEach(() => {
  rpcMock.mockReset()
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  qc.clear()
})

describe('useApplyReserveDecision', () => {
  it('target=cycle: invoca apply_reserve_decision con p_meta_goal_id=null', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const observer = makeObserver('fam-1')
    await observer.mutate({ amount: 100_000, target: 'cycle' })
    expect(rpcMock).toHaveBeenCalledWith('apply_reserve_decision', {
      p_amount: 100_000,
      p_target: 'cycle',
      p_meta_goal_id: null,
    })
  })

  it('target=meta sin metaGoalId: preserva el null en p_meta_goal_id', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const observer = makeObserver('fam-1')
    await observer.mutate({ amount: 50_000, target: 'meta' })
    expect(rpcMock).toHaveBeenCalledWith('apply_reserve_decision', {
      p_amount: 50_000,
      p_target: 'meta',
      p_meta_goal_id: null,
    })
  })

  it('target=meta con metaGoalId: pasa el id al RPC', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const observer = makeObserver('fam-1')
    await observer.mutate({
      amount: 200_000,
      target: 'meta',
      metaGoalId: 'goal-123',
    })
    expect(rpcMock).toHaveBeenCalledWith('apply_reserve_decision', {
      p_amount: 200_000,
      p_target: 'meta',
      p_meta_goal_id: 'goal-123',
    })
  })

  it('propaga error cuando el RPC devuelve error', async () => {
    rpcMock.mockResolvedValue({ error: new Error('amount exceeds reserve') })
    const observer = makeObserver('fam-1')
    await expect(
      observer.mutate({ amount: 10_000_000, target: 'cycle' }),
    ).rejects.toThrow(/amount exceeds reserve/)
  })

  it('onSuccess invalida family-finance, savings-goal, cycle-acumulado, home-snapshot', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const observer = makeObserver('fam-1')
    await observer.mutate({ amount: 100_000, target: 'cycle' })

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toContainEqual(['family-finance', 'fam-1'])
    expect(keys).toContainEqual(['savings-goal', 'fam-1'])
    expect(keys).toContainEqual(['cycle-acumulado', 'fam-1'])
    expect(keys).toContainEqual(['home-snapshot'])
  })
})
