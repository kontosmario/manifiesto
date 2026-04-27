import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  label: string
  from: number
  to: number | null
}> = [
  { key: 'arranque', label: 'Arranque', from: 0, to: 7 },
  { key: 'constante', label: 'Constante', from: 7, to: 14 },
  { key: 'disciplinado', label: 'Disciplinado', from: 14, to: 30 },
  { key: 'imparable', label: 'Imparable', from: 30, to: 60 },
  { key: 'maestro', label: 'Maestro', from: 60, to: 90 },
  { key: 'leyenda', label: 'Leyenda', from: 90, to: null },
]

// ─────────────────────────────────────────────────────────────
// Raw Supabase row.
// ─────────────────────────────────────────────────────────────

interface UserStreakRow {
  current_streak: number
  longest_streak: number
  total_days_logged: number
  last_logged_date: string | null
  freeze_tokens: number
}

export const streakQueryKey = (familyId?: string, userId?: string) =>
  ['user-streak', familyId ?? null, userId ?? null] as const

export const markedDaysQueryKey = (familyId?: string, userId?: string) =>
  ['streak-marked-days', familyId ?? null, userId ?? null] as const

interface MarkedDayRow {
  marked_date: string
}

async function fetchMarkedDays(
  familyId: string,
  userId: string,
): Promise<string[]> {
  // Last 14 entries is plenty: the UI only renders the last 7 days,
  // and a small buffer covers timezone edge-cases without paginating.
  const { data, error } = await supabase
    .from('streak_marked_days')
    .select('marked_date')
    .eq('family_id', familyId)
    .eq('user_id', userId)
    .order('marked_date', { ascending: false })
    .limit(14)
  if (error) throw error
  return ((data as MarkedDayRow[] | null) ?? []).map((r) => r.marked_date)
}

async function fetchStreakRow(
  familyId: string,
  userId: string,
): Promise<UserStreakRow | null> {
  const { data, error } = await supabase
    .from('user_streaks')
    .select('current_streak, longest_streak, total_days_logged, last_logged_date, freeze_tokens')
    .eq('family_id', familyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as UserStreakRow | null) ?? null
}

// Streak day boundary lives in the device's IANA timezone to match
// the trigger (`expenses_trigger_advance_streak`), which reads the
// same value off `profiles.timezone` (synced by `useTimezoneSync` on
// every authenticated session). Using UTC here misclassified any
// expense logged in the local evening — the trigger stored the next
// UTC date but the client was comparing against today-in-UTC,
// flipping `hasLoggedToday` and the at-risk/broken status off.
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
 * Aggregates the authoritative `user_streaks` row with a derived
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
  const streakRowQuery = useQuery<UserStreakRow | null>({
    queryKey: streakQueryKey(familyId, userId),
    enabled: Boolean(familyId && userId),
    queryFn: () => fetchStreakRow(familyId!, userId!),
  })
  const markedDaysQuery = useQuery<string[]>({
    queryKey: markedDaysQueryKey(familyId, userId),
    enabled: Boolean(familyId && userId),
    queryFn: () => fetchMarkedDays(familyId!, userId!),
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
    // A day counts as "logged" if the user inserted an expense OR
    // explicitly marked it as a "no spending" day via the streak sheet.
    const week = new Array<boolean>(7).fill(false)
    for (let i = 0; i < 7; i++) {
      const offsetDate = new Date(today.getTime() - (6 - i) * 86_400_000)
      const iso = isoDay(offsetDate, tz)
      if (markedDays.has(iso)) {
        week[i] = true
      }
    }
    for (const e of expenses) {
      if (!e.created_by || e.created_by !== userId) continue
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
      }
    }

    const hasLoggedToday = row.last_logged_date === todayIso
    const hasMarkedNoExpenseToday = markedDays.has(todayIso)
    // `isBroken` on the client: last log is older than yesterday AND no
    // shield available. If a shield IS available, we leave the card as
    // at-risk — the shield consumption happens on the next insert.
    const lastLogged = row.last_logged_date ? new Date(row.last_logged_date) : null
    const isBroken = (() => {
      if (!lastLogged) return false
      if (row.last_logged_date === todayIso) return false
      if (row.last_logged_date === yesterdayIso) return false
      // Gap > 1 day.
      return row.freeze_tokens === 0 && row.current_streak > 0
    })()

    return {
      currentStreak: row.current_streak,
      longestStreak: row.longest_streak,
      totalDaysLogged: row.total_days_logged,
      hasLoggedToday,
      hasMarkedNoExpenseToday,
      freezeTokens: row.freeze_tokens,
      weekActivity: week,
      isBroken,
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

/**
 * Marks today as a no-expense day. Server-side, this writes a row in
 * `streak_marked_days` and runs the streak state machine for today
 * (in the user's timezone), so the streak advances exactly as it would
 * on a real expense insert. Client cache is invalidated for both the
 * streak row and the marked-days list so the UI updates immediately.
 */
export function useMarkNoExpenseDay(
  familyId: string | undefined,
  userId: string | undefined,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error('No family selected')
      const { data, error } = await supabase.rpc('mark_no_expense_day', {
        p_family_id: familyId,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: streakQueryKey(familyId, userId) }),
        queryClient.invalidateQueries({ queryKey: markedDaysQueryKey(familyId, userId) }),
      ])
    },
  })
}

