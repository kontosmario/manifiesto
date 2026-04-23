import { useEffect, useMemo } from 'react'
import { Platform } from 'react-native'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { computeDailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useFamily } from '@/features/family/use-family'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import { canUseNativePushNotifications } from '@/lib/runtime-environment'
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
      payCycle: dashboard.payCycle,
      savingsGoal: dashboard.savingsGoal,
      today: dashboard.todayDate,
    })
  }, [
    dashboard.dailyBudgetBufferMode,
    dashboard.dailyBudgetBufferValue,
    dashboard.fixedExpensesMonthlyTotal,
    dashboard.monthlyIncome,
    dashboard.payCycle,
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
      const triggerDate = new Date(now)
      triggerDate.setHours(dashboard.dailyBudgetCheckinHour, 0, 0, 0)

      if (triggerDate <= now) {
        triggerDate.setDate(triggerDate.getDate() + 1)
      }

      const isSameDayCheckin = formatLocalDateKey(triggerDate) === formatLocalDateKey(dashboard.todayDate)
      const checkinBudget = isSameDayCheckin ? summary.openingBudget : summary.projectedTomorrowOpening

      const scheduled = await Notifications.getAllScheduledNotificationsAsync()
      const existingCheckins = scheduled.filter(
        (item) => item.content.data?.key === `${CHECKIN_NOTIFICATION_KEY}:${familyId}`,
      )

      await Promise.all(existingCheckins.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)))

      if (!isCancelled) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Presupuesto del día listo',
            body: `Hoy arrancás con ${formatMoney(checkinBudget)} para moverte con margen.`,
            data: {
              key: `${CHECKIN_NOTIFICATION_KEY}:${familyId}`,
              kind: CHECKIN_NOTIFICATION_KEY,
              url: '/expenses',
            },
            sound: 'default',
          },
          trigger: {
            channelId: 'default',
            date: triggerDate,
            type: Notifications.SchedulableTriggerInputTypes.DATE,
          },
        })
      }

      const thresholdKey = `${THRESHOLD_NOTIFICATION_KEY}:${familyId}:${formatLocalDateKey(dashboard.todayDate)}`
      const hasThresholdLog = (await getPersistentValue(thresholdKey)) === '1'
      const hour = now.getHours()
      const hasCrossedThreshold =
        summary.openingBudget > 0 && summary.todaySpent >= summary.openingBudget * 0.7

      if (!hasThresholdLog && hasCrossedThreshold && hour < 18 && !isCancelled) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Ojo con el resto del día',
            body:
              summary.remainingToday >= 0
                ? `Ya usaste gran parte de hoy. Te quedan ${formatMoney(summary.remainingToday)} para cerrar prolijo.`
                : `Ya te pasaste hoy. Si frenás ahora, mañana abrís con ${formatMoney(summary.projectedTomorrowOpening)}.`,
            data: {
              kind: THRESHOLD_NOTIFICATION_KEY,
              url: '/expenses',
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
    dashboard.dailyBudgetCheckinHour,
    dashboard.dailyBudgetNudgesEnabled,
    dashboard.todayDate,
    familyId,
    summary,
  ])
}

function formatMoney(value: number) {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  })
}
