import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPayment } from '@/features/fixed-expenses/fixed-expense-payment.repository'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'

export function useMarkFixedExpensePaid(params: { familyId: string; userId: string; periodMonth: string }) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { fixedExpenseId: string }>({
    mutationFn: async ({ fixedExpenseId }) => {
      await createPayment({ fixedExpenseId, userId: params.userId, periodMonth: params.periodMonth })
    },
    onSuccess: () => {
      // Invalidate by prefix so every cycle-window variant of the
      // payments query refetches (the new key includes cycle ISO, not
      // the calendar period_month).
      void queryClient.invalidateQueries({
        queryKey: fixedExpenseQueryKeys.paymentsFamily(params.familyId),
      })
    },
  })
}
