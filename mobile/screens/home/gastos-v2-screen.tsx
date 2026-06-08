import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  type ScrollView,
  type SectionListData,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { MaterialIcons } from '@expo/vector-icons'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { RiseView } from '@/components/home/animated/rise-view'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { SwipeRow, type SwipeAction } from '@/components/ui/swipe-row'
import { GastoRow } from '@/components/gastos/gasto-row'
import { GastosAdvisorChip } from '@/components/gastos/gastos-advisor-chip'
import { GastosEmptyState } from '@/components/gastos/gastos-empty-state'
import { GastosHeader } from '@/components/gastos/gastos-header'
import { GastosHeroCard } from '@/components/gastos/gastos-hero-card'
import { GastosMonthCalendar } from '@/components/gastos/gastos-month-calendar'
import { GastosSmartFilter } from '@/components/gastos/gastos-smart-filter'
import { StreakFlameIcon } from '@/components/gastos/streak-flame-icon'
import { StreakSheet } from '@/components/gastos/streak-sheet'
import {
  GASTOS_TOUR,
  GASTOS_TOUR_STEPS,
  TourTarget,
  useRegisterTourScrollView,
  useScreenTour,
} from '@/features/tours'
import {
  useDeleteExpense,
  useRecentExpenses,
  type Expense,
} from '@/features/expenses/use-expenses'
import {
  useDeleteIncomeEvent,
  useIncomeEvents,
  type IncomeEvent,
} from '@/features/income/use-income-events'
import { IncomeRow } from '@/components/gastos/income-row'
import { useFamilyMembers } from '@/features/family/use-family-members'
import { usePressScale } from '@/hooks/use-press-scale'
import { useGastosController } from '@/features/gastos/use-gastos-controller'
import { useGastosRealtime } from '@/features/gastos/use-gastos-realtime'
import { useGastosSnapshot } from '@/features/gastos/use-gastos-snapshot'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { useGastosTelemetry } from '@/features/gastos/use-gastos-telemetry'
import { logScreenEvent } from '@/features/telemetry/log-screen-event'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import {
  useMarkNoExpenseDay,
  useStreak,
  useUnmarkNoExpenseDay,
  type StreakData,
} from '@/features/streaks/use-streak'
import { confetti } from '@/lib/confetti-bus'
import { toast } from '@/lib/toast-bus'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { triggerHaptic } from '@/lib/haptics'
import { errorMessages } from '@/lib/copy/states'
import { formatMoney } from '@/utils/money'
import { getErrorMessage } from '@/utils/error-message'
import { useAppTheme } from '@/theme/theme-provider'

interface GastosV2ScreenProps {
  familyId: string
  userId: string
}

const STREAK_DEFAULTS: StreakData = Object.freeze({
  currentStreak: 0,
  longestStreak: 0,
  totalDaysLogged: 0,
  hasLoggedToday: false,
  hasMarkedNoExpenseToday: false,
  freezeTokens: 0,
  weekActivity: Object.freeze([false, false, false, false, false, false, false]) as unknown as boolean[],
  isBroken: false,
  streakBrokenAt: null,
  markedDaysIso: Object.freeze([]) as unknown as string[],
})

// Movement items mix expenses + incomes in a single day's row list.
// Income now uses the same row chrome as expense (see `IncomeRow`),
// differentiated by color + pill — so they slot naturally into the
// SectionList. Sort order within a day: incomes first (top of the
// day), then expenses by time desc. Income surfaces as a "first thing
// that happened" anchor without breaking the chronological feed.
type MovementItem =
  | { kind: 'expense'; iso: string; expense: Expense }
  | { kind: 'income'; iso: string; income: IncomeEvent }

interface MovimientosSection {
  title: string
  day: number
  /** Local-day epoch ms (startOf the section's day in the user's local
   *  timezone). Used to sort sections chronologically across month
   *  boundaries — sorting by `day` (1–31) alone bleeds: in a May 25 →
   *  Jun 24 cycle, day 31 (May) numerically beats day 4 (Jun) and
   *  today / yesterday ended up at the BOTTOM of the list. */
  dateMs: number
  total: number
  /** Mixed rows: incomes prepended to expenses (incomes at the top of
   *  the day, expenses below). Both render with their own row chrome
   *  via `IncomeRow` / `GastoRow` — the chrome is unified so income
   *  reads as a row in the same UI (color + pill differentiate). */
  data: MovementItem[]
  /** Raw income list for the day. Kept on the section for future
   *  surfaces (e.g. day-level totals or filters); the visible feed
   *  reads `data` instead. */
  incomes: IncomeEvent[]
}

// Fallback label for an income whose `description` is empty. The
// `IncomeRow` component itself owns the kind → emoji + pill copy
// mapping; this is just a "what to show as the row title" lookup.
function incomeKindFallback(kind: IncomeEvent['kind']): string {
  switch (kind) {
    case 'transfer':
      return 'Transferencia'
    case 'bonus':
      return 'Bono'
    case 'gift':
      return 'Regalo'
    case 'other':
    default:
      return 'Ingreso'
  }
}

/**
 * Canonical "what time did this income happen" — local-noon epoch ms
 * derived from `event_date` ("YYYY-MM-DD") when present, falling back
 * to `created_at` when the row is from a code path that doesn't set
 * event_date. Used everywhere that needs to slot an income into a day
 * bucket or sort it chronologically alongside expenses. Eliminates the
 * back-date bug where filtering/sorting by created_at filed a
 * backdated income under "today" instead of the day the user picked.
 */
function incomeHappenedAtMs(income: IncomeEvent): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(income.event_date)
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      12,
      0,
      0,
      0,
    ).getTime()
  }
  return Date.parse(income.created_at)
}

/**
 * Builds the meta line under the section title: "3 gastos · 1 ingreso"
 * style. Pluralization in Spanish + handles 0 / 1 / N for each side.
 * Skipped when both counts are zero (the parent section won't render
 * in that case anyway).
 */
function sectionMetaCopy(expenseCount: number, incomeCount: number): string {
  const parts: string[] = []
  if (expenseCount > 0) {
    parts.push(`${expenseCount} gasto${expenseCount === 1 ? '' : 's'}`)
  }
  if (incomeCount > 0) {
    parts.push(`${incomeCount} ingreso${incomeCount === 1 ? '' : 's'}`)
  }
  if (parts.length === 0) return 'sin movimientos'
  return parts.join(' · ')
}

const WEEKDAYS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

/** Etiqueta para una sección que existe solo por un income-event (sin
 *  expenses ese día). Coincide con el formato de `groupGastosByDay`. */
