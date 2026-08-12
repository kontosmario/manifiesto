import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useStreak } from '@/features/streaks/use-streak'
import { useMyProfile } from '@/features/profile/use-profile'
import { useFamily } from '@/features/family/use-family'
import { gardenRecoveredQueryKey } from './garden-query-keys'
import {
  ADELANTO_MAX,
  deriveAdelanto,
  deriveDayRings,
  type DayRing,
  type RingTone,
} from './crecimiento-model'
import {
  deriveGardenCells,
  deriveHistoryWeeks,
  deriveWeekClose,
  deriveWeekStrip,
  familyActivityWithCounts,
  gardenFirstActivity,
  isoDay,
  resolveDeviceTimezone,
  weeksToShow,
  type GardenCell,
  type HistoryDot,
  type WeekClose,
  type WeekStripDay,
} from './garden-model'

export { gardenRecoveredQueryKey }

async function fetchRecoveredDays(familyId: string): Promise<string[]> {
  // Los días recuperados son del HOGAR (unicidad family_id+day).
  const { data, error } = await supabase
    .from('garden_recovered_days')
    .select('day')
    .eq('family_id', familyId)
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
  /** Racha rota (server-authoritative + heurística) y cuándo. Los consume el
   *  hero de 6 estados vía `deriveHeroState`. */
  isBroken: boolean
  streakBrokenAt: string | null
  cells: GardenCell[]
  weeksShown: number
  weekClose: WeekClose
  weekCloseAvailable: boolean
  weekCloseId: string
  weekStrip: WeekStripDay[]
  firstActivityIso: string | null

  // ── Crecimiento (rediseño 2026-08, §3 del plan) ──────────────────────
  /** Horas que HOY le adelantaste al brote (0–24, o 48 el día en calma). */
  adelantoHoy: number
  /** `adelantoHoy / 24`, topeado en 1 — el llenado del aro grande. */
  pctHoy: number
  /** Hoy marcado como día sin gastos. Fuente: `markedDaysIso` contra el
   *  `todayIso` de este hook (ver el porqué en el cuerpo del memo). */
  marcadoHoy: boolean
  /** Timestamp de la marca de hoy, o `null` si no hay marca (o si el cache lo
   *  sembró `gastos_snapshot`, que no trae la hora). */
  marcadoHoyAt: string | null
  /** Gastos del hogar registrados hoy (fijos incluidos) y sólo los
   *  discrecionales — el segundo decide si el día puede marcarse "sin gastos". */
  registrosHoy: number
  discrecionalesHoy: number
  /** Los 7 aros de la semana vigente, L→D. */
  dayRings: DayRing[]
  /** Hasta 4 semanas ANTERIORES (más reciente primero). `null` en la primera
   *  semana del jardín: no hay historial que mostrar (matriz ②9). */
  historyWeeks: HistoryDot[][] | null
}

/**
 * Deriva el estado del jardín (grilla 7×5 + cierre de semana + los aros de
 * crecimiento) a partir del motor de rachas existente (`useStreak`) y del
 * historial de gastos (`useExpenses`). El "brote" se planta al registrar un
 * gasto variable o fijo (trigger server-side) o al marcar un día sin gasto;
 * aquí solo se LEE y se deriva. Días salteados no rompen el jardín — se
 * muestran como brote tenue (la madurez depende de la antigüedad del día).
 *
 * `now` y `tone` son OPCIONALES a propósito: hay cinco call sites que pasan
 * dos argumentos (`neo-home-screen`, `streak-week-widget`, `home-dashboard`,
 * `week-close-bridge`, `garden-screen`) y ninguno necesita ni el reloj vivo ni
 * el cupo. Sin `now` el memo se comporta EXACTAMENTE como antes (la fecha se
 * congela hasta que otra dep cambie); con él —lo pasa `useMinuteTick` desde la
 * pantalla del jardín— los aros cruzan la medianoche solos.
 *
 * ⚠️ El TONO del cupo NO se calcula acá (§3.3 del plan): montar
 * `useHomeMetrics` en este hook cargaría media Home en las 5 tabs vía
 * `WeekCloseBridge` y ni siquiera compila (`useHomeMetrics(familyId: string)`
 * no acepta el `undefined` que le pasa `streak-week-widget`). Lo calcula la
 * pantalla, que es la única que lo necesita, y lo baja por este parámetro.
 */
