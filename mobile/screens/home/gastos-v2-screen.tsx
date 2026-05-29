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
import { SwipeableRow, type SwipeAction } from '@/components/ui/swipeable-row'
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
import { useDeleteExpense, type Expense } from '@/features/expenses/use-expenses'
import { useIncomeEvents, type IncomeEvent } from '@/features/income/use-income-events'
import { ActivityRowV2 } from '@/components/home/activity-row-v2'
import { useFamilyMembers } from '@/features/family/use-family-members'
import { usePressScale } from '@/hooks/use-press-scale'
import { useGastosController } from '@/features/gastos/use-gastos-controller'
import { useGastosRealtime } from '@/features/gastos/use-gastos-realtime'
import { useGastosSnapshot } from '@/features/gastos/use-gastos-snapshot'
import { useGastosTelemetry } from '@/features/gastos/use-gastos-telemetry'
import { logScreenEvent } from '@/features/telemetry/log-screen-event'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import { useStreak, type StreakData } from '@/features/streaks/use-streak'
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
})

type MovementItem =
  | { kind: 'expense'; iso: string; expense: Expense }
  | { kind: 'income'; iso: string; income: IncomeEvent }

interface MovimientosSection {
  title: string
  day: number
  total: number
  data: MovementItem[]
}

const INCOME_KIND_LABEL_G: Record<IncomeEvent['kind'], string> = {
  transfer: 'Transferencia',
  bonus: 'Bono',
  gift: 'Regalo',
  other: 'Ingreso',
}

