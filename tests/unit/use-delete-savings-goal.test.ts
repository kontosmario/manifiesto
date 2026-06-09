import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const deleteSavingsGoalMock = vi.fn()

vi.mock('@/features/savings-goals/savings-goal.repository', () => ({
  deleteSavingsGoal: (...args: unknown[]) => deleteSavingsGoalMock(...args),
}))

// El builder ahora delega en `syncAllAfterMutation`, que importa
// `controlSnapshotKey` desde `use-control-snapshot.ts` — ese file pulla
// `@/lib/supabase`, que importa `react-native` (AppState/Platform) y
// rompe vitest env=node. Mockamos supabase a un stub vacío para que la
// cadena de imports compile sin tocar RN. Mismo patrón que
// `use-apply-reserve.test.ts`.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import {
  buildDeleteSavingsGoalMutation,
} from '@/features/savings-goals/use-delete-savings-goal'

let qc: QueryClient

function makeObserver(familyId?: string) {
  return new MutationObserver<void, Error, string, unknown>(
    qc,
    buildDeleteSavingsGoalMutation(qc, familyId),
  )
}

beforeEach(() => {
  deleteSavingsGoalMock.mockReset()
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  qc.clear()
})

describe('useDeleteSavingsGoal', () => {
  it('invoca deleteSavingsGoal con el goalId', async () => {
    deleteSavingsGoalMock.mockResolvedValue(undefined)
    const observer = makeObserver('fam-1')
    await observer.mutate('goal-abc')
    expect(deleteSavingsGoalMock).toHaveBeenCalledWith('goal-abc')
  })

  it('onSuccess invalida savings-goal, savings-goal-latest, cycle-acumulado, home-snapshot', async () => {
    deleteSavingsGoalMock.mockResolvedValue(undefined)
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const observer = makeObserver('fam-1')
    await observer.mutate('goal-abc')

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    // savings-goal key shape = ['savings-goal', familyId ?? null]
    expect(keys).toContainEqual(['savings-goal', 'fam-1'])
    // latest goal key shape = ['savings-goal-latest', familyId ?? null]
    expect(keys).toContainEqual(['savings-goal-latest', 'fam-1'])
    expect(keys).toContainEqual(['cycle-acumulado', 'fam-1'])
    expect(keys).toContainEqual(['home-snapshot'])
  })

  it('propaga errores del repository (RLS, network)', async () => {
    deleteSavingsGoalMock.mockRejectedValue(new Error('RLS denied'))
    const observer = makeObserver('fam-1')
    await expect(observer.mutate('goal-abc')).rejects.toThrow(/RLS denied/)
  })
})
