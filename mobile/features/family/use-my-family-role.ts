import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type FamilyRole = 'owner' | 'member' | 'blocked'

export const myFamilyRoleQueryKey = (userId?: string, familyId?: string) =>
  ['family-member-role', familyId, userId] as const

/**
 * Returns the caller's role on their current family membership.
 * - 'owner'   → can edit shared Hogar settings (finance, savings goal, members)
 * - 'member'  → read-only on shared resources
 * - 'blocked' → listed for completeness; cannot write
 * - null      → membership not found / unauthenticated
 */
export function useMyFamilyRole(userId?: string, familyId?: string) {
  return useQuery<FamilyRole | null>({
    queryKey: myFamilyRoleQueryKey(userId, familyId),
    enabled: Boolean(userId && familyId),
    queryFn: async () => {
      if (!userId || !familyId) {
        return null
      }

      const { data, error } = await supabase
        .from('family_members')
        .select('role')
        .eq('user_id', userId)
        .eq('family_id', familyId)
        .maybeSingle()

      if (error) {
        throw error
      }

      const raw = (data as { role?: unknown } | null)?.role
      if (raw === 'owner' || raw === 'member' || raw === 'blocked') {
        return raw
      }

      return null
    },
    staleTime: 60_000,
  })
}
