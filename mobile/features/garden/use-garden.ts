import { useMemo } from 'react'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useStreak } from '@/features/streaks/use-streak'
import {
  deriveGardenCells,
  deriveWeekClose,
  deriveWeekStrip,
  weeksToShow,
  type GardenCell,
  type WeekClose,
  type WeekStripDay,
} from './garden-model'

export interface GardenData {
  currentStreak: number
  longestStreak: number
  totalDaysLogged: number
  freezeTokens: number
  hasLoggedToday: boolean
  cells: GardenCell[]
  weeksShown: number
  weekClose: WeekClose
  weekStrip: WeekStripDay[]
  firstActivityIso: string | null
}

// Día local del usuario — DEBE coincidir con el trigger server
// (`expenses_trigger_advance_streak`, que lee `profiles.timezone`). Mismo
// helper que use-streak.ts: en-CA + IANA tz resuelta. NO usar UTC.
function isoDay(d: Date, tz: string): string {
  return d.toLocaleDateString('en-CA', { timeZone: tz })
}

function resolveTz(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz && tz.length > 0 ? tz : 'America/Argentina/Buenos_Aires'
  } catch {
    return 'America/Argentina/Buenos_Aires'
  }
}

/**
 * Deriva el estado del jardín (grilla 7×5 + cierre de semana) a partir del
 * motor de rachas existente (`useStreak`) y del historial de gastos
 * (`useExpenses`). El "brote" se planta al registrar un gasto variable o
 * fijo (trigger server-side) o al marcar un día sin gasto; acá solo se LEE
 * y se deriva. Días salteados no rompen el jardín — se muestran como brote
 * tenue (la madurez depende de la antigüedad del día).
 */
export function useGarden(
  familyId: string | undefined,
  userId: string | undefined,
): { data: GardenData | null; isLoading: boolean } {
  const streak = useStreak(familyId, userId)
  const expensesQuery = useExpenses(familyId)

  const data = useMemo<GardenData | null>(() => {
    if (!familyId || !userId || !streak.data) return null
    const tz = resolveTz()
    const today = new Date()
    const todayIso = isoDay(today, tz)

    // Set de días-con-actividad: gastos del usuario (variable + fijo) ∪
    // días marcados sin-gasto. Mismo patrón que use-streak.ts weekActivity.
    const activity = new Set<string>(streak.data.markedDaysIso)
    for (const e of expensesQuery.data ?? []) {
      if (e.created_by !== userId) continue
      activity.add(isoDay(new Date(e.created_at), tz))
    }

    // Lunes de la semana actual (getDay: 0=Dom..6=Sáb → Monday0).
    const dow = (today.getDay() + 6) % 7
    const weekDayIso = (i: number) =>
      isoDay(new Date(today.getTime() - (dow - i) * 86_400_000), tz)

    const sorted = [...activity].sort()
    const firstActivityIso = sorted.length > 0 ? sorted[0] : null

    return {
      currentStreak: streak.data.currentStreak,
      longestStreak: streak.data.longestStreak,
      totalDaysLogged: streak.data.totalDaysLogged,
      freezeTokens: streak.data.freezeTokens,
      hasLoggedToday: streak.data.hasLoggedToday,
      cells: deriveGardenCells(activity, todayIso, firstActivityIso),
      weeksShown: weeksToShow(firstActivityIso, todayIso),
      weekClose: deriveWeekClose(activity, weekDayIso),
      weekStrip: deriveWeekStrip(activity, todayIso, weekDayIso),
      firstActivityIso,
    }
  }, [familyId, userId, streak.data, expensesQuery.data])

  return { data, isLoading: streak.isLoading || expensesQuery.isLoading }
}
