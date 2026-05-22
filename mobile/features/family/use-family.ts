import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AccountKind } from '@/features/family/account-kind'
import { normalizeAccountKind } from '@/features/family/account-kind'

export interface FamilyInfo {
  familyId: string
  kind: AccountKind
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
    // Family membership rarely cambia mid-session (solo cambia en
    // bootstrap, join o leave). 5 min evita refetches en tab-switches.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!userId) {
        return null
      }

      const membershipResponse = await supabase
        .from('family_members')
        .select('family_id, families(kind)')
        .eq('user_id', userId)
        .maybeSingle()

      if (membershipResponse.error) {
        throw membershipResponse.error
      }

      if (!membershipResponse.data) {
        return null
      }

      const familyRel = membershipResponse.data.families as { kind: string } | { kind: string }[] | null
      const kindRaw = Array.isArray(familyRel) ? familyRel[0]?.kind : familyRel?.kind

      return {
        familyId: membershipResponse.data.family_id as string,
        kind: normalizeAccountKind(kindRaw),
      }
    },
  })
}
