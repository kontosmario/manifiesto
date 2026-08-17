// mobile/screens/garden/garden-screen.tsx
//
// MI JARDÍN — la pantalla COMPUESTA con el kit del rediseño
// (`components/redesign/jardin/jardin-screen.tsx`, aprobado bajo gate) y los
// datos reales del hogar. Task 9 del plan
// `docs/superpowers/plans/2026-08-11-jardin-rediseno-integracion.md`.
//
// Patrón del repo (el mismo de `neo-gastos-screen`): la pantalla NO monta la
// `JardinFinalScreen` auto-conducida del kit — compone sus sub-componentes
// exportados llenando los VMs del §5 con lo que derivan los hooks. El render
// es idéntico al que aprobó el owner; lo único que cambia es de dónde salen
// los números.
//
// ─────────────────────────────────────────────────────────────────────
// DECISIONES DE ESTE ARCHIVO
// ─────────────────────────────────────────────────────────────────────
//
//  · §3.5 — LA GRILLA DEL MES SE RETIRA. `GardenGrid` (35 celdas) y
//    `GardenHero` (stats) salen de la pantalla: el handoff los reemplaza por
//    la fila de 7 aros + el historial de semanas. Así desaparece la
//    posibilidad de que el aro (etapa por HORAS) y la grilla (etapa por días)
//    se contradigan en la misma pantalla, y el jardín deja de renderizar 35
//    canvas de Skia. `deriveGardenCells` sigue viva (otros consumidores); esta
//    pantalla ya no la mira.
//
//  · `plantedToday := pctHoy > 0 || marcadoHoy` — la fuente OPTIMISTA, la
//    misma que mueve el aro (el insert prepende al cache). NUNCA
//    `hasLoggedToday`, que viene de `family_streaks.last_logged_date` y llega
//    un beat tarde: el hero se quedaría en "planta para sumar" con el aro ya
//    al 25%.
//
//  · TONO DEL CUPO (§3.3): se calcula ACÁ y se baja a `useGarden`. Meterlo en
//    el hook cargaría media Home en las 5 tabs vía `WeekCloseBridge`. El
//    predicado es el equivalente de `deriveGaugeState` sobre los campos que
//    `HomeHeroMetrics` ya expone (`spentToday > openingDailyBudget`), porque
//    `deriveGaugeState` pide `budgetDays`, que sólo trae `useFamilyDashboard`.
//    Sin ingreso configurado el tono es celeste y la pantalla no menciona el
//    cupo. Precedente de montar `useHomeMetrics` fuera de Home:
//    `add-gasto-v2-screen.tsx:137`.
//
//  · El día en calma se marca DESDE ACÁ (D4): es la pantalla del hábito. El
//    camino es el mismo del FAB — `useMarkNoExpenseDay`, y si el server
//    rechaza con `EXPENSES_EXIST_ON_DATE` se abre el `NoSpendConfirmSheet`
//    existente y se reintenta con `force: true`.
//
//  · La `SemanaPasadaCard` abre el CIERRE nuevo (`WeekCloseCierre`, la
//    `CierreSemanaView` del kit con el VM real) — el mismo componente que
//    auto-dispara el `WeekCloseBridge`, para que las dos puertas muestren
//    exactamente lo mismo. La variante y la guarda de racha viva ya vienen
//    resueltas del modelo (`weekClose.variant`, T10).
//
//  · El dot de "sin ver" sale de `useWeekCloseSeen`: el bridge marca "shown"
//    al auto-disparar y el "seen" se escribe recién al CERRAR el cierre (desde
//    acá o desde el bridge). `seen === null` es "todavía leyendo" y NO prende
//    el dot: aparecer y apagarse un frame después es peor que tardar un frame.
//
//  · LOGROS (T11 Step 3): el stack de la card son tres discos — las DOS
//    últimas medallas ganadas (por `earned_at` desc, con la regla D3 de
//    `medalForCode`) + el hueco de lo que falta; con la colección completa no
//    hay hueco y entran las tres últimas. El "próximo:" sale del MISMO
//    `splitLogros` que la galería, con las mismas fuentes de progreso
//    (`currentStreak` + `home_snapshot.no_spend_days_this_cycle`), para que las
//    dos pantallas no propongan hitos distintos. El dot ④2 lo decide
//    `useAchievementsSeen` (conteo visto vs `earnedCount`) y se apaga al tocar
//    la card — y también al entrar a la galería desde Ajustes.
//
//  · i18n (T12): el kit es `@i18n-ignore-file` y guarda el copy del handoff
//    como DEFAULT de cada prop; esta pantalla le pasa el copy traducido. Lo
//    que no tiene visual —a11y del back, del "×" de la nota, del scrim del
//    sheet— también viaja por prop, y el tono del cupo (color puro) baja como
//    texto en el a11y del aro grande.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Screen } from '@/components/ui/screen'
import { RiseView } from '@/components/home/animated/rise-view'
import { NoSpendConfirmSheet } from '@/components/gastos/no-spend-confirm-sheet'
import { WeekCloseCierre } from '@/components/garden/week-close-cierre'
import {
  CrecimientoCard,
  HistorialSheet,
  JardinHeader,
  JardinHero,
  JardinSkeleton,
  LogrosAccessCard,
  NotaEducativa,
  SemanaPasadaCard,
  type CrecimientoVM,
  type DayRingVM,
  type HeroVM,
  type HistorialWeekVM,
  type JardinMode,
  type LogrosAccessVM,
  type SemanaPasadaVM,
} from '@/components/redesign/jardin/jardin-screen'
import type { BrotPose } from '@/components/brot'
import {
  medalForCode,
  splitLogros,
  type MedalVM,
} from '@/features/achievements/achievement-progress'
import { achievementTitle } from '@/features/achievements/achievement-tiers'
import { useAchievements } from '@/features/achievements/use-achievements'
import { useAchievementsSeen } from '@/features/achievements/use-achievements-seen'
import { useCategories, type Category } from '@/features/categories/use-categories'
import { useExpenses, type Expense } from '@/features/expenses/use-expenses'
import { useHomeMetrics } from '@/features/home/use-home-metrics'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import {
  ADELANTO_MAX,
  AGUA_POR_REGISTRO,
  deriveHeroState,
  type DayRing,
  type HeroState,
  type RingTone,
} from '@/features/garden/crecimiento-model'
import { isoDay, resolveDeviceTimezone } from '@/features/garden/garden-model'
import { useGarden } from '@/features/garden/use-garden'
import { useWeekCloseSeen } from '@/features/garden/use-week-close-seen'
import { useMarkNoExpenseDay } from '@/features/streaks/use-streak'
import { useMinuteTick } from '@/hooks/use-minute-tick'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { confetti } from '@/lib/confetti-bus'
import { triggerHaptic } from '@/lib/haptics'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import { toast } from '@/lib/toast-bus'
import { formatDayMonthShort, monthShort, weekdayLong } from '@/utils/date-format'
import { getErrorMessage } from '@/utils/error-message'
import { useThemeMode } from '@/theme/theme-provider'
import { neoTokens } from '@/theme/neo-tokens'