export function useGarden(
  familyId: string | undefined,
  userId: string | undefined,
  now?: Date,
  tone: RingTone = 'water',
): { data: GardenData | null; isLoading: boolean } {
  const streak = useStreak(familyId, userId)
  const expensesQuery = useExpenses(familyId)
  const profileQuery = useMyProfile(userId)
  const familyQuery = useFamily(userId)
  const recoveredQuery = useQuery<string[]>({
    queryKey: gardenRecoveredQueryKey(familyId),
    enabled: Boolean(familyId && userId),
    // staleTime corto (30s = default global): el auto-bridge del cron (medianoche)
    // escribe garden_recovered_days SIN mutación cliente, así que al re-montar el
    // jardín/Home con datos rancios el refetchOnMount default (true) trae el día
    // recién recuperado en vez de mostrarlo 'missed'. El path de gasto (Case 3)
    // además invalida esta key vía syncAllAfterMutation → refresco inmediato.
    staleTime: 30_000,
    queryFn: () => fetchRecoveredDays(familyId!),
  })

  // La tz del dispositivo no cambia mientras la pantalla vive; resolverla una
  // vez evita un `Intl.DateTimeFormat` por render en el camino caliente.
  const tz = useMemo(() => resolveDeviceTimezone(), [])

  const markedDaysIso = streak.data?.markedDaysIso
  const expenses = expensesQuery.data

  /**
   * Actividad + conteos por día en UNA sola pasada. Depende de los GASTOS,
   * nunca del reloj: el tick de minuto sólo mueve `horaLocal`/`todayIso`, que
   * son escalares, así que este recorrido (el único O(n) sobre el historial
   * completo del hogar) no se repite cada minuto.
   */
  const activityAndCounts = useMemo(
    () => familyActivityWithCounts(expenses ?? [], markedDaysIso ?? [], tz),
    [expenses, markedDaysIso, tz],
  )

  // `now` entra al memo por su timestamp, no por identidad: un `new Date()` de
  // default como valor de parámetro sería un objeto nuevo por render y haría
  // recomputar TODO en cada render de los cinco call sites que no lo pasan.
  const nowMs = now?.getTime() ?? null

  const data = useMemo<GardenData | null>(() => {
    if (!familyId || !userId || !streak.data) return null
    const today = nowMs === null ? new Date() : new Date(nowMs)
    const todayIso = isoDay(today, tz)
    const { activity, counts } = activityAndCounts

    // Lunes de la semana actual (getDay: 0=Dom..6=Sáb → Monday0).
    const dow = (today.getDay() + 6) % 7
    // El desplazamiento de días se ancla al MEDIODÍA local (mismo criterio que
    // el sheet de historial de la pantalla): restar múltiplos exactos de 24 h
    // desde la hora real corre la fecha un día entero durante la madrugada del
    // cambio de horario de verano (el día local dura 23 h), y ahí la fila de 7
    // aros, la tira de Home y el id del cierre apuntaban al día equivocado.
    const noon = new Date(today)
    noon.setHours(12, 0, 0, 0)
    const weekDayIso = (i: number) =>
      isoDay(new Date(noon.getTime() - (dow - i) * 86_400_000), tz)
    // Semana que YA cerró (la anterior): el "cierre de semana" recapitula la
    // semana COMPLETA, no la en curso.
    const prevWeekDayIso = (i: number) =>
      isoDay(new Date(noon.getTime() - (dow - i + 7) * 86_400_000), tz)

    // Ancla = primer brote DESDE que nació el HOGAR (families.created_at).
    // Back-datear un gasto anterior no extiende el jardín (evita "salteados"
    // falsos). Fallback al created_at del perfil si la familia aún no cargó.
    const created = familyQuery.data?.createdAt ?? profileQuery.data?.created_at
    const accountCreatedIso = created ? isoDay(new Date(created), tz) : null
    const sorted = [...activity].sort()
    const firstActivityIso = gardenFirstActivity(sorted, accountCreatedIso)
    const weekCloseId = prevWeekDayIso(0) // lunes de la semana cerrada = id estable
    const weekCloseAvailable =
      firstActivityIso !== null && firstActivityIso <= prevWeekDayIso(6)

    // Días recuperados (plantados con ayuda) — separados de la actividad orgánica
    // para que el grid los muestre distintos y NO cuenten para la floración.
    const recoveredIso = new Set<string>(recoveredQuery.data ?? [])
    const weeksShown = weeksToShow(firstActivityIso, todayIso)

    // ── Crecimiento del día (§3.2/§3.3) ────────────────────────────────
    const registrosHoy = counts.todos.get(todayIso) ?? 0
    const discrecionalesHoy = counts.discrecionales.get(todayIso) ?? 0
    // El día marcado se lee de `markedDaysIso` contra el `todayIso` de ESTE
    // memo, no del `hasMarkedNoExpenseToday` de `useStreak`: ese flag se
    // computa con un `new Date()` dentro de un memo que NO depende del reloj
    // (`use-streak.ts`), así que al cruzar la medianoche con la app abierta
    // (matriz ②7) sigue apuntando al día de AYER — y el hero diría "brote
    // plantado" con el aro del día nuevo en 0%. Misma fuente que
    // `deriveDayRings` ⇒ el aro, el chip, la píldora y la acción secundaria no
    // pueden contradecirse.
    const marcadoHoy = streak.data.markedDaysIso.includes(todayIso)
    const adelantoHoy = deriveAdelanto({
      registros: registrosHoy,
      marcadoSinGastos: marcadoHoy,
      discrecionales: discrecionalesHoy,
    })
    // Hora local FRACCIONARIA en la tz del corte de día: la misma que usa
    // `isoDay` (tz del dispositivo), así que el reloj del device sirve.
    const horaLocal = today.getHours() + today.getMinutes() / 60

    const historyWeeks =
      weeksShown <= 1
        ? null
        : deriveHistoryWeeks({
            todayIso,
            weeksShown,
            activityIso: activity,
            markedDaysIso: new Set(streak.data.markedDaysIso),
            discrecionalesPorDia: counts.discrecionales,
            recoveredIso,
            // El "sin culpa" del historial se ancla al PRIMER BROTE, igual que
            // el estado 'pre' de deriveGardenCells — no al alta de la cuenta.
            startIso: firstActivityIso,
          })

    return {
      currentStreak: streak.data.currentStreak,
      longestStreak: streak.data.longestStreak,
      totalDaysLogged: streak.data.totalDaysLogged,
      freezeTokens: streak.data.freezeTokens,
      hasLoggedToday: streak.data.hasLoggedToday,
      isBroken: streak.data.isBroken,
      streakBrokenAt: streak.data.streakBrokenAt,
      cells: deriveGardenCells(activity, todayIso, firstActivityIso, recoveredIso),
      weeksShown,
      weekClose: deriveWeekClose(activity, recoveredIso, prevWeekDayIso, {
        // La guarda del tramo `cortada` (T10): una semana de score ≤1 cuya
        // única actividad fue el domingo deja la racha cruzando VIVA al lunes.
        streakAlive: !streak.data.isBroken && streak.data.currentStreak > 0,
        // Las dos fuentes del día EN CALMA: `activity` funde marcas y gastos,
        // así que sin esto un día marcado sería indistinguible de uno con
        // compras (y la línea "N días en calma" no tendría de dónde salir).
        markedDaysIso: streak.data.markedDaysIso,
        discrecionalesPorDia: counts.discrecionales,
      }),
      weekCloseAvailable,
      weekCloseId,
      weekStrip: deriveWeekStrip(activity, recoveredIso, todayIso, weekDayIso, accountCreatedIso),
      firstActivityIso,
      adelantoHoy,
      pctHoy: Math.min(1, adelantoHoy / ADELANTO_MAX),
      marcadoHoy,
      marcadoHoyAt: streak.data.markedDayTimes.get(todayIso) ?? null,
      registrosHoy,
      discrecionalesHoy,
      dayRings: deriveDayRings({
        counts,
        markedDaysIso: streak.data.markedDaysIso,
        recoveredIso,
        todayIso,
        horaLocal,
        tone,
        // §3.6: el ancla del "sin culpa" es el PRIMER BROTE. Cuando todavía no
        // hay ninguno (cuenta recién creada, el caso ④5/②9) `firstActivityIso`
        // es `null` y sin ancla los días de esta semana anteriores a la alta
        // saldrían 'missed' —brotes marchitos por días en los que el usuario ni
        // tenía la app—, justo lo que §3.5b prohíbe. Ahí cae al alta de la
        // cuenta, el mismo ancla que ya usa la tira de Home (`deriveWeekStrip`),
        // así que las dos superficies cuentan la misma semana igual. Con
        // actividad manda `firstActivityIso`, que es el más indulgente de los
        // dos y es el que fija §3.6.
        startIso: firstActivityIso ?? (activity.size === 0 ? accountCreatedIso : null),
        weekDayIso,
      }),
      historyWeeks,
    }
  }, [
    familyId,
    userId,
    streak.data,
    activityAndCounts,
    profileQuery.data,
    familyQuery.data,
    recoveredQuery.data,
    nowMs,
    tone,
    tz,
  ])

  return {
    data,
    isLoading: streak.isLoading || expensesQuery.isLoading || recoveredQuery.isLoading,
  }
}
