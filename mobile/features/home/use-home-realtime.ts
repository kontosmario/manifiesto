// Realtime subscriptions for the Home tab. Thin wrapper around the
// generic `useFamilyRealtime` helper — keeps the call sites readable
// and the table → invalidator map declarative.

import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import { savingsGoalQueryKey } from '@/features/savings-goals/use-savings-goal'
import { latestSavingsGoalQueryKey } from '@/features/savings-goals/use-latest-savings-goal'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'
import { gastosEndpointKeys } from '@/features/gastos/use-gastos-endpoints'
import { useFamilyRealtime } from '@/features/family/use-family-realtime'

export function useHomeRealtime(familyId?: string) {
  useFamilyRealtime({
    familyId,
    scope: 'home',
    listeners: {
      expenses: (qc, fid) => {
        void qc.invalidateQueries({ queryKey: expenseQueryKeys.family(fid) })
        void qc.invalidateQueries({ queryKey: expenseQueryKeys.recentFamily(fid) })
        // Gastos v2 endpoints: hero, calendar, donut, paginated y forDay
        // se alimentan de expenses; sin invalidación quedan stale tras
        // que otro miembro registre un gasto en otro device.
        void qc.invalidateQueries({ queryKey: gastosEndpointKeys.heroFamily(fid) })
        void qc.invalidateQueries({ queryKey: gastosEndpointKeys.calendarFamily(fid) })
        void qc.invalidateQueries({ queryKey: gastosEndpointKeys.categoriesFamily(fid) })
        void qc.invalidateQueries({ queryKey: gastosEndpointKeys.paginatedFamily(fid) })
        void qc.invalidateQueries({ queryKey: gastosEndpointKeys.forDayFamily(fid) })
      },
      fixed_expenses: (qc, fid) => {
        void qc.invalidateQueries({ queryKey: fixedExpenseQueryKeys.family(fid) })
        // gastos_snapshot incluye fixed expenses (chip "fijos pendientes"
        // y secciones derivadas); invalidar por prefijo de familia.
        void qc.invalidateQueries({ queryKey: ['gastos-snapshot', fid] })
      },
      savings_goals: (qc, fid) => {
        void qc.invalidateQueries({ queryKey: savingsGoalQueryKey(fid) })
        // Latest savings goal (Settings) y cycle-acumulado (hero chip)
        // también dependen del goal activo.
        void qc.invalidateQueries({ queryKey: latestSavingsGoalQueryKey(fid) })
        void qc.invalidateQueries({ queryKey: ['cycle-acumulado', fid] })
      },
      notifications: (qc, fid) => {
        void qc.invalidateQueries({ queryKey: notificationQueryKeys.family(fid) })
      },
    },
  })
}