interface GardenScreenProps {
  familyId: string
  userId: string
}

/** 4 registros llenan el aro (24 h de adelanto, 6 h cada uno) — §3.3. */
const REGISTROS_META = Math.round(ADELANTO_MAX / AGUA_POR_REGISTRO)
/** Entrada de cards: stagger 60ms + rise 12px (matriz ⑥5). */
const CARD_STAGGER_MS = 60
const CARD_RISE = 12
/** Crossfade del hero al cambiar de estado (matriz ①7). */
const HERO_SWAP_MS = 200
/** Nota educativa: fade + collapse al descartarla (matriz ⑤2). */
const NOTE_DISMISS_MS = 250
/** La nota acompaña sólo al principio: a la tercera semana ya sabés cómo va. */
const NOTE_MAX_WEEKS = 2
/** Cuántas semanas del historial entran en la fila resumen de la card. */
const HISTORY_SUMMARY_ROWS = 2
const MS_DIA = 86_400_000

const noteDismissedKey = (userId: string) => `garden_note_dismissed_${userId}`

/** Pose del día en la fila de 7 — tabla del §5, única fuente. `today` copia la
 *  del foco; el resto es fijo. */
function poseForDayRing(ring: DayRing, focusPose: BrotPose): BrotPose | null {
  switch (ring.state) {
    case 'future':
    case 'pre':
      return null
    case 'today':
      return focusPose
    case 'missed':
      return 'wilted'
    case 'calma':
      return 'zen'
    case 'recovered':
      return 'seed'
    default:
      return 'idle'
  }
}

/** Chip del hero (README:30 lo sacó del render; alimenta el a11y label). */
function heroChipKind(kind: HeroState): HeroVM['chip']['kind'] {
  if (kind === 'cortada') return 'lost'
  if (kind === 'enRiesgo') return 'risk'
  if (kind === 'empezar') return 'neutral'
  return 'ok'
}

/** `hh:mm` sin `Intl`: el mismo formato en cualquier locale y sin depender de
 *  la config regional del device (esto es una HORA, no una fecha). */
