// Super admin — capacidades SOLO para kontosmario@gmail.com.
//
// La seguridad REAL la hace el server: cada RPC (admin_search_users /
// admin_set_mvp) verifica is_super_admin() y tira 'forbidden' si no. El gate
// de ESTE archivo (useIsSuperAdmin) es solo de UI: decide si se MUESTRA la
// entrada/pantalla. Nunca confíes en él para autorización.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthSession } from '@/features/auth/use-auth-session'

export const SUPER_ADMIN_EMAIL = 'kontosmario@gmail.com'

/** Gate de UI: ¿el usuario actual es el super admin? */
export function useIsSuperAdmin(): boolean {
  const email = useAuthSession().data?.user.email
  return (email ?? '').toLowerCase() === SUPER_ADMIN_EMAIL
}

export interface AdminUserResult {
  userId: string
  email: string
  displayName: string | null
  familyId: string | null
  isMvp: boolean
  hasSub: boolean
}

export const adminSearchKey = (query: string) =>
  ['admin-search-users', query] as const

/** Busca usuarios por email (server gatea a super admin). Min 2 chars. */
export function useAdminSearchUsers(query: string) {
  const trimmed = query.trim()
  return useQuery<AdminUserResult[]>({
    queryKey: adminSearchKey(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_search_users', {
        p_query: trimmed,
      })
      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(
        (r): AdminUserResult => ({
          userId: String(r.user_id),
          email: String(r.email ?? ''),
          displayName: (r.display_name as string) ?? null,
          familyId: (r.family_id as string) ?? null,
          isMvp: Boolean(r.is_mvp),
          hasSub: Boolean(r.has_sub),
        }),
      )
    },
  })
}

/** Prende/apaga MVP de un usuario (server gatea a super admin). */
export function useAdminSetMvp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { targetUserId: string; enabled: boolean }) => {
      const { error } = await supabase.rpc('admin_set_mvp', {
        p_target_user_id: args.targetUserId,
        p_enabled: args.enabled,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-search-users'] })
    },
  })
}
