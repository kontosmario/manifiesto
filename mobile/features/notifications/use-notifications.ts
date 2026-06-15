import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'
import { supabase } from '@/lib/supabase'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
import { toast } from '@/lib/toast-bus'

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

interface PreviousListSnapshot {
  key: readonly unknown[]
  data: FamilyNotification[]
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
    // Notifications cambian via realtime + mark-read mutation; ambos
    // invalidan este key. 5 min staleTime evita refetches en
    // tab-switches dentro del mismo uso. home_snapshot seeds con
    // limit=80; si el caller usa otro limit hay miss inevitable.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!familyId || limit <= 0) {
        return []
      }

      let query = supabase
        .from('notifications')
        .select(NOTIFICATION_COLUMNS)
        .eq('family_id', familyId)
        // Asistente Financiero signals are NOT shown in this feed.
        // They live exclusively on the asistente surface, with their
        // own per-user dismiss table (`advisor_signal_dismissals`).
        // Filter is defensive — also covers rows inserted by older
        // builds before the sync hook stopped piping them in.
        .not('kind', 'like', 'advisor_%')

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
      // Same filter as the list query — advisor signals don't count
      // toward the unread badge in the regular feed.
      .not('kind', 'like', 'advisor_%')

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
    // Unread count cambia via realtime + mark-read mutation; ambos
    // invalidan este key. 5 min staleTime evita refetches en
    // tab-switches dentro del mismo uso.
    staleTime: 5 * 60_000,
    queryFn: unreadNotificationsQueryFn(familyId, userId),
  })
}

/**
 * Mark-on-open: al abrir el feed marcamos como leídas (read_at = now) todas las
 * no-leídas de la familia (family-wide o propias) → el badge del bell se va a 0,
 * patrón estándar de "abriste tus notificaciones". NO borra: las filas siguen
 * visibles esa sesión para accionarlas; el cron diario las poda a las 48h. El
 * dismiss explícito (✓/swipe) sigue haciendo hard delete.
 * Optimista: bajamos el unread count a 0 al instante, rollback en onError.
 */
export function useMarkNotificationsSeen(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!familyId) return
      let query = supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('family_id', familyId)
        .is('read_at', null)
        .not('kind', 'like', 'advisor_%')
      query = userId
        ? query.or(`user_id.is.null,user_id.eq.${userId}`)
        : query.is('user_id', null)
      const { error } = await query
      if (error && !isMissingNotificationsTableError(error)) throw error
    },
    onMutate: async () => {
      const unreadKey = notificationQueryKeys.unreadCount(familyId, userId ?? null)
      await queryClient.cancelQueries({ queryKey: unreadKey })
      const prev = queryClient.getQueryData<number>(unreadKey)
      queryClient.setQueryData<number>(unreadKey, 0)
      return { unreadKey, prev }
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData(context.unreadKey, context.prev)
    },
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['notifications'],
      })
    },
  })
}

/**
 * Notificaciones V2: marcar una notificación como leída = HARD DELETE
 * de la fila. No se conservan una vez leídas, así que el feed solo
 * muestra pendientes. La eliminación es optimista: sacamos la fila de
 * todas las listas cacheadas en `onMutate` para que la salida se sienta
 * instantánea, con rollback en `onError`.
 */
export function useDeleteNotification(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  const ref = useRef<{ mutate: (input: { id: string }) => void } | null>(null)

  const result = useMutation({
    mutationFn: async (input: { id: string }) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', input.id)

      if (error) throw error
    },
    onMutate: async (input) => {
      if (!familyId) return { snapshots: [] as PreviousListSnapshot[] }

      const familyKey = notificationQueryKeys.family(familyId)
      await queryClient.cancelQueries({ queryKey: familyKey })

      // Removemos el id de toda lista cacheada bajo la familia (cualquier
      // userId/limit). El badge de unread cuenta server-side; no lo
      // tocamos acá, pero la invalidación en onSettled lo refresca.
      const snapshots: PreviousListSnapshot[] = []
      const queries = queryClient.getQueriesData<FamilyNotification[]>({
        queryKey: familyKey,
      })
      for (const [key, data] of queries) {
        if (!Array.isArray(data)) continue
        snapshots.push({ key, data })
        queryClient.setQueryData<FamilyNotification[]>(
          key,
          data.filter((n) => n.id !== input.id),
        )
      }

      return { snapshots }
    },
    onError: (_error, input, context) => {
      for (const snapshot of context?.snapshots ?? []) {
        queryClient.setQueryData(snapshot.key, snapshot.data)
      }
      toast.error('No se pudo eliminar la notificación.', {
        actionLabel: 'Reintentar',
        onAction: () => ref.current?.mutate(input),
      })
    },
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['notifications'],
      })
    },
  })

  useEffect(() => {
    ref.current = { mutate: result.mutate }
  }, [result.mutate])

  return result
}

export function useDeleteAllNotifications(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!familyId) return

      let query = supabase
        .from('notifications')
        .delete()
        .eq('family_id', familyId)
        // No barremos señales del asistente — no se muestran acá y
        // borrarlas afectaría silenciosamente otra superficie.
        .not('kind', 'like', 'advisor_%')

      if (userId) {
        query = query.or(`user_id.is.null,user_id.eq.${userId}`)
      } else {
        query = query.is('user_id', null)
      }

      const { error } = await query
      if (error) throw error
    },
    onMutate: async () => {
      if (!familyId) return { snapshots: [] as PreviousListSnapshot[] }

      const familyKey = notificationQueryKeys.family(familyId)
      await queryClient.cancelQueries({ queryKey: familyKey })

      const snapshots: PreviousListSnapshot[] = []
      const queries = queryClient.getQueriesData<FamilyNotification[]>({
        queryKey: familyKey,
      })
      for (const [key, data] of queries) {
        if (!Array.isArray(data)) continue
        snapshots.push({ key, data })
        queryClient.setQueryData<FamilyNotification[]>(key, [])
      }

      return { snapshots }
    },
    onError: (_error, _input, context) => {
      for (const snapshot of context?.snapshots ?? []) {
        queryClient.setQueryData(snapshot.key, snapshot.data)
      }
      toast.error('No se pudieron borrar las notificaciones.')
    },
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['notifications'],
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
