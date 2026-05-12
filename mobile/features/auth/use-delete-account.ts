import { useMutation } from '@tanstack/react-query'
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
 * El procesado final (borrado del `auth.users` row → cascade a todo el
 * esquema public) corre en background (cron + edge function con
 * service-role) cuando la gracia vence.
 *
 * Después de éxito, el caller hace signOut para sacar al usuario de la
 * app inmediatamente — el flag deletion_scheduled_at se mantiene en el
 * profile y bloquea futuros logins porque la cuenta queda "en proceso
 * de eliminación".
 */
export function useRequestAccountDeletion() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('request_account_deletion')
      if (error) {
        throw error
      }
      return data as string // ISO timestamp scheduled_at
    },
  })
}

export function useCancelAccountDeletion() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cancel_account_deletion')
      if (error) {
        throw error
      }
    },
  })
}