/**
 * Reverts today's "no expense" mark. Server-side this clears the row
 * from `streak_marked_days` and recomputes the streak by replaying
 * every real expense + remaining marked day, so any side-effects from
 * the original mark (shield grants, level transitions) roll back too.
 */
export function useUnmarkNoExpenseDay(
  familyId: string | undefined,
  userId: string | undefined,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error('No family selected')
      const { data, error } = await supabase.rpc('unmark_no_expense_day', {
        p_family_id: familyId,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: streakQueryKey(familyId, userId) }),
        queryClient.invalidateQueries({ queryKey: markedDaysQueryKey(familyId, userId) }),
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
    currentLevelLabel: levelDef.label,
    regressionDay,
    atRiskIntensity,
  })

  return {
    status,
    level: levelDef.key,
    levelLabel: levelDef.label,
    nextLevelLabel: nextLevelDef?.label ?? 'Leyenda',
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
  regressionDay: number
  atRiskIntensity: AtRiskIntensity | null
}): { headline: string; message: string } {
  const { status, data, daysToNextLevel, currentLevelLabel, regressionDay, atRiskIntensity } =
    input
  const next = LEVELS.find((l) => l.from > data.currentStreak)

  if (status === 'active') {
    if (data.hasMarkedNoExpenseToday) {
      return {
        headline: 'Hoy sin gastos — racha protegida',
        message: `Marcaste el día como "sin gastos". La racha sigue activa en ${currentLevelLabel} y cada día contado suma a tu progreso.`,
      }
    }
    if (daysToNextLevel > 0 && daysToNextLevel <= 3 && next) {
      return {
        headline: `¡Casi en ${next.label}!`,
        message: `Solo ${daysToNextLevel} días más para subir de nivel. Seguí así.`,
      }
    }
    return {
      headline:
        data.currentStreak <= 1
          ? 'Empezaste tu racha'
          : `${data.currentStreak} días seguidos, imparable`,
      message: `Estás en ${currentLevelLabel}. Cada día que registrás tu dinero trabaja mejor para vos.`,
    }
  }

  if (status === 'at_risk') {
    const tone = resolveDayTone(atRiskIntensity ?? 'calm')
    if (data.freezeTokens > 0) {
      const n = data.freezeTokens
      const shieldsLabel = `${n} ${n === 1 ? 'escudo' : 'escudos'}`
      return {
        headline: tone.atRiskHeadlineWithShield,
        message: `${tone.atRiskMessage} Tenés ${shieldsLabel} disponible${n === 1 ? '' : 's'} — si no registrás hoy se activa solo a las 23:59.`,
      }
    }
    return {
      headline: tone.atRiskHeadlineNoShield,
      message: `${tone.atRiskMessage} Sin escudos: si no registrás, volvés al día ${regressionDay} y perdés ${data.currentStreak - regressionDay} ${data.currentStreak - regressionDay === 1 ? 'día' : 'días'} de progreso.`,
    }
  }

  return {
    headline: 'La racha se cortó',
    message: `Arrancás desde el día ${regressionDay}. Las rachas se construyen día a día — empezá hoy y en ${daysToNextLevel} días volvés a donde estabas.`,
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
  switch (intensity) {
    case 'calm':
      return {
        atRiskHeadlineWithShield: 'Buen día — tu racha sigue viva',
        atRiskHeadlineNoShield: 'Hoy todavía no registraste',
        atRiskMessage: 'Tenés toda la jornada por delante, registrá cuando puedas.',
      }
    case 'gentle':
      return {
        atRiskHeadlineWithShield: 'Tu racha sigue en juego',
        atRiskHeadlineNoShield: 'Aún no registraste hoy',
        atRiskMessage: 'Buen momento para anotar el gasto del día antes de que se haga tarde.',
      }
    case 'urgent':
      return {
        atRiskHeadlineWithShield: 'Cuidado — se acerca el corte',
        atRiskHeadlineNoShield: 'Faltan pocas horas para medianoche',
        atRiskMessage: 'Si registrás ahora, evitás cualquier sobresalto.',
      }
    case 'critical':
      return {
        atRiskHeadlineWithShield: 'Última hora — racha en riesgo',
        atRiskHeadlineNoShield: 'Última hora antes de medianoche',
        atRiskMessage: 'Registrá ya para cerrar el día sin perder progreso.',
      }
  }
}
