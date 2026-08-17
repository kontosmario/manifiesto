import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
  type ScrollView,
  type SectionListData,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { MaterialIcons } from '@expo/vector-icons'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { CardSkeleton, HeroSkeleton, ListRowSkeleton } from '@/components/ui/skeleton-layouts'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { GastosEmptyState } from '@/components/gastos/gastos-empty-state'
import { GastosHeader } from '@/components/gastos/gastos-header'
import { GardenLeafIcon } from '@/components/garden/garden-leaf-icon'
import { StreakSheet } from '@/components/gastos/streak-sheet'
import { EmptyActionButton } from '@/components/gastos/empty-action-button'
import { GastosMovementRow } from '@/components/gastos/gastos-movement-row'
import { GastosSectionHeader } from '@/components/gastos/gastos-section-header'
import { GastosListHeader } from '@/components/gastos/gastos-list-header'
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
} from '@/features/expenses/use-expenses'
import {
  useCycleIncomeEventsTotal,
  useDeleteIncomeEvent,
  useIncomeEvents,
  type IncomeEvent,
} from '@/features/income/use-income-events'
import { useFamilyMembers } from '@/features/family/use-family-members'
import { useGastosController } from '@/features/gastos/use-gastos-controller'
import { GASTOS_DAYS_PER_PAGE } from '@/features/gastos/use-gastos-endpoints'
import { useGastosRealtime } from '@/features/gastos/use-gastos-realtime'
import { useGastosSnapshot } from '@/features/gastos/use-gastos-snapshot'
import { computeCupoDiario, resolveCupoIncomeBase } from '@/features/gastos/cupo-diario'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import { useBranchLog, useScreenLifecycleLog } from '@/lib/dev/anim-log'
import { useOpenLayoutGate } from '@/hooks/use-layout-transition-gate'
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
import {
  getCycleNavBounds,
  incomeHappenedAtMs,
  stepCycleDay,
  type MovementItem,
  type MovimientosSection,
} from '@/features/gastos/gastos-helpers'
import { buildGastosSections } from '@/features/gastos/build-sections'
import { buildGastosEmptyState } from '@/features/gastos/build-gastos-empty-state'
import { confetti } from '@/lib/confetti-bus'
import { toast } from '@/lib/toast-bus'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'
import i18n from '@/lib/i18n'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

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
  markedDayTimes: new Map<string, string>(),
})

/**
 * Gate component: dispara `gastos_snapshot` (RPC bundleada) y solo
 * monta `<GastosV2ScreenContent>` cuando el snapshot resolvió. El
 * snapshot seedéa las 6 caches que el contenido consume (hero,
 * calendar, categories, primera página de paginated, streak row,
 * marked_days). De esa forma los hooks adentro del controller leen
 * cache hot y no disparan sus 6 RPCs propias en cold-start.
 *
 * `usePayCycle` y `useFamilyDashboard` se calculan aquí pero no firen
 * red porque sus dependencias (family_finance, fixed_expenses,
 * expenses) ya están seeded por home_snapshot.
 */
/**
 * Skeleton mostrado mientras el `gastos_snapshot` resuelve (en vez del
 * canvas en blanco). Misma Screen + bg + AmbientBlobs y una estructura
 * que aproxima el layout real (hero, calendario, filas) para que el
 * primer frame ya tenga forma y el swap a contenido no parpadee.
 */
function GastosScreenSkeleton() {
  const { theme } = useAppTheme()
  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      scrollable={false}
      contentContainerStyle={styles.screenContent}
    >
      <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />
      <View style={styles.skeletonStack}>
        <HeroSkeleton />
        <CardSkeleton height={300} />
        <ListRowSkeleton rows={5} />
      </View>
    </Screen>
  )
}

