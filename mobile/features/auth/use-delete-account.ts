import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileQueryKey } from '@/features/profile/use-profile'
import {
  clearLastUserPendingDeletion,
  setLastUserPendingDeletion,
} from '@/lib/last-user-cache'
import { supabase } from '@/lib/supabase'

/**
 * Solicita la baja de la cuenta del usuario actual. El RPC servidor:
 *   1. Verifica que el usuario no sea owner de una familia con otros
 *      miembros activos (si lo es, devuelve error pidiendo transfer
 *      de ownership primero).
 *   2. Setea `profiles.deletion_scheduled_at = now() + 30d`.
 *   3. Borra las push_subscriptions del usuario para que durante la
 *      gracia no le sigan llegando notificaciones.
 *
 * **Idempotente** (CR Sprint A finding #2): si ya hay una baja agendada,
 * la RPC devuelve el timestamp existente sin extenderlo. El cliente
 * tampoco retrae fallos de red (`retry: false`) — un fallo se reporta
 * al user, no queda pendiente en background.
 *
 * El procesado final (borrado del `auth.users` row → cascade a todo el
 * esquema public) corre en background (cron + edge function con
 * service-role) cuando la gracia vence.
 *
 * Después de éxito, el caller hace signOut para sacar al usuario de la
 * app inmediatamente. NOTA: la sesión Supabase puede re-emitir un JWT
 * si el user re-loguea durante el grace; el flag
 * `deletion_scheduled_at` queda en el profile pero NO bloquea
 * automáticamente el login. Si el user vuelve a loguearse, exponemos
 * el banner de cancel desde el welcome/login (Sprint J · J-Auth2:
 * `WelcomeCancelDeletionBanner` lee el cache last-user y ofrece un
 * CTA "Iniciar sesión para cancelar"; el flujo autenticado expone
 * `CancelDeletionBanner` en home/settings con la CTA directa).
 */
export function useRequestAccountDeletion(userId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('request_account_deletion')
      if (error) {
        throw error
      }
      return data as string // ISO timestamp scheduled_at
    },
    onSuccess: (scheduledAt) => {
      // Sprint J · J-Auth2 — keep the profile cache + last-user cache
      // in sync so the cancel-deletion banner appears immediately on
      // the welcome / login screens after the user signs back in (and
      // on home/settings, the same session if they don't sign out).
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
      }
      void setLastUserPendingDeletion(scheduledAt)
    },
  })
}

export function useCancelAccountDeletion(userId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cancel_account_deletion')
      if (error) {
        throw error
      }
    },
    onSuccess: () => {
      // Sprint J · J-Auth2 — invalidate the profile so the banner
      // disappears from home/settings, and clear the last-user cache
      // so the welcome-screen variant also hides next time the user
      // signs out.
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
      }
      void clearLastUserPendingDeletion()
    },
  })
}