function clockLabel(date: Date): string {
  const h = date.getHours()
  const m = date.getMinutes()
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`
}

/**
 * Pantalla "Mi jardín" — vista dedicada de la racha (accesible desde Gastos).
 * De solo lectura salvo el "día sin gastos": el brote se planta al registrar un
 * gasto o pago de fijo (trigger server-side) o al marcar el día. Si faltás un
 * día y tienes un escudo, el motor lo recupera SOLO (consume el escudo y planta
 * un brote "recuperado" que no florece) — sin acción manual. Ver el trigger
 * `_advance_streak_internal` (Case 3) y el cron `cron_emit_streak_broken`.
 */
export function GardenScreen({ familyId, userId }: GardenScreenProps) {
  const mode = useThemeMode().resolvedMode as JardinMode
  const neo = neoTokens(mode)
  const { t } = useTranslation()
  const router = useRouter()
  const reduceMotion = useReducedMotion()

  // Reloj vivo: la etapa del brote se mide en horas y el día tiene que rotar
  // solo a la medianoche con la app abierta (matriz ②7).
  const now = useMinuteTick()
  const tz = useMemo(() => resolveDeviceTimezone(), [])
  const todayIso = isoDay(now, tz)

  const homeMetrics = useHomeMetrics(familyId)
  const tone = useMemo<RingTone>(() => {
    const hero = homeMetrics.hero
    // Sin ingreso configurado (o sin cupo de apertura) no hay referencia
    // contra la cual medir: celeste neutro y ni una palabra sobre el cupo.
    if (!hero.incomeConfigured) return 'water'
    if (!Number.isFinite(hero.openingDailyBudget) || hero.openingDailyBudget <= 0) {
      return 'water'
    }
    // El día EN CURSO nunca va en verde, aunque estés holgado dentro del cupo:
    // `ringGreen` es el color del día COMPLETO (y el relleno de todo día pasado
    // plantado), así que un hoy verde se leía como un día ya terminado y la
    // leyenda —que declara celeste para "crecimiento de hoy"— quedaba
    // contradiciendo a la pantalla. Reportado por el owner en device
    // (2026-08-17).
    //
    // El ámbar SÍ se conserva: no es "el color de hoy", es una ADVERTENCIA de
    // que te pasaste del cupo, y esa señal no la cubre ningún otro elemento.
    return hero.spentToday > hero.openingDailyBudget ? 'amber' : 'water'
  }, [homeMetrics.hero])

  const { data } = useGarden(familyId, userId, now, tone)
  const achievements = useAchievements(userId)
  const { seen: weekCloseSeen, markSeen: markWeekCloseSeen } = useWeekCloseSeen(
    userId,
    data?.weekCloseId,
  )
  // ④2 — el dot de "logros nuevos sin ver". El conteo llega `null` mientras el
  // catálogo carga, y con `null` el hook no afirma nada (ni prende ni apaga).
  //
  // ⚠️ `isLoading` NO es decorativo: `useAchievements` publica el resumen en
  // cuanto llega el CATÁLOGO, con `earnedCount: 0`, aunque la query de `earned`
  // siga viajando (`use-achievements.ts`: el `if (!catalog)` es el único gate).
  // Sin este gate, `useAchievementsSeen` ancla —o "sanea hacia abajo"— contra
  // ese 0 transitorio y PISA en AsyncStorage el conteo real que el usuario ya
  // había visto; cuando los earned llegan, la resta da todos los logros de la
  // cuenta y el dot se prende anunciando como nuevos hitos de hace meses. Es
  // justo el estreno que el docblock del hook dice que hay que evitar.
  // `error` entra por lo mismo: con la query de earned caída (offline) el
  // resumen también dice 0 y `isLoading` ya es false.
  const settledEarnedCount =
    achievements.isLoading || achievements.error
      ? null
      : (achievements.data?.earnedCount ?? null)
  const { unseenCount: logrosUnseen, markSeen: markLogrosSeen } = useAchievementsSeen(
    userId,
    settledEarnedCount,
  )

  // Días en calma del CICLO — la misma fuente cycle-scoped que usa la galería
  // (`home_snapshot.no_spend_days_this_cycle`), para que el "próximo:" de la
  // card y el de la pantalla de Logros no propongan hitos distintos. El campo
  // es opcional por back-compat: `?.length ?? null`, NUNCA `?? 0` (con 0 se
  // derivarían barras "0 de 15" falsas y cambiaría el nudge elegido).
  const homeSnapshot = useHomeSnapshot(userId)
  const cycleNoSpendCount = homeSnapshot.data?.no_spend_days_this_cycle?.length ?? null

  const [showWeekClose, setShowWeekClose] = useState(false)
  const [showHistorial, setShowHistorial] = useState(false)
  // `null` = todavía no sabemos (leyendo el flag). No se dibuja la nota hasta
  // saberlo: aparecer y desaparecer sola es peor que tardar un frame.
  const [noteDismissed, setNoteDismissed] = useState<boolean | null>(null)
  const [confirmSheetVisible, setConfirmSheetVisible] = useState(false)

  useEffect(() => {
    let alive = true
    void getPersistentValue(noteDismissedKey(userId)).then((value) => {
      if (alive) setNoteDismissed(value === '1')
    })
    return () => {
      alive = false
    }
  }, [userId])

  // ── Día sin gastos (D4) ────────────────────────────────────────────
  const markNoExpenseMutation = useMarkNoExpenseDay(familyId, userId)
  // `useMutation` de RQ v5 devuelve un OBJETO NUEVO en cada render. Con él en
  // las deps, `doMark` → `handleMarkNoSpend` → `crecimientoVm` se recreaban
  // siempre y el `useMemo` del VM no memoizaba nada: cada render rearmaba los 7
  // aros + el foco y volvía a montar `CrecimientoCard` (7 Brots de Skia). Leída
  // por ref queda estable — mismo patrón que el "FIX B" de `neo-gastos-screen`.
  const markNoExpenseMutationRef = useRef(markNoExpenseMutation)
  markNoExpenseMutationRef.current = markNoExpenseMutation
  const expensesQuery = useExpenses(familyId)
  const categoriesQuery = useCategories(familyId)

  // Los gastos PROPIOS de hoy alimentan la hoja de confirmación (el usuario
  // verifica qué registró antes de forzar la marca), igual que en el FAB.
  const expensesTodayOwn = useMemo((): Expense[] => {
    const mine: Expense[] = []
    for (const e of expensesQuery.data ?? []) {
      if (e.created_by !== userId) continue
      if (isoDay(new Date(e.created_at), tz) !== todayIso) continue
      mine.push(e)
    }
    return mine
  }, [expensesQuery.data, userId, tz, todayIso])

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>()
    for (const c of categoriesQuery.data ?? []) map.set(c.id, c)
    return map
  }, [categoriesQuery.data])

  const doMark = useCallback(
    (options?: { force?: boolean }) => {
      markNoExpenseMutationRef.current.mutate(options?.force ? { force: true } : undefined, {
        onSuccess: () => {
          void triggerHaptic('success')
          confetti.celebrate({ durationMs: 2000, origin: 'top' })
          toast.success(t('gastos:noSpend.markedSuccess'))
          setConfirmSheetVisible(false)
        },
        onError: (error: unknown) => {
          // `getErrorMessage` y NO `error instanceof Error`: PostgREST devuelve
          // el rechazo del RPC como OBJETO PLANO (`{ message, details, hint,
          // code }` — ver el `then` de postgrest-js, que sólo construye un
          // `PostgrestError` con `throwOnError`), así que `instanceof Error` da
          // false SIEMPRE y el texto del server no se leía nunca: las dos ramas
          // de abajo eran inalcanzables y el camino de confirmación + `force`
          // —la razón de ser del `NoSpendConfirmSheet` de esta pantalla— estaba
          // muerto. El fallback vacío deja que el `else` ponga el copy genérico.
          const message = getErrorMessage(error, '')
          // El guard del server excluye pagos de fijos, así que este rechazo
          // significa que hay gastos DISCRECIONALES que el cliente no vio
          // (otro miembro, o un corte de día distinto al del hogar). No es un
          // error: es el camino de confirmación + retry con `force`.
          if (message.includes('EXPENSES_EXIST_ON_DATE')) {
            void triggerHaptic('warning')
            setConfirmSheetVisible(true)
            return
          }
          void triggerHaptic('error')
          toast.error(
            message.includes('FUTURE_DATE_NOT_ALLOWED')
              ? t('gastos:noSpend.futureDate')
              : t('gastos:noSpend.markFailed'),
          )
        },
      })
    },
    // La mutación viaja por ref (arriba): identidad ESTABLE.
    [t],
  )

  const handleBack = useCallback(() => {
    void triggerHaptic('selection')
    router.back()
  }, [router])

  const handleAddExpense = useCallback(() => {
    void triggerHaptic('light')
    router.push('/(app)/add-expense')
  }, [router])

  const handleMarkNoSpend = useCallback(() => {
    void triggerHaptic('light')
    doMark()
  }, [doMark])

  const handleOpenWeekClose = useCallback(() => {
    void triggerHaptic('selection')
    setShowWeekClose(true)
  }, [])

  // Cerrar el cierre ES verlo: recién ahí se apaga el dot (el auto-disparo del
  // bridge escribe otra marca, la de "shown").
  const handleCloseWeekClose = useCallback(() => {
    markWeekCloseSeen()
    setShowWeekClose(false)
  }, [markWeekCloseSeen])

  const handleOpenHistorial = useCallback(() => {
    void triggerHaptic('selection')
    setShowHistorial(true)
  }, [])

  // Ir a la galería ES ver los logros nuevos: el dot se apaga al tocar, no al
  // volver (si el usuario cierra la app en la galería, ya los vio igual).
  const handleOpenLogros = useCallback(() => {
    void triggerHaptic('selection')
    markLogrosSeen()
    router.push('/(app)/settings/achievements')
  }, [markLogrosSeen, router])

  const handleDismissNote = useCallback(() => {
    void triggerHaptic('selection')
    setNoteDismissed(true)
    void setPersistentValue(noteDismissedKey(userId), '1')
  }, [userId])

  // ── VMs ────────────────────────────────────────────────────────────

  const plantedToday = data !== null && (data.pctHoy > 0 || data.marcadoHoy)
  const todayRing = data?.dayRings.find((r) => r.isToday) ?? null
  // La semana florece con los 7 días plantados; los futuros no son 'planted',
  // así que esto sólo puede darse el domingo (igual que el segundo pase de
  // `deriveGardenCells`).
  const semanaFlorecida =
    data !== null &&
    data.dayRings.every(
      (r) => r.state === 'planted' || r.state === 'calma' || (r.isToday && plantedToday),
    )

  const focusPose = useMemo<BrotPose>(() => {
    if (semanaFlorecida) return 'radiant'
    if (todayRing?.noSpend) return 'zen'
    const registros = data?.registrosHoy ?? 0
    if (registros >= REGISTROS_META) return 'love'
    if (registros > 0) return 'sprout'
    return 'seed'
  }, [semanaFlorecida, todayRing?.noSpend, data?.registrosHoy])

  const heroVm = useMemo<HeroVM | null>(() => {
    if (!data) return null
    const kind = deriveHeroState({
      currentStreak: data.currentStreak,
      isBroken: data.isBroken,
      streakBrokenAt: data.streakBrokenAt,
      plantedToday,
      hourLocal: now.getHours(),
      todayIso,
    })
    const vars = {
      day: `${weekdayLong(now)} ${now.getDate()}`.toUpperCase(),
      time: clockLabel(now),
      streak: data.currentStreak,
      record: data.longestStreak,
      count: data.currentStreak,
    }
    const base = {
      kind,
      label: t(`garden:hero2.${kind}.label`, vars),
      title: t(`garden:hero2.${kind}.title`, vars),
      sub: t(`garden:hero2.${kind}.sub`, vars),
      chip: { text: t(`garden:hero2.${kind}.chip`, vars), kind: heroChipKind(kind) },
    }
    // Poses y densidad de partículas: tabla del handoff (2a–2f). Los estados
    // sin nada que celebrar van sin campo de partículas.
    switch (kind) {
      case 'empezar':
        return {
          ...base,
          brotPose: 'seed',
          particleCount: 0,
          cta: { text: t('garden:hero2.empezar.cta'), tone: 'green', onPress: handleAddExpense },
        }
      case 'aTiempo':
        return {
          ...base,
          brotPose: 'wave',
          particleCount: 8,
          cta: { text: t('garden:hero2.aTiempo.cta'), tone: 'green', onPress: handleAddExpense },
        }
      case 'plantado':
        return {
          ...base,
          brotPose: todayRing?.noSpend ? 'zen' : 'love',
          particleCount: 10,
          pill: t('garden:hero2.plantado.pill', vars),
        }
      case 'floreciendo':
        return {
          ...base,
          brotPose: 'radiant',
          particleCount: 12,
          pill: t('garden:hero2.floreciendo.pill', vars),
        }
      case 'enRiesgo':
        return {
          ...base,
          brotPose: 'worried',
          particleCount: 0,
          cta: { text: t('garden:hero2.enRiesgo.cta'), tone: 'amber', onPress: handleAddExpense },
        }
      default:
        return {
          ...base,
          brotPose: 'sad',
          particleCount: 0,
          cta: { text: t('garden:hero2.cortada.cta'), tone: 'green', onPress: handleAddExpense },
        }
    }
  }, [data, plantedToday, now, todayIso, todayRing?.noSpend, t, handleAddExpense])

  const crecimientoVm = useMemo<CrecimientoVM | null>(() => {
    if (!data || !todayRing) return null
    const days: DayRingVM[] = data.dayRings.map((ring) => ({
      letter: ring.letter,
      state: ring.state,
      pct: ring.pct,
      tone: ring.tone,
      noSpend: ring.noSpend,
      stage: ring.stage,
      brotPose: poseForDayRing(ring, focusPose),
      brotSize: ring.brotSize,
    }))

    // Chip del aro grande (§3.4). El día en calma anuncia su hora cuando la
    // tenemos: el cache sembrado por `gastos_snapshot` sólo trae fechas.
    let chipDot: 'sand' | 'water' | 'green'
    let chipText: string
    if (todayRing.noSpend) {
      chipDot = 'green'
      const at = data.marcadoHoyAt ? new Date(data.marcadoHoyAt) : null
      chipText =
        at && Number.isFinite(at.getTime())
          ? t('garden:crecimiento.chipCalmaAt', { time: clockLabel(at) })
          : t('garden:crecimiento.chipCalma')
    } else if (data.registrosHoy >= REGISTROS_META) {
      chipDot = 'green'
      chipText = t('garden:crecimiento.chipCompleto')
    } else if (data.registrosHoy > 0) {
      chipDot = 'water'
      chipText = t('garden:crecimiento.chipPartial', {
        done: data.registrosHoy,
        target: REGISTROS_META,
      })
    } else {
      chipDot = 'sand'
      chipText = t('garden:crecimiento.chipEmpty')
    }

    return {
      focus: {
        letter: todayRing.letter,
        state: todayRing.state,
        pct: todayRing.pct,
        tone: todayRing.tone,
        noSpend: todayRing.noSpend,
        stage: todayRing.stage,
        brotPose: focusPose,
        chipDot,
        chipText,
      },
      days,
      footer: plantedToday
        ? { kind: 'pill', text: t('garden:crecimiento.footerPill') }
        : {
            kind: 'cta',
            text: t('garden:crecimiento.footerCta'),
            onPress: handleAddExpense,
          },
      // El día ya marcado no se ofrece de nuevo, y un día con gastos
      // discrecionales no es un día "sin gastos" (§3.6): el server lo
      // rechazaría y ofrecerlo sería prometer algo que no pasa.
      secondary:
        data.marcadoHoy || data.discrecionalesHoy > 0
          ? undefined
          : { text: t('garden:crecimiento.secondary'), onPress: handleMarkNoSpend },
      history: data.historyWeeks
        ? {
            rows: data.historyWeeks.slice(0, HISTORY_SUMMARY_ROWS),
            onOpen: handleOpenHistorial,
          }
        : null,
    }
  }, [
    data,
    todayRing,
    focusPose,
    plantedToday,
    t,
    handleAddExpense,
    handleMarkNoSpend,
    handleOpenHistorial,
  ])

  /** Leyenda de la card (los tres puntos de color, [OWNER-6]). */
  const legendCopy = useMemo(
    () => ({
      completo: t('garden:crecimiento.legendCompleto'),
      hoy: t('garden:crecimiento.legendHoy'),
      calma: t('garden:crecimiento.legendCalma'),
    }),
    [t],
  )

  /**
   * a11y del aro grande: el chip + el TONO del cupo en palabras. El tono es
   * color puro (verde dentro / ámbar pasado / celeste sin datos, §3.3), así que
   * sin este texto el estado no existe para quien no distingue los dos verdes.
   * Sin ingreso configurado no se menciona el cupo — no hay contra qué medir.
   */
  const focusA11yLabel = useMemo<string | undefined>(() => {
    const chipText = crecimientoVm?.focus.chipText
    if (chipText === undefined) return undefined
    // El estado del cupo se dice SIEMPRE que haya cupo contra el cual medir, y
    // se calcula acá y no a partir de `tone`: desde que el día en curso pinta
    // celeste (ver el memo de `tone`), atarlo al color se habría comido la
    // línea "Dentro de tu cupo de hoy" justo en el caso feliz — y para quien
    // no ve el aro, este texto ES el estado.
    const hero = homeMetrics.hero
    const hayCupo =
      hero.incomeConfigured &&
      Number.isFinite(hero.openingDailyBudget) &&
      hero.openingDailyBudget > 0
    if (!hayCupo) return chipText
    return `${chipText}. ${t(
      hero.spentToday > hero.openingDailyBudget
        ? 'garden:crecimiento.toneAmber'
        : 'garden:crecimiento.toneGreen',
    )}`
  }, [crecimientoVm?.focus.chipText, homeMetrics.hero, t])

  const semanaVm = useMemo<SemanaPasadaVM | null>(() => {
    // Sin semana cerrada (la PRIMERA semana del jardín) la card no existe:
    // no hay nada que recapitular todavía (matriz ③6).
    if (!data || !data.weekCloseAvailable) return null
    const { score, variant } = data.weekClose
    return {
      variant,
      title: t(`garden:semanaPasada.${variant}.title`),
      sub: t(`garden:semanaPasada.${variant}.sub`, { score }),
      // `null` = todavía leyendo el flag: sólo el `false` explícito prende.
      unseenDot: weekCloseSeen === false,
      onOpenCierre: handleOpenWeekClose,
    }
  }, [data, weekCloseSeen, t, handleOpenWeekClose])

  const logrosVm = useMemo<LogrosAccessVM | null>(() => {
    const summary = achievements.data
    if (!summary) return null

    // El stack del handoff son SIEMPRE tres discos. Con algo por desbloquear
    // se ven las dos últimas medallas ganadas + el hueco de lo que falta; con
    // la colección completa (④4) no hay hueco que mostrar y entran las tres
    // últimas. Un usuario nuevo (④5) queda con tres pozos vacíos, que es
    // exactamente lo que dice su colección.
    const earned = summary.items
      .filter((item) => item.earned)
      .sort((a, b) => (b.earned_at ?? '').localeCompare(a.earned_at ?? ''))
    const complete = summary.totalCount > 0 && summary.earnedCount >= summary.totalCount
    const medals: MedalVM[] = earned
      .slice(0, complete ? 3 : 2)
      .map((item) => medalForCode(item.code, true))
    while (medals.length < 3) medals.push({ kind: 'locked' })

    const split = splitLogros(summary.items, {
      currentStreak: data?.currentStreak ?? null,
      cycleNoSpendCount,
    })
    const next = split.nudgeCode ? achievementTitle(split.nudgeCode) : ''
    const counts = { earned: summary.earnedCount, total: summary.totalCount }
    return {
      medals,
      // "Colección completa" se ancla en `earned === total` y NO en la ausencia
      // de nudge: cuando lo único que queda son los dos secretos tampoco hay
      // nudge (anunciarlos los dejaría de hacer secretos) y decir "completa"
      // ahí sería mentir. Ese caso cae al conteo pelado.
      countText: complete
        ? t('garden:logrosAccess.countComplete', counts)
        : next
          ? t('garden:logrosAccess.countNext', { ...counts, next })
          : t('garden:logrosAccess.count', counts),
      // `null` = todavía leyendo el flag: igual que el dot del cierre, sólo un
      // número positivo lo prende.
      unseenDot: (logrosUnseen ?? 0) > 0,
      onPress: handleOpenLogros,
    }
  }, [
    achievements.data,
    data?.currentStreak,
    cycleNoSpendCount,
    logrosUnseen,
    t,
    handleOpenLogros,
  ])

  // Semanas del sheet: los mismos dots del resumen + su rango y su chip. El
  // lunes se calcula al MEDIODÍA para que un cambio de horario de verano no
  // corra la fecha un día.
  const historyWeeks = data?.historyWeeks ?? null
  const historialWeeks = useMemo<HistorialWeekVM[]>(() => {
    if (!historyWeeks) return []
    const dow = (now.getDay() + 6) % 7
    const noon = new Date(now)
    noon.setHours(12, 0, 0, 0)
    return historyWeeks.map((dots, index) => {
      const monday = new Date(noon.getTime() - (dow + (index + 1) * 7) * MS_DIA)
      const sunday = new Date(monday.getTime() + 6 * MS_DIA)
      const range =
        monday.getMonth() === sunday.getMonth()
          ? `${monday.getDate()} – ${formatDayMonthShort(sunday)}`
          : `${formatDayMonthShort(monday)} – ${formatDayMonthShort(sunday)}`
      // El score cuenta días ORGÁNICOS (plantados + en calma): el escudo salva
      // la racha, no fabrica una floración.
      const score = dots.filter((dot) => dot === 'full' || dot === 'calma').length
      return {
        range,
        dots,
        chip:
          score >= 7
            ? { text: t('garden:historial.flowered'), tone: 'ok' as const }
            : { text: t('garden:historial.score', { score }), tone: 'neutral' as const },
      }
    })
  }, [historyWeeks, now, t])

  const showNote =
    data !== null && noteDismissed === false && data.weeksShown <= NOTE_MAX_WEEKS

  return (
    <>
      <Screen backgroundColor={neo.bg} contentContainerStyle={styles.content}>
        <JardinHeader
          mode={mode}
          title={t('garden:screen.title')}
          sub={t('garden:screen.subtitle')}
          backLabel={t('common:actions.back')}
          onBack={handleBack}
        />

        {!data || !heroVm || !crecimientoVm ? (
          <JardinSkeleton mode={mode} />
        ) : (
          <>
            {/* Swap del hero al cambiar de estado (matriz ①7): el `key` lo
                remonta y Reanimated corre el `entering` (fade 200ms + el rise
                del RiseView). Es fade-IN, no un cruce de dos capas: un
                `exiting` mantendría el hero viejo EN EL LAYOUT hasta terminar
                y por 200ms se verían dos heroes apilados empujando la card de
                abajo. El dissolve interno de `brot.js` no se porta. */}
            <Animated.View
              key={heroVm.kind}
              entering={
                reduceMotion
                  ? undefined
                  : FadeIn.duration(HERO_SWAP_MS).reduceMotion(ReduceMotion.System)
              }
            >
              <RiseView translateY={CARD_RISE}>
                <JardinHero mode={mode} vm={heroVm} />
              </RiseView>
            </Animated.View>

            <RiseView delay={CARD_STAGGER_MS} translateY={CARD_RISE}>
              <CrecimientoCard
                mode={mode}
                vm={crecimientoVm}
                title={t('garden:crecimiento.title')}
                tag={t('garden:crecimiento.tag')}
                legend={legendCopy}
                historyLabel={t('garden:historial.title')}
                focusA11yLabel={focusA11yLabel}
              />
            </RiseView>

            {semanaVm ? (
              <RiseView delay={CARD_STAGGER_MS * 2} translateY={CARD_RISE}>
                <SemanaPasadaCard
                  mode={mode}
                  vm={semanaVm}
                  ctaText={t('garden:semanaPasada.cta')}
                />
              </RiseView>
            ) : null}

            {logrosVm ? (
              <RiseView delay={CARD_STAGGER_MS * 3} translateY={CARD_RISE}>
                <LogrosAccessCard
                  mode={mode}
                  vm={logrosVm}
                  title={t('garden:logrosAccess.title')}
                  unseenLabel={t('garden:logrosAccess.unseen', {
                    count: logrosUnseen ?? 0,
                  })}
                />
              </RiseView>
            ) : null}

            {/* La nota es la ÚLTIMA card, así que su `exiting` puede quedarse
                en el layout mientras se desvanece sin empujar nada (⑤2). */}
            {showNote ? (
              <Animated.View
                exiting={
                  reduceMotion
                    ? undefined
                    : FadeOut.duration(NOTE_DISMISS_MS).reduceMotion(ReduceMotion.System)
                }
              >
                <RiseView delay={CARD_STAGGER_MS * 4} translateY={CARD_RISE}>
                  <NotaEducativa
                    mode={mode}
                    text={t('garden:nota.text')}
                    dismissLabel={t('garden:nota.dismiss')}
                    onDismiss={handleDismissNote}
                  />
                </RiseView>
              </Animated.View>
            ) : null}

            <View style={styles.tail} />
          </>
        )}
      </Screen>

      {/* Montada SIEMPRE y conducida por `visible`: `ModalCard` necesita seguir
          en el árbol un frame más para que la salida se vea (desmontarla en
          `false` la cerraba de golpe). */}
      <HistorialSheet
        mode={mode}
        visible={showHistorial && historialWeeks.length > 0}
        weeks={historialWeeks}
        monthLabel={monthShort(now)}
        title={t('garden:historial.title')}
        closeLabel={t('common:actions.close')}
        onClose={() => setShowHistorial(false)}
      />

      {showWeekClose && data ? (
        <WeekCloseCierre garden={data} userId={userId} onClose={handleCloseWeekClose} />
      ) : null}

      <NoSpendConfirmSheet
        visible={confirmSheetVisible}
        expensesToday={expensesTodayOwn}
        categoryById={categoryById}
        isSubmitting={markNoExpenseMutation.isPending}
        onCancel={() => setConfirmSheetVisible(false)}
        onConfirm={() => doMark({ force: true })}
      />
    </>
  )
}

const styles = StyleSheet.create({
  // El aire de arriba va en `contentContainerStyle`, NO en `bodyStyle`: el
  // `Screen` lo absorbe con `Math.max(callerTop, insets.top)` (screen.tsx:281)
  // y así el header arranca donde arrancan los de las otras cinco pantallas.
  // En `bodyStyle` se SUMABA al inset — los 2pt de más que dejaban al header
  // desalineado contra el resto de la app. 10 es el canónico de Fijos, Control
  // y Ajustes.
  //
  // Sin `gap`: cada card del kit trae su propio `marginTop: 16` (el mismo del
  // handoff, y desde 2026-08-11 también el del hero). Un gap acá los duplicaría.
  content: {
    paddingTop: 10,
  },
  /** Aire final: la última card cierra con su sombra `raisedLg` completa. */
  tail: {
    height: 16,
  },
})
