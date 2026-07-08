import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import i18n from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useExpenses } from '@/features/expenses/use-expenses'

// ─────────────────────────────────────────────────────────────
// Types mirrored from the spec so the UI can import a single place.
// ─────────────────────────────────────────────────────────────

export type StreakStatus = 'active' | 'at_risk' | 'broken'
/**
 * Visual intensity ramp used while the streak is at-risk and the day
 * is still in progress in the user's timezone. The four bands map to
 * the green→yellow→orange→red palette and to the time the user has
 * left to register today before midnight.
 *  • calm:     05–11h — plenty of day ahead.
 *  • gentle:   12–15h — friendly nudge, no urgency.
 *  • urgent:   16–19h — orange alert; "Hoy no tuve gastos" unlocks.
 *  • critical: 20–04h — red alert; final stretch.
 *  Always `null` when status is `active` or `broken`.
 */
export type AtRiskIntensity = 'calm' | 'gentle' | 'urgent' | 'critical'
export type StreakLevel =
  | 'arranque'
  | 'constante'
  | 'disciplinado'
  | 'imparable'
  | 'maestro'
  | 'leyenda'

export interface StreakData {
  currentStreak: number
  longestStreak: number
  totalDaysLogged: number
  hasLoggedToday: boolean
  /** True when today's activity comes from a "no spend" mark, not an
   *  expense — used so the UI can differentiate the copy ("hoy no
   *  gastaste, racha protegida") from a real registered day. */
  hasMarkedNoExpenseToday: boolean
  freezeTokens: number
  /** 7 entries, index 0 = 6 days ago, index 6 = today. */
  weekActivity: boolean[]
  isBroken: boolean
  /** ISO timestamp the streak broke at (server-authoritative), or
   *  null if not broken. The hourly server cron is the source of
   *  truth for break detection — the client used to derive this
   *  locally but that race-conditioned with the at-risk window. */
  streakBrokenAt: string | null
  /** ISO date strings (`YYYY-MM-DD`) of marked no-spend days from ANY
   *  family member (deduped), ordered by `marked_date` descending.
   *  Limited to the last 35 by the underlying query — covers the
   *  garden grid's 5-week window. */
  markedDaysIso: string[]
}

export interface StreakDerived {
  status: StreakStatus
  level: StreakLevel
  levelLabel: string
  nextLevelLabel: string
  nextLevelThreshold: number
  daysIntoLevel: number
  levelTotalDays: number
  progressPct: number
  daysToNextLevel: number
  regressionDay: number
  copyHeadline: string
  copyMessage: string
  /** Hour-of-day urgency band when status is `at_risk`; null otherwise. */
  atRiskIntensity: AtRiskIntensity | null
}

export const LEVELS: Array<{
  key: StreakLevel
  from: number
  to: number | null
}> = [
  { key: 'arranque', from: 0, to: 7 },
  { key: 'constante', from: 7, to: 14 },
  { key: 'disciplinado', from: 14, to: 30 },
  { key: 'imparable', from: 30, to: 60 },
  { key: 'maestro', from: 60, to: 90 },
  { key: 'leyenda', from: 90, to: null },
]

/** Etiqueta visible del nivel de racha (resuelta vía i18n). */
export function levelLabel(key: StreakLevel): string {
  return i18n.t(`garden:levels.${key}`)
}

// ─────────────────────────────────────────────────────────────
// Raw Supabase row (family_streaks — la racha es del HOGAR).
// ─────────────────────────────────────────────────────────────

interface FamilyStreakRow {
  current_streak: number
  longest_streak: number
  total_days_logged: number
  last_logged_date: string | null
  freeze_tokens: number
  streak_broken_at: string | null
}

export {
  streakQueryKey,
  markedDaysQueryKey,
} from '@/features/streaks/streak-query-keys'
import {
  streakQueryKey,
  markedDaysQueryKey,
} from '@/features/streaks/streak-query-keys'
import { homeSnapshotQueryKey } from '@/features/home/home-snapshot-query-keys'

interface MarkedDayRow {
  marked_date: string
}

