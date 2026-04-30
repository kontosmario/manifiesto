// Realtime subscriptions for the Gastos tab. Reuses the generic
// `useFamilyRealtime` helper — listens on `expenses` and
// `categories` so partner edits / category renames propagate without
// pull-to-refresh.

import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { gastosEndpointKeys } from '@/features/gastos/use-gastos-endpoints'
import { useFamilyRealtime } from '@/features/family/use-family-realtime'

export function useGastosRealtime(familyId?: string) {
  useFamilyRealtime({
    familyId,
    scope: 'gastos',
    listeners: {
      expenses: (qc, fid) => {
        void qc.invalidateQueries({ queryKey: expenseQueryKeys.family(fid) })
        void qc.invalidateQueries({ queryKey: expenseQueryKeys.recentFamily(fid) })
        // Architecture v2: invalidate the 5 specialized gastos endpoints
        // by prefix so any cycle/category combo cached in memory refetches.
        void qc.invalidateQueries({ queryKey: gastosEndpointKeys.heroFamily(fid) })
        void qc.invalidateQueries({ queryKey: gastosEndpointKeys.calendarFamily(fid) })
        void qc.invalidateQueries({ queryKey: gastosEndpointKeys.categoriesFamily(fid) })
        void qc.invalidateQueries({ queryKey: gastosEndpointKeys.paginatedFamily(fid) })
        void qc.invalidateQueries({ queryKey: gastosEndpointKeys.forDayFamily(fid) })
      },
      categories: (qc, fid) => {
        // `categoriesQueryKey` requires a scope; passing only the
        // familyId-scoped prefix invalidates both expense and
        // fixed_expense scopes via React Query's prefix matching.
        void qc.invalidateQueries({ queryKey: ['categories', fid] })
      },
    },
  })
}
