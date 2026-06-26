import { useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { upsertSavingsGoal } from '@/features/savings-goals/savings-goal.repository'
import { savingsGoalQueryKey } from '@/features/savings-goals/use-savings-goal'
import { latestSavingsGoalQueryKey } from '@/features/savings-goals/use-latest-savings-goal'
import type {
  SavingsGoal,
  SavingsGoalInput,
} from '@/features/savings-goals/savings-goal.model'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
import { toast } from '@/lib/toast-bus'
import i18n from '@/lib/i18n'

interface MutationVars {
  input: SavingsGoalInput
  existingId: string | null
}

export function useUpsertSavingsGoal(familyId: string, userId?: string) {
  const queryClient = useQueryClient()
  const ref = useRef<{ mutate: (input: MutationVars) => void } | null>(null)

  const result = useMutation<
    SavingsGoal,
    Error,
    MutationVars,
    {
      previousActive: SavingsGoal | null | undefined
      previousLatest: SavingsGoal | null | undefined
    } | undefined
  >({
    mutationFn: ({ input, existingId }) =>
      upsertSavingsGoal(familyId, input, existingId),
    // Code review H4 (sprint A, 2026-06-08): el onError previo aplicaba
    // el mismo `previous` (snapshot de la query active-only) a las dos
    // keys, lo que dejaba `latestSavingsGoalQueryKey` corrupta cuando
    // su shape original incluía goals inactivas (Settings rollback
    // perdía la goal inactiva). Snapshoteamos las DOS keys por
    // separado y restauramos cada una a su valor previo.
    onMutate: async ({ input, existingId }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: savingsGoalQueryKey(familyId) }),
        queryClient.cancelQueries({ queryKey: latestSavingsGoalQueryKey(familyId) }),
      ])
      const previousActive = queryClient.getQueryData<SavingsGoal | null>(
        savingsGoalQueryKey(familyId),
      )
      const previousLatest = queryClient.getQueryData<SavingsGoal | null>(
        latestSavingsGoalQueryKey(familyId),
      )
      // Optimistic merge sobre la goal cacheada. Si no había goal, la
      // creamos provisoriamente con id tentativo. Cuando el server
      // responde, syncAll refetcha y reemplaza con el row real.
      const nowIso = new Date().toISOString()
      const base: SavingsGoal = previousActive ?? previousLatest ?? {
        id: existingId ?? `temp-${Date.now()}`,
        familyId,
        title: '',
        emoji: '🎯',
        goalAmount: 0,
        currentAmount: 0,
        targetMonths: null,
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      }
      const optimistic: SavingsGoal = {
        ...base,
        title: input.title,
        emoji: input.emoji,
        goalAmount: input.goalAmount,
        currentAmount: input.currentAmount,
        targetMonths: input.targetMonths,
        isActive: input.isActive,
        updatedAt: nowIso,
      }
      queryClient.setQueryData<SavingsGoal | null>(
        savingsGoalQueryKey(familyId),
        // savingsGoalQueryKey (solo activos): si el nuevo state es
        // inactive, removemos del cache de "active". Si está activo,
        // optimistic update normal.
        optimistic.isActive ? optimistic : null,
      )
      // savings-goal-latest siempre tiene la versión actual sin filtro
      // — actualizar también optimisticamente para que Settings refleje
      // el toggle inmediato sin esperar refetch.
      queryClient.setQueryData<SavingsGoal | null>(
        latestSavingsGoalQueryKey(familyId),
        optimistic,
      )
      return { previousActive, previousLatest }
    },
    onError: (_err, input, ctx) => {
      if (ctx?.previousActive !== undefined) {
        queryClient.setQueryData(savingsGoalQueryKey(familyId), ctx.previousActive)
      }
      if (ctx?.previousLatest !== undefined) {
        queryClient.setQueryData(
          latestSavingsGoalQueryKey(familyId),
          ctx.previousLatest,
        )
      }
      toast.error(i18n.t('settings:savingsGoalValidation.saveFailed'), {
        actionLabel: i18n.t('common:actions.retry'),
        onAction: () => ref.current?.mutate(input),
      })
    },
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['savings'],
      })
    },
  })

  useEffect(() => {
    ref.current = { mutate: result.mutate }
  }, [result.mutate])

  return result
}
