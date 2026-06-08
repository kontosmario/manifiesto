import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query'
import { deleteSavingsGoal } from '@/features/savings-goals/savings-goal.repository'
import { savingsGoalQueryKey } from '@/features/savings-goals/use-savings-goal'
import { latestSavingsGoalQueryKey } from '@/features/savings-goals/use-latest-savings-goal'

/**
 * Pure builder — separable del React layer para que vitest pueda
 * testear el shape (mutationFn + onSuccess invalidations) sin
 * `useMutation`.
 */
export function buildDeleteSavingsGoalMutation(
  queryClient: QueryClient,
  familyId?: string,
): UseMutationOptions<void, Error, string, unknown> {
  return {
    mutationFn: async (goalId: string) => {
      await deleteSavingsGoal(goalId)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: savingsGoalQueryKey(familyId) }),
        // Latest goal — Settings consume esta key. Sin invalidar, el
        // user borraba y la pantalla seguía mostrando el goal stale.
        queryClient.invalidateQueries({ queryKey: latestSavingsGoalQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: ['cycle-acumulado', familyId] }),
        queryClient.invalidateQueries({ queryKey: ['home-snapshot'] }),
      ])
    },
  }
}

/**
 * Hard-delete a savings goal row.
 *
 * Invalidates:
 *   · savings-goal: Home + Control read this; debe quedar null.
 *   · cycle-acumulado: el hero del Home suma la goal acumulada al
 *     disponible visible; al borrar la goal ese cálculo cambia.
 *   · home-snapshot: bundle del Home incluye savings goal data.
 *
 * NOTA: el `current_amount` ya acumulado NO se reembolsa a ningún
 * lado vía esta mutación — la goal se borra "tal cual está" (hard
 * delete del row). El monto que el user había acumulado en la meta
 * queda registrado en el historial de aportes (savings_contributions)
 * pero deja de aparecer como meta activa. El Alert del delete confirm
 * lo aclara así, sin sugerir que la plata "vuelve" a ningún disponible.
 */
export function useDeleteSavingsGoal(familyId?: string) {
  const queryClient = useQueryClient()
  return useMutation(buildDeleteSavingsGoalMutation(queryClient, familyId))
}
