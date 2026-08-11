import type { QueryClient } from '@tanstack/react-query'
import { syncAllAfterMutation, type SyncScope } from '@/lib/sync-after-mutation'

/**
 * Cierre del onboarding del CREADOR: las escrituras del wizard en el
 * único orden que deja la cache consistente cuando la Home monta.
 *
 * Dos restricciones que el código no puede mostrar por sí solo:
 *
 *  · `family_finance.monthly_income` es DERIVADA — la escribe el trigger
 *    `recompute_family_income` al guardar la contribución del miembro. El
 *    upsert de family_finance la stripea del payload
 *    (family-finance.repository.ts) y siembra la cache con la fila que lee
 *    de vuelta: si corre antes que la contribución, esa fila trae 0 y ese
 *    0 es lo que queda cacheado.
 *
 *  · La sincronización final se ESPERA. Las invalidaciones acopladas a
 *    cada mutación no bloquean su `mutateAsync`, así que sin este await el
 *    usuario llega a la Home con el refetch en vuelo y un `home_snapshot`
 *    con ingreso 0 que queda fresco por su staleTime: hero sin sueldo,
 *    ahorro derivado en 0 y todo lo gateado por `monthlyIncome > 0` sin
 *    montarse.
 *
 * `completeOnboarding` va último a propósito: flipea el gate de la ruta,
 * o sea que es el disparador del montaje de la Home.
 *
 * Los errores se propagan tal cual: el caller decide (el wizard muestra
 * el error y NO completa el onboarding).
 */
export interface FinishCreatorOnboardingArgs {
  queryClient: QueryClient
  familyId: string
  userId?: string
  /** Contribución del dueño — única escritura que mueve monthly_income. */
  saveOwnerIncome: () => Promise<unknown>
  saveFinance: () => Promise<unknown>
  /** null / ausente cuando el usuario terminó sin meta. */
  saveFirstGoal?: (() => Promise<unknown>) | null
  completeOnboarding: () => Promise<unknown>
}

export async function finishCreatorOnboarding(
  args: FinishCreatorOnboardingArgs,
): Promise<void> {
  const { queryClient, familyId, userId, saveFirstGoal } = args

  await args.saveOwnerIncome()
  await args.saveFinance()
  if (saveFirstGoal) {
    await saveFirstGoal()
  }

  const scopes: readonly SyncScope[] = saveFirstGoal
    ? ['income', 'savings']
    : ['income']
  await syncAllAfterMutation(queryClient, { familyId, userId, scopes })

  await args.completeOnboarding()
}
