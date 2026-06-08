import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type FamilyFinance,
  type UpsertFamilyFinanceInput,
} from '@/features/finance/family-finance.model'
import {
  fetchFamilyFinance,
  upsertFamilyFinance,
} from '@/features/finance/family-finance.repository'

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

export function useUpsertFamilyFinance(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpsertFamilyFinanceInput) => {
      if (!familyId) {
        throw new Error('No hay familia activa para guardar métricas financieras.')
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
    // setQueryData → el render inmediato ya lee data fresh. Aún así
    // invalidamos queries DERIVADAS (cycle-acumulado) para que el
    // hero refresque el acumulado del mes pasado si cambió.
    onSuccess: (updatedFinance) => {
      if (familyId) {
        queryClient.setQueryData(familyFinanceQueryKey(familyId), updatedFinance)
        void queryClient.invalidateQueries({ queryKey: ['cycle-acumulado', familyId] })
      }
    },
  })
}
