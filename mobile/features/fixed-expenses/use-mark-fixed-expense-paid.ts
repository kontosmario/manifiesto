import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPayment } from '@/features/fixed-expenses/fixed-expense-payment.repository'
import { fixedExpensePaymentsKey } from '@/features/fixed-expenses/use-fixed-expense-payments'

export function useMarkFixedExpensePaid(params: { familyId: string; userId: string; periodMonth: string }) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { fixedExpenseId: string }>({
    mutationFn: async ({ fixedExpenseId }) => {
      await createPayment({ fixedExpenseId, userId: params.userId, periodMonth: params.periodMonth })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: fixedExpensePaymentsKey(params.familyId, params.periodMonth),
      })
    },
  })
}
