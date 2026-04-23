import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

export const authQueryKeys = {
  session: ['auth', 'session'] as const,
}

export function useAuthSession() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      queryClient.setQueryData(authQueryKeys.session, session)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [queryClient])

  return useQuery<Session | null>({
    queryKey: authQueryKeys.session,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        throw error
      }
      return data.session
    },
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
