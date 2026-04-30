import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'
import { supabase } from '@/lib/supabase'

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'alert'

export interface NotificationMetadata {
  route?: string
  expense_id?: string
  commitment_id?: string
  goal_id?: string
  streak?: number
  milestone?: number
  delta?: number
  amount?: number
  [key: string]: unknown
}

interface RawNotification {
  id: string
  family_id: string
  user_id: string | null
  title: string
  body: string
  kind: string
  severity: string | null
  created_by: string | null
  created_at: string
  read_at: string | null
  metadata: NotificationMetadata | null
}

export interface FamilyNotification {
  id: string
  family_id: string
  user_id: string | null
  title: string
  body: string
  kind: string
  severity: NotificationSeverity
  created_by: string | null
  created_at: string
  read_at: string | null
  metadata: NotificationMetadata
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

function normalizeSeverity(raw: string | null | undefined): NotificationSeverity {
  switch (raw) {
    case 'success':
    case 'warning':
    case 'alert':
      return raw
    default:
      return 'info'
  }
}

function normalizeRow(row: RawNotification): FamilyNotification {
  return {
    id: row.id,
    family_id: row.family_id,
    user_id: row.user_id,
    title: row.title ?? '',
    body: row.body ?? '',
    kind: row.kind ?? 'info',
    severity: normalizeSeverity(row.severity),
    created_by: row.created_by,
    created_at: row.created_at,
    read_at: row.read_at,
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as NotificationMetadata)
        : {},
  }
}

export const familyNotificationsQueryKey = notificationQueryKeys.list

const NOTIFICATION_COLUMNS =
  'id, family_id, user_id, title, body, kind, severity, created_by, created_at, read_at, metadata'

export function useFamilyNotifications(
  familyId?: string,
  userId?: string,
  limit = 60,
) {
  return useQuery<FamilyNotification[]>({
    queryKey: notificationQueryKeys.list(familyId, userId ?? null, limit),
    enabled: Boolean(familyId) && limit > 0,
    queryFn: async () => {
      if (!familyId || limit <= 0) {
        return []
      }

      let query = supabase
        .from('notifications')
        .select(NOTIFICATION_COLUMNS)
        .eq('family_id', familyId)

      if (userId) {
        // Include family-wide notifications (user_id IS NULL) OR those
        // addressed to the current user. PostgREST `or()` with is.null
        // requires quoting.
        query = query.or(`user_id.is.null,user_id.eq.${userId}`)
      } else {
        query = query.is('user_id', null)
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        if (isMissingNotificationsTableError(error)) {
          return []
        }

        throw error
      }

      return ((data as RawNotification[] | null) ?? []).map(normalizeRow)
    },
  })
}

function unreadNotificationsQueryFn(familyId: string | undefined, userId: string | undefined) {
  return async (): Promise<number> => {
    if (!familyId) return 0

    let query = supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', familyId)
      .is('read_at', null)

    if (userId) {
      query = query.or(`user_id.is.null,user_id.eq.${userId}`)
    } else {
      query = query.is('user_id', null)
    }

    const { count, error } = await query

    if (error) {
      if (isMissingNotificationsTableError(error)) {
        return 0
      }

      throw error
    }

    return count ?? 0
  }
}

export function useUnreadNotificationsCount(familyId?: string, userId?: string) {
  return useQuery<number>({
    queryKey: notificationQueryKeys.unreadCount(familyId, userId ?? null),
    enabled: Boolean(familyId),
    queryFn: unreadNotificationsQueryFn(familyId, userId),
  })
}

/**
 * Boolean projection of `useUnreadNotificationsCount`. Use this when
 * the consumer only needs to know "are there ANY unread?" — narrowing
 * the hook with `select` ensures the component re-renders only on
 * `0 ↔ N` transitions, not every time the count changes (`3 → 5`).
 */
export function useHasUnreadNotifications(familyId?: string, userId?: string) {
  return useQuery<number, Error, boolean>({
    queryKey: notificationQueryKeys.unreadCount(familyId, userId ?? null),
    enabled: Boolean(familyId),
    queryFn: unreadNotificationsQueryFn(familyId, userId),
    select: (count) => count > 0,
  })
}

export function useMarkNotificationRead(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; read: boolean }) => {
      const nextValue = input.read ? new Date().toISOString() : null
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: nextValue })
        .eq('id', input.id)

      if (error) throw error
    },
    onSuccess: () => {
      if (!familyId) return
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.family(familyId),
      })
    },
  })
}

export function useMarkAllNotificationsRead(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!familyId) return

      const nowIso = new Date().toISOString()
      let query = supabase
        .from('notifications')
        .update({ read_at: nowIso })
        .eq('family_id', familyId)
        .is('read_at', null)

      if (userId) {
        query = query.or(`user_id.is.null,user_id.eq.${userId}`)
      } else {
        query = query.is('user_id', null)
      }

      const { error } = await query
      if (error) throw error
    },
    onSuccess: () => {
      if (!familyId) return
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.family(familyId),
      })
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
          event: '*',
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
      // `unsubscribe` closes the realtime websocket side; `removeChannel`
      // frees the client-side object. Doing one without the other can
      // leave listeners attached in memory when the subscription is
      // torn down while still pending.
      void channel.unsubscribe()
      void supabase.removeChannel(channel)
    }
  }, [familyId, queryClient])
}
