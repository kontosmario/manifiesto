import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AccountKind } from '@/features/family/account-kind'
import { normalizeAccountKind } from '@/features/family/account-kind'

export interface FamilyInfo {
  familyId: string
  kind: AccountKind
  /** ISO timestamp de creación de la familia — ancla del jardín
   *  familiar (el jardín arranca cuando nació el hogar). */
  createdAt: string | null
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
        .select('family_id, families(kind, created_at)')
        .eq('user_id', userId)
        .maybeSingle()

      if (membershipResponse.error) {
        throw membershipResponse.error
      }

      if (!membershipResponse.data) {
        return null
      }

      const familyRel = membershipResponse.data.families as
        | { kind: string; created_at: string | null }
        | { kind: string; created_at: string | null }[]
        | null
      const familyRow = Array.isArray(familyRel) ? familyRel[0] : familyRel

      return {
        familyId: membershipResponse.data.family_id as string,
        kind: normalizeAccountKind(familyRow?.kind),
        createdAt: familyRow?.created_at ?? null,
      }
    },
  })
}
