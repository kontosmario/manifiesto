import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'
import { clearLastUserProfile } from '@/lib/last-user-cache'
import { PERSIST_STORAGE_KEY, queryPersister } from '@/lib/query-client'

export const authQueryKeys = {
  session: ['auth', 'session'] as const,
}

export function useAuthSession() {
  const queryClient = useQueryClient()

  useEffect(() => {
    // Sprint H · H6: en cada arranque drenamos la cola de cleanups de
    // push-token que pudieron haber quedado pendientes en un logout
    // offline. Best-effort; si sigue offline, vuelve a quedar pending.
    void (async () => {
      try {
        const { flushPendingPushTokenCleanup } = await import('@/lib/push-notifications')
        await flushPendingPushTokenCleanup()
      } catch {
        // best-effort
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      queryClient.setQueryData(authQueryKeys.session, session)
      // H6: cada vez que cambia el auth state también drenamos. Cubre
      // el escenario en el que el logout-offline encoló un cleanup y
      // ahora el user (mismo o nuevo) loguea con red activa.
      void (async () => {
        try {
          const { flushPendingPushTokenCleanup } = await import('@/lib/push-notifications')
          await flushPendingPushTokenCleanup()
        } catch {
          // best-effort
        }
      })()
      // Purge every cached query ONLY when the session itself flips —
      // i.e. the user signed out. `USER_UPDATED` also fires on benign
      // metadata edits (display_name, password, etc.) for the SAME
      // user; purging there remounted the whole app shell mid-flow
      // (e.g. bounced the onboarding back to step 1 after saving the
      // name). Different-user scenarios are covered by `SIGNED_IN`
      // → route redirect, not by cache eviction here.
      if (event === 'SIGNED_OUT') {
        // Sprint H · H4 — explicit null write for the session query.
        //
        // Antes el predicate `q.queryKey[0] !== 'auth'` excluía las
        // claves del auth query del purge. La intención era buena (no
        // dropear la query que mantiene el listener) pero combinado con
        // `gcTime: Infinity` (más abajo) significaba que un signOut que
        // NO propaga via onAuthStateChange (raro, pero posible si algún
        // path llama directo a clearLocal()) dejaba la sesión vieja
        // viva en memoria. Aquí la flushiamos a null explícitamente
        // — siempre seguro porque el evento que disparó este handler
        // ES SIGNED_OUT, no hay sesión válida.
        queryClient.setQueryData(authQueryKeys.session, null)
        queryClient.removeQueries({
          // Mantenemos la auth query (no la removemos) porque su
          // identidad queryKey es el contrato del listener — drop
          // sería un mount/refetch innecesario y crearía un flash
          // de "loading". Toda otra query del usuario anterior se
          // borra para evitar leak entre sesiones.
          predicate: (q) => q.queryKey[0] !== 'auth',
        })
        // Drop the persisted React Query cache from disk too. The
        // throttled persister would only get around to rewriting a
        // smaller cache ~1s later, leaving a window where the
        // previous user's financial data is still on disk; if the
        // app is killed before the throttle fires the data persists
        // indefinitely. We forcibly clear both the persister state
        // AND the raw AsyncStorage row so a new user signing in on
        // the same device cannot see leftover data.
        void (async () => {
          try {
            await queryPersister.removeClient()
          } catch {
            // best-effort
          }
          try {
            await AsyncStorage.removeItem(PERSIST_STORAGE_KEY)
          } catch {
            // best-effort
          }
        })()
        // Drop the personalized login cache too — once the user signs
        // out we want the next login screen to reset, not greet the
        // previous account by name. The biometric metadata is wiped
        // separately via `clearBiometricCredentials` where applicable.
        void clearLastUserProfile()
        // Sprint L · Audit #5 L-2 (2026-06-10): defense-in-depth clear
        // of the notification-bridge pendingRoute. `logoutSession`
        // already calls this synchronously before resetAppLock(), but
        // any code path that calls `supabase.auth.signOut()` directly
        // (e.g. a 401 response forcing a sign-out, or test harnesses)
        // would otherwise leave the queued route alive for the next
        // sign-in to drain. Dynamic import to avoid pulling the bridge
        // module into the auth bundle at startup.
        void (async () => {
          try {
            const { clearPendingNotificationRoute } = await import(
              '@/lib/notification-pending-route'
            )
            clearPendingNotificationRoute()
          } catch {
            // best-effort
          }
        })()
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