async function fetchMarkedDays(familyId: string): Promise<string[]> {
  // Marcas de TODOS los miembros (el día sin gasto es del hogar). El
  // límite sube a 35 (14 cuando era per-usuario): la grilla del jardín
  // cubre hasta 5 semanas y ahora agrega varias autorías.
  const { data, error } = await supabase
    .from('streak_marked_days')
    .select('marked_date')
    .eq('family_id', familyId)
    .order('marked_date', { ascending: false })
    .limit(35)
  if (error) throw error
  const days = ((data as MarkedDayRow[] | null) ?? []).map((r) => r.marked_date)
  // Dos miembros pueden marcar el mismo día — dedupe para el Set/UI.
  return [...new Set(days)]
}

async function fetchStreakRow(familyId: string): Promise<FamilyStreakRow | null> {
  const { data, error } = await supabase
    .from('family_streaks')
    .select(
      'current_streak, longest_streak, total_days_logged, last_logged_date, freeze_tokens, streak_broken_at',
    )
    .eq('family_id', familyId)
    .maybeSingle()
  if (error) throw error
  return (data as FamilyStreakRow | null) ?? null
}

// Streak day boundary lives in the device's IANA timezone. Server-side
// the trigger (`expenses_trigger_advance_streak`) cuts the day in the
// FAMILY timezone (`family_local_timezone` = owner's profile tz); a
// household normally shares the huso, so device tz matches. Using UTC
// here misclassified any expense logged in the local evening — the
// trigger stored the next UTC date but the client was comparing
// against today-in-UTC, flipping `hasLoggedToday` and the
// at-risk/broken status off.
function isoDay(d: Date, timeZone: string): string {
  return d.toLocaleDateString('en-CA', { timeZone })
}

function resolveLocalTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz && tz.length > 0 ? tz : 'America/Argentina/Buenos_Aires'
  } catch {
    return 'America/Argentina/Buenos_Aires'
  }
}

/**
 * Aggregates the authoritative `family_streaks` row (the streak is the
 * HOUSEHOLD's — any member's activity advances it) with a derived
 * `weekActivity` series and the at-risk / broken state the UI needs.
 * The state machine only runs on expense insert (via trigger), so the
 * client derives the current-moment status from `last_logged_date`
 * vs. today.
 */