const INCOME_KIND_ICON_G: Record<IncomeEvent['kind'], string> = {
  transfer: '💸',
  bonus: '⭐',
  gift: '🎁',
  other: '💵',
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
      const t = Date.parse(i.created_at)
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
  const deleteExpenseMutation = useDeleteExpense(familyId)
  const streakQuery = useStreak(familyId, userId)
  const streakData = streakQuery.data ?? STREAK_DEFAULTS
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
    if (controller.selectedDay != null) {
      // Modo "día tappeado": el controller ya filtró a un solo día.
      // Mezclamos income solo de ese día, sin generar otras secciones.
      const base = controller.groups.map<MovimientosSection>((g) => ({
        title: g.label,
        day: g.day,
        total: g.total,
        data: g.items.map<MovementItem>((e) => ({
          kind: 'expense',
          iso: e.created_at,
          expense: e,
        })),
      }))
      const dayIncomes = cycleIncomeEvents.filter((i) => {
        const d = new Date(i.created_at)
        return d.getDate() === controller.selectedDay
      })
      if (base.length > 0 && dayIncomes.length > 0) {
        base[0]!.data = [
          ...base[0]!.data,
          ...dayIncomes.map<MovementItem>((i) => ({
            kind: 'income',
            iso: i.created_at,
            income: i,
          })),
        ].sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0))
      }
      return base
    }

    // Vista normal del cycle: mergeamos income en los buckets de día.
    const byDay = new Map<number, MovimientosSection>()
    for (const g of controller.groups) {
      byDay.set(g.day, {
        title: g.label,
        day: g.day,
        total: g.total,
        data: g.items.map<MovementItem>((e) => ({
          kind: 'expense',
          iso: e.created_at,
          expense: e,
        })),
      })
    }
    for (const income of cycleIncomeEvents) {
      const d = new Date(income.created_at)
      const day = d.getDate()
      const existing = byDay.get(day)
      const item: MovementItem = {
        kind: 'income',
        iso: income.created_at,
        income,
      }
      if (existing) {
        existing.data.push(item)
      } else {
        // Día sin gastos pero con ingreso → sección nueva. Total = 0
        // (no afecta el agregado de gastos). El header sigue mostrando
        // la fecha; el row income explica la fila.
        byDay.set(day, {
          title: formatStandaloneIncomeDay(d),
          day,
          total: 0,
          data: [item],
        })
      }
    }
    // Sort within day desc + sort sections by day desc.
    const merged = Array.from(byDay.values())
    for (const s of merged) {
      s.data.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0))
    }
    merged.sort((a, b) => b.day - a.day)
    return merged
  }, [controller.groups, controller.selectedDay, cycleIncomeEvents])

  const renderItem = useCallback(
    ({ item: mv }: { item: MovementItem }) => {
      // Income row — usamos ActivityRowV2 (amount positivo en verde +
      // ícono por kind). No tiene swipe-to-delete (los ingresos no se
      // borran desde acá; el flujo está en el form de Ingresos).
      if (mv.kind === 'income') {
        const income = mv.income
        const kindLabel = INCOME_KIND_LABEL_G[income.kind]
        const title = income.description?.trim() || kindLabel
        const who = familyMembers.find((m) => m.id === income.created_by)
        return (
          <Animated.View
            style={styles.rowWrap}
            entering={rowAnimationEnabled ? FadeIn.duration(180) : undefined}
            exiting={FadeOut.duration(140)}
            layout={rowAnimationEnabled ? LinearTransition.duration(220) : undefined}
          >
            <ActivityRowV2
              icon={INCOME_KIND_ICON_G[income.kind]}
              title={title}
              category={`Ingreso · ${kindLabel}`}
              whoName={who?.name ?? 'Alguien'}
              whoColor={who?.color ?? '#329315'}
              amount={Math.round(Math.abs(Number(income.amount ?? 0)))}
            />
          </Animated.View>
        )
      }
      const item = mv.expense
      const cat = controller.categoriesById.get(item.category_id)
      const who = familyMembers.find((m) => m.id === item.created_by)
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
        // smooth instead of snapping. `entering`/`layout` are gated
        // by `rowAnimationEnabled` so cold mount + virtualized scroll
        // recycle don't fire worklets that contend with the tab
        // transition. `exiting` stays on because rows leaving the
        // filtered set should always fade out (the parent stays
        // mounted, so the cost is bounded to actual deletions).
        <Animated.View
          style={styles.rowWrap}
          entering={rowAnimationEnabled ? FadeIn.duration(180) : undefined}
          exiting={FadeOut.duration(140)}
          layout={rowAnimationEnabled ? LinearTransition.duration(220) : undefined}
        >
          <SwipeableRow
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
          </SwipeableRow>
        </Animated.View>
      )
    },
    [
      controller.categoriesById,
      familyMembers,
      handleDelete,
      deleteExpenseMutation,
      theme.colors.textMuted,
      rowAnimationEnabled,
    ],
  )

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<MovementItem, MovimientosSection> }) => (
      // Section headers also fade in / reflow when filtering changes
      // which day groups exist. Same gating logic as rows: cold mount
      // → no entering animation; user toggles a filter → 500ms window
      // where new sections fade in.
      <Animated.View
        // Sticky date-group header: its opaque bg must match the canvas
        // so scrolling rows slide cleanly under it. On the near-black
        // dark canvas that means DARK_TAB_CANVAS, not the forest
        // `background` token.
        style={[
          styles.groupHeader,
          {
            backgroundColor: theme.isDark
              ? DARK_TAB_CANVAS
              : theme.colors.background,
          },
        ]}
        entering={rowAnimationEnabled ? FadeIn.duration(160) : undefined}
        exiting={FadeOut.duration(120)}
        layout={rowAnimationEnabled ? LinearTransition.duration(220) : undefined}
      >
        <View>
          <Text style={[styles.groupLabel, { color: theme.colors.text }]}>
            {section.title}
          </Text>
          <Text style={[styles.groupMeta, { color: theme.colors.textSoft }]}>
            {section.data.length} movimiento{section.data.length === 1 ? '' : 's'}
          </Text>
        </View>
        <Text style={[styles.groupTotal, { color: theme.colors.text }]}>
          -{formatMoney(section.total)}
        </Text>
      </Animated.View>
    ),
    [theme.isDark, theme.colors.background, theme.colors.text, theme.colors.textSoft, rowAnimationEnabled],
  )

  const keyExtractor = useCallback(
    (item: MovementItem) =>
      item.kind === 'expense' ? `e-${item.expense.id}` : `i-${item.income.id}`,
    [],
  )

  // Empty state — three variants. Rendered as ListEmptyComponent of
  // the SectionList when `sections` is empty (no day groups passed).
  const emptyState = useMemo(() => {
    if (controller.expenses.length === 0) {
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
        primary: 'Aún sin gastos en este ciclo',
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
                  accessibilityLabel="Fin del ciclo"
                >
                  FIN DEL CICLO
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
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 2,
    paddingTop: 14,
    paddingBottom: 6,
  },
  groupLabel: { fontSize: 14, fontWeight: '700' },
  groupMeta: { fontSize: 11 },
  // Tabular nums acá porque el total se renderea en columna right-aligned
  // por encima del groupTotal de la siguiente sección. Sin tabular, los
  // dígitos proporcionales (1 vs 8) hacen que la columna wobblee al
  // scrollear. Mismo principio para GastoRow.amount.
  groupTotal: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
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
