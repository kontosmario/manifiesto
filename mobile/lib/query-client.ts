import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

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

export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})
