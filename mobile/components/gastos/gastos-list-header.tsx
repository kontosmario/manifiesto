// Chrome encima del SectionList del feed de Gastos: header + hero +
// calendar + filter + clear-filters + advisor + título "Movimientos".
// Extraído del useMemo de `ListHeader` inline en `gastos-v2-screen.tsx`
// para que la screen quede como orquestador. Recibe TODO lo que precisa
// como props — no hooks adentro (excepto theme), así la memoization de
// la screen sigue siendo predecible.
import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { RiseView } from '@/components/home/animated/rise-view'
import { useGatedLayout } from '@/hooks/use-layout-transition-gate'
import { GastosAdvisorChip } from '@/components/gastos/gastos-advisor-chip'
import { GastosHeader } from '@/components/gastos/gastos-header'
import { GastosHeroCard } from '@/components/gastos/gastos-hero-card'
import { GastosMonthCalendar } from '@/components/gastos/gastos-month-calendar'
import { GastosSmartFilter } from '@/components/gastos/gastos-smart-filter'
import { GardenLeafIcon } from '@/components/garden/garden-leaf-icon'
import { ClearFiltersButton } from '@/components/gastos/clear-filters-button'
import {
  GASTOS_TOUR,
  GASTOS_TOUR_STEPS,
  TourTarget,
} from '@/features/tours'
import {
  getMondayFirstOffset,
} from '@/features/gastos/gastos-helpers'
import type { StreakData } from '@/features/streaks/use-streak'
import { useAppTheme } from '@/theme/theme-provider'
import type { UseGastosControllerResult } from '@/features/gastos/use-gastos-controller'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import type { CategoryLite } from '@/features/gastos/gastos-aggregates.model'
import { nunitoFamily } from '@/theme/typography'

export interface GastosListHeaderProps {
  streakData: StreakData
  onPressStreak: () => void
  // Datos del controller (paso explícito en vez de pasar el controller
  // completo así el dep array de la screen queda granular).
  cycleLabel: string
  cycleStart: Date
  cycleDays: number
  today: Date
  filteredTotal: number
  summaryChip: UseGastosControllerResult['summaryChip']
  topCategories: UseGastosControllerResult['topCategories']
  averageDaily: number
  recentDailyBars: number[]
  cycleDaysElapsed: number
  selectedDay: number | null
  dailySpend: UseGastosControllerResult['dailySpend']
  dayMoods: UseGastosControllerResult['dayMoods']
  selectedCategoryId: string | null
  filteredExpensesCount: number
  hasAnyFilter: boolean
  onClearDay: () => void
  onSelectDay: (day: number | null) => void
  onPrevDay: () => void
  onNextDay: () => void
  canGoPrev: boolean
  canGoNext: boolean
  onRegisterForgotten: (date: Date) => void
  onMarkNoSpend: (date: Date) => void
  onUnmarkNoSpend: (date: Date) => void
  noSpendMarkedDates: Set<string>
  categoriesList: CategoryLite[]
  expenseCountByCategoryId: Map<string, number>
  onSelectCategory: (id: string | null) => void
  onClearFilters: () => void
  advisorSignals: ControlAdvisorTask[]
  categoryNameById: Map<string, string>
  onAdvisorPress: () => void
  /** Cuántas secciones hay en el list — controla si se muestra el
   *  "Desliza para acciones" debajo del título "Movimientos". */
  sectionsLength: number
}

