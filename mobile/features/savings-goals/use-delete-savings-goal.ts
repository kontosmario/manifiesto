import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteSavingsGoal } from '@/features/savings-goals/savings-goal.repository'
import { savingsGoalQueryKey } from '@/features/savings-goals/use-savings-goal'
import { latestSavingsGoalQueryKey } from '@/features/savings-goals/use-latest-savings-goal'

/**
 * Hard-delete a savings goal row.
 *
 * Invalidates:
 *   · savings-goal: Home + Control read this; debe quedar null.
 *   · cycle-acumulado: el hero del Home suma la goal acumulada al
 *     disponible visible; al borrar la goal ese cálculo cambia.
 *   · home-snapshot: bundle del Home incluye savings goal data.
 *
 * NOTA: el `current_amount` ya acumulado NO se devuelve al disponible
 * vía esta mutación — la goal se borra "tal cual está". El UX del
 * Alert le aclara al user que su ahorro vuelve a su disponible
 * (porque deja de estar earmark en una meta), pero no hay refund RPC.
 */
export function useDeleteSavingsGoal(familyId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
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
  })
}