function formatStandaloneIncomeDay(d: Date): string {
  return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} ${MONTHS_ES[d.getMonth()]}`
}

/**
 * Gate component: dispara `gastos_snapshot` (RPC bundleada) y solo
 * monta `<GastosV2ScreenContent>` cuando el snapshot resolvió. El
 * snapshot seedéa las 6 caches que el contenido consume (hero,
 * calendar, categories, primera página de paginated, streak row,
 * marked_days). De esa forma los hooks adentro del controller leen
 * cache hot y no disparan sus 6 RPCs propias en cold-start.
 *
 * `usePayCycle` y `useFamilyDashboard` se calculan acá pero no firen
 * red porque sus dependencias (family_finance, fixed_expenses,
 * expenses) ya están seeded por home_snapshot.
 */
export function GastosV2Screen({ familyId, userId }: GastosV2ScreenProps) {
  const { cycle, today } = usePayCycle(familyId)
  const dashboard = useFamilyDashboard(familyId)
  const cupoDiario = useMemo(() => {
    const libre = Math.max(
      0,
      dashboard.monthlyIncome -
        dashboard.fixedExpensesMonthlyTotal -
        dashboard.savingsGoal,
    )
    return cycle.days > 0 ? libre / cycle.days : 0
  }, [
    dashboard.monthlyIncome,
    dashboard.fixedExpensesMonthlyTotal,
    dashboard.savingsGoal,
    cycle.days,
  ])

  const snapshot = useGastosSnapshot({
    familyId,
    userId,
    cycleStart: cycle.start,
    cycleEnd: cycle.end,
    today,
    cupoDiario,
    daysPerPage: 7,
  })

  if (!snapshot.data) {
    // Snapshot pending → pantalla en blanco breve (~400ms). Mismo
    // patrón que `<HomeScreen>` cuando espera home_snapshot. Evita
    // mountear el controller con caches vacías y disparar 6 RPCs en
    // paralelo.
    return null
  }

  return <GastosV2ScreenContent familyId={familyId} userId={userId} />
}

function GastosV2ScreenContent({ familyId, userId }: GastosV2ScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const safeAreaInsets = useSafeAreaInsets()
  // Auto-start the Gastos guided tour on first visit. No-op once seen.
  useScreenTour(GASTOS_TOUR)
  // Register the SectionList as the tour's scroll surface so the host
  // can auto-scroll each step's target into view (hero/streak live in
  // the list header; calendar and filters live further down). The
  // hook resolves the underlying ScrollView via `getScrollResponder()`
  // — SectionList doesn't expose `scrollTo`/`measureInWindow` on its
  // own instance.
  const tourScrollRef = useRef<SectionList<MovementItem, MovimientosSection> | null>(null)
  // Outer `<View collapsable={false}>` wrapping the SectionList. Used
  // as the registry's `measureRef`: SectionList instances don't expose
  // `measureInWindow` reliably across RN versions, so we measure this
  // flex:1 host instead. The `list` tour step is registered separately
  // (via `<TourTarget>` around the "Movimientos" title row, with
  // `highlight.extendToScrollEnd` so the cutout stretches from the
  // anchor down to the bottom of the visible scroll surface).
  const tourMeasureRef = useRef<View | null>(null)
  const {
    onScroll: onTourScroll,
    onContentSizeChange: onTourContentSizeChange,
  } = useRegisterTourScrollView(GASTOS_TOUR, tourScrollRef, {
    measureRef: tourMeasureRef,
  })
  // Replicate Screen's bottom-padding logic for tab screens — without
  // this, the SectionList scroll-surface ends ~120pt above the tab
  // bar (cuando no hay paddingBottom propio) y el área visible se
  // achata. Agregamos el padding en el contentContainerStyle del list
  // para que el contenido pueda scrollearse hasta el borde del tab bar.
  const tabBarBottomPadding = safeAreaInsets.bottom + 96

  // Asistente Financiero deep-links: solo `categoryId` se sigue
  // parseando. El smart filter (priceMin/priceMax/dateRange) fue
  // descartado en la arquitectura v2 — las búsquedas por fecha viven
  // en el calendario y `selectedDay` dispara su propia query.
  const params = useLocalSearchParams<{ categoryId?: string }>()
  const initialCategoryId =
    typeof params.categoryId === 'string' && params.categoryId.length > 0
      ? params.categoryId
      : null
  const controller = useGastosController(familyId, {
    initialCategoryId,
  })

  // Sonda para detectar el caso "frozen cycle pero hay expenses post-cobro":
  // si el cycle activo está congelado (esperando confirm), el controller
  // filtra por cycleStart → cycleEnd y los gastos recién agregados (con
  // fecha posterior al cycleEnd) caen fuera del filtro. El user ve un
  // empty state engañoso ("Carga tu primer gasto") cuando en realidad
  // tiene gastos atrapados en el limbo. Owner feedback 2026-06-08.
  const { isSalaryPendingConfirmation } = usePayCycle(familyId)
  const recentExpensesQuery = useRecentExpenses(familyId, 3)
  const hasRecentExpensesOutsideCycle =
    isSalaryPendingConfirmation &&
    (recentExpensesQuery.data?.length ?? 0) > 0

  // Income events del cycle visible — se intercalan con los gastos en
  // las day-groups, con un row variante (verde, ícono distinto).
  // useIncomeEvents trae los últimos 100 de la familia; filtramos al
  // cycle aquí mismo.
  const incomeEventsQuery = useIncomeEvents(familyId)
  const cycleIncomeEvents = useMemo<IncomeEvent[]>(() => {
    const all = incomeEventsQuery.data ?? []
    if (all.length === 0) return []
    const startMs = controller.cycleStart.getTime()
    const endMs = controller.cycleEnd.getTime()
    return all.filter((i) => {
      // Bucket by `event_date` (the day the income happened) not
      // `created_at` (when the row was registered). Users can backdate
      // an income via the add-income form; using created_at would file
      // a backdated income under "today" and miss the actual day in
      // the cycle. Same fix applied in `home-activity-section.tsx`.
      const t = incomeHappenedAtMs(i)
      return Number.isFinite(t) && t >= startMs && t < endMs
    })
  }, [incomeEventsQuery.data, controller.cycleStart, controller.cycleEnd])

  useGastosRealtime(familyId)
  const telemetry = useGastosTelemetry(familyId)
  const trackTap = useCallback(
    (elementId: string, slot: string, destinationRoute?: string) => {
      telemetry.markTapped()
      void logScreenEvent({
        familyId,
        event: 'gastos.element_tapped',
        elementId,
        slot,
        context: {
          session_id: telemetry.sessionId,
          destination_route: destinationRoute ?? null,
        },
      })
    },
    [familyId, telemetry],
  )

  const membersQuery = useFamilyMembers(familyId)
  const familyMembersData = membersQuery.data
  const familyMembers = useMemo(() => familyMembersData ?? [], [familyMembersData])
  const deleteExpenseMutation = useDeleteExpense(familyId, userId)
  // Income delete now lives on the SwipeRow — swipe-to-delete matches
  // how expense rows behave, requires intentional gesture, can't be
  // mistapped like the X used to be. Same plumbing as the expense
  // mutation (optimistic + sync invalidation).
  const deleteIncomeMutation = useDeleteIncomeEvent(userId)
  const streakQuery = useStreak(familyId, userId)
  const streakData = streakQuery.data ?? STREAK_DEFAULTS
  const markNoSpendMutation = useMarkNoExpenseDay(familyId, userId)
  const unmarkNoSpendMutation = useUnmarkNoExpenseDay(familyId, userId)

  // Marked days for current calendar view. F3 swaps F2's placeholder
  // (streak hook's last-14 markedDaysIso, not cycle-bounded) for the
  // home_snapshot's `no_spend_days_this_cycle` — exactly the current
  // cycle window, matching the Control hero stat. Stored as a Set for
  // O(1) lookup in the calendar's grid.
  const homeSnapshot = useHomeSnapshot(userId)
  const noSpendMarkedDates = useMemo(() => {
    return new Set<string>(homeSnapshot.data?.no_spend_days_this_cycle ?? [])
  }, [homeSnapshot.data?.no_spend_days_this_cycle])

  const handleMarkNoSpend = useCallback(
    (date: Date) => {
      // Local-tz YYYY-MM-DD (avoid toISOString UTC shift — consistent
      // with how the calendar component computes the Set lookup).
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      markNoSpendMutation.mutate(
        { date: iso },
        {
          onSuccess: () => {
            void triggerHaptic('success')
            confetti.celebrate({ durationMs: 2000, origin: 'top' })
            toast.success('Día sin gastos registrado')
          },
          onError: (error: unknown) => {
            void triggerHaptic('error')
            const message = error instanceof Error ? error.message : 'Error desconocido'
            if (message.includes('EXPENSES_EXIST_ON_DATE')) {
              toast.error('Ese día tiene gastos registrados — no se puede marcar como sin gasto.')
            } else if (message.includes('FUTURE_DATE_NOT_ALLOWED')) {
              toast.error('No podés marcar un día que aún no ocurrió.')
            } else {
              toast.error('No se pudo marcar. Reintentá en un momento.')
            }
          },
        },
      )
    },
    [markNoSpendMutation],
  )

  const handleUnmarkNoSpend = useCallback(
    (date: Date) => {
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      unmarkNoSpendMutation.mutate(
        { date: iso },
        {
          onSuccess: () => {
            void triggerHaptic('selection')
            toast.info('Marca de día sin gastos removida.')
          },
          onError: (error: unknown) => {
            void triggerHaptic('error')
            toast.error(
              error instanceof Error
                ? error.message
                : 'No se pudo revertir. Reintentá en un momento.',
            )
          },
        },
      )
    },
    [unmarkNoSpendMutation],
  )

  const [streakSheetVisible, setStreakSheetVisible] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // ─── Row-entrance animation gate ─────────────────────────────────
  // The Animated.View wrapping each SectionList row carries
  // `entering={FadeIn}` + `layout={LinearTransition}` to make filter
  // changes feel smooth. The side-effect of leaving those props on
  // permanently is that EVERY cold tab mount (and every recycle of a
  // virtualized row while scrolling) re-fires the FadeIn worklet —
  // contending with the 240ms native tab-switch transition. Gate the
  // animation behind a transient flag that flips on for ~500ms only
  // after the user changes a filter, then off again. Cold mount and
  // plain scroll → 0 entering worklets.
  const [rowAnimationEnabled, setRowAnimationEnabled] = useState(false)
  const filterSignature = `${controller.selectedCategoryId ?? ''}|${controller.selectedDay ?? ''}`
  const initialFilterSignatureRef = useRef(filterSignature)
  const lastFilterSignatureRef = useRef(filterSignature)
  useEffect(() => {
    // Skip the very first effect run (mount). After that, any signature
    // change is a real filter toggle by the user.
    if (lastFilterSignatureRef.current === filterSignature) return
    lastFilterSignatureRef.current = filterSignature
    if (filterSignature === initialFilterSignatureRef.current) return
    setRowAnimationEnabled(true)
    const timeout = setTimeout(() => setRowAnimationEnabled(false), 500)
    return () => clearTimeout(timeout)
  }, [filterSignature])

  // Also flip the animation flag when the expense count changes via a
  // mutation (add / delete). Otherwise the new row from an optimistic
  // prepend popped in without a fade, and on delete the sibling reflow
  // happened without LinearTransition smoothing. Same 500ms window as
  // filter changes — long enough for FadeIn (180) + LinearTransition
  // (220) to land.
  const expensesCountRef = useRef(controller.expenses.length)
  useEffect(() => {
    if (expensesCountRef.current === controller.expenses.length) return
    expensesCountRef.current = controller.expenses.length
    setRowAnimationEnabled(true)
    const timeout = setTimeout(() => setRowAnimationEnabled(false), 500)
    return () => clearTimeout(timeout)
  }, [controller.expenses.length])

  const handleDelete = useCallback(
    (expenseId: string) => {
      void triggerHaptic('warning')
      trackTap('gasto_row_delete', 'list')
      deleteExpenseMutation.mutate(expenseId, {
        onError: (error: unknown) => {
          void triggerHaptic('error')
          Alert.alert('No pudimos eliminar', getErrorMessage(error, errorMessages.server))
        },
        onSuccess: () => void triggerHaptic('success'),
      })
    },
    [deleteExpenseMutation, trackTap],
  )

  const handleDeleteIncome = useCallback(
    (incomeId: string) => {
      if (!familyId) return
      void triggerHaptic('warning')
      trackTap('income_row_delete', 'list')
      deleteIncomeMutation.mutate(
        { id: incomeId, familyId },
        {
          onError: (error: unknown) => {
            void triggerHaptic('error')
            Alert.alert(
              'No pudimos eliminar',
              getErrorMessage(error, errorMessages.server),
            )
          },
          onSuccess: () => void triggerHaptic('success'),
        },
      )
    },
    [deleteIncomeMutation, familyId, trackTap],
  )


  const expenseCountByCategoryId = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of controller.filteredExpenses) {
      map.set(e.category_id, (map.get(e.category_id) ?? 0) + 1)
    }
    return map
  }, [controller.filteredExpenses])
  const categoriesList = useMemo(
    () => Array.from(controller.categoriesById.values()),
    [controller.categoriesById],
  )
  // Defer the heavy intelligence + notifications queries past first
  // paint — the chip is below the fold and tolerates a ~600ms wait
  // without UX cost (audit §3.4 / item 18).
  const { signals: advisorSignals } = useControlV2Data(familyId, undefined, {
    defer: true,
  })
  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of controller.categoriesById.values()) {
      m.set(c.id, c.name)
    }
    return m
  }, [controller.categoriesById])

  const cycleDates = useMemo(() => {
    const out: Date[] = []
    for (let i = 0; i < controller.cycleDays; i++) {
      out.push(
        new Date(
          controller.cycleStart.getFullYear(),
          controller.cycleStart.getMonth(),
          controller.cycleStart.getDate() + i,
        ),
      )
    }
    return out
  }, [controller.cycleStart, controller.cycleDays])
  const navBounds = useMemo(
    () => getCycleNavBounds(controller.selectedDay, cycleDates, controller.today),
    [controller.selectedDay, cycleDates, controller.today],
  )
  const handlePrevDay = useCallback(() => {
    controller.setSelectedDay(stepCycleDay(controller.selectedDay, cycleDates, controller.today, -1))
  }, [controller, cycleDates])
  const handleNextDay = useCallback(() => {
    controller.setSelectedDay(stepCycleDay(controller.selectedDay, cycleDates, controller.today, 1))
  }, [controller, cycleDates])

  const handlePressAdd = useCallback(() => {
    void triggerHaptic('light')
    // Abre el form de gasto como modal/sheet, igual que el botón '+' del
    // tab bar (AddExpenseTabButton también hace push a /(app)/add-expense).
    // Antes navegaba al tab '/(app)/(tabs)/add', que no corresponde.
    trackTap('add_expense_cta', 'movements_empty', '/(app)/add-expense')
    router.push('/(app)/add-expense')
  }, [router, trackTap])
  const handlePressStreak = useCallback(() => {
    void triggerHaptic('selection')
    trackTap('streak_flame', 'header')
    setStreakSheetVisible(true)
  }, [trackTap])
  const handleRegisterForgotten = useCallback(
    (date: Date) => {
      void triggerHaptic('light')
      trackTap('calendar_register_forgotten', 'calendar', '/(app)/add-expense')
      const y = date.getFullYear()
      const m = `${date.getMonth() + 1}`.padStart(2, '0')
      const d = `${date.getDate()}`.padStart(2, '0')
      router.push({
        pathname: '/(app)/add-expense',
        params: { date: `${y}-${m}-${d}` },
      })
    },
    [router, trackTap],
  )
  const handleClearFilters = useCallback(() => {
    void triggerHaptic('selection')
    trackTap('clear_filters', 'filters')
    controller.clearAll()
  }, [controller, trackTap])
  const handleSelectCategory = useCallback(
    (id: string | null) => {
      if (id !== controller.selectedCategoryId) {
        trackTap('filter_pill', 'filters')
      }
      controller.setSelectedCategoryId(id)
    },
    [controller, trackTap],
  )
  const handleSelectDay = useCallback(
    (day: number | null) => {
      if (day !== controller.selectedDay) {
        trackTap('calendar_day', 'calendar')
      }
      controller.setSelectedDay(day)
    },
    [controller, trackTap],
  )
  const handleAdvisorPress = useCallback(() => {
    trackTap('advisor_chip', 'movements', '/(app)/(tabs)/insights')
    router.push('/(app)/(tabs)/insights')
  }, [router, trackTap])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    void logScreenEvent({
      familyId,
      event: 'gastos.refreshed',
      context: { session_id: telemetry.sessionId },
    })
    try {
      await controller.refetchAll()
    } finally {
      setIsRefreshing(false)
    }
  }, [controller, familyId, telemetry.sessionId])

  // Map controller groups → SectionList sections (audit §2.3 — list
  // virtualizada). Each day = one section, sin movimientos = empty
  // section that won't render rows. Acá mezclamos income events del
  // cycle dentro del mismo bucket por día (sorted por created_at desc).
  // Si un día tiene SOLO income (sin expenses), creamos una sección
  // nueva. El income NO afecta `total` (que es total de gastos).
  const sections = useMemo<MovimientosSection[]>(() => {
    // Helper: epoch ms at startOf the local-day for the given ISO.
    // Used as the canonical bucketing key + sort key so month boundaries
    // don't bleed (the old key was `day` 1–31 — same number for May 31
    // and "Jun 31 doesn't exist", and lower numbers in early June sorted
    // BELOW high numbers in late May).
    const dayMsFromIso = (iso: string): number => {
      const d = new Date(iso)
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    }

    /**
     * Builds a section's `data` row list: incomes first (sorted desc by
     * created_at — most recent at the top of the day), then expenses
     * (already sorted desc by the controller). Within the SectionList
     * this places income as the day's "first thing that happened"
     * anchor, immediately under the date header, with expenses below.
     * Keeps the chronological feel without inline-mixing that the user
     * complained about.
     */
    const buildSectionData = (
      expenseRows: MovementItem[],
      incomes: IncomeEvent[],
    ): MovementItem[] => {
      const incomeRows: MovementItem[] = incomes.map((i) => ({
        kind: 'income',
        iso: i.created_at,
        income: i,
      }))
      incomeRows.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0))
      return [...incomeRows, ...expenseRows]
    }

    if (controller.selectedDay != null) {
      // Modo "día tappeado": el controller ya filtró expenses a un solo
      // día. Para el merge de income usamos el dateMs del primer
      // expense del grupo (groups[0].items[0]) como anchor — así el
      // filter de income matchea EL MISMO DÍA REAL (mes + año), no
      // sólo el día-del-mes.
      const base = controller.groups.map<MovimientosSection>((g) => ({
        title: g.label,
        day: g.day,
        dateMs:
          g.items.length > 0
            ? dayMsFromIso(g.items[0].created_at)
            : 0,
        total: g.total,
        data: g.items.map<MovementItem>((e) => ({
          kind: 'expense',
          iso: e.created_at,
          expense: e,
        })),
        incomes: [],
      }))
      const selectedDateMs = base[0]?.dateMs ?? null
      const dayIncomes =
        selectedDateMs != null
          ? cycleIncomeEvents.filter(
              (i) => incomeHappenedAtMs(i) === selectedDateMs,
            )
          : []
      if (base.length > 0 && dayIncomes.length > 0) {
        base[0]!.incomes = dayIncomes
        base[0]!.data = buildSectionData(base[0]!.data, dayIncomes)
      }
      return base
    }

    // Vista normal del cycle: incomes van COMO ROWS dentro del array
    // `data`, en el tope del día (antes de los expenses). Misma chrome
    // que un expense row, diferenciada por color + pill (ver
    // `IncomeRow`). El campo `incomes` se mantiene en la section por
    // si en el futuro queremos un summary, pero el render del feed
    // los pasa por `data`.
    const byDay = new Map<number, MovimientosSection>()
    for (const g of controller.groups) {
      const dateMs =
        g.items.length > 0 ? dayMsFromIso(g.items[0].created_at) : 0
      byDay.set(dateMs, {
        title: g.label,
        day: g.day,
        dateMs,
        total: g.total,
        data: g.items.map<MovementItem>((e) => ({
          kind: 'expense',
          iso: e.created_at,
          expense: e,
        })),
        incomes: [],
      })
    }
    for (const income of cycleIncomeEvents) {
      // Bucket by event_date (what day did this income happen), not
      // created_at (when registered). Backdated incomes file under
      // the right day.
      const dateMs = incomeHappenedAtMs(income)
      const d = new Date(dateMs)
      const existing = byDay.get(dateMs)
      if (existing) {
        existing.incomes.push(income)
      } else {
        // Día sin gastos pero con ingreso → sección nueva.
        byDay.set(dateMs, {
          title: formatStandaloneIncomeDay(d),
          day: d.getDate(),
          dateMs,
          total: 0,
          data: [],
          incomes: [income],
        })
      }
    }
    // Sort expense rows within day desc + sort sections by actual date
    // desc — NOT by day-of-month integer (that bled across May → June).
    // Then rebuild `data` so incomes sit on top of expenses for each
    // section.
    const merged = Array.from(byDay.values())
    for (const s of merged) {
      s.data.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0))
      s.incomes.sort((a, b) =>
        a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
      )
      s.data = buildSectionData(s.data, s.incomes)
    }
    merged.sort((a, b) => b.dateMs - a.dateMs)
    return merged
  }, [controller.groups, controller.selectedDay, cycleIncomeEvents])

  const memberById = useMemo(() => {
    const map = new Map<string, (typeof familyMembers)[number]>()
    for (const m of familyMembers) map.set(m.id, m)
    return map
  }, [familyMembers])

  const renderItem = useCallback(
    ({ item: mv }: { item: MovementItem }) => {
      // Income row: mirrors GastoRow's chrome (same card, same radius,
      // same padding) AND wraps in the same SwipeRow so swipe-to-delete
      // works identically. Differentiation lives in color + pill, never
      // in interaction model — the row feels native to the feed.
      if (mv.kind === 'income') {
        const income = mv.income
        const who = memberById.get(income.created_by)
        const title = income.description?.trim() || incomeKindFallback(income.kind)
        const incomeActions: SwipeAction[] = [
          {
            label: 'Eliminar',
            tone: 'danger',
            icon: 'delete',
            onPress: () => handleDeleteIncome(income.id),
          },
        ]
        const isIncomePending =
          deleteIncomeMutation.isPending &&
          deleteIncomeMutation.variables?.id === income.id
        return (
          <Animated.View
            style={styles.rowWrap}
            entering={rowAnimationEnabled ? FadeIn.duration(180) : undefined}
            exiting={FadeOut.duration(140)}
            layout={rowAnimationEnabled ? LinearTransition.duration(220) : undefined}
          >
            <SwipeRow
              accessibilityLabel={`${title}, ingreso`}
              accessibilityHint="Desliza a la izquierda para eliminar"
              accessibilityActions={[{ name: 'delete', label: 'Eliminar' }]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'delete') {
                  handleDeleteIncome(income.id)
                }
              }}
              rightActions={incomeActions}
              isProcessing={isIncomePending}
            >
              <IncomeRow
                title={title}
                kind={income.kind}
                whoName={who?.name ?? 'Alguien'}
                whoColor={who?.color ?? '#329315'}
                amount={Math.round(Math.abs(Number(income.amount ?? 0)))}
                time={formatTime(income.created_at)}
              />
            </SwipeRow>
          </Animated.View>
        )
      }
      const item = mv.expense
      const cat = controller.categoriesById.get(item.category_id)
      const who = memberById.get(item.created_by)
      const actions: SwipeAction[] = [
        {
          label: 'Eliminar',
          tone: 'danger',
          icon: 'delete',
          onPress: () => handleDelete(item.id),
        },
      ]
      const a11yLabel = composeRowA11yLabel({
        title: item.description || cat?.name || 'Gasto',
        categoryName: cat?.name ?? 'Sin categoría',
        whoName: who?.name ?? 'Alguien',
        amount: Math.abs(Number(item.price ?? 0)),
        iso: item.created_at,
      })
      const isPending =
        deleteExpenseMutation.isPending &&
        deleteExpenseMutation.variables === item.id
      return (
        // Wrapping in Animated.View with entering/exiting + layout
        // makes filter changes (category pill, day selection) feel
        // smooth instead of snapping. `entering` + `layout` are
        // gated by `rowAnimationEnabled` so cold mount + virtualized
        // scroll recycle don't fire worklets that contend with the
        // tab transition. `exiting` stays on unconditionally because
        // FlatList only unmounts a cell when its key leaves `data`
        // (filter change or actual delete) — recycle reuses the same
        // mount, so the cost is bounded to real removals.
        <Animated.View
          style={styles.rowWrap}
          entering={rowAnimationEnabled ? FadeIn.duration(180) : undefined}
          exiting={FadeOut.duration(140)}
          layout={rowAnimationEnabled ? LinearTransition.duration(220) : undefined}
        >
          <SwipeRow
            accessibilityLabel={a11yLabel}
            accessibilityHint="Desliza a la izquierda para eliminar"
            accessibilityActions={[{ name: 'delete', label: 'Eliminar' }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'delete') {
                handleDelete(item.id)
              }
            }}
            rightActions={actions}
            isProcessing={isPending}
          >
            <GastoRow
              title={item.description || cat?.name || 'Gasto'}
              categoryName={cat?.name ?? 'Sin categoría'}
              categoryColor={cat?.color ?? theme.colors.textMuted}
              whoName={who?.name ?? 'Alguien'}
              whoColor={who?.color ?? '#329315'}
              amount={-Math.abs(Number(item.price ?? 0))}
              time={formatTime(item.created_at)}
              notes={item.notes}
            />
          </SwipeRow>
        </Animated.View>
      )
    },
    [
      controller.categoriesById,
      memberById,
      handleDelete,
      handleDeleteIncome,
      deleteExpenseMutation,
      deleteIncomeMutation,
      theme.colors.textMuted,
      rowAnimationEnabled,
    ],
  )

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<MovementItem, MovimientosSection> }) => (
      // Section header: hairline divider + date eyebrow + meta line
      // (count of gastos + ingresos) + total. Income rows render
      // INSIDE `section.data` now (top of each day), so the header
      // stays clean — just a chronological anchor between days.
      <Animated.View
        style={styles.sectionHeaderShell}
        entering={rowAnimationEnabled ? FadeIn.duration(160) : undefined}
        exiting={FadeOut.duration(120)}
        layout={rowAnimationEnabled ? LinearTransition.duration(220) : undefined}
      >
        {/* Hairline rule above the date — replaces the opaque "block"
            background that used to wrap the header. Reads as a soft
            day-boundary divider; the date itself sits naturally on the
            canvas instead of inside a heavy band. */}
        <View
          style={[styles.daySeparator, { backgroundColor: theme.colors.line }]}
        />
        <View style={styles.groupHeader}>
          <View style={styles.groupTitleCol}>
            <Text
              style={[styles.groupLabel, { color: theme.colors.textMuted }]}
              numberOfLines={1}
            >
              {section.title.toUpperCase()}
            </Text>
            <Text
              style={[styles.groupMeta, { color: theme.colors.textSoft }]}
              numberOfLines={1}
            >
              {sectionMetaCopy(
                section.data.length - section.incomes.length,
                section.incomes.length,
              )}
            </Text>
          </View>
          {section.total > 0 ? (
            <Text style={[styles.groupTotal, { color: theme.colors.text }]}>
              -{formatMoney(section.total)}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    ),
    [
      theme.colors.text,
      theme.colors.textMuted,
      theme.colors.textSoft,
      theme.colors.line,
      rowAnimationEnabled,
    ],
  )

  const keyExtractor = useCallback(
    (item: MovementItem) =>
      item.kind === 'expense' ? `e-${item.expense.id}` : `i-${item.income.id}`,
    [],
  )

  // Empty state — four variants. Rendered as ListEmptyComponent of
  // the SectionList when `sections` is empty (no day groups passed).
  const emptyState = useMemo(() => {
    if (controller.expenses.length === 0) {
      // Caso especial: cycle frozen pero hay expenses recientes en DB.
      // El user vio "Carga tu primer gasto" cuando ya había cargado
      // varios — los gastos quedaron atrapados fuera del cycle visible
      // hasta que confirme el cobro. CTA navega al Home donde el sheet
      // de "¿Cobraste?" auto-abre.
      if (hasRecentExpensesOutsideCycle) {
        return {
          kind: 'pending-confirm' as const,
          primary: 'Tus gastos esperan al mes nuevo',
          secondary:
            'Ya registraste movimientos del próximo ciclo. Confirmá tu cobro para que aparezcan acá.',
          actionLabel: 'Confirmar cobro',
          onAction: () => router.push('/(app)/(tabs)/home'),
          iconName: 'event-available' as const,
        }
      }
      // No empty-state CTA here on purpose — the home Variables band
      // and the Add tab already cover "register the first expense".
      // Surfacing the same button a third time was redundant.
      return {
        kind: 'global' as const,
        primary: 'Carga tu primer gasto',
        secondary: 'Empieza el ciclo registrando uno',
        actionLabel: undefined,
        onAction: undefined,
        iconName: 'add-circle-outline' as const,
      }
    }
    if (controller.filteredExpenses.length === 0 && controller.hasAnyFilter) {
      return {
        kind: 'filtered' as const,
        primary: 'No hay movimientos para este filtro',
        secondary: 'Prueba quitando algún filtro para ver más',
        actionLabel: 'Limpiar filtros',
        onAction: handleClearFilters,
        iconName: 'filter-alt-off' as const,
      }
    }
    if (controller.filteredExpenses.length === 0) {
      return {
        kind: 'cycle' as const,
        primary: 'Aún sin gastos en este mes',
        secondary: 'Cuando cargues uno, lo vas a ver aquí',
        actionLabel: undefined,
        onAction: undefined,
        iconName: 'hourglass-empty' as const,
      }
    }
    return null
  }, [
    controller.expenses.length,
    controller.filteredExpenses.length,
    controller.hasAnyFilter,
    handleClearFilters,
    hasRecentExpensesOutsideCycle,
    router,
  ])

  const sectionLayout = LinearTransition.duration(260)

  // Chrome shown above the virtualized list — composed once and
  // memoized so SectionList doesn't unmount it on every data update.
  const ListHeader = useMemo(
    () => (
      <View style={styles.headerStack}>
        <Animated.View layout={sectionLayout}>
          <GastosHeader
            subtitle={`Ciclo ${controller.cycleLabel}`}
            rightSlot={
              <TourTarget
                tour={GASTOS_TOUR}
                order={GASTOS_TOUR_STEPS.streak.order}
                text={GASTOS_TOUR_STEPS.streak.text}
                // Match the icon's rounded-square geometry (44×44,
                // borderRadius 14) and pad enough to cover the
                // absolutely-positioned count badge that pokes out
                // at top:-5 / right:-5.
                highlight={{ borderRadius: 20, padding: 6, pulse: true }}
              >
                <StreakFlameIcon data={streakData} onPress={handlePressStreak} />
              </TourTarget>
            }
          />
        </Animated.View>
        <TourTarget
          tour={GASTOS_TOUR}
          order={GASTOS_TOUR_STEPS.hero.order}
          text={GASTOS_TOUR_STEPS.hero.text}
        >
          <Animated.View layout={sectionLayout}>
            <GastosHeroCard
              totalVisible={controller.filteredTotal}
              summaryChip={controller.summaryChip}
              topCategories={controller.topCategories}
              averageDaily={controller.averageDaily}
              averageDailyBars={controller.recentDailyBars}
              averageWindowDays={controller.cycleDaysElapsed}
              daySelected={controller.selectedDay != null}
            />
          </Animated.View>
        </TourTarget>
        <TourTarget
          tour={GASTOS_TOUR}
          order={GASTOS_TOUR_STEPS.calendar.order}
          text={GASTOS_TOUR_STEPS.calendar.text}
        >
          {/*
            RiseView delay=120 para que el calendar entre DESPUÉS del
            hero (delay=100) y ANTES del filter (delay=140). Sin esto
            el calendar mounteaba a 0ms y aparecía antes que el hero,
            rompiendo la cascada visual top→down esperada.
          */}
          <RiseView delay={120}>
          <Animated.View layout={sectionLayout}>
            <GastosMonthCalendar
              dayMoods={controller.dayMoods}
              todayDay={controller.today.getDate()}
              cycleStart={controller.cycleStart}
              cycleDays={controller.cycleDays}
              firstWeekdayOffset={getMondayFirstOffset(controller.cycleStart)}
              selectedDay={controller.selectedDay}
              selectedDayTotal={
                controller.selectedDay != null
                  ? (controller.dailySpend[controller.selectedDay]?.total ?? 0)
                  : 0
              }
              selectedDayCount={
                controller.selectedDay != null
                  ? (controller.dailySpend[controller.selectedDay]?.count ?? 0)
                  : 0
              }
              cycleLabel={controller.cycleLabel}
              onSelectDay={handleSelectDay}
              onClearDay={controller.clearDay}
              onPrevDay={handlePrevDay}
              onNextDay={handleNextDay}
              canGoPrev={navBounds.canGoPrev}
              canGoNext={navBounds.canGoNext}
              onRegisterForgottenExpense={handleRegisterForgotten}
              onMarkNoSpend={handleMarkNoSpend}
              onUnmarkNoSpend={handleUnmarkNoSpend}
              noSpendMarkedDates={noSpendMarkedDates}
            />
          </Animated.View>
          </RiseView>
        </TourTarget>
        <TourTarget
          tour={GASTOS_TOUR}
          order={GASTOS_TOUR_STEPS.filters.order}
          text={GASTOS_TOUR_STEPS.filters.text}
        >
          <Animated.View layout={sectionLayout}>
            <GastosSmartFilter
              categories={categoriesList}
              expenseCountByCategoryId={expenseCountByCategoryId}
              totalCount={controller.filteredExpenses.length}
              selectedCategoryId={controller.selectedCategoryId}
              onSelect={handleSelectCategory}
            />
          </Animated.View>
        </TourTarget>
        {controller.hasAnyFilter ? (
          <Animated.View layout={sectionLayout}>
            <ClearFiltersButton onPress={handleClearFilters} />
          </Animated.View>
        ) : null}
        {/* delay=160 cierra la cascada (header 0 → hero 100 → calendar 120
            → filter 140 → advisor 160). Antes el chip aparecía a 0ms sin
            stagger junto al header, rompiendo la lectura top-down. */}
        <RiseView delay={160}>
          <Animated.View layout={sectionLayout}>
            <GastosAdvisorChip
              signals={advisorSignals}
              selectedCategoryId={controller.selectedCategoryId}
              categoryNameById={categoryNameById}
              onPress={handleAdvisorPress}
            />
          </Animated.View>
        </RiseView>
        <TourTarget
          tour={GASTOS_TOUR}
          order={GASTOS_TOUR_STEPS.list.order}
          text={GASTOS_TOUR_STEPS.list.text}
          highlight={{
            borderRadius: 12,
            padding: 8,
            extendToScrollEnd: true,
          }}
        >
          <View style={styles.movimientosTitleRow}>
            <Text style={[styles.movimientosTitle, { color: theme.colors.text }]}>
              Movimientos
            </Text>
            {sections.length > 0 ? (
              // El carácter `‹` (U+2039) era ambiguo como flecha. Switch
              // a MaterialIcons `chevron-left` 14pt baseline-aligned con
              // el texto para clarity icónica. Wrapped en row para flow.
              <View style={styles.swipeHintRow}>
                <MaterialIcons
                  name="chevron-left"
                  size={14}
                  color={theme.colors.textMuted}
                />
                <Text style={[styles.swipeHint, { color: theme.colors.textMuted }]}>
                  Desliza para acciones
                </Text>
              </View>
            ) : null}
          </View>
        </TourTarget>
      </View>
    ),
    [
      sectionLayout,
      sections.length,
      streakData,
      handlePressStreak,
      controller.cycleLabel,
      controller.filteredTotal,
      controller.summaryChip,
      controller.topCategories,
      controller.averageDaily,
      controller.recentDailyBars,
      controller.cycleDaysElapsed,
      controller.dayMoods,
      controller.cycleStart,
      controller.cycleDays,
      controller.today,
      controller.selectedDay,
      controller.dailySpend,
      controller.selectedCategoryId,
      controller.filteredExpenses.length,
      controller.hasAnyFilter,
      controller.clearDay,
      handleSelectDay,
      handlePrevDay,
      handleNextDay,
      navBounds,
      handleRegisterForgotten,
      handleMarkNoSpend,
      handleUnmarkNoSpend,
      noSpendMarkedDates,
      categoriesList,
      expenseCountByCategoryId,
      handleSelectCategory,
      handleClearFilters,
      advisorSignals,
      categoryNameById,
      handleAdvisorPress,
      theme,
    ],
  )

  // ── Hard error ───────────────────────────────────────────────────
  if (
    controller.error &&
    controller.filteredExpenses.length === 0 &&
    controller.expenses.length === 0
  ) {
    return (
      <Screen
        backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
        contentContainerStyle={styles.screenContent}
        scrollable={false}
      >
        <ErrorState
          description={getErrorMessage(controller.error, errorMessages.server)}
          title="No pudimos cargar tus gastos"
          onAction={() => {
            void controller.refetchAll()
          }}
        />
      </Screen>
    )
  }

  // ── Empty account (first-run onboarding) ─────────────────────────
  // The content only mounts after the snapshot resolved (the outer
  // `GastosV2Screen` returns null until `snapshot.data`), so an empty
  // `expenses` array reliably means "brand-new account", not a loading
  // flash. Render the onboarding empty state (intro card + ghost
  // previews + CTA) instead of the data cards with zeros. The other two
  // empty variants (`filtered` / `cycle`) stay inside the SectionList.
  // Empty account: ahora chequea movimientos totales (gastos + ingresos).
  // Si solo hay ingresos sin gastos, NO es empty — hay actividad real
  // que mostrar.
  const isEmptyAccount =
    !controller.error &&
    controller.expenses.length === 0 &&
    cycleIncomeEvents.length === 0
  if (isEmptyAccount) {
    return (
      <Screen
        backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
        // Default scrollable Screen (mismo patrón que Fijos). NO usar
        // `styles.screenContent` acá — ese estilo es del SectionList y
        // fuerza `paddingBottom: 0`, que dejaba el empty state sin poder
        // scrollearse hasta el final. Este usa el bottom-padding default
        // del Screen (clearance del tab bar).
        contentContainerStyle={styles.emptyStateContent}
        // Blobs detrás del scroll (no como hijo en flujo) para que cubran
        // el viewport y no metan un gap fantasma arriba del header.
        backgroundSlot={<AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />}
        // ── Tour: registrar el ScrollView de ESTE Screen como la
        // superficie de scroll del tour. En el branch empty el SectionList
        // (la superficie registrada por defecto vía `tourScrollRef`/
        // `tourMeasureRef`) NO se monta, así que `measureSv` daba null y el
        // tour-host abortaba (cutout sin posicionar = "el tour no anda").
        // Apuntando `tourScrollRef` al ScrollView del empty: `measureSv`
        // mide el viewport (resolveMeasureNode cae al scrollRef porque
        // `tourMeasureRef` queda sin attach acá) y el auto-scroll funciona
        // para los pasos de abajo (calendar/list) cuando el contenido
        // supera el viewport. Mismo enfoque que Fijos.
        scrollRef={tourScrollRef as unknown as RefObject<ScrollView | null>}
        onScroll={onTourScroll}
        onContentSizeChange={onTourContentSizeChange}
        scrollEventThrottle={16}
      >
        <View style={styles.emptyStateStack}>
          {/* Keep the streak flame + its tour target so the streak tour
              step and the flame keep working on the empty screen. */}
          <GastosHeader
            subtitle={`Ciclo ${controller.cycleLabel}`}
            rightSlot={
              <TourTarget
                tour={GASTOS_TOUR}
                order={GASTOS_TOUR_STEPS.streak.order}
                text={GASTOS_TOUR_STEPS.streak.text}
                highlight={{ borderRadius: 20, padding: 6, pulse: true }}
              >
                <StreakFlameIcon data={streakData} onPress={handlePressStreak} />
              </TourTarget>
            }
          />
          {/* Maps the hero/calendar/list ghost previews onto the matching
              GASTOS tour steps. The `filters` step (order 3) has no target
              on the empty screen — the tour engine builds its step list
              from REGISTERED targets only (tour-provider `stepsRef`), so a
              never-registered step is simply omitted from the walk; no
              stall. Same approach Fijos uses for its empty state. */}
          <GastosEmptyState
            onAddFirst={handlePressAdd}
            renderSection={(slot, children) => (
              <TourTarget
                tour={GASTOS_TOUR}
                order={GASTOS_TOUR_STEPS[slot].order}
                text={GASTOS_TOUR_STEPS[slot].text}
                highlight={{ borderRadius: 22, padding: 6 }}
              >
                {children}
              </TourTarget>
            )}
          />
        </View>
        <StreakSheet
          familyId={familyId}
          userId={userId}
          visible={streakSheetVisible}
          data={streakData}
          onClose={() => setStreakSheetVisible(false)}
          onPressAddExpense={handlePressAdd}
        />
      </Screen>
    )
  }

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      scrollable={false}
      contentContainerStyle={styles.screenContent}
    >
      {/* Mounted as a Screen-level sibling (not inside the SectionList
          header) so the absolute-positioned blobs fill the whole canvas
          instead of getting clipped to the ListHeaderComponent cell.
          Dark mode uses the 'calm' tone (faint forest halos on the
          near-black canvas); light keeps the bright aurora. */}
      <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />
      {/* `tourMeasureRef` wires this `flex:1` host as the registry's
          measurement target for the scrollable surface. The `list`
          step's highlight is registered separately (TourTarget around
          the "Movimientos" title row inside ListHeader, with
          `extendToScrollEnd`). */}
      <View
        ref={tourMeasureRef}
        collapsable={false}
        style={styles.activityListWrap}
      >
      <SectionList<MovementItem, MovimientosSection>
        ref={tourScrollRef}
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={ListHeader}
        onScroll={onTourScroll}
        onContentSizeChange={onTourContentSizeChange}
        scrollEventThrottle={16}
        ListEmptyComponent={
          emptyState ? (
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: theme.isDark
                    ? theme.colors.surfaceMuted
                    : theme.colors.creamCard,
                  borderColor: theme.colors.line,
                },
              ]}
              accessibilityRole="text"
              accessibilityLabel={`${emptyState.primary}. ${emptyState.secondary ?? ''}`}
            >
              <View style={[styles.emptyIcon, { backgroundColor: theme.colors.primarySurface }]}>
                <MaterialIcons name={emptyState.iconName} size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.emptyText}>
                <Text style={[styles.emptyPrimary, { color: theme.colors.text }]}>
                  {emptyState.primary}
                </Text>
                {emptyState.secondary ? (
                  <Text
                    style={[styles.emptySecondary, { color: theme.colors.textMuted }]}
                    maxFontSizeMultiplier={1.4}
                  >
                    {emptyState.secondary}
                  </Text>
                ) : null}
              </View>
              {emptyState.actionLabel && emptyState.onAction ? (
                <EmptyActionButton
                  label={emptyState.actionLabel}
                  onPress={emptyState.onAction}
                />
              ) : null}
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.listFooter}>
            {controller.isFetchingNextPage ? (
              <View
                style={styles.loadingMoreRow}
                accessibilityRole="text"
                accessibilityLabel="Cargando más movimientos"
              >
                <ActivityIndicator size="small" color={theme.colors.textMuted} />
                <Text style={[styles.loadingMoreText, { color: theme.colors.textMuted }]}>
                  Cargando más días…
                </Text>
              </View>
            ) : null}
            {!controller.hasNextPage && controller.expenses.length > 0 ? (
              // Editorial eyebrow en lugar de los em dashes "— Fin del
              // ciclo —" (impeccable ban: no em dashes en copy). Centrado
              // con letter-spacing como label de cierre, más limpio.
              <View style={styles.endOfListBlock}>
                <View
                  style={[
                    styles.endOfListRule,
                    { backgroundColor: theme.colors.line },
                  ]}
                />
                <Text
                  style={[styles.endOfList, { color: theme.colors.textMuted }]}
                  accessibilityRole="text"
                  accessibilityLabel="Fin del mes"
                >
                  FIN DEL MES
                </Text>
                <View
                  style={[
                    styles.endOfListRule,
                    { backgroundColor: theme.colors.line },
                  ]}
                />
              </View>
            ) : null}
          </View>
        }
        // Virtual scroll: dispara la siguiente página cuando el
        // usuario está al ~50% del último viewport. RN llama una sola
        // vez por umbral cruzado.
        onEndReached={() => {
          void controller.fetchNextPage()
        }}
        onEndReachedThreshold={0.5}
        stickySectionHeadersEnabled={false}
        // Virtualization knobs — tuned for typical mobile lists.
        // `windowSize` 9 = ~9 viewports of buffered content.
        // `removeClippedSubviews` mounts/unmounts off-screen rows on
        // Android (no-op on iOS but doesn't hurt).
        windowSize={9}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: tabBarBottomPadding },
        ]}
        // SafeArea is already handled by `<Screen>`'s SafeAreaView.
        // Setting `never` prevents the SectionList from adding extra
        // top inset on iOS, que duplica el espacio entre la barra de
        // navegación y el contenido.
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            // iOS `tintColor` y Android `colors[]` ahora theme-aware.
            // Antes hardcoded `#A6EF8F` iOS / `#297811` Android — el
            // android spinner en dark mode sobre canvas dark daba ~3:1
            // (visible animado pero apagado). heroAccent en iOS es lime
            // brand-bright (visible en ambos modos sobre canvas).
            // `primary` en android: light #297811 (dark green sobre cream
            // ✅), dark #A6EF8F (lime sobre forest dark ✅).
            tintColor={theme.colors.heroAccent}
            colors={[theme.colors.primary]}
          />
        }
      />
      </View>

      <StreakSheet
        familyId={familyId}
        userId={userId}
        visible={streakSheetVisible}
        data={streakData}
        onClose={() => setStreakSheetVisible(false)}
        onPressAddExpense={handlePressAdd}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  // `paddingBottom: 0` overrides Screen's default bottomPadding (the
  // ~120pt that pushes content above the tab bar). En non-scrollable
  // mode ese padding va al contenedor padre y achata el área del
  // SectionList. Lo movemos al `contentContainerStyle` del list así el
  // usuario puede scrollear hasta el borde del tab bar.
  screenContent: { paddingTop: 14, paddingBottom: 0 },
  // Empty-state branch: scrollable Screen con bottom-padding default (no
  // el override paddingBottom:0 del SectionList), + gap entre el header
  // y el contenido del empty state para que no queden pegados.
  emptyStateContent: { paddingTop: 14 },
  emptyStateStack: { gap: 12 },
  activityListWrap: {
    // Holds the SectionList for the guided-tour highlight target.
    // flex:1 keeps the list filling the rest of the screen; without
    // this the wrapper collapses and the list loses its scrollable
    // area.
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 0,
  },
  headerStack: { gap: 10, marginBottom: 8 },
  rowWrap: { paddingTop: 6 },
  sectionHeaderShell: {
    // Transparent shell — the section header used to carry an opaque
    // dark bg (DARK_TAB_CANVAS in dark, background in light) inherited
    // from when sticky headers were enabled. They aren't anymore
    // (`stickySectionHeadersEnabled={false}` on the SectionList) so the
    // bg was creating a heavy "band" behind the date that felt
    // aggressive. Without it the date sits on the canvas like a label,
    // not inside a card.
    backgroundColor: 'transparent',
  },
  daySeparator: {
    // Hairline divider above each day group. Replaces the opaque bg as
    // the day-boundary cue — minimal chrome, visible but not loud.
    height: StyleSheet.hairlineWidth,
    marginTop: 16,
    marginBottom: 2,
    marginHorizontal: 2,
    opacity: 0.7,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 2,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 12,
  },
  groupTitleCol: {
    flex: 1,
    gap: 2,
  },
  // Eyebrow-style date label: uppercase, letter-spaced, in `textMuted`.
  // The previous treatment (14px / weight 700 / `text`) read as a
  // section TITLE — too heavy for what's essentially a chronological
  // label between expense rows.
  groupLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  groupMeta: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  // Tabular nums acá porque el total se renderea en columna right-aligned
  // por encima del groupTotal de la siguiente sección. Sin tabular, los
  // dígitos proporcionales (1 vs 8) hacen que la columna wobblee al
  // scrollear. Mismo principio para GastoRow.amount.
  groupTotal: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  movimientosTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
  },
  movimientosTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  swipeHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  swipeHint: { fontSize: 11 },
  listFooter: { gap: 12, paddingVertical: 16, alignItems: 'center' },
  loadingMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 12,
    fontWeight: '500',
  },
  endOfListBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  endOfListRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  endOfList: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  clearFiltersBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  clearFiltersText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { flex: 1, gap: 2 },
  emptyPrimary: { fontSize: 14, fontWeight: '700' },
  emptySecondary: { fontSize: 12, lineHeight: 16 },
  emptyAction: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyActionText: { fontSize: 12, fontWeight: '700' },
})

