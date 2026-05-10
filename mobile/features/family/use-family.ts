import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface FamilyInfo {
  familyId: string
}

export const familyQueryKey = (userId?: string) => ['family', userId] as const

/**
 * Fetches the family the user belongs to. Returns just `familyId`
 * — there's no persistent shareable family code anymore. To invite
 * someone, generate a single-use invite via `useCreateFamilyInvite`.
 */
export function useFamily(userId?: string) {
  return useQuery<FamilyInfo | null>({
    queryKey: familyQueryKey(userId),
    enabled: Boolean(userId),
    // Match home_snapshot's staleTime so post-seed reads are served
    // from cache (the snapshot's seed populates this same key).
    staleTime: 60_000,
    queryFn: async () => {
      if (!userId) {
        return null
      }

      const membershipResponse = await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (membershipResponse.error) {
        throw membershipResponse.error
      }

      if (!membershipResponse.data) {
        return null
      }

      return {
        familyId: membershipResponse.data.family_id as string,
      }
    },
  })
}
