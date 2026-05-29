import type { QueryClient } from '@tanstack/react-query'
import { syncAllAfterMutation, type SyncScope } from '@/lib/sync-after-mutation'

interface InvalidateFamilyBudgetDataOptions {
  includeFixedExpenses?: boolean
  includeNotifications?: boolean
  /** userId del miembro que dispara la mutación. Habilita invalidación
   *  del home_snapshot root + streaks + achievements (resuelve el
   *  clobbering estructural cuando se pasa). Si no se pasa, las
   *  invalidaciones derivadas a user siguen omitidas — back-compat. */
  userId?: string
}

/**
 * Wrapper de compatibilidad sobre `syncAllAfterMutation`. Mapea los
 * boolean flags legacy a scopes del nuevo helper centralizado.
 *
 * Spec: docs/superpowers/specs/2026-05-29-state-sync-design.md
 *
 * Para call-sites nuevos: preferí `syncAllAfterMutation` directo con
 * scopes explícitos — esta función queda solo como puente para los
 * call-sites existentes (useCreateExpense, useUpdateExpense, etc.) que
 * se irán migrando en sus respectivos tasks del plan.
 */
export async function invalidateFamilyBudgetData(
  queryClient: QueryClient,
  familyId?: string,
  options: InvalidateFamilyBudgetDataOptions = {},
): Promise<void> {
  if (!familyId) return
  const scopes: SyncScope[] = ['expenses']
  if (options.includeFixedExpenses) scopes.push('fixed')
  if (options.includeNotifications) scopes.push('notifications')
  await syncAllAfterMutation(queryClient, {
    familyId,
    userId: options.userId,
    scopes,
  })
}
