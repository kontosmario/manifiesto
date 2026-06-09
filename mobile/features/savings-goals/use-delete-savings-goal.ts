import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query'
import { deleteSavingsGoal } from '@/features/savings-goals/savings-goal.repository'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'

/**
 * Pure builder — separable del React layer para que vitest pueda
 * testear el shape (mutationFn + onSuccess invalidations) sin
 * `useMutation`.
 *
 * Code review Cross-M3 mobile FIX-ROUND: las 4 invalidaciones
 * hardcoded (savings-goal, savings-goal-latest, cycle-acumulado,
 * home-snapshot) están totalmente cubiertas por `syncAllAfterMutation`
 * con scope 'savings' + el invalidate global de homeSnapshotQueryKey
 * cuando hay userId. Para callers sin userId (tests, callers legacy)
 * mantenemos un fallback explícito que prefija ['home-snapshot'].
 */
export function buildDeleteSavingsGoalMutation(
  queryClient: QueryClient,
  familyId?: string,
  userId?: string,
): UseMutationOptions<void, Error, string, unknown> {
  return {
    mutationFn: async (goalId: string) => {
      await deleteSavingsGoal(goalId)
    },
    onSuccess: async () => {
      await syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['savings'],
      })
      if (!userId) {
        await queryClient.invalidateQueries({ queryKey: ['home-snapshot'] })
      }
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
export function useDeleteSavingsGoal(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  return useMutation(
    buildDeleteSavingsGoalMutation(queryClient, familyId, userId),
  )
}
