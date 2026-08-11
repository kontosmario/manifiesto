import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `syncAllAfterMutation` pulla `@/lib/supabase` por la cadena de query
// keys (arrastra react-native: AppState/Platform) — incompatible con
// vitest env=node. Stub vacío, mismo patrón que
// `sync-after-mutation-guard.test.ts`.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { finishCreatorOnboarding } from '@/features/onboarding/finish-creator-onboarding'
import { familyFinanceQueryKey } from '@/features/finance/use-family-finance'
import { homeSnapshotQueryKey } from '@/features/home/home-snapshot-query-keys'

const FAMILY_ID = 'fam-1'
const USER_ID = 'user-1'
const INCOME = 480_000

let qc: QueryClient

/**
 * Backend de mentira con la misma semántica que la DB real:
 * `monthly_income` es DERIVADA de la contribución del miembro, así que
 * SOLO la mueve `saveOwnerIncome`; el upsert de family_finance la lee de
 * vuelta y no la escribe.
 */
function makeBackend() {
  const state = { contribution: 0 }
  return {
    state,
    writeContribution(amount: number) {
      state.contribution = amount
    },
    readFinance() {
      return { family_id: FAMILY_ID, monthly_income: state.contribution }
    },
    readHomeSnapshot() {
      return { monthly_income: state.contribution }
    },
  }
}

/** Deja la query ACTIVA (con observer) y con data inicial, que es lo que
 *  hace que `invalidateQueries` la re-fetchee y se pueda esperar. */
async function activate<T>(
  queryKey: readonly unknown[],
  queryFn: () => T,
): Promise<() => void> {
  const observer = new QueryObserver<T, Error, T, T, readonly unknown[]>(qc, {
    queryKey,
    queryFn: async () => queryFn(),
    retry: false,
    staleTime: 60_000,
  })
  const unsubscribe = observer.subscribe(() => {})
  await observer.refetch()
  return unsubscribe
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  qc.clear()
})

describe('finishCreatorOnboarding — orden de las escrituras', () => {
  it('escribe el ingreso del dueño ANTES del upsert de family_finance', async () => {
    const calls: string[] = []
    await finishCreatorOnboarding({
      queryClient: qc,
      familyId: FAMILY_ID,
      userId: USER_ID,
      saveOwnerIncome: async () => calls.push('ownerIncome'),
      saveFinance: async () => calls.push('finance'),
      completeOnboarding: async () => calls.push('complete'),
    })

    expect(calls.indexOf('ownerIncome')).toBeLessThan(calls.indexOf('finance'))
  })

  it('invalida home_snapshot y family-finance DESPUÉS de la última escritura', async () => {
    const calls: string[] = []
    const invalidateSpy = vi
      .spyOn(qc, 'invalidateQueries')
      .mockImplementation(async (filters?: { queryKey?: readonly unknown[] }) => {
        calls.push(`invalidate:${JSON.stringify(filters?.queryKey)}`)
      })

    await finishCreatorOnboarding({
      queryClient: qc,
      familyId: FAMILY_ID,
      userId: USER_ID,
      saveOwnerIncome: async () => calls.push('ownerIncome'),
      saveFinance: async () => calls.push('finance'),
      saveFirstGoal: async () => calls.push('goal'),
      completeOnboarding: async () => calls.push('complete'),
    })

    const homeInvalidate = calls.indexOf(
      `invalidate:${JSON.stringify(homeSnapshotQueryKey(USER_ID))}`,
    )
    const financeInvalidate = calls.indexOf(
      `invalidate:${JSON.stringify(familyFinanceQueryKey(FAMILY_ID))}`,
    )

    expect(homeInvalidate).toBeGreaterThan(calls.indexOf('ownerIncome'))
    expect(homeInvalidate).toBeGreaterThan(calls.indexOf('finance'))
    expect(homeInvalidate).toBeGreaterThan(calls.indexOf('goal'))
    expect(financeInvalidate).toBeGreaterThan(calls.indexOf('ownerIncome'))
    // El gate de la ruta lo flipea `completeOnboarding`: la Home monta
    // recién después, o sea que la sync tiene que haber terminado antes.
    expect(homeInvalidate).toBeLessThan(calls.indexOf('complete'))
    expect(financeInvalidate).toBeLessThan(calls.indexOf('complete'))

    invalidateSpy.mockRestore()
  })

  it('sin meta no toca el goal ni el scope savings', async () => {
    const calls: string[] = []
    const invalidateSpy = vi
      .spyOn(qc, 'invalidateQueries')
      .mockImplementation(async (filters?: { queryKey?: readonly unknown[] }) => {
        calls.push(`invalidate:${JSON.stringify(filters?.queryKey)}`)
      })
    const saveFirstGoal = vi.fn()

    await finishCreatorOnboarding({
      queryClient: qc,
      familyId: FAMILY_ID,
      userId: USER_ID,
      saveOwnerIncome: async () => calls.push('ownerIncome'),
      saveFinance: async () => calls.push('finance'),
      saveFirstGoal: null,
      completeOnboarding: async () => calls.push('complete'),
    })

    expect(saveFirstGoal).not.toHaveBeenCalled()
    expect(calls).not.toContain(
      `invalidate:${JSON.stringify(['savings-goal', FAMILY_ID])}`,
    )
    expect(calls).toContain(
      `invalidate:${JSON.stringify(homeSnapshotQueryKey(USER_ID))}`,
    )

    invalidateSpy.mockRestore()
  })
})

describe('finishCreatorOnboarding — cache al montar la Home', () => {
  it('deja family-finance y home_snapshot con el ingreso real, no con 0', async () => {
    const backend = makeBackend()
    const stopFinance = await activate(familyFinanceQueryKey(FAMILY_ID), () =>
      backend.readFinance(),
    )
    const stopHome = await activate(homeSnapshotQueryKey(USER_ID), () =>
      backend.readHomeSnapshot(),
    )

    let financeAtComplete: unknown = null
    let homeAtComplete: unknown = null

    await finishCreatorOnboarding({
      queryClient: qc,
      familyId: FAMILY_ID,
      userId: USER_ID,
      saveOwnerIncome: async () => backend.writeContribution(INCOME),
      // El upsert real NO escribe monthly_income (columna derivada):
      // devuelve la fila de DB y la siembra en cache vía setQueryData.
      saveFinance: async () => {
        qc.setQueryData(familyFinanceQueryKey(FAMILY_ID), backend.readFinance())
      },
      completeOnboarding: async () => {
        financeAtComplete = qc.getQueryData(familyFinanceQueryKey(FAMILY_ID))
        homeAtComplete = qc.getQueryData(homeSnapshotQueryKey(USER_ID))
      },
    })

    expect(financeAtComplete).toMatchObject({ monthly_income: INCOME })
    expect(homeAtComplete).toMatchObject({ monthly_income: INCOME })

    stopFinance()
    stopHome()
  })
})