// ── Tiny sub-components con press feedback Emil-grade ───────────
//
// Extraídos del JSX inline porque `usePressScale` requiere component
// body (rules of hooks lo prohíben adentro de `useMemo`). Mantenerlos
// chicos y locales evita explotar el archivo a más componentes.
//
// Antes: `Pressable` con `style={({pressed}) => [..., {opacity: 0.85}]}`
// → fade muerto sin sensación de tap. Después: Pressable + Animated.View
// con spring scale 0.97 (mismo patrón que Home Sprint 1).

function ClearFiltersButton({ onPress }: { onPress: () => void }) {
  const { theme } = useAppTheme()
  const press = usePressScale({ pressedScale: 0.97 })
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel="Limpiar todos los filtros activos"
      hitSlop={8}
    >
      <Animated.View
        style={[
          styles.clearFiltersBtn,
          {
            backgroundColor: theme.colors.creamSoft,
            borderColor: theme.colors.line,
          },
          press.animatedStyle,
        ]}
      >
        <MaterialIcons name="filter-alt-off" size={14} color={theme.colors.textMuted} />
        <Text style={[styles.clearFiltersText, { color: theme.colors.textMuted }]}>
          Limpiar filtros
        </Text>
      </Animated.View>
    </Pressable>
  )
}

