import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { PersistedClient } from '@tanstack/react-query-persist-client'

/**
 * Global React Query client for the app.
 *
 * `staleTime` policy
 * ------------------
 * Default is 30s — enough to coalesce duplicate queries on a fast
 * navigation burst without letting stale data stick around. Individual
 * queries override this only when the underlying data lives longer (e.g.
 * family members — rarely change — use 60s).
 *
 * `refetchOnWindowFocus: false`
 * -----------------------------
 * React Query's window-focus refetch is tuned for web tabs; on native
 * it fires every time the app comes back to the foreground and causes
 * a thundering herd of refetches against Supabase. We disable it
 * globally and rely on mutation-driven `invalidateQueries` + the
 * realtime subscription for freshness.
 *
 * Retries
 * -------
 * 1 retry for queries (transient network flaps), 0 for mutations —
 * duplicating a POST on retry is worse than surfacing the error.
 *
 * Global error sink
 * -----------------
 * `MutationCache.onError` catches any mutation that doesn't provide its
 * own `onError`, so a forgotten handler doesn't silently swallow a
 * failure. In dev we surface it to the console; in prod it's a no-op
 * until we wire a telemetry sink.
 */
const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    if (__DEV__) {
      console.warn(
        '[react-query] mutation failed',
        mutation.options.mutationKey ?? '(anonymous)',
        error,
      )
    }
  },
})

const queryCache = new QueryCache({
  onError: (error, query) => {
    if (__DEV__) {
      console.warn('[react-query] query failed', query.queryKey, error)
    }
  },
})

// `gcTime` is renamed from React Query v4's `cacheTime`. We bump it
// to 24h so persisted queries don't get garbage-collected before the
// persister has a chance to restore them on cold start. Stale data is
// still revalidated by `staleTime` policies — `gcTime` only controls
// when the cache entry is *removed*, not when it's considered fresh.
const PERSIST_GC_TIME_MS = 24 * 60 * 60 * 1000 // 24h

export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: PERSIST_GC_TIME_MS,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})

/**
 * AsyncStorage persister for React Query.
 *
 * Cold start UX:
 *   - On app launch, the persister reads the saved cache and hydrates
 *     `queryClient` synchronously enough that the first render shows
 *     last-session data instead of skeletons.
 *   - In the background, queries with stale data refetch. Users see
 *     a transition rather than a blank wait.
 *
 * `buster` is bumped any time the cache shape changes incompatibly
 * (e.g., adding a required column to `Expense` would orphan old
 * entries). Bumping invalidates all persisted entries forcing a
 * fresh fetch on next launch.
 */
// v3 (2026-05-10): security hardening — sensitive financial queries
// (home_snapshot, expenses, fixed-expenses, etc.) are no longer
// persisted to AsyncStorage. AsyncStorage is plaintext on disk
// (a plist on iOS, SharedPreferences on Android) so backups,
// rooted devices, and forensic acquisitions could read the entire
// family financial history. We now persist only lightweight
// non-financial UI state. Bumping the buster invalidates v2 caches.
export const QUERY_CACHE_BUSTER = 'manifiesto-cache-v3'
export const PERSIST_STORAGE_KEY = 'react-query-cache'

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  // Throttle writes so a flurry of mutations doesn't hammer disk
  // (default 1000ms is fine; we set explicitly for clarity).
  throttleTime: 1000,
  key: PERSIST_STORAGE_KEY,
})

/**
 * Query-key roots whose data must NEVER touch disk. Anything with
 * a financial / PII payload — household snapshots, expenses,
 * recurring commitments, savings goals, paginated gastos lists,
 * notifications (bodies contain user content), insights / advisor
 * outputs — is fetched fresh each cold start. The cost is a brief
 * skeleton on launch; the benefit is no plaintext financial data
 * at rest.
 */
const SENSITIVE_QUERY_ROOTS = new Set<string>([
  // Already excluded for unrelated reasons:
  'auth',
  'family',
  'profile',
  // Financial / dominant-PII:
  'home-snapshot',
  'home_snapshot',
  'family-finance',
  'family-members',
  'family-members-detail',
  'family-member-role',
  'expenses',
  'fixed-expenses',
  'fixed-expense-payments',
  'savings-goal',
  'savings-goals',
  'gastos',
  'control',
  'control-advisor',
  'advisor',
  'insights',
  'notifications',
  'notification',
  'monthly-summaries',
  'velocity-snapshots',
  'income-events',
  'subscriptions-zombie',
  'home-telemetry',
  'push-subscription',
])

export const queryPersistOptions = {
  maxAge: PERSIST_GC_TIME_MS,
  buster: QUERY_CACHE_BUSTER,
  // Don't persist mutations — they're transient by design and
  // restoring a half-finished mutation across launches risks duplicate
  // writes. Persist only query data.
  dehydrateOptions: {
    shouldDehydrateMutation: (): boolean => false,
    // Skip queries that error'd or were never resolved — replaying
    // an error state on cold start is worse than triggering a fresh
    // fetch.
    //
    // Also skip the auth session query AND the entry-gate queries
    // (`family`, `profile`):
    //
    // - Persisting `['auth', ...]` lets React Query serve a userId
    //   synchronously on cold start, but the Supabase client loads its
    //   JWT from AsyncStorage *async*. The gap caused `home_snapshot()`
    //   to fire before the JWT was attached → PostgREST received an
    //   unauthenticated request → SQL raised `P0001 No session`.
    //   Forcing the auth queryFn to run means `userId` only resolves
    //   AFTER `supabase.auth.getSession()` returns, by which point the
    //   JWT is attached to outgoing requests.
    //
    // - Persisting `['family', userId]` / `['profile', userId]` is
    //   dangerous because `AppEntryGate` (mounted at `/`) decides
    //   between `/home`, `/onboarding`, and `/(auth)/join` based on
    //   their values. If a previous session was RLS-denied (e.g. due
    //   to the JWT race above), the queries resolved as `success` with
    //   `data === null`. Rehydrating that null on next cold start
    //   ships the user straight to the join screen even though they
    //   actually belong to a family. They're cheap to refetch and gate
    //   routing, so we always go to the network.
    shouldDehydrateQuery: (query: {
      queryKey: readonly unknown[]
      state: { status: string }
    }) => {
      if (query.state.status !== 'success') return false
      const root = query.queryKey[0]
      if (typeof root === 'string' && SENSITIVE_QUERY_ROOTS.has(root)) {
        return false
      }
      return true
    },
  },
} as const

// Type re-export so consumers (e.g., advanced cache surgery) don't
// need to know which sub-package owns the type.
export type { PersistedClient }
