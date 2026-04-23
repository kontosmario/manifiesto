import { Alert, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { GastosHeader } from '@/components/gastos/gastos-header'
import { GastosHeroCard } from '@/components/gastos/gastos-hero-card'
import { GastosInsightsRow } from '@/components/gastos/gastos-insights-row'
import { GastosMonthCalendar } from '@/components/gastos/gastos-month-calendar'
import { GastosSmartFilter } from '@/components/gastos/gastos-smart-filter'
import { GastosMovimientos } from '@/components/gastos/gastos-movimientos'
import { useDeleteExpense } from '@/features/expenses/use-expenses'
import { useFamilyMembers } from '@/features/family/use-family-members'
import { useGastosController } from '@/features/gastos/use-gastos-controller'
import { triggerHaptic } from '@/lib/haptics'
import { errorMessages } from '@/lib/copy/states'
import { getErrorMessage } from '@/utils/error-message'

interface GastosV2ScreenProps {
  familyId: string
}

/**
 * New Gastos screen — V1 Cuaderno port. Work in progress: ships the
 * header + hero card first and will grow to include insights row,
 * month calendar, smart filter and the grouped movements list.
 */
export function GastosV2Screen({ familyId }: GastosV2ScreenProps) {
  const router = useRouter()
  const controller = useGastosController(familyId)
  const membersQuery = useFamilyMembers(familyId)
  const deleteExpenseMutation = useDeleteExpense(familyId)

  const handleDelete = (expenseId: string) => {
    void triggerHaptic('warning')
    deleteExpenseMutation.mutate(expenseId, {
      onError: (error: unknown) => {
        void triggerHaptic('error')
        Alert.alert('No pudimos eliminar', getErrorMessage(error, errorMessages.server))
      },
      onSuccess: () => void triggerHaptic('success'),
    })
  }

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

  return (
    <Screen contentContainerStyle={styles.screenContent}>
      <View style={styles.stack}>
        <AmbientBlobs />
        <GastosHeader onPressAdd={handlePressAdd} />
        <GastosHeroCard
          totalVisible={controller.filteredTotal}
          summaryChip={controller.summaryChip}
          topCategories={controller.topCategories}
        />
        <GastosInsightsRow
          averageDaily={controller.averageDaily}
          streakDays={controller.registrationStreak}
        />
        <GastosMonthCalendar
          dayMoods={controller.dayMoods}
          todayDay={controller.today.getUTCDate()}
          daysInMonth={controller.daysInMonth}
          firstWeekdayOffset={getMondayFirstOffset(controller.today)}
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
          monthLabel={MONTH_ES[controller.monthIndex]}
          onSelectDay={controller.setSelectedDay}
          onClearDay={controller.clearDay}
          onPrevDay={() =>
            controller.setSelectedDay(
              controller.selectedDay == null
                ? null
                : controller.selectedDay <= 1
                  ? controller.daysInMonth
                  : controller.selectedDay - 1,
            )
          }
          onNextDay={() =>
            controller.setSelectedDay(
              controller.selectedDay == null
                ? null
                : controller.selectedDay >= controller.daysInMonth
                  ? 1
                  : controller.selectedDay + 1,
            )
          }
        />
        <GastosSmartFilter
          categories={categoriesList}
          expenseCountByCategoryId={expenseCountByCategoryId}
          totalCount={controller.filteredExpenses.length}
          selectedCategoryId={controller.selectedCategoryId}
          onSelect={controller.setSelectedCategoryId}
        />
        <GastosMovimientos
          groups={controller.groups}
          categoriesById={controller.categoriesById}
          familyMembers={membersQuery.data ?? []}
          onDelete={handleDelete}
        />
        <View style={styles.bottomSpacer} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: { paddingTop: 0 },
  stack: { gap: 10 },
  bottomSpacer: { height: 24 },
})

const MONTH_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** Offset (0-indexed) of the first of the month when the calendar
 *  starts on Monday. JS Date.getUTCDay returns 0=Sun..6=Sat; we shift
 *  so 0=Mon..6=Sun. */
function getMondayFirstOffset(today: Date): number {
  const firstOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const jsDow = firstOfMonth.getUTCDay() // 0=Sun..6=Sat
  return (jsDow + 6) % 7
}
