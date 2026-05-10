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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: familyFinanceQueryKey(familyId) })
    },
  })
}
