import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { profileQueryKey, useMyProfile, type Profile } from '@/features/profile/use-profile'
import { useLanguage } from '@/features/preferences/language-provider'
import type { AppLanguage } from '@/lib/i18n/locale'

/**
 * Persiste el idioma resuelto del usuario en `profiles.preferred_language`
 * cuando difiere del valor guardado. Mismo patrón best-effort que
 * `useTimezoneSync`: el servidor lo necesita para localizar las push
 * notifications (se generan por cron con el usuario fuera de la app).
 *
 * Montar en AppStackShell para que corra en cada sesión autenticada.
 */
export function useLanguageSync() {
  const session = useAuthSession()
  const queryClient = useQueryClient()
  const userId = session.data?.user.id
  const profileQuery = useMyProfile(userId)
  const { language } = useLanguage()

  const lastSyncedRef = useRef<AppLanguage | null>(null)

  useEffect(() => {
    if (!userId) {
      lastSyncedRef.current = null
      return
    }
    const serverLang = (profileQuery.data?.preferred_language ?? null) as AppLanguage | null
    if (serverLang === language) {
      lastSyncedRef.current = language
      return
    }
    if (lastSyncedRef.current === language) return
    lastSyncedRef.current = language

    void (async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_language: language })
        .eq('id', userId)
      if (error) {
        lastSyncedRef.current = null
        return
      }
      queryClient.setQueryData<Profile | null>(profileQueryKey(userId), (prev) =>
        prev ? { ...prev, preferred_language: language } : prev,
      )
    })()
  }, [userId, profileQuery.data?.preferred_language, language, queryClient])
}
