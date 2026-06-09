import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'

export interface ApplyReserveInput {
  amount: number
  target: 'cycle' | 'meta'
  metaGoalId?: string
}

/**
 * Pure builder — separable del React layer para que vitest pueda
 * testear el shape (mutationFn + onSuccess invalidations) sin
 * `useMutation`. El hook abajo se limita a inyectar el QueryClient
 * y el familyId/userId del context.
 */
export function buildApplyReserveMutation(
  queryClient: QueryClient,
  familyId?: string,
  userId?: string,
): UseMutationOptions<void, Error, ApplyReserveInput, unknown> {
  return {
    mutationFn: async (input: ApplyReserveInput) => {
      const { error } = await supabase.rpc('apply_reserve_decision', {
        p_amount: input.amount,
        p_target: input.target,
        p_meta_goal_id: input.metaGoalId ?? null,
      })
      if (error) throw error
    },
    // Code review M1 (sprint mobile FIX-ROUND, 2026-06-08): las 4
    // invalidaciones hardcoded (family-finance, savings-goal,
    // cycle-acumulado, home-snapshot) están totalmente cubiertas por
    // `syncAllAfterMutation` cuando hay userId, vía scopes 'savings'
    // (savings-goal + latest + cycle-acumulado) + 'income'
    // (family-finance + cycle-acumulado) + el invalidate global de
    // homeSnapshotQueryKey(userId). Mantenemos un fallback explícito
    // para callers sin userId (tests, contextos sin sesión).
    onSuccess: async () => {
      await syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['savings', 'income'],
      })
      if (!userId) {
        // Backstop: syncAll no invalida home-snapshot sin userId.
        await queryClient.invalidateQueries({ queryKey: ['home-snapshot'] })
      }
    },
  }
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
 *   · syncAllAfterMutation: cubre control snapshots y otros derivados.
 */
export function useApplyReserveDecision(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  return useMutation(buildApplyReserveMutation(queryClient, familyId, userId))
}
