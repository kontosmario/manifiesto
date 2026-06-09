// mobile/features/flags/use-feature-flags.ts
//
// Sprint C · C9 — Feature flags hook
//
// Lee los flags del user via RPC `get_user_flags()` (rollout determinístico
// resuelto server-side). Cachea con staleTime 5min — los flags cambian
// con muy baja frecuencia.
//
// Patrón de uso:
//
//   const flag = useFeatureFlag('wrapped_v2')
//   if (flag.enabled) renderWrappedV2()
//
// Si el RPC falla o el flag no está en la tabla, se devuelve el
// `default` declarado en `feature-flag-keys.ts`. Esto preserva el
// principio "fail closed": si algo está roto, el flag mostrará la
// versión vieja, no la experimental.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type FeatureFlagKey } from '@/features/flags/feature-flag-keys'
import {
  resolveFlag,
  type FeatureFlagsMap,
  type ResolvedFeatureFlag,
} from '@/features/flags/resolve-flag'

const STALE_TIME = 5 * 60_000
const GC_TIME = 30 * 60_000

interface FeatureFlagRow {
  key: string
  enabled: boolean
  payload: Record<string, unknown> | null
}

export type { ResolvedFeatureFlag, FeatureFlagsMap }

export const featureFlagsQueryKey = (userId: string | null | undefined) =>
  ['feature-flags', userId ?? null] as const

async function fetchFeatureFlags(): Promise<FeatureFlagsMap> {
  const { data, error } = await supabase.rpc('get_user_flags')
  if (error) throw error
  const rows = (data ?? []) as FeatureFlagRow[]
  const map: FeatureFlagsMap = {}
  for (const row of rows) {
    map[row.key] = {
      enabled: Boolean(row.enabled),
      payload:
        row.payload && typeof row.payload === 'object'
          ? (row.payload as Record<string, unknown>)
          : {},
    }
  }
  return map
}

export function useFeatureFlags(userId: string | null | undefined) {
  return useQuery<FeatureFlagsMap>({
    queryKey: featureFlagsQueryKey(userId),
    enabled: Boolean(userId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      try {
        return await fetchFeatureFlags()
      } catch {
        // Fail closed: en caso de error, devolvemos un map vacío
        // y los consumers caen en su `default`. No crasheamos la app
        // por un knob remoto que no resolvió.
        return {}
      }
    },
  })
}

/**
 * Resolves a single feature flag by key. Returns the default declared
 * in `FEATURE_FLAGS` while the query is pending or if the row is
 * missing from the server-side response.
 *
 * Pass `userId = null/undefined` antes de tener sesión — devuelve el
 * default sin hacer fetch.
 */
export function useFeatureFlag(
  key: FeatureFlagKey,
  userId: string | null | undefined,
): ResolvedFeatureFlag {
  const query = useFeatureFlags(userId)
  return resolveFlag(key, query.data)
}

// Re-exports para conveniencia de imports — un solo barrel.
export { resolveFlag } from '@/features/flags/resolve-flag'
export { FEATURE_FLAGS, type FeatureFlagKey } from '@/features/flags/feature-flag-keys'
// Silenciar import unused para `getFeatureFlagDefault` — lo dejamos por
// si llega un consumer que quiere resolver default sin pasar por el map.
export { getFeatureFlagDefault } from '@/features/flags/feature-flag-keys'
