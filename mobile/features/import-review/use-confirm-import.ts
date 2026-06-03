import { useCallback } from 'react'
import { createExpense } from '@/features/expenses/expense-repository'
import { useCreateIncomeEvent } from '@/features/income/use-income-events'
import { isoDateToLocalNoonTimestamp } from './cycle-date-math'
import type { ConfirmFailure, ConfirmResult, ReviewRow } from './types'

export interface ConfirmContext {
  familyId: string
  userId: string
}

export function useConfirmImport(ctx: ConfirmContext) {
  const createIncomeMut = useCreateIncomeEvent(ctx.userId)

  return useCallback(
    async (rows: readonly ReviewRow[]): Promise<ConfirmResult> => {
      const submittable = rows.filter((r) => r.kind !== 'skip')
      const skipped = rows.length - submittable.length

      const settled = await Promise.allSettled(
        submittable.map((r) => insertOne(r, ctx, createIncomeMut.mutateAsync)),
      )

      let insertedExpenses = 0
      let insertedIncomes = 0
      const failed: ConfirmFailure[] = []

      settled.forEach((res, i) => {
        const row = submittable[i]
        if (res.status === 'fulfilled') {
          if (row.kind === 'expense') insertedExpenses += 1
          else if (row.kind === 'income') insertedIncomes += 1
        } else {
          failed.push({
            rowId: row.id,
            description: row.description,
            reason:
              res.reason instanceof Error
                ? res.reason.message
                : String(res.reason),
          })
        }
      })

      return { insertedExpenses, insertedIncomes, skipped, failed }
    },
    [ctx, createIncomeMut.mutateAsync],
  )
}

async function insertOne(
  row: ReviewRow,
  ctx: ConfirmContext,
  createIncome: ReturnType<typeof useCreateIncomeEvent>['mutateAsync'],
): Promise<void> {
  if (row.kind === 'expense') {
    if (!row.categoryId) throw new Error('Falta categoría para el gasto.')
    await createExpense(ctx.familyId, ctx.userId, {
      categoryId: row.categoryId,
      description: row.description,
      notes: row.notes ?? undefined,
      price: row.amount,
      createdAt: isoDateToLocalNoonTimestamp(row.date),
    })
    return
  }

  if (row.kind === 'income') {
    await createIncome({
      familyId: ctx.familyId,
      amount: row.amount,
      kind: row.incomeKind,
      description: row.description,
      eventDate: row.date,
    })
    return
  }

  // Shouldn't reach: filter dropped skips above
  throw new Error(`Unsupported row kind: ${row.kind}`)
}
