import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export interface FamilyInfo {
  familyId: string
  familyCode: string
}

export const familyQueryKey = (userId?: string) => ['family', userId] as const

export function useFamily(userId?: string) {
  return useQuery<FamilyInfo | null>({
    queryKey: familyQueryKey(userId),
    enabled: Boolean(userId),
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

      const familyResponse = await supabase
        .from('families')
        .select('code')
        .eq('id', membershipResponse.data.family_id)
        .single()

      if (familyResponse.error) {
        throw familyResponse.error
      }

      return {
        familyId: membershipResponse.data.family_id,
        familyCode: familyResponse.data.code,
      }
    },
  })
}
