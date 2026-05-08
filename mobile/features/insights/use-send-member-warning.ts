// Sends an advisory notification to another family member through
// the `emit_user_notification` SECURITY DEFINER RPC. The RPC
// hard-codes `created_by = auth.uid()` (no spoofing), validates the
// kind whitelist, length-caps title/body, and rate-limits emission
// per user. Direct INSERT into `notifications` is denied at the RLS
// layer.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'
import { supabase } from '@/lib/supabase'

interface SendMemberWarningArgs {
  familyId: string
  targetUserId: string
  message: string
}

export function useSendMemberWarning() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, SendMemberWarningArgs>({
    mutationKey: ['control-advisor', 'send-member-warning'],
    mutationFn: async ({ targetUserId, message }) => {
      const { error } = await supabase.rpc('emit_user_notification', {
        p_target_user_id: targetUserId,
        p_kind: 'member_warning',
        p_title: '👥 Aviso del Asistente Financiero',
        p_body: message,
        p_metadata: { source: 'control-advisor' },
      })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.family(vars.familyId),
      })
    },
  })
}
