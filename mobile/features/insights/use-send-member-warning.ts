// Sends an advisory notification to another family member.
// Used by the `member-imbalance` rule: the "Avisar" CTA calls this
// mutation, which inserts a `notifications` row addressed to the
// target user. The row is picked up by the app's realtime stream
// and the `send-family-push` Edge Function forwards a push if the
// user has a registered device.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'
import { supabase } from '@/lib/supabase'

interface SendMemberWarningArgs {
  familyId: string
  targetUserId: string
  message: string
  createdBy: string
}

export function useSendMemberWarning() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, SendMemberWarningArgs>({
    mutationKey: ['control-advisor', 'send-member-warning'],
    mutationFn: async ({ familyId, targetUserId, message, createdBy }) => {
      const { error } = await supabase.from('notifications').insert({
        family_id: familyId,
        user_id: targetUserId,
        title: '👥 Aviso del Asistente Financiero',
        body: message,
        kind: 'member_warning',
        severity: 'info',
        created_by: createdBy,
        metadata: { source: 'control-advisor' },
      })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      // Refresh notifications so the sender sees it in their feed too
      // (warnings are family-scoped).
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.family(vars.familyId),
      })
    },
  })
}
