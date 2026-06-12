import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  normalizeEntitlementSnapshot,
  type EntitlementSnapshot,
} from '@/features/billing/entitlement-snapshot'

/**
 * Hook del snapshot de entitlement resuelto server-side. El cliente NUNCA
 * decide su propio acceso — `family_entitlement_snapshot` (RPC) corre la
 * cascada comped > familia con sub activa > trial monotónico > bloqueado
 * y este hook solo refleja el resultado. Fase 1: el trial sale del backfill
 * de profiles.created_at; la suscripción real entra en Fase 2 (expo-iap).
 *
 * La lógica pura (tipos + normalizador) vive en entitlement-snapshot.ts.
 */

export type {
  EntitlementSnapshot,
  EntitlementSource,
} from '@/features/billing/entitlement-snapshot'

export const entitlementQueryKey = (userId?: string) =>
  ['entitlement', userId] as const

export function useEntitlement(userId?: string) {
  return useQuery({
    queryKey: entitlementQueryKey(userId),
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async (): Promise<EntitlementSnapshot> => {
      const { data, error } = await supabase.rpc('family_entitlement_snapshot')
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return normalizeEntitlementSnapshot(
        (row as Record<string, unknown>) ?? null,
      )
    },
  })
}
