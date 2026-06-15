// Preferencias EXPLÍCITAS del Asistente Financiero (tabla user_advisor_prefs).
// Calca el patrón de use-notification-preferences: query + mutation con
// upsert onConflict='user_id', optimistic update + rollback + invalidate.
// Degrada a defaults si la tabla no existe (migración pendiente / build viejo).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { UserPersona } from '@/features/insights/persona'

export interface AdvisorPreferences {
  userId: string | null
  useInferredPersona: boolean
  personaOverride: UserPersona | null
  advisorEnabled: boolean
  updatedAt: string | null
}

interface AdvisorPreferencesRow {
  user_id: string
  use_inferred_persona: boolean | null
  persona_override: string | null
  advisor_enabled: boolean | null
  updated_at: string | null
}

export const ADVISOR_PREFERENCES_DEFAULTS: AdvisorPreferences = {
  userId: null,
  useInferredPersona: true,
  personaOverride: null,
  advisorEnabled: true,
  updatedAt: null,
}

export const ADVISOR_PREFERENCES_QUERY_KEY = ['advisor-preferences'] as const

const SELECT_COLS = 'user_id, use_inferred_persona, persona_override, advisor_enabled, updated_at'
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])
const PERSONA_VALUES = ['planner', 'firefighter', 'avoider', 'optimizer'] as const

function isMissingTableError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return MISSING_TABLE_CODES.has(code) || text.includes('does not exist') || text.includes('schema cache')
}

function normalizePersona(value: string | null): UserPersona | null {
  return value && (PERSONA_VALUES as readonly string[]).includes(value)
    ? (value as UserPersona)
    : null
}

function normalizeRow(row: AdvisorPreferencesRow | null): AdvisorPreferences {
  if (!row) return ADVISOR_PREFERENCES_DEFAULTS
  return {
    userId: row.user_id,
    useInferredPersona: row.use_inferred_persona ?? true,
    personaOverride: normalizePersona(row.persona_override),
    advisorEnabled: row.advisor_enabled ?? true,
    updatedAt: row.updated_at,
  }
}

function toDbPatch(patch: Partial<AdvisorPreferences>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.useInferredPersona !== undefined) out.use_inferred_persona = patch.useInferredPersona
  if (patch.personaOverride !== undefined) out.persona_override = patch.personaOverride
  if (patch.advisorEnabled !== undefined) out.advisor_enabled = patch.advisorEnabled
  return out
}

export function useAdvisorPreferences() {
  return useQuery<AdvisorPreferences>({
    queryKey: ADVISOR_PREFERENCES_QUERY_KEY,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) return ADVISOR_PREFERENCES_DEFAULTS

      const { data, error } = await supabase
        .from('user_advisor_prefs')
        .select(SELECT_COLS)
        .eq('user_id', userId)
        .maybeSingle()

      if (error) {
        if (isMissingTableError(error)) return { ...ADVISOR_PREFERENCES_DEFAULTS, userId }
        throw error
      }
      const row = (data as AdvisorPreferencesRow | null) ?? null
      if (!row) return { ...ADVISOR_PREFERENCES_DEFAULTS, userId }
      return normalizeRow(row)
    },
  })
}

export function useUpdateAdvisorPreferences() {
  const queryClient = useQueryClient()

  return useMutation<
    AdvisorPreferences,
    unknown,
    Partial<AdvisorPreferences>,
    { previous?: AdvisorPreferences }
  >({
    mutationFn: async (patch) => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('Sesión no disponible.')

      const { data, error } = await supabase
        .from('user_advisor_prefs')
        .upsert({ user_id: userId, ...toDbPatch(patch) }, { onConflict: 'user_id' })
        .select(SELECT_COLS)
        .single()

      if (error) throw error
      return normalizeRow(data as AdvisorPreferencesRow)
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ADVISOR_PREFERENCES_QUERY_KEY })
      const previous = queryClient.getQueryData<AdvisorPreferences>(ADVISOR_PREFERENCES_QUERY_KEY)
      const base = previous ?? ADVISOR_PREFERENCES_DEFAULTS
      queryClient.setQueryData<AdvisorPreferences>(ADVISOR_PREFERENCES_QUERY_KEY, {
        ...base,
        ...patch,
      })
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ADVISOR_PREFERENCES_QUERY_KEY, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ADVISOR_PREFERENCES_QUERY_KEY })
    },
  })
}
