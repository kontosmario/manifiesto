import { Alert, StyleSheet, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { GastosHeader } from '@/components/gastos/gastos-header'
import { GastosHeroCard } from '@/components/gastos/gastos-hero-card'
import { GastosMonthCalendar } from '@/components/gastos/gastos-month-calendar'
import { GastosSmartFilter } from '@/components/gastos/gastos-smart-filter'
import { GastosMovimientos } from '@/components/gastos/gastos-movimientos'
import { StreakFlameIcon } from '@/components/gastos/streak-flame-icon'
import { StreakSheet } from '@/components/gastos/streak-sheet'
import { useDeleteExpense } from '@/features/expenses/use-expenses'
import { useFamilyMembers } from '@/features/family/use-family-members'
import {
  useGastosController,
  type GastosDateRange,
} from '@/features/gastos/use-gastos-controller'
import { useLocalSearchParams } from 'expo-router'
import { useStreak } from '@/features/streaks/use-streak'
import { triggerHaptic } from '@/lib/haptics'
import { errorMessages } from '@/lib/copy/states'
import { getErrorMessage } from '@/utils/error-message'

interface GastosV2ScreenProps {
  familyId: string
  userId: string
}

/**
 * New Gastos screen — V1 Cuaderno port. Work in progress: ships the
 * header + hero card first and will grow to include insights row,
 * month calendar, smart filter and the grouped movements list.
 */
export function GastosV2Screen({ familyId, userId }: GastosV2ScreenProps) {
  const router = useRouter()
  // Asistente Financiero deep-links: the URL may carry an initial
  // filter preset (category, price band, date range, or a focused
  // expense id). We seed the controller with those values once so the
  // screen opens already filtered.
  const params = useLocalSearchParams<{
    categoryId?: string
    priceMax?: string
    priceMin?: string
    dateRange?: string
    focusExpenseId?: string
  }>()
  const initialCategoryId =
    typeof params.categoryId === 'string' && params.categoryId.length > 0
      ? params.categoryId
      : null
  const initialSmartFilter = {
    priceMax: toFiniteNumber(params.priceMax),
    priceMin: toFiniteNumber(params.priceMin),
    dateRange: toDateRange(params.dateRange),
    focusExpenseId:
      typeof params.focusExpenseId === 'string' &&
      params.focusExpenseId.length > 0
        ? params.focusExpenseId
        : undefined,
  }
  const controller = useGastosController(familyId, {
    initialCategoryId,
    initialSmartFilter,
  })
  const membersQuery = useFamilyMembers(familyId)
  const deleteExpenseMutation = useDeleteExpense(familyId)
  const streakQuery = useStreak(familyId, userId)
  const streakData = streakQuery.data ?? {
    currentStreak: 0,
    longestStreak: 0,
    totalDaysLogged: 0,
    hasLoggedToday: false,
    hasMarkedNoExpenseToday: false,
    freezeTokens: 0,
    weekActivity: new Array(7).fill(false),
    isBroken: false,
  }
  const [streakSheetVisible, setStreakSheetVisible] = useState(false)

  const handleDelete = useCallback(
    (expenseId: string) => {
      void triggerHaptic('warning')
      deleteExpenseMutation.mutate(expenseId, {
        onError: (error: unknown) => {
          void triggerHaptic('error')
          Alert.alert('No pudimos eliminar', getErrorMessage(error, errorMessages.server))
        },
        onSuccess: () => void triggerHaptic('success'),
      })
    },
    [deleteExpenseMutation],
  )

  // Per-category movement counts across the month (respecting the day
  // filter) — used by the smart filter pills + "Ver todas" sheet.
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

  const handlePressAdd = () => {
    void triggerHaptic('light')
    router.push('/(app)/(tabs)/add')
  }
  const handlePressStreak = () => {
    void triggerHaptic('selection')
    setStreakSheetVisible(true)
  }

  if (controller.error && controller.filteredExpenses.length === 0) {
    return (
      <Screen contentContainerStyle={styles.screenContent} scrollable={false}>
        <ErrorState
          description={getErrorMessage(controller.error, errorMessages.server)}
          title="No pudimos cargar tus gastos"
        />
      </Screen>
    )
  }

  // Each section in the stack gets `layout={LinearTransition}` so when
  // one section grows or shrinks (e.g. the hero when top-categories
  // change on a day-filter switch), the siblings below glide to their
  // new Y-position instead of snapping.
  const sectionLayout = LinearTransition.duration(260)

  return (
    <Screen contentContainerStyle={styles.screenContent}>
      <View style={styles.stack}>
        <AmbientBlobs />
        <Animated.View layout={sectionLayout}>
          <GastosHeader
            subtitle={`Ciclo ${controller.cycleLabel}`}
            rightSlot={<StreakFlameIcon data={streakData} onPress={handlePressStreak} />}
          />
        </Animated.View>
        <Animated.View layout={sectionLayout}>
          <GastosHeroCard
            totalVisible={controller.filteredTotal}
            summaryChip={controller.summaryChip}
            topCategories={controller.topCategories}
            averageDaily={controller.averageDaily}
            averageDailyBars={controller.recentDailyBars}
          />
        </Animated.View>
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
            onSelectDay={controller.setSelectedDay}
            onClearDay={controller.clearDay}
            onPrevDay={() =>
              controller.setSelectedDay(
                stepCycleDay(
                  controller.selectedDay,
                  controller.cycleStart,
                  controller.cycleDays,
                  controller.today,
                  -1,
                ),
              )
            }
            onNextDay={() =>
              controller.setSelectedDay(
                stepCycleDay(
                  controller.selectedDay,
                  controller.cycleStart,
                  controller.cycleDays,
                  controller.today,
                  1,
                ),
              )
            }
            {...getCycleNavBounds(
              controller.selectedDay,
              controller.cycleStart,
              controller.cycleDays,
              controller.today,
            )}
            onRegisterForgottenExpense={(date) => {
              void triggerHaptic('light')
              // Format as local YYYY-MM-DD (no timezone drift) so the
              // add-expense screen parses it as the exact day the user
              // tapped, regardless of UTC offset.
              const y = date.getFullYear()
              const m = `${date.getMonth() + 1}`.padStart(2, '0')
              const d = `${date.getDate()}`.padStart(2, '0')
              router.push({
                pathname: '/(app)/add-expense',
                params: { date: `${y}-${m}-${d}` },
              })
            }}
          />
        </Animated.View>
        <Animated.View layout={sectionLayout}>
          <GastosSmartFilter
            categories={categoriesList}
            expenseCountByCategoryId={expenseCountByCategoryId}
            totalCount={controller.filteredExpenses.length}
            selectedCategoryId={controller.selectedCategoryId}
            onSelect={controller.setSelectedCategoryId}
          />
        </Animated.View>
        <Animated.View layout={sectionLayout}>
          <GastosMovimientos
            groups={controller.groups}
            categoriesById={controller.categoriesById}
            familyMembers={membersQuery.data ?? []}
            onDelete={handleDelete}
            pendingExpenseId={
              deleteExpenseMutation.isPending
                ? (deleteExpenseMutation.variables ?? null)
                : null
            }
          />
        </Animated.View>
        <View style={styles.bottomSpacer} />
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
  screenContent: { paddingTop: 14 },
  stack: { gap: 10 },
  bottomSpacer: { height: 24 },
})

/** Offset (0-indexed) of the first day of the cycle when the calendar
 *  starts on Monday. JS Date.getDay returns 0=Sun..6=Sat; we shift
 *  so 0=Mon..6=Sun. */
function getMondayFirstOffset(cycleStart: Date): number {
  const jsDow = cycleStart.getDay() // 0=Sun..6=Sat
  return (jsDow + 6) % 7
}

/**
 * Moves the selected calendar day forward or backward one position
 * within the cycle window, CLAMPED at both edges:
 *   · backward stops at the cycle start
 *   · forward stops at the earlier of (cycle end - 1, today)
 * Returns the new calendar day-of-month, or the same `selected` when
 * already at a boundary (no-op).
 */
function stepCycleDay(
  selected: number | null,
  cycleStart: Date,
  cycleDays: number,
  today: Date,
  direction: 1 | -1,
): number | null {
  if (selected == null) return null
  const cycleDates: Date[] = []
  for (let i = 0; i < cycleDays; i++) {
    cycleDates.push(
      new Date(
        cycleStart.getFullYear(),
        cycleStart.getMonth(),
        cycleStart.getDate() + i,
      ),
    )
  }
  const idx = cycleDates.findIndex((d) => d.getDate() === selected)
  if (idx === -1) return cycleDates[0].getDate()
  const todayMs = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime()
  const target = idx + direction
  if (target < 0 || target >= cycleDays) return selected
  const targetDate = cycleDates[target]
  if (!targetDate) return selected
  // Forward direction can't cross today (no future days).
  if (direction === 1 && targetDate.getTime() > todayMs) return selected
  return targetDate.getDate()
}

/**
 * Returns whether prev / next chevrons should be enabled given the
 * current selection. The calendar uses these to disable the chevron
 * controls so users can't try to drift off the cycle window or into
 * the future.
 */
function getCycleNavBounds(
  selected: number | null,
  cycleStart: Date,
  cycleDays: number,
  today: Date,
): { canGoPrev: boolean; canGoNext: boolean } {
  if (selected == null) return { canGoPrev: false, canGoNext: false }
  const cycleDates: Date[] = []
  for (let i = 0; i < cycleDays; i++) {
    cycleDates.push(
      new Date(
        cycleStart.getFullYear(),
        cycleStart.getMonth(),
        cycleStart.getDate() + i,
      ),
    )
  }
  const idx = cycleDates.findIndex((d) => d.getDate() === selected)
  if (idx === -1) return { canGoPrev: false, canGoNext: false }
  const todayMs = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime()
  const canGoPrev = idx > 0
  const nextDate = cycleDates[idx + 1]
  const canGoNext = Boolean(nextDate) && nextDate!.getTime() <= todayMs
  return { canGoPrev, canGoNext }
}

function toFiniteNumber(raw: string | string[] | undefined): number | undefined {
  if (typeof raw !== 'string') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

function toDateRange(
  raw: string | string[] | undefined,
): GastosDateRange | undefined {
  if (typeof raw !== 'string') return undefined
  switch (raw) {
    case 'today':
    case 'last-7':
    case 'first-3-days':
    case 'last-3-days':
    case 'nights':
    case 'all':
      return raw
    default:
      return undefined
  }
}
