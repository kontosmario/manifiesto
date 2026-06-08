import { useQuery } from '@tanstack/react-query'
import { fetchLatestSavingsGoal } from '@/features/savings-goals/savings-goal.repository'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'

export const latestSavingsGoalQueryKey = (familyId?: string) =>
  ['savings-goal-latest', familyId ?? null] as const

/**
 * Trae el último goal de la familia, ACTIVO O INACTIVO. Usado por
 * Settings — necesita ver el goal aunque esté desactivado para que el
 * toggle no parezca borrarlo (al toggle off, useSavingsGoal devolvía
 * null porque filtra por is_active=true → la screen flippaba al
 * EmptyState como si se hubiera eliminado).
 *
 * Home / Control siguen usando `useSavingsGoal` (solo activos).
 */
export function useLatestSavingsGoal(familyId?: string) {
  return useQuery<SavingsGoal | null>({
    queryKey: latestSavingsGoalQueryKey(familyId),
    enabled: Boolean(familyId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!familyId) return null
      return fetchLatestSavingsGoal(familyId)
    },
  })
}
