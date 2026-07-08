import { useEffect, useMemo } from 'react'
import { Platform } from 'react-native'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { computeDailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useFamily } from '@/features/family/use-family'
import { useCycleIncomeEventsTotal } from '@/features/income/use-income-events'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import { canUseNativePushNotifications } from '@/lib/runtime-environment'
import i18n from '@/lib/i18n'
import { formatLocalDateKey } from '@/utils/pay-cycle'

const CHECKIN_NOTIFICATION_KEY = 'daily-budget-checkin'
const THRESHOLD_NOTIFICATION_KEY = 'daily-budget-threshold'

export function useDailyBudgetNudges() {
  const sessionQuery = useAuthSession()
  const userId = sessionQuery.data?.user.id
  const familyQuery = useFamily(userId)
  const familyId = familyQuery.data?.familyId
  const dashboard = useFamilyDashboard(familyId)
  const expensesQuery = useExpenses(familyId)
  const variableExpenses = useMemo(
    () => (expensesQuery.data ?? []).filter((expense) => !expense.commitment_id),
    [expensesQuery.data],
  )
  // Modo INGRESO DINÁMICO: el hogar no tiene sueldo (monthlyIncome = 0)
  // y sin este mapeo el umbral del 70% nunca dispararía (openingBudget
  // quedaba en 0). El presupuesto BRUTO del ciclo = ingresos cargados
  // (+ override real si lo hay), que el engine ya sabe re-anclar a hoy
  // — mismo modelo que el hero (family-dashboard-model + hero metrics).
  const isDynamicIncome = dashboard.incomeMode === 'dynamic'
  const cycleIncomeQuery = useCycleIncomeEventsTotal(
    isDynamicIncome ? familyId : undefined,
    formatLocalDateKey(dashboard.monthlyAccounting.start),
    formatLocalDateKey(dashboard.monthlyAccounting.end),
  )
  const cycleExtraIncome = cycleIncomeQuery.data ?? 0
  const effectiveCycleStartingBalance = isDynamicIncome
    ? (dashboard.cycleStartingBalanceOverride ?? 0) + cycleExtraIncome
    : dashboard.cycleStartingBalanceOverride

  const summary = useMemo(() => {
    if (!familyId) {
      return null
    }

    return computeDailyBudgetSummary({
      bufferMode: dashboard.dailyBudgetBufferMode,
      bufferValue: dashboard.dailyBudgetBufferValue,
      expenses: variableExpenses,
      fixedExpensesMonthlyTotal: dashboard.fixedExpensesMonthlyTotal,
      monthlyIncome: dashboard.monthlyIncome,
      monthlyAccounting: dashboard.monthlyAccounting,
      savingsGoal: dashboard.savingsGoal,
      today: dashboard.todayDate,
      cycleStartingBalance: effectiveCycleStartingBalance,
    })
  }, [
    effectiveCycleStartingBalance,
    dashboard.dailyBudgetBufferMode,
    dashboard.dailyBudgetBufferValue,
    dashboard.fixedExpensesMonthlyTotal,
    dashboard.monthlyIncome,
    dashboard.monthlyAccounting,
    dashboard.savingsGoal,
    dashboard.todayDate,
    variableExpenses,
    familyId,
  ])

  useEffect(() => {
    if (
      !canUseNativePushNotifications ||
      !familyId ||
      !summary ||
      !dashboard.dailyBudgetNudgesEnabled
    ) {
      return
    }

    let isCancelled = false

    void (async () => {
      const Notifications = await import('expo-notifications')
      const { status } = await Notifications.getPermissionsAsync()

      if (isCancelled || status !== 'granted') {
        return
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
        })
      }

      const now = new Date()

      // "Presupuesto del día listo" (checkin local diario) se RETIRÓ (2026-06-19):
      // era redundante con el push server "Buen día" (checkin_morning, mismo
      // ~9am pero con el monto real). La local REQUIERE permiso de notifs (igual
      // que el push, ver el guard de arriba), así que nunca fue un fallback para
      // "sin push": si tenías permiso llegaban las DOS. Cancelamos cualquiera que
      // haya quedado agendada de versiones previas para que deje de dispararse en
      // installs existentes; ya no se re-agenda. (Se conserva "Cierra tu día", la
      // del umbral 70%, que es contextual y no se pisa con nada server-side.)
      const scheduled = await Notifications.getAllScheduledNotificationsAsync()
      const staleCheckins = scheduled.filter(
        (item) => item.content.data?.key === `${CHECKIN_NOTIFICATION_KEY}:${familyId}`,
      )
      await Promise.all(
        staleCheckins.map((item) =>
          Notifications.cancelScheduledNotificationAsync(item.identifier),
        ),
      )

      const thresholdKey = `${THRESHOLD_NOTIFICATION_KEY}:${familyId}:${formatLocalDateKey(dashboard.todayDate)}`
      const hasThresholdLog = (await getPersistentValue(thresholdKey)) === '1'
      const hour = now.getHours()
      const hasCrossedThreshold =
        summary.openingBudget > 0 && summary.todaySpent >= summary.openingBudget * 0.7

      if (!hasThresholdLog && hasCrossedThreshold && hour < 18 && !isCancelled) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: i18n.t('home:dailyBudgetNudge.closeDayTitle'),
            // Sprint Q · Q-1: no amounts on the lock screen. The
            // contextual amount/projection lives in `data` so the
            // in-app surface can still tailor the message.
            body: i18n.t('home:dailyBudgetNudge.closeDayBody'),
            data: {
              kind: THRESHOLD_NOTIFICATION_KEY,
              url: '/expenses',
              remainingToday: summary.remainingToday,
              projectedTomorrowOpening: summary.projectedTomorrowOpening,
            },
            sound: 'default',
          },
          trigger: {
            channelId: 'default',
            seconds: 1,
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          },
        })

        await setPersistentValue(thresholdKey, '1')
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [
    dashboard.dailyBudgetNudgesEnabled,
    dashboard.todayDate,
    familyId,
    summary,
  ])
}