function EmptyActionButton({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  const { theme } = useAppTheme()
  const press = usePressScale({ pressedScale: 0.97 })
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Animated.View
        style={[
          styles.emptyAction,
          {
            backgroundColor: theme.colors.primarySurface,
            borderColor: theme.colors.line,
          },
          press.animatedStyle,
        ]}
      >
        {/* `primaryStrong` en lugar de `primary` para AA cleanly en
            ambos modos. En light primaryStrong #1F590D es más oscuro
            que primary (7.7:1 vs 5.2:1 sobre primarySurface). En dark
            primaryStrong #D1F7C5 es más brillante que primary #A6EF8F
            (5.1:1 vs 4.4:1 marginal). Switch single-token AA win. */}
        <Text style={[styles.emptyActionText, { color: theme.colors.primaryStrong }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

function getMondayFirstOffset(cycleStart: Date): number {
  const jsDow = cycleStart.getDay()
  return (jsDow + 6) % 7
}

function stepCycleDay(
  selected: number | null,
  cycleDates: Date[],
  today: Date,
  direction: 1 | -1,
): number | null {
  if (selected == null) return null
  const idx = cycleDates.findIndex((d) => d.getDate() === selected)
  if (idx === -1) return cycleDates[0]?.getDate() ?? null
  const todayMs = startOfLocalDay(today).getTime()
  const target = idx + direction
  if (target < 0 || target >= cycleDates.length) return selected
  const targetDate = cycleDates[target]
  if (!targetDate) return selected
  if (direction === 1 && targetDate.getTime() > todayMs) return selected
  return targetDate.getDate()
}

function getCycleNavBounds(
  selected: number | null,
  cycleDates: Date[],
  today: Date,
): { canGoPrev: boolean; canGoNext: boolean } {
  if (selected == null) return { canGoPrev: false, canGoNext: false }
  const idx = cycleDates.findIndex((d) => d.getDate() === selected)
  if (idx === -1) return { canGoPrev: false, canGoNext: false }
  const todayMs = startOfLocalDay(today).getTime()
  const canGoPrev = idx > 0
  const nextDate = cycleDates[idx + 1]
  const canGoNext = Boolean(nextDate) && nextDate!.getTime() <= todayMs
  return { canGoPrev, canGoNext }
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function composeRowA11yLabel(args: {
  title: string
  categoryName: string
  whoName: string
  amount: number
  iso: string
}): string {
  const time = formatTime(args.iso)
  return `${args.title}, ${args.amount} pesos en ${args.categoryName}, cargado por ${args.whoName} a las ${time}.`
}