export function useStreak(familyId: string | undefined, userId: string | undefined): {
  data: StreakData | null
  isLoading: boolean
  error: unknown
} {
  const expensesQuery = useExpenses(familyId)
  const streakRowQuery = useQuery<FamilyStreakRow | null>({
    queryKey: streakQueryKey(familyId),
    enabled: Boolean(familyId && userId),
    // Sin staleTime explícito el default es 0 → cada mount disparaba
    // un refetch en background, anulando el seed de gastos_snapshot.
    // 5 min + invalidaciones en mark/unmark mutations cubren los
    // cambios reales.
    staleTime: 5 * 60_000,
    queryFn: () => fetchStreakRow(familyId!),
  })
  const markedDaysQuery = useQuery<string[]>({
    queryKey: markedDaysQueryKey(familyId),
    enabled: Boolean(familyId && userId),
    staleTime: 5 * 60_000,
    queryFn: () => fetchMarkedDays(familyId!),
  })

  const data = useMemo<StreakData | null>(() => {
    if (!familyId || !userId) return null
    const row = streakRowQuery.data
    const expenses = expensesQuery.data ?? []
    const markedDays = new Set(markedDaysQuery.data ?? [])
    const today = new Date()
    const tz = resolveLocalTimezone()
    const todayIso = isoDay(today, tz)
    const yesterdayIso = isoDay(new Date(today.getTime() - 86_400_000), tz)

    // weekActivity — last 7 days (index 0 = 6 days ago, 6 = today).
    // A day counts as "logged" if ANY family member inserted an
    // expense OR marked it as a "no spending" day — the garden is the
    // household's, so everyone's activity plants the day's sprout.
    const week = new Array<boolean>(7).fill(false)
    for (let i = 0; i < 7; i++) {
      const offsetDate = new Date(today.getTime() - (6 - i) * 86_400_000)
      const iso = isoDay(offsetDate, tz)
      if (markedDays.has(iso)) {
        week[i] = true
      }
    }
    for (const e of expenses) {
      if (!e.created_by) continue
      const created = new Date(e.created_at)
      const iso = isoDay(created, tz)
      // Find which week column this date belongs to (0 = 6 days ago).
      for (let i = 0; i < 7; i++) {
        const offsetDate = new Date(today.getTime() - (6 - i) * 86_400_000)
        if (isoDay(offsetDate, tz) === iso) {
          week[i] = true
          break
        }
      }
    }

    if (!row) {
      // User has no streak row yet (no expenses). Return a zero state.
      return {
        currentStreak: 0,
        longestStreak: 0,
        totalDaysLogged: 0,
        hasLoggedToday: false,
        hasMarkedNoExpenseToday: false,
        freezeTokens: 0,
        weekActivity: week,
        isBroken: false,
        streakBrokenAt: null,
        markedDaysIso: [],
      }
    }

    const hasLoggedToday = row.last_logged_date === todayIso
    const hasMarkedNoExpenseToday = markedDays.has(todayIso)
    // Server-authoritative `isBroken`: the hourly cron sets
    // `streak_broken_at` and zeroes `current_streak` once the gap is
    // too large to recover with a shield. We treat that combination
    // as the canonical "broken" state.
    //
    // Fallback heuristic: if the server hasn't run yet but the client
    // can plainly see the gap is too large, surface broken anyway.
    // This covers the lag between the cron run and the next refresh
    // (worst case ~1h before the cron catches up).
    const serverBroken = row.streak_broken_at !== null && row.current_streak === 0
    const heuristicBroken = (() => {
      if (!row.last_logged_date) return false
      if (row.last_logged_date === todayIso) return false
      if (row.last_logged_date === yesterdayIso) return false
      return row.freeze_tokens === 0 && row.current_streak > 0
    })()
    const isBroken = serverBroken || heuristicBroken

    return {
      currentStreak: row.current_streak,
      longestStreak: row.longest_streak,
      totalDaysLogged: row.total_days_logged,
      hasLoggedToday,
      hasMarkedNoExpenseToday,
      freezeTokens: row.freeze_tokens,
      weekActivity: week,
      isBroken,
      streakBrokenAt: row.streak_broken_at,
      markedDaysIso: markedDaysQuery.data ?? [],
    }
  }, [familyId, userId, streakRowQuery.data, expensesQuery.data, markedDaysQuery.data])

  return {
    data,
    isLoading:
      streakRowQuery.isLoading || expensesQuery.isLoading || markedDaysQuery.isLoading,
    error:
      streakRowQuery.error ?? expensesQuery.error ?? markedDaysQuery.error ?? null,
  }
}

export interface MarkNoExpenseDayInput {
  /** YYYY-MM-DD in the user's local timezone. Omit for today. */
  date?: string
  /** Allow marking today even if expenses already exist. The UI
   *  prompts an Alert before passing true. Has no effect on past
   *  dates — those reject unconditionally if expenses exist. */
  force?: boolean
}

/**
 * Marks a day as no-expense. Server-side, this writes a row in
 * `streak_marked_days` and runs the streak state machine for that
 * day (in the user's timezone), so the streak advances exactly as
 * it would on a real expense insert. Client cache is invalidated for
 * both the streak row and the marked-days list so the UI updates
 * immediately.
 *
 * Default is "today in user-local tz". Pass `{ date: 'YYYY-MM-DD' }`
 * to mark a past date. Server-side rejects future dates and past
 * dates with existing expenses.
 */
