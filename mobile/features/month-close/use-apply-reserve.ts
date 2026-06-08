import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { familyFinanceQueryKey } from '@/features/finance/use-family-finance'

export interface ApplyReserveInput {
  amount: number
  target: 'cycle' | 'meta'
  metaGoalId?: string
}

/**
 * Drive the `apply_reserve_decision` RPC. Mueve parcial o total de la
 * `monthly_reserve_amount` acumulada al ciclo en curso (target='cycle')
 * o a una savings_goal (target='meta'). El RPC valida que el monto sea
 * positivo y no supere la reserva disponible.
 *
 * Invalida los query keys que dependen del state mutado:
 *   · family-finance: la fuente de monthly_reserve_amount y
 *     current_cycle_starting_balance.
 *   · savings-goal: el current_amount cuando target='meta'.
 *   · cycle-acumulado: el hero del Home consulta acá para mostrar
 *     contexto positivo cuando se sumó al cycle.
 *   · home-snapshot: el chip "Reserva" del Home se hidrata desde acá.
 */
export function useApplyReserveDecision(familyId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ApplyReserveInput) => {
      const { error } = await supabase.rpc('apply_reserve_decision', {
        p_amount: input.amount,
        p_target: input.target,
        p_meta_goal_id: input.metaGoalId ?? null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyFinanceQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: ['savings-goal', familyId] }),
        queryClient.invalidateQueries({ queryKey: ['cycle-acumulado', familyId] }),
        // home-snapshot vive bajo userId, pero invalidar por prefijo
        // refresca cualquier instancia activa sin riesgo.
        queryClient.invalidateQueries({ queryKey: ['home-snapshot'] }),
      ])
    },
  })
}
