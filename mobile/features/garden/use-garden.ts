import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useStreak } from '@/features/streaks/use-streak'
import { useMyProfile } from '@/features/profile/use-profile'
import { gardenRecoveredQueryKey } from './garden-query-keys'
import {
  deriveGardenCells,
  deriveWeekClose,
  deriveWeekStrip,
  gardenFirstActivity,
  weeksToShow,
  type GardenCell,
  type WeekClose,
  type WeekStripDay,
} from './garden-model'

export { gardenRecoveredQueryKey }

async function fetchRecoveredDays(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('garden_recovered_days')
    .select('day')
    .eq('user_id', userId)
    .order('day', { ascending: false })
    .limit(60)
  if (error) throw error
  return ((data as { day: string }[] | null) ?? []).map((r) => r.day)
}

export interface GardenData {
  currentStreak: number
  longestStreak: number
  totalDaysLogged: number
  freezeTokens: number
  hasLoggedToday: boolean
  cells: GardenCell[]
  weeksShown: number
  weekClose: WeekClose
  weekCloseAvailable: boolean
  weekCloseId: string
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
 * fijo (trigger server-side) o al marcar un día sin gasto; aquí solo se LEE
 * y se deriva. Días salteados no rompen el jardín — se muestran como brote
 * tenue (la madurez depende de la antigüedad del día).
 */
export function useGarden(
  familyId: string | undefined,
  userId: string | undefined,
): { data: GardenData | null; isLoading: boolean } {
  const streak = useStreak(familyId, userId)
  const expensesQuery = useExpenses(familyId)
  const profileQuery = useMyProfile(userId)
  const recoveredQuery = useQuery<string[]>({
    queryKey: gardenRecoveredQueryKey(userId),
    enabled: Boolean(familyId && userId),
    // staleTime corto (30s = default global): el auto-bridge del cron (medianoche)
    // escribe garden_recovered_days SIN mutación cliente, así que al re-montar el
    // jardín/Home con datos rancios el refetchOnMount default (true) trae el día
    // recién recuperado en vez de mostrarlo 'missed'. El path de gasto (Case 3)
    // además invalida esta key vía syncAllAfterMutation → refresco inmediato.
    staleTime: 30_000,
    queryFn: () => fetchRecoveredDays(userId!),
  })

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
    // Semana que YA cerró (la anterior): el "cierre de semana" recapitula la
    // semana COMPLETA, no la en curso.
    const prevWeekDayIso = (i: number) =>
      isoDay(new Date(today.getTime() - (dow - i + 7) * 86_400_000), tz)

    // Ancla = primer brote DESDE tu inicio (cuándo creaste la cuenta). Back-datear
    // un gasto anterior a tu cuenta no extiende el jardín (evita "salteados" falsos).
    const created = profileQuery.data?.created_at
    const accountCreatedIso = created ? isoDay(new Date(created), tz) : null
    const sorted = [...activity].sort()
    const firstActivityIso = gardenFirstActivity(sorted, accountCreatedIso)
    const weekCloseId = prevWeekDayIso(0) // lunes de la semana cerrada = id estable
    const weekCloseAvailable =
      firstActivityIso !== null && firstActivityIso <= prevWeekDayIso(6)

    // Días recuperados (plantados con ayuda) — separados de la actividad orgánica
    // para que el grid los muestre distintos y NO cuenten para la floración.
    const recoveredIso = new Set<string>(recoveredQuery.data ?? [])

    return {
      currentStreak: streak.data.currentStreak,
      longestStreak: streak.data.longestStreak,
      totalDaysLogged: streak.data.totalDaysLogged,
      freezeTokens: streak.data.freezeTokens,
      hasLoggedToday: streak.data.hasLoggedToday,
      cells: deriveGardenCells(activity, todayIso, firstActivityIso, recoveredIso),
      weeksShown: weeksToShow(firstActivityIso, todayIso),
      weekClose: deriveWeekClose(activity, recoveredIso, prevWeekDayIso),
      weekCloseAvailable,
      weekCloseId,
      weekStrip: deriveWeekStrip(activity, recoveredIso, todayIso, weekDayIso, accountCreatedIso),
      firstActivityIso,
    }
  }, [familyId, userId, streak.data, expensesQuery.data, profileQuery.data, recoveredQuery.data])

  return {
    data,
    isLoading: streak.isLoading || expensesQuery.isLoading || recoveredQuery.isLoading,
  }
}