export function useMarkNoExpenseDay(
  familyId: string | undefined,
  userId: string | undefined,
) {
  const queryClient = useQueryClient()

  return useMutation<string, Error, MarkNoExpenseDayInput | undefined>({
    mutationFn: async (input) => {
      if (!familyId) throw new Error('No family selected')
      const { data, error } = await supabase.rpc('mark_no_expense_day', {
        p_family_id: familyId,
        p_date: input?.date ?? null,
        p_force: input?.force ?? false,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: async () => {
      // home_snapshot also exposes no_spend_days_this_cycle (since
      // migration 20260601007000). The calendar reads marked days
      // from THERE for cycle-scoped accuracy, so we must invalidate
      // it too — without this the calendar leaf-dot only updates
      // after a full reload.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: streakQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: markedDaysQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: homeSnapshotQueryKey(userId) }),
      ])
    },
  })
}

export interface UnmarkNoExpenseDayInput {
  /** YYYY-MM-DD in the user's local timezone. Omit for today. */
  date?: string
}

/**
 * Reverts a day's "no expense" mark. Server-side this clears the row
 * from `streak_marked_days` and recomputes the streak by replaying
 * every real expense + remaining marked day, so any side-effects
 * from the original mark (shield grants, level transitions) roll
 * back too.
 *
 * Default is "today". Pass `{ date: 'YYYY-MM-DD' }` to revert a
 * specific past date.
 */
export function useUnmarkNoExpenseDay(
  familyId: string | undefined,
  userId: string | undefined,
) {
  const queryClient = useQueryClient()

  return useMutation<string, Error, UnmarkNoExpenseDayInput | undefined>({
    mutationFn: async (input) => {
      if (!familyId) throw new Error('No family selected')
      const { data, error } = await supabase.rpc('unmark_no_expense_day', {
        p_family_id: familyId,
        p_date: input?.date ?? null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: async () => {
      // home_snapshot also exposes no_spend_days_this_cycle (since
      // migration 20260601007000). The calendar reads marked days
      // from THERE for cycle-scoped accuracy, so we must invalidate
      // it too — without this the calendar leaf-dot only updates
      // after a full reload.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: streakQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: markedDaysQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: homeSnapshotQueryKey(userId) }),
      ])
    },
  })
}

/**
 * Pure derivation used by both the header icon and the sheet.
 */
export function deriveStreak(data: StreakData): StreakDerived {
  const status: StreakStatus = data.isBroken
    ? 'broken'
    : data.hasLoggedToday
      ? 'active'
      : 'at_risk'

  const levelDef =
    [...LEVELS].reverse().find((l) => data.currentStreak >= l.from) ?? LEVELS[0]!
  const nextLevelDef = LEVELS.find((l) => l.from > data.currentStreak) ?? null
  const daysIntoLevel = data.currentStreak - levelDef.from
  const levelTotalDays = nextLevelDef ? nextLevelDef.from - levelDef.from : 30
  const progressPct = Math.min(daysIntoLevel / Math.max(1, levelTotalDays), 1)
  const daysToNextLevel = nextLevelDef ? nextLevelDef.from - data.currentStreak : 0
  const regressionDay = levelDef.from

  const atRiskIntensity = status === 'at_risk' ? resolveAtRiskIntensity(new Date()) : null

  const { headline, message } = buildCopy({
    status,
    data,
    daysToNextLevel,
    currentLevelLabel: levelLabel(levelDef.key),
    nextLevelKey: nextLevelDef?.key ?? null,
    regressionDay,
    atRiskIntensity,
  })

  return {
    status,
    level: levelDef.key,
    levelLabel: levelLabel(levelDef.key),
    nextLevelLabel: levelLabel(nextLevelDef?.key ?? 'leyenda'),
    nextLevelThreshold: nextLevelDef?.from ?? 90,
    daysIntoLevel,
    levelTotalDays,
    progressPct,
    daysToNextLevel,
    regressionDay,
    copyHeadline: headline,
    copyMessage: message,
    atRiskIntensity,
  }
}

/**
 * Maps the user's current local hour to the four-band urgency ramp.
 * Pure function so the hook stays cheap — derive once per render.
 */
export function resolveAtRiskIntensity(now: Date): AtRiskIntensity {
  const hour = now.getHours()
  if (hour >= 5 && hour < 12) return 'calm'
  if (hour >= 12 && hour < 16) return 'gentle'
  if (hour >= 16 && hour < 20) return 'urgent'
  return 'critical'
}

function buildCopy(input: {
  status: StreakStatus
  data: StreakData
  daysToNextLevel: number
  currentLevelLabel: string
  nextLevelKey: StreakLevel | null
  regressionDay: number
  atRiskIntensity: AtRiskIntensity | null
}): { headline: string; message: string } {
  // `regressionDay` is preserved on `StreakDerived` for legacy
  // consumers but the new copy doesn't reference it: the server now
  // zeroes the streak on break (no level-boundary regression), so
  // talking about a regression target would be misleading.
  const { status, data, daysToNextLevel, currentLevelLabel, nextLevelKey, atRiskIntensity } = input

  if (status === 'active') {
    if (data.hasMarkedNoExpenseToday) {
      return {
        headline: i18n.t('garden:streakCopy.noSpend.headline'),
        message: i18n.t('garden:streakCopy.noSpend.message', { level: currentLevelLabel }),
      }
    }
    if (daysToNextLevel > 0 && daysToNextLevel <= 3 && nextLevelKey) {
      return {
        headline: i18n.t('garden:streakCopy.nearLevel.headline', {
          level: levelLabel(nextLevelKey),
        }),
        message: i18n.t('garden:streakCopy.nearLevel.message', { count: daysToNextLevel }),
      }
    }
    return {
      headline:
        data.currentStreak <= 1
          ? i18n.t('garden:streakCopy.active.headlineStart')
          : i18n.t('garden:streakCopy.active.headlineStreak', { count: data.currentStreak }),
      message: i18n.t('garden:streakCopy.active.message', { level: currentLevelLabel }),
    }
  }

  if (status === 'at_risk') {
    const tone = resolveDayTone(atRiskIntensity ?? 'calm')
    if (data.freezeTokens > 0) {
      return {
        headline: tone.atRiskHeadlineWithShield,
        message: i18n.t('garden:streakCopy.atRiskWithShield.message', {
          count: data.freezeTokens,
          tone: tone.atRiskMessage,
        }),
      }
    }
    // Without shields, the streak goes to ZERO at the next cron run
    // (true break). Frame consequence as "se corta" rather than the
    // old regression bookkeeping; that copy referenced level
    // boundaries that no longer apply server-side.
    return {
      headline: tone.atRiskHeadlineNoShield,
      message: i18n.t('garden:streakCopy.atRiskNoShield.message', {
        count: data.currentStreak,
        tone: tone.atRiskMessage,
      }),
    }
  }

  // Broken state.
  // After the server cron processes the break, `currentStreak` is 0
  // and `longestStreak` keeps the prior best. Frame the copy around
  // a fresh restart instead of regression bookkeeping (the v1 copy
  // referenced a `regressionDay` that no longer applies — the new
  // backend zeroes the streak instead of regressing to a level
  // boundary).
  if (data.longestStreak >= 7) {
    return {
      headline: i18n.t('garden:streakCopy.broken.headline'),
      message: i18n.t('garden:streakCopy.broken.messageWithRecord', {
        count: data.longestStreak,
      }),
    }
  }
  return {
    headline: i18n.t('garden:streakCopy.broken.headline'),
    message: i18n.t('garden:streakCopy.broken.messageFresh'),
  }
}

interface DayTone {
  atRiskHeadlineWithShield: string
  atRiskHeadlineNoShield: string
  atRiskMessage: string
}

/**
 * Maps the urgency band into copy. Same source as the visual tone in
 * the streak sheet (`getStatusTone`) so the message and color always
 * reinforce each other instead of drifting.
 */
function resolveDayTone(intensity: AtRiskIntensity): DayTone {
  return {
    atRiskHeadlineWithShield: i18n.t(`garden:dayTone.${intensity}.atRiskHeadlineWithShield`),
    atRiskHeadlineNoShield: i18n.t(`garden:dayTone.${intensity}.atRiskHeadlineNoShield`),
    atRiskMessage: i18n.t(`garden:dayTone.${intensity}.atRiskMessage`),
  }
}
