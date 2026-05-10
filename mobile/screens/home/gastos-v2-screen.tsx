import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListData,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { MaterialIcons } from '@expo/vector-icons'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { SwipeableRow, type SwipeAction } from '@/components/ui/swipeable-row'
import { GastoRow } from '@/components/gastos/gasto-row'
import { GastosAdvisorChip } from '@/components/gastos/gastos-advisor-chip'
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
import { useFamilyMembers } from '@/features/family/use-family-members'
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

interface MovimientosSection {
  title: string
  day: number
  total: number
  data: Expense[]
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
  const tourScrollRef = useRef<SectionList<Expense, MovimientosSection> | null>(null)
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
    trackTap('add_expense_cta', 'movements_empty', '/(app)/(tabs)/add')
    router.push('/(app)/(tabs)/add')
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
  // section that won't render rows.
  const sections = useMemo<MovimientosSection[]>(
    () =>
      controller.groups.map((g) => ({
        title: g.label,
        day: g.day,
        total: g.total,
        data: g.items,
      })),
    [controller.groups],
  )

  const renderItem = useCallback(
    ({ item }: { item: Expense }) => {
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
        // smooth instead of snapping: rows fade in as they enter the
        // filtered set, fade out as they leave, and slide into their
        // new position when remaining rows reflow. Item key (item.id)
        // is stable so unrelated rows don't re-trigger the entrance.
        <Animated.View
          style={styles.rowWrap}
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(140)}
          layout={LinearTransition.duration(220)}
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
    ],
  )

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<Expense, MovimientosSection> }) => (
      // Section headers also fade in / reflow when filtering changes
      // which day groups exist. Slightly faster than rows so the day
      // label arrives a beat before its rows finish entering.
      <Animated.View
        style={[styles.groupHeader, { backgroundColor: theme.colors.background }]}
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(120)}
        layout={LinearTransition.duration(220)}
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
    [theme.colors.background, theme.colors.text, theme.colors.textSoft],
  )

  const keyExtractor = useCallback((item: Expense) => item.id, [])

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
            <Pressable
              onPress={handleClearFilters}
              accessibilityRole="button"
              accessibilityLabel="Limpiar todos los filtros activos"
              hitSlop={8}
              style={({ pressed }) => [
                styles.clearFiltersBtn,
                {
                  backgroundColor: theme.colors.creamSoft,
                  borderColor: theme.colors.line,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <MaterialIcons name="filter-alt-off" size={14} color={theme.colors.textMuted} />
              <Text style={[styles.clearFiltersText, { color: theme.colors.textMuted }]}>
                Limpiar filtros
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
        <Animated.View layout={sectionLayout}>
          <GastosAdvisorChip
            signals={advisorSignals}
            selectedCategoryId={controller.selectedCategoryId}
            categoryNameById={categoryNameById}
            onPress={handleAdvisorPress}
          />
        </Animated.View>
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
              <Text style={[styles.swipeHint, { color: theme.colors.textMuted }]}>
                ‹ Desliza para acciones
              </Text>
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
      <Screen contentContainerStyle={styles.screenContent} scrollable={false}>
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

  return (
    <Screen scrollable={false} contentContainerStyle={styles.screenContent}>
      {/* Mounted as a Screen-level sibling (not inside the SectionList
          header) so the absolute-positioned blobs fill the whole canvas
          instead of getting clipped to the ListHeaderComponent cell. */}
      <AmbientBlobs />
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
      <SectionList<Expense, MovimientosSection>
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
                  backgroundColor: theme.colors.creamCard,
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
                <Pressable
                  onPress={emptyState.onAction}
                  accessibilityRole="button"
                  accessibilityLabel={emptyState.actionLabel}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.emptyAction,
                    {
                      backgroundColor: theme.colors.primarySurface,
                      borderColor: theme.colors.line,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.emptyActionText, { color: theme.colors.primary }]}>
                    {emptyState.actionLabel}
                  </Text>
                </Pressable>
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
              <Text
                style={[styles.endOfList, { color: theme.colors.textMuted }]}
                accessibilityRole="text"
              >
                — Fin del ciclo —
              </Text>
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
            tintColor="#A6EF8F"
            colors={['#297811']}
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
  groupTotal: { fontSize: 14, fontWeight: '800' },
  movimientosTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
  },
  movimientosTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
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
  endOfList: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
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
