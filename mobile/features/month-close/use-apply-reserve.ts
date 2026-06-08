import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { familyFinanceQueryKey } from '@/features/finance/use-family-finance'
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
    // Code review H2 (sprint A, 2026-06-08): la decisión de aplicar
    // reserva impacta Home / Control / Gastos (reserva, savings,
    // acumulado del ciclo). Antes invalidábamos solo 4 keys hardcoded;
    // ahora delegamos a `syncAllAfterMutation` con scopes `savings` +
    // `income` para cubrir control snapshots, family-finance, savings
    // goals y cycle-acumulado de forma consistente con el resto del
    // proyecto. Mantenemos un `home-snapshot` prefix-invalidate como
    // backstop cuando no hay userId (tests, callers sin sesión).
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyFinanceQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: ['savings-goal', familyId] }),
        queryClient.invalidateQueries({ queryKey: ['cycle-acumulado', familyId] }),
        queryClient.invalidateQueries({ queryKey: ['home-snapshot'] }),
        syncAllAfterMutation(queryClient, {
          familyId,
          userId,
          scopes: ['savings', 'income'],
        }),
      ])
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