export function GastosListHeader(props: GastosListHeaderProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  // Gateado: en el primer attach del tab (pre-mounted + detached) NO
  // disparamos las layout transitions de las secciones del header — sino
  // toda la cabecera warpea cuando el data warm se asienta. Se habilita
  // tras el idle para los cambios reales (cambiar filtro, día, etc).
  const sectionLayout = useGatedLayout(LinearTransition.duration(260))
  const {
    streakData,
    onPressStreak,
    cycleLabel,
    cycleStart,
    cycleDays,
    today,
    filteredTotal,
    summaryChip,
    topCategories,
    averageDaily,
    recentDailyBars,
    cycleDaysElapsed,
    selectedDay,
    dailySpend,
    dayMoods,
    selectedCategoryId,
    filteredExpensesCount,
    hasAnyFilter,
    onClearDay,
    onSelectDay,
    onPrevDay,
    onNextDay,
    canGoPrev,
    canGoNext,
    onRegisterForgotten,
    onMarkNoSpend,
    onUnmarkNoSpend,
    noSpendMarkedDates,
    categoriesList,
    expenseCountByCategoryId,
    onSelectCategory,
    onClearFilters,
    advisorSignals,
    onAdvisorPress,
    sectionsLength,
  } = props

  const firstWeekdayOffset = useMemo(
    () => getMondayFirstOffset(cycleStart),
    [cycleStart],
  )
  // El chip matchea `signal.cat` (nombre CRUDO de la categoría, en
  // español) contra el nombre de la categoría seleccionada. Por eso acá
  // armamos el lookup con el `rawName` crudo, NO con el `name` localizado:
  // el `categoryNameById` del prop viene localizado y rompería el match en
  // EN (el signal trae "Comida" pero el display sería "Food").
  const rawCategoryNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categoriesList) {
      m.set(c.id, c.rawName ?? c.name)
    }
    return m
  }, [categoriesList])
  const selectedDayTotal =
    selectedDay != null ? (dailySpend[selectedDay]?.total ?? 0) : 0
  const selectedDayCount =
    selectedDay != null ? (dailySpend[selectedDay]?.count ?? 0) : 0

  return (
    <View style={styles.headerStack}>
      <Animated.View layout={sectionLayout}>
        <GastosHeader
          subtitle={t('gastos:header.cycleSubtitle', { cycle: cycleLabel })}
          rightSlot={
            <TourTarget
              tour={GASTOS_TOUR}
              // Antes `streak`. El paso se renombró a `garden` cuando el
              // header de la Gastos NEO se partió en dos (desplegable de ciclo
              // + acceso al jardín): acá el target SIEMPRE fue el ícono del
              // jardín, así que el mapeo es el mismo. Esta pantalla no tiene
              // desplegable de ciclos → el paso `cycles` no se registra y el
              // tour lo omite, igual que `filters` en el empty state.
              order={GASTOS_TOUR_STEPS.garden.order}
              text={GASTOS_TOUR_STEPS.garden.text}
              // Match the icon's rounded-square geometry (44×44,
              // borderRadius 14) and pad enough to cover the
              // absolutely-positioned count badge that pokes out
              // en top:-5 / right:-5.
              highlight={{ borderRadius: 20, padding: 6, pulse: true }}
            >
              <GardenLeafIcon data={streakData} onPress={onPressStreak} />
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
            totalVisible={filteredTotal}
            summaryChip={summaryChip}
            topCategories={topCategories}
            averageDaily={averageDaily}
            averageDailyBars={recentDailyBars}
            averageWindowDays={cycleDaysElapsed}
            daySelected={selectedDay != null}
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
              dayMoods={dayMoods}
              todayDay={today.getDate()}
              cycleStart={cycleStart}
              cycleDays={cycleDays}
              firstWeekdayOffset={firstWeekdayOffset}
              selectedDay={selectedDay}
              selectedDayTotal={selectedDayTotal}
              selectedDayCount={selectedDayCount}
              cycleLabel={cycleLabel}
              onSelectDay={onSelectDay}
              onClearDay={onClearDay}
              onPrevDay={onPrevDay}
              onNextDay={onNextDay}
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
              onRegisterForgottenExpense={onRegisterForgotten}
              onMarkNoSpend={onMarkNoSpend}
              onUnmarkNoSpend={onUnmarkNoSpend}
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
            totalCount={filteredExpensesCount}
            selectedCategoryId={selectedCategoryId}
            onSelect={onSelectCategory}
          />
        </Animated.View>
      </TourTarget>
      {hasAnyFilter ? (
        <Animated.View layout={sectionLayout}>
          <ClearFiltersButton onPress={onClearFilters} />
        </Animated.View>
      ) : null}
      {/* delay=160 cierra la cascada (header 0 → hero 100 → calendar 120
          → filter 140 → advisor 160). Antes el chip aparecía a 0ms sin
          stagger junto al header, rompiendo la lectura top-down. */}
      <RiseView delay={160}>
        <Animated.View layout={sectionLayout}>
          <GastosAdvisorChip
            signals={advisorSignals}
            selectedCategoryId={selectedCategoryId}
            categoryNameById={rawCategoryNameById}
            onPress={onAdvisorPress}
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
            {t('gastos:list.movementsTitle')}
          </Text>
          {sectionsLength > 0 ? (
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
                {t('gastos:list.swipeHint')}
              </Text>
            </View>
          ) : null}
        </View>
      </TourTarget>
    </View>
  )
}

const styles = StyleSheet.create({
  headerStack: { gap: 10, marginBottom: 8 },
  movimientosTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
  },
  movimientosTitle: { fontSize: 20, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: -0.5 },
  swipeHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  swipeHint: { fontSize: 11 },
})
