import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'
import { supabase } from '@/lib/supabase'

interface RawNotification {
  id: string
  family_id: string
  title: string
  body: string
  kind: string
  created_by: string | null
  created_at: string
}

export interface FamilyNotification {
  id: string
  family_id: string
  title: string
  body: string
  kind: string
  created_by: string | null
  created_at: string
}

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

function isMissingNotificationsTableError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()

  return (
    MISSING_TABLE_CODES.has(code) ||
    text.includes('does not exist') ||
    text.includes('schema cache')
  )
}

export const familyNotificationsQueryKey = notificationQueryKeys.list

export function useFamilyNotifications(familyId?: string, limit = 30) {
  return useQuery<FamilyNotification[]>({
    queryKey: notificationQueryKeys.list(familyId, limit),
    enabled: Boolean(familyId) && limit > 0,
    queryFn: async () => {
      if (!familyId || limit <= 0) {
        return []
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('id, family_id, title, body, kind, created_by, created_at')
        .eq('family_id', familyId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        if (isMissingNotificationsTableError(error)) {
          return []
        }

        throw error
      }

      return ((data as RawNotification[] | null) ?? []).map((row) => ({
        ...row,
        title: row.title ?? '',
        body: row.body ?? '',
        kind: row.kind ?? 'info',
      }))
    },
  })
}

export function useFamilyNotificationsRealtime(familyId?: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!familyId) {
      return
    }

    const channel = supabase
      .channel(`family-notifications:${familyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `family_id=eq.${familyId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: notificationQueryKeys.family(familyId),
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [familyId, queryClient])
}
