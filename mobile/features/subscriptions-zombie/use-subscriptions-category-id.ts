import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscriptionsZombieQueryKeys } from './query-keys'

export function useSubscriptionsCategoryId(familyId?: string) {
  return useQuery({
    queryKey: subscriptionsZombieQueryKeys.category(familyId),
    enabled: Boolean(familyId),
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async (): Promise<string | null> => {
      if (!familyId) return null
      const { data, error } = await supabase
        .from('categories')
        .select('id')
        .eq('family_id', familyId)
        .eq('name', 'Suscripciones')
        .eq('scope', 'fixed_expense')
        .maybeSingle()
      if (error) throw error
      return data?.id ?? null
    },
  })
}