export function GastosV2Screen({ familyId, userId }: GastosV2ScreenProps) {
  useScreenLifecycleLog('Gastos')
  const { cycle, today } = usePayCycle(familyId)
  const dashboard = useFamilyDashboard(familyId)
  // Dinámico: la base del cupo son los ingresos del ciclo + override —
  // con el sueldo (0) los moods del calendario caían al fallback de
  // promedio y contradecían el cupo de Home/Control (review 2026-07-08).
  // La MISMA derivación vive en use-warm-tabs-snapshots (keys deben
  // matchear) — cualquier cambio va en resolveCupoIncomeBase, no acá.
  const cupoIncomeQuery = useCycleIncomeEventsTotal(
    familyId,
    formatLocalDateKey(dashboard.monthlyAccounting.start),
    formatLocalDateKey(dashboard.monthlyAccounting.end),
  )
  const cupoDiario = useMemo(
    () =>
      computeCupoDiario({
        monthlyIncome: resolveCupoIncomeBase({
          incomeMode: dashboard.incomeMode,
          monthlyIncome: dashboard.monthlyIncome,
          cycleIncomeTotal: cupoIncomeQuery.data ?? 0,
          cycleStartingBalanceOverride: dashboard.cycleStartingBalanceOverride,
        }),
        fixedExpensesMonthlyTotal: dashboard.fixedExpensesMonthlyTotal,
        savingsGoal: dashboard.savingsGoal,
        cycleDays: cycle.days,
      }),
    [
      dashboard.incomeMode,
      dashboard.monthlyIncome,
      dashboard.cycleStartingBalanceOverride,
      cupoIncomeQuery.data,
      dashboard.fixedExpensesMonthlyTotal,
      dashboard.savingsGoal,
      cycle.days,
    ],
  )

  const snapshot = useGastosSnapshot({
    familyId,
    userId,
    cycleStart: cycle.start,
    cycleEnd: cycle.end,
    today,
    cupoDiario,
    // Pantalla VIEJA (hoy fuera de la tab: expenses.tsx monta la neo). Toma la
    // misma constante igual: comparte cache/queryKeys con la neo y con el warm
    // de Home, y un literal distinto acá se cobraría como cache-hit silencioso
    // en cualquiera de las dos (ver GASTOS_DAYS_PER_PAGE).
    daysPerPage: GASTOS_DAYS_PER_PAGE,
  })

  // Sonda del swap skeleton↔contenido. Un `content→skeleton→content` al
  // entrar = el snapshot se puso frío = el parpadeo.
  useBranchLog('gastos', snapshot.data ? 'content' : 'skeleton')

  if (!snapshot.data) {
    // Snapshot pending. Antes devolvíamos `null` → ~400ms de canvas en
    // blanco → el "flicker/salto" al entrar a Gastos la primera vez (el
    // resto de los tabs no lo sufren porque renderean del home_snapshot
    // warm). Ahora mostramos un skeleton estable con la MISMA estructura
    // (hero + calendario + filas) para que el primer frame ya tenga forma
    // y el swap a contenido real no se lea como un parpadeo. Seguimos sin
    // mountear el controller (evita los 6 RPCs en paralelo).
    return <GastosScreenSkeleton />
  }

  return <GastosV2ScreenContent familyId={familyId} userId={userId} />
}

