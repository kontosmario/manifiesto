import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { clearLastUserProfile } from '@/lib/last-user-cache'

export const authQueryKeys = {
  session: ['auth', 'session'] as const,
}

export function useAuthSession() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      queryClient.setQueryData(authQueryKeys.session, session)
      // Purge every cached query ONLY when the session itself flips —
      // i.e. the user signed out. `USER_UPDATED` also fires on benign
      // metadata edits (display_name, password, etc.) for the SAME
      // user; purging there remounted the whole app shell mid-flow
      // (e.g. bounced the onboarding back to step 1 after saving the
      // name). Different-user scenarios are covered by `SIGNED_IN`
      // → route redirect, not by cache eviction here.
      if (event === 'SIGNED_OUT') {
        queryClient.removeQueries({
          predicate: (q) => q.queryKey[0] !== 'auth',
        })
        // Drop the personalized login cache too — once the user signs
        // out we want the next login screen to reset, not greet the
        // previous account by name. The biometric metadata is wiped
        // separately via `clearBiometricCredentials` where applicable.
        void clearLastUserProfile()
      }
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
