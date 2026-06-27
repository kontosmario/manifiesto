import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type FamilyFinance,
  type UpsertFamilyFinanceInput,
} from '@/features/finance/family-finance.model'
import {
  fetchFamilyFinance,
  upsertFamilyFinance,
} from '@/features/finance/family-finance.repository'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
import i18n from '@/lib/i18n'

export {
  buildFamilyFinanceInput,
  buildSalaryConfirmationInput,
  buildCycleStartingBalanceInput,
  DEFAULT_DAILY_BUDGET_BUFFER_MODE,
  DEFAULT_DAILY_BUDGET_CHECKIN_HOUR,
  DEFAULT_SALARY_PAYMENT_DAY,
  DEFAULT_USD_EXCHANGE_RATE,
  type FamilyFinance,
  type FamilyFinanceInputSnapshot,
} from '@/features/finance/family-finance.model'

export const familyFinanceQueryKey = (familyId?: string) => ['family-finance', familyId] as const

export function useFamilyFinance(familyId?: string) {
  return useQuery<FamilyFinance>({
    queryKey: familyFinanceQueryKey(familyId),
    enabled: Boolean(familyId),
    // family_finance cambia solo cuando el usuario edita ingreso,
    // ahorro, ciclo, etc. — todas esas mutations invalidan este key.
    // 5 min evita refetches en tab-switches dentro del mismo uso.
    staleTime: 5 * 60_000,
    queryFn: async () => fetchFamilyFinance(familyId),
  })
}

export function useUpsertFamilyFinance(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpsertFamilyFinanceInput) => {
      if (!familyId) {
        throw new Error(i18n.t('settings:financeValidation.noActiveFamily'))
      }
      return upsertFamilyFinance(familyId, input)
    },
    // Fix chip flash al confirmar cobro: el invalidate previo era
    // async — durante el refetch, el cache mantenía data STALE
    // (ej. cycle_starting_balance de un test con "acumular"), y el
    // hero leía esos valores stale → chip peach "Ajustado" flasheaba
    // brevemente antes de que el refetch completara.
    //
    // Ahora `upsertFamilyFinance` devuelve el row real escrito en DB
    // (`.select().maybeSingle()`); lo metemos directo al cache vía
    // setQueryData → el render inmediato ya lee data fresh.
    onSuccess: (updatedFinance) => {
      if (familyId) {
        queryClient.setQueryData(familyFinanceQueryKey(familyId), updatedFinance)
      }
    },
    // Code review C2 (sprint A, 2026-06-08): finance afecta a Home,
    // Control v2 y Gastos (chip "ajustado", proyecciones, presupuesto
    // restante). Antes solo invalidábamos `cycle-acumulado`; ahora
    // delegamos a `syncAllAfterMutation` con scope `income` (que cubre
    // family-finance + control snapshots + home_snapshot + acumulado).
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['income'],
      })
    },
  })
}
