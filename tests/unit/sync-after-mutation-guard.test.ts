import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// `syncAllAfterMutation` importa `controlSnapshotKey` desde
// `use-control-snapshot.ts`, que pulla `@/lib/supabase` y arrastra
// react-native (AppState/Platform) — incompatible con vitest env=node.
// Mockamos supabase con un stub vacío, mismo patrón que
// `use-delete-savings-goal.test.ts`.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { syncAllAfterMutation, type SyncScope } from '@/lib/sync-after-mutation'
import { homeSnapshotQueryKey } from '@/features/home/home-snapshot-query-keys'

/**
 * Lista canónica de scopes — debe matchear `SyncScope` en
 * `mobile/lib/sync-after-mutation.ts`. Si agregás un scope nuevo,
 * sumalo acá; el test fallará loud si el nuevo scope NO incluye
 * `homeSnapshotQueryKey(userId)` en su set de keys (invariante del
 * snapshot pattern — todo cambio dispara refetch del home root).
 */
const ALL_SCOPES = [
  'expenses',
  'fixed',
  'fixedPayment',
  'income',
  'savings',
  'notifications',
  'wrapped',
  'categories',
  'profile',
] as const satisfies readonly SyncScope[]

const FAMILY_ID = 'test-family-id'
const USER_ID = 'test-user-id'
const EXPECTED_HOME_KEY = JSON.stringify(homeSnapshotQueryKey(USER_ID))

let qc: QueryClient

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  qc.clear()
})

describe('syncAllAfterMutation — invariantes de scope', () => {
  it.each(ALL_SCOPES)(
    'scope "%s" incluye homeSnapshotQueryKey(userId) cuando userId está provided',
    async (scope) => {
      const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
      await syncAllAfterMutation(qc, {
        familyId: FAMILY_ID,
        userId: USER_ID,
        scopes: [scope],
      })

      const calledKeys = invalidateSpy.mock.calls
        .map((c) => c[0]?.queryKey)
        .filter((k): k is readonly unknown[] => Array.isArray(k))
        .map((k) => JSON.stringify(k))

      if (!calledKeys.includes(EXPECTED_HOME_KEY)) {
        // Fail loud con nombre del scope que rompió el invariante,
        // para que el dev sepa exactamente cuál bloque del helper
        // necesita el push de homeSnapshotQueryKey.
        throw new Error(
          `scope "${scope}" NO invalida homeSnapshotQueryKey(userId). ` +
            `Agregá el push en sync-after-mutation.ts. ` +
            `Keys invalidadas: ${JSON.stringify(calledKeys)}`,
        )
      }
      expect(calledKeys).toContain(EXPECTED_HOME_KEY)
    },
  )

  it('no hace ninguna invalidación cuando scopes está vacío', async () => {
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    await syncAllAfterMutation(qc, {
      familyId: FAMILY_ID,
      userId: USER_ID,
      scopes: [],
    })
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('no incluye homeSnapshotQueryKey cuando userId no está provided', async () => {
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    await syncAllAfterMutation(qc, {
      familyId: FAMILY_ID,
      scopes: ['expenses'],
    })
    const calledKeys = invalidateSpy.mock.calls
      .map((c) => c[0]?.queryKey)
      .filter((k): k is readonly unknown[] => Array.isArray(k))
      .map((k) => JSON.stringify(k))
    // home-snapshot necesita userId, sin él no debería aparecer.
    expect(calledKeys).not.toContain(JSON.stringify(['home-snapshot', USER_ID]))
  })

  it('dedup: scopes repetidos no generan invalidaciones duplicadas', async () => {
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    await syncAllAfterMutation(qc, {
      familyId: FAMILY_ID,
      userId: USER_ID,
      scopes: ['expenses', 'expenses', 'expenses'],
    })
    const calls = invalidateSpy.mock.calls.map((c) =>
      JSON.stringify(c[0]?.queryKey),
    )
    const unique = new Set(calls)
    expect(calls.length).toBe(unique.size)
  })
})