function GastosV2ScreenContent({ familyId, userId }: GastosV2ScreenProps) {
  // Si esto re-monta al entrar (sin que GastosV2Screen re-monte) = el
  // contenido se re-construye → re-dispara entradas = parpadeo.
  useScreenLifecycleLog('Gastos·Content')
  // Abre el gate de layout en el primer scroll → las transiciones recién se
  // arman cuando el user interactúa, nunca durante el settle del primer attach.
  const openLayoutGate = useOpenLayoutGate()
  const router = useRouter()
  const { t } = useTranslation()
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
  // La barra neo flota con `max(inset, 22)` de anclaje (neo-tab-bar-live) +
  // ~83 de cuerpo → footprint ~105-117; el `max(inset, 22)` acá matchea ese
  // anclaje y deja un gap constante (con inset 0 el `+96` sin el max quedaba
  // corto y tapaba el último movimiento).
  const tabBarBottomPadding = Math.max(safeAreaInsets.bottom, 22) + 96

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

  // Sonda para detectar el caso "DB tiene expenses pero el cycle visible
  // está vacío" — típicamente porque el cycle se freezó esperando
  // confirm cobro. Owner feedback 2026-06-08: el empty state engañoso
  // ("Carga tu primer gasto") cuando ya hay gastos cargados.
  const recentExpensesQuery = useRecentExpenses(familyId, 3)
  const hasRecentExpensesOutsideCycle =
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
      const eventMs = incomeHappenedAtMs(i)
      return Number.isFinite(eventMs) && eventMs >= startMs && eventMs < endMs
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
            toast.success(i18n.t('gastos:noSpend.markedSuccess'))
          },
          onError: (error: unknown) => {
            void triggerHaptic('error')
            const message = error instanceof Error ? error.message : i18n.t('gastos:noSpend.unknownError')
            if (message.includes('EXPENSES_EXIST_ON_DATE')) {
              toast.error(i18n.t('gastos:noSpend.expensesExist'))
            } else if (message.includes('FUTURE_DATE_NOT_ALLOWED')) {
              toast.error(i18n.t('gastos:noSpend.futureDate'))
            } else {
              toast.error(i18n.t('gastos:noSpend.markFailed'))
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
            toast.info(i18n.t('gastos:noSpend.unmarkedSuccess'))
          },
          onError: (error: unknown) => {
            void triggerHaptic('error')
            toast.error(
              error instanceof Error
                ? error.message
                : i18n.t('gastos:noSpend.unmarkFailed'),
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
          Alert.alert(i18n.t('gastos:errors.deleteTitle'), getErrorMessage(error, i18n.t('states:error.server')))
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
              i18n.t('gastos:errors.deleteTitle'),
              getErrorMessage(error, i18n.t('states:error.server')),
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
  // NO deferimos aquí: el GastosAdvisorChip NO está "below the fold" — vive
  // en el header del SectionList (gastos-list-header), arriba de los
  // movimientos. Con `defer: true` las signals resolvían ~600ms después del
  // primer paint → el chip montaba de null (altura 0 → ~52px) → el
  // ListHeaderComponent crecía → el SectionList VIRTUALIZADO corregía su
  // content-size → "salto" visible en el primer attach del tab (solo Gastos
  // lo sufre porque Fijos/Control usan ScrollView que solo reflowea).
  // La query ya viene prefetcheada/warm (useWarmTabsSnapshots) y dedupeada
  // por React Query (misma queryKey que Control), así que leerla en el
  // primer paint es cache-read + buildControlSignals (lo mismo que hace el
  // tab Control sin defer): costo mínimo, altura del header estable, sin
  // salto. (Antes: audit §3.4 / item 18, con la premisa errónea de "below
  // the fold".)
  const { signals: advisorSignals } = useControlV2Data(familyId, undefined, {
    defer: false,
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
    // La metáfora de jardín reemplaza el StreakSheet: el header abre "Mi jardín".
    router.push('/(app)/garden')
  }, [router, trackTap])
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

  // Map controller groups → SectionList sections. Helper extraído a
  // `build-sections.ts` para mantener la screen orquestadora; la lógica
  // de merge día-con-solo-income, sort cronológico y bucketing por
  // event_date vive ahí (puro, sin renderer).
  const sections = useMemo<MovimientosSection[]>(
    () =>
      buildGastosSections({
        groups: controller.groups,
        cycleIncomeEvents,
        selectedDay: controller.selectedDay,
        // Ingresos de días todavía no paginados: no abren sección propia (si
        // no, el sueldo del día 1 cae al fondo del feed y abre un hueco de
        // semanas). Ver buildGastosSections.
        hasNextPage: controller.hasNextPage,
      }),
    [controller.groups, controller.selectedDay, cycleIncomeEvents, controller.hasNextPage],
  )

  const memberById = useMemo(() => {
    const map = new Map<string, (typeof familyMembers)[number]>()
    for (const m of familyMembers) map.set(m.id, m)
    return map
  }, [familyMembers])

  const renderItem = useCallback(
    ({ item: mv }: { item: MovementItem }) => {
      const isIncomePending =
        mv.kind === 'income' &&
        deleteIncomeMutation.isPending &&
        deleteIncomeMutation.variables?.id === mv.income.id
      const isExpensePending =
        mv.kind === 'expense' &&
        deleteExpenseMutation.isPending &&
        deleteExpenseMutation.variables === mv.expense.id
      return (
        <GastosMovementRow
          movement={mv}
          categoriesById={controller.categoriesById}
          memberById={memberById}
          animationEnabled={rowAnimationEnabled}
          isExpenseDeleting={isExpensePending}
          isIncomeDeleting={isIncomePending}
          onDeleteExpense={handleDelete}
          onDeleteIncome={handleDeleteIncome}
        />
      )
    },
    [
      controller.categoriesById,
      memberById,
      handleDelete,
      handleDeleteIncome,
      deleteExpenseMutation,
      deleteIncomeMutation,
      rowAnimationEnabled,
    ],
  )

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<MovementItem, MovimientosSection> }) => (
      <GastosSectionHeader
        section={section as MovimientosSection}
        animationEnabled={rowAnimationEnabled}
      />
    ),
    [rowAnimationEnabled],
  )

  const keyExtractor = useCallback(
    (item: MovementItem) =>
      item.kind === 'expense' ? `e-${item.expense.id}` : `i-${item.income.id}`,
    [],
  )

  // ── Auto-paginación GATEADA POR GESTO (portado de la neo) ───────────
  //
  // Antes acá vivía un `onEndReached={() => void controller.fetchNextPage()}`
  // pelado con `onEndReachedThreshold={0.5}`. Con la 1ª página en 7 días eso
  // pasaba inadvertido; con `GASTOS_DAYS_PER_PAGE = 2` el contenido inicial es
  // más corto que el viewport → `distanceFromEnd` ya es ~0 al montar y
  // `onEndReached` cascadea solo, trayendo 3 páginas en cold-start sin que el
  // usuario scrollee. (Esta pantalla no está en la tab hoy — `expenses.tsx`
  // monta la neo — pero el revert al viejo screen está documentado ahí como
  // acción esperada, así que no puede quedar sin la mitigación.)
  //
  // Mismo contrato que la neo:
  //  · el flag arranca en false → no carga al montar;
  //  · lo prende el 1er drag REAL del usuario (`onScrollBeginDrag`);
  //  · se baja al disparar → como mucho 1 página por gesto (sin cascada);
  //  · se baja también cuando el contenido ENCOGE, porque RN llama
  //    `_maybeCallOnEdgeReached()` desde `_onContentSizeChange` (VirtualizedList)
  //    y un colapso del feed (tocar un día del calendario, filtrar) dispararía
  //    la paginación sin que nadie esté cerca del fondo. El callback del usuario
  //    corre ANTES de ese chequeo, así que desarmar acá gana la carrera.
  // `controller.fetchNextPage` ya guardea contra hasNextPage/isFetchingNextPage.
  const controllerRef = useRef(controller)
  controllerRef.current = controller
  const canPaginateRef = useRef(false)
  const lastContentHeightRef = useRef(0)
  const handleScrollBeginDrag = useCallback(() => {
    canPaginateRef.current = true
    openLayoutGate()
  }, [openLayoutGate])
  const handleEndReached = useCallback(() => {
    if (!canPaginateRef.current) return
    canPaginateRef.current = false
    void controllerRef.current.fetchNextPage()
  }, [])
  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      if (height < lastContentHeightRef.current) canPaginateRef.current = false
      lastContentHeightRef.current = height
      onTourContentSizeChange(width, height)
    },
    [onTourContentSizeChange],
  )

  // Empty state — cuatro variants delegados a `buildGastosEmptyState`.
  // Rendered como ListEmptyComponent del SectionList cuando `sections`
  // está vacío.
  const goToHome = useCallback(
    () => router.push('/(app)/(tabs)/home'),
    [router],
  )
  const emptyState = useMemo(
    () =>
      buildGastosEmptyState({
        expensesCount: controller.expenses.length,
        filteredCount: controller.filteredExpenses.length,
        hasAnyFilter: controller.hasAnyFilter,
        hasRecentExpensesOutsideCycle,
        isDynamicIncome: controller.incomeMode === 'dynamic',
        onClearFilters: handleClearFilters,
        onGoToHome: goToHome,
      }),
    [
      controller.expenses.length,
      controller.filteredExpenses.length,
      controller.hasAnyFilter,
      controller.incomeMode,
      handleClearFilters,
      hasRecentExpensesOutsideCycle,
      goToHome,
    ],
  )

  // Chrome encima del virtualized list — extraído a `GastosListHeader`.
  // useMemo del JSX para que la SectionList no lo unmountee en cada data
  // update.
  const ListHeader = useMemo(
    () => (
      <GastosListHeader
        streakData={streakData}
        onPressStreak={handlePressStreak}
        cycleLabel={controller.cycleLabel}
        cycleStart={controller.cycleStart}
        cycleDays={controller.cycleDays}
        today={controller.today}
        filteredTotal={controller.filteredTotal}
        summaryChip={controller.summaryChip}
        topCategories={controller.topCategories}
        averageDaily={controller.averageDaily}
        recentDailyBars={controller.recentDailyBars}
        cycleDaysElapsed={controller.cycleDaysElapsed}
        selectedDay={controller.selectedDay}
        dailySpend={controller.dailySpend}
        dayMoods={controller.dayMoods}
        selectedCategoryId={controller.selectedCategoryId}
        filteredExpensesCount={controller.filteredExpenses.length}
        hasAnyFilter={controller.hasAnyFilter}
        onClearDay={controller.clearDay}
        onSelectDay={handleSelectDay}
        onPrevDay={handlePrevDay}
        onNextDay={handleNextDay}
        canGoPrev={navBounds.canGoPrev}
        canGoNext={navBounds.canGoNext}
        onRegisterForgotten={handleRegisterForgotten}
        onMarkNoSpend={handleMarkNoSpend}
        onUnmarkNoSpend={handleUnmarkNoSpend}
        noSpendMarkedDates={noSpendMarkedDates}
        categoriesList={categoriesList}
        expenseCountByCategoryId={expenseCountByCategoryId}
        onSelectCategory={handleSelectCategory}
        onClearFilters={handleClearFilters}
        advisorSignals={advisorSignals}
        categoryNameById={categoryNameById}
        onAdvisorPress={handleAdvisorPress}
        sectionsLength={sections.length}
      />
    ),
    [
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
          description={getErrorMessage(controller.error, i18n.t('states:error.server'))}
          title={t('gastos:errors.loadTitle')}
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
  //
  // !hasRecentExpensesOutsideCycle: si DB tiene expenses recientes pero
  // están fuera del cycle visible (típicamente cycle frozen por falta
  // de confirm cobro), NO somos un "first-run account". Renderear el
  // onboarding GastosEmptyState mintiría diciendo "Carga tu primer
  // gasto" cuando ya hay 3 cargados. Devolvemos false → renderea
  // SectionList con el empty state contextual ("Tus gastos esperan al
  // mes nuevo"). Owner feedback 2026-06-08.
  const isEmptyAccount =
    !controller.error &&
    controller.expenses.length === 0 &&
    cycleIncomeEvents.length === 0 &&
    !hasRecentExpensesOutsideCycle
  if (isEmptyAccount) {
    return (
      <Screen
        backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
        // Default scrollable Screen (mismo patrón que Fijos). NO usar
        // `styles.screenContent` aquí — ese estilo es del SectionList y
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
        // `tourMeasureRef` queda sin attach aquí) y el auto-scroll funciona
        // para los pasos de abajo (calendar/list) cuando el contenido
        // supera el viewport. Mismo enfoque que Fijos.
        scrollRef={tourScrollRef as unknown as RefObject<ScrollView | null>}
        onScroll={onTourScroll}
        onContentSizeChange={onTourContentSizeChange}
        scrollEventThrottle={16}
      >
        <View style={styles.emptyStateStack}>
          {/* Keep the streak flame + its tour target so the garden tour
              step and the flame keep working on the empty screen.
              (`streak` se renombró a `garden` — ver la nota en
              `gastos-list-header`.) */}
          <GastosHeader
            familyId={familyId}
            subtitle={t('gastos:header.cycleSubtitle', { cycle: controller.cycleLabel })}
            rightSlot={
              <TourTarget
                tour={GASTOS_TOUR}
                order={GASTOS_TOUR_STEPS.garden.order}
                text={GASTOS_TOUR_STEPS.garden.text}
                highlight={{ borderRadius: 20, padding: 6, pulse: true }}
              >
                <GardenLeafIcon data={streakData} onPress={handlePressStreak} />
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
        // Abre el gate de layout Y arma la auto-paginación (ver arriba).
        onScrollBeginDrag={handleScrollBeginDrag}
        // Tour + desarme del gate de paginación cuando el contenido ENCOGE.
        onContentSizeChange={handleContentSizeChange}
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
                accessibilityLabel={t('gastos:list.loadingMoreA11y')}
              >
                <ActivityIndicator size="small" color={theme.colors.textMuted} />
                <Text style={[styles.loadingMoreText, { color: theme.colors.textMuted }]}>
                  {t('gastos:list.loadingMoreDays')}
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
                  accessibilityLabel={t('gastos:list.endOfMonthA11y')}
                >
                  {t('gastos:list.endOfMonth')}
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
        // Virtual scroll GATEADO por gesto de usuario (ver handleEndReached):
        // sin el gate, con la 1ª página en 2 días el contenido inicial no llena
        // el viewport y `onEndReached` cascadea solo al montar.
        onEndReached={handleEndReached}
        // 0.1 (era 0.5) · el threshold se mide en VIEWPORTS desde el final
        // (`distanceFromEnd < threshold * visibleLength`): con 0.5 la carga
        // arrancaba a MEDIA pantalla del fondo. Con 0.1 dispara recién a ~10%
        // del viewport del fondo REAL. No se baja a 0: el offset del fondo no
        // cae exacto en cada gesto (rubber-band iOS, redondeos de fling).
        onEndReachedThreshold={0.1}
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
  skeletonStack: { paddingHorizontal: 20, gap: 16, paddingTop: 8 },
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
  listFooter: { gap: 12, paddingVertical: 16, alignItems: 'center' },
  loadingMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.8,
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
  emptyPrimary: { fontSize: 14, fontWeight: '700', fontFamily: nunitoFamily('700') },
  emptySecondary: { fontSize: 12, lineHeight: 16 },
})

