import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  NOTIFICATION_KIND_GROUPS,
  type NotificationGroup,
} from '@/utils/notifications'

export { NOTIFICATION_KIND_GROUPS, type NotificationGroup }

export interface NotificationPreferences {
  userId: string | null
  channelPush: boolean
  channelInapp: boolean
  kindsMuted: string[]
  checkinMorningHour: number
  checkinMiddayHour: number
  checkinEveningHour: number
  nudgesEnabled: boolean
  updatedAt: string | null
}

interface NotificationPreferencesRow {
  user_id: string
  channel_push: boolean | null
  channel_inapp: boolean | null
  kinds_muted: string[] | null
  checkin_morning_hour: number | null
  checkin_midday_hour: number | null
  checkin_evening_hour: number | null
  nudges_enabled: boolean | null
  updated_at: string | null
}

export const NOTIFICATION_PREFERENCES_DEFAULTS: NotificationPreferences = {
  userId: null,
  channelPush: true,
  channelInapp: true,
  kindsMuted: [],
  checkinMorningHour: 9,
  checkinMiddayHour: 14,
  checkinEveningHour: 20,
  nudgesEnabled: true,
  updatedAt: null,
}

export const NOTIFICATION_PREFERENCES_QUERY_KEY = ['notification-preferences'] as const

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

function isMissingTableError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return MISSING_TABLE_CODES.has(code) || text.includes('does not exist') || text.includes('schema cache')
}

function normalizeRow(row: NotificationPreferencesRow | null): NotificationPreferences {
  if (!row) return NOTIFICATION_PREFERENCES_DEFAULTS
  return {
    userId: row.user_id,
    channelPush: row.channel_push ?? true,
    channelInapp: row.channel_inapp ?? true,
    kindsMuted: Array.isArray(row.kinds_muted) ? row.kinds_muted : [],
    checkinMorningHour: row.checkin_morning_hour ?? 9,
    checkinMiddayHour: row.checkin_midday_hour ?? 14,
    checkinEveningHour: row.checkin_evening_hour ?? 20,
    nudgesEnabled: row.nudges_enabled ?? true,
    updatedAt: row.updated_at,
  }
}

function toDbPatch(patch: Partial<NotificationPreferences>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.channelPush !== undefined) out.channel_push = patch.channelPush
  if (patch.channelInapp !== undefined) out.channel_inapp = patch.channelInapp
  if (patch.kindsMuted !== undefined) out.kinds_muted = patch.kindsMuted
  if (patch.checkinMorningHour !== undefined) out.checkin_morning_hour = patch.checkinMorningHour
  if (patch.checkinMiddayHour !== undefined) out.checkin_midday_hour = patch.checkinMiddayHour
  if (patch.checkinEveningHour !== undefined) out.checkin_evening_hour = patch.checkinEveningHour
  if (patch.nudgesEnabled !== undefined) out.nudges_enabled = patch.nudgesEnabled
  return out
}

export function useNotificationPreferences() {
  return useQuery<NotificationPreferences>({
    queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) {
        return NOTIFICATION_PREFERENCES_DEFAULTS
      }

      const { data, error } = await supabase
        .from('notification_preferences')
        .select(
          'user_id, channel_push, channel_inapp, kinds_muted, checkin_morning_hour, checkin_midday_hour, checkin_evening_hour, nudges_enabled, updated_at',
        )
        .eq('user_id', userId)
        .maybeSingle()

      if (error) {
        if (isMissingTableError(error)) {
          return { ...NOTIFICATION_PREFERENCES_DEFAULTS, userId }
        }
        throw error
      }

      const row = (data as NotificationPreferencesRow | null) ?? null
      if (!row) {
        return { ...NOTIFICATION_PREFERENCES_DEFAULTS, userId }
      }
      return normalizeRow(row)
    },
  })
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient()

  return useMutation<
    NotificationPreferences,
    unknown,
    Partial<NotificationPreferences>,
    { previous?: NotificationPreferences }
  >({
    mutationFn: async (patch) => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) {
        throw new Error('Sesión no disponible.')
      }

      const dbPatch = toDbPatch(patch)
      const { data, error } = await supabase
        .from('notification_preferences')
        .upsert({ user_id: userId, ...dbPatch }, { onConflict: 'user_id' })
        .select(
          'user_id, channel_push, channel_inapp, kinds_muted, checkin_morning_hour, checkin_midday_hour, checkin_evening_hour, nudges_enabled, updated_at',
        )
        .single()

      if (error) throw error
      return normalizeRow(data as NotificationPreferencesRow)
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY })
      const previous = queryClient.getQueryData<NotificationPreferences>(
        NOTIFICATION_PREFERENCES_QUERY_KEY,
      )

      const base = previous ?? NOTIFICATION_PREFERENCES_DEFAULTS
      const next: NotificationPreferences = { ...base, ...patch }
      queryClient.setQueryData<NotificationPreferences>(
        NOTIFICATION_PREFERENCES_QUERY_KEY,
        next,
      )
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NOTIFICATION_PREFERENCES_QUERY_KEY, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY })
    },
  })
}
