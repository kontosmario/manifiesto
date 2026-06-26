import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import i18n from '@/lib/i18n'
import { createExpense } from '@/features/expenses/expense-repository'
import { useCreateIncomeEvent } from '@/features/income/use-income-events'
import { sendFamilyPush } from '@/lib/send-family-push'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
import { isoDateToLocalNoonTimestamp } from './cycle-date-math'
import type { ConfirmFailure, ConfirmResult, ReviewRow } from './types'

export interface ConfirmContext {
  familyId: string
  userId: string
}

export function useConfirmImport(ctx: ConfirmContext) {
  const createIncomeMut = useCreateIncomeEvent(ctx.userId)
  const queryClient = useQueryClient()

  return useCallback(
    async (rows: readonly ReviewRow[]): Promise<ConfirmResult> => {
      const submittable = rows.filter((r) => r.kind !== 'skip')
      const skipped = rows.length - submittable.length

      const settled = await Promise.allSettled(
        submittable.map((r) => insertOne(r, ctx, createIncomeMut.mutateAsync)),
      )

      let insertedExpenses = 0
      let insertedIncomes = 0
      let insertedIncomeTotal = 0
      const failed: ConfirmFailure[] = []

      settled.forEach((res, i) => {
        const row = submittable[i]
        if (res.status === 'fulfilled') {
          if (row.kind === 'expense') insertedExpenses += 1
          else if (row.kind === 'income') {
            insertedIncomes += 1
            insertedIncomeTotal += row.amount
          }
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

      // Bulk-invalidate every query that depends on expenses or income
      // so every surface (Home dashboard, Gastos calendar, Control v2,
      // streaks, achievements, snapshot roots) refetches once the import
      // settles. Per-row mutations would invalidate N times — fine for
      // correctness but thrashes the network. We're doing a single pass
      // at the tail because the user already dismissed the wizard by
      // this point; the modal-exit animation is the visual signal that
      // "the work is done", and any list refetches behind it stream in
      // by the time the user lands back on their previous screen.
      //
      // We use `createExpense` raw (not `useCreateExpense`) for the
      // expense path, so this sync IS the only thing keeping caches
      // honest for expenses. Income goes through `useCreateIncomeEvent`
      // which already calls `syncAllAfterMutation` per mutation; the
      // bulk call here is redundant for that scope but harmless
      // (invalidation is idempotent).
      const insertedAny = insertedExpenses > 0 || insertedIncomes > 0
      if (insertedAny) {
        const scopes: Array<'expenses' | 'income'> = []
        if (insertedExpenses > 0) scopes.push('expenses')
        if (insertedIncomes > 0) scopes.push('income')
        await syncAllAfterMutation(queryClient, {
          familyId: ctx.familyId,
          userId: ctx.userId,
          scopes,
        })
      }

      // Un solo push social al cerrar el import (los per-row se
      // suprimieron con skipPush). Solo aplica a ingresos — los gastos
      // importados no pushean. Anti-spam: 1 notif por import, no 1 por fila.
      if (insertedIncomes >= 1) {
        void sendFamilyPush({
          familyId: ctx.familyId,
          title:
            insertedIncomes === 1
              ? '{actor} registró un ingreso'
              : `{actor} registró ${insertedIncomes} ingresos`,
          body: `+$${insertedIncomeTotal.toLocaleString('es-AR')}`,
          kind: 'income_logged',
          url: '/home',
        }).catch(() => {})
      }

      return { insertedExpenses, insertedIncomes, skipped, failed }
    },
    [ctx, createIncomeMut.mutateAsync, queryClient],
  )
}

async function insertOne(
  row: ReviewRow,
  ctx: ConfirmContext,
  createIncome: ReturnType<typeof useCreateIncomeEvent>['mutateAsync'],
): Promise<void> {
  if (row.kind === 'expense') {
    if (!row.categoryId) throw new Error(i18n.t('gastos:import.error.missingCategory'))
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
      // Anti-spam: el push va consolidado al cerrar el import, no por fila.
      skipPush: true,
    })
    return
  }

  // Shouldn't reach: filter dropped skips above
  throw new Error(`Unsupported row kind: ${row.kind}`)
}
