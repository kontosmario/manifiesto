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
      // `categories` es una VIEW: el template standard "Suscripciones" viene
      // con family_id NULL (global). Incluir nulls para que matchee.
      const { data, error } = await supabase
        .from('categories')
        .select('id')
        .or(`family_id.eq.${familyId},family_id.is.null`)
        .eq('name', 'Suscripciones')
        .eq('scope', 'fixed_expense')
        // limit(1): si una familia creara un custom "Suscripciones" la view
        // devolvería 2 filas y maybeSingle() tiraría. El template alcanza.
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data?.id ?? null
    },
  })
}
