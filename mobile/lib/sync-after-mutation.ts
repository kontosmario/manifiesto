import type { QueryClient } from '@tanstack/react-query'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'
import { incomeEventQueryKeys } from '@/features/income/income-event-query-keys'
import { savingsGoalQueryKey } from '@/features/savings-goals/use-savings-goal'
import { latestSavingsGoalQueryKey } from '@/features/savings-goals/use-latest-savings-goal'
import { familyFinanceQueryKey } from '@/features/finance/use-family-finance'
import { homeSnapshotQueryKey } from '@/features/home/home-snapshot-query-keys'
import { controlIntelligenceQueryKey } from '@/features/insights/control-v2-query-keys'
import { controlSnapshotKey } from '@/features/insights/use-control-snapshot'
import { gastosEndpointKeys } from '@/features/gastos/use-gastos-endpoints'
import {
  streakQueryKey,
  markedDaysQueryKey,
} from '@/features/streaks/streak-query-keys'
import { achievementsEarnedQueryKey } from '@/features/achievements/use-achievements'
import { monthlyEditionsQueryKey } from '@/features/wrapped/monthly-editions-query-keys'

export type SyncScope =
  | 'expenses'
  | 'fixed'
  | 'fixedPayment'
  | 'income'
  | 'savings'
  | 'notifications'
  | 'wrapped'

interface SyncArgs {
  familyId?: string
  userId?: string
  scopes: readonly SyncScope[]
}

/**
 * Invalida toda query derivada del scope dado (incluyendo los snapshot
 * roots). Llamar desde `onSettled` de cualquier mutación. El optimistic
 * update sigue siendo responsabilidad de cada mutación en su `onMutate`.
 *
 * Cada scope expande a un set de keys que cubren TODAS las vistas que
 * podrían mostrar data stale tras la mutación. Las keys se deduplican
 * antes de invocar `invalidateQueries`. La invalidación de los snapshot
 * roots (home_snapshot, gastos_snapshot) resuelve el clobbering
 * estructural: al refetchear, el snapshot trae data fresca del server
 * y re-siembra los caches derivados en lugar de pisar el optimistic
 * con data vieja.
 *
 * Spec: docs/superpowers/specs/2026-05-29-state-sync-design.md
 */
export async function syncAllAfterMutation(
  queryClient: QueryClient,
  args: SyncArgs,
): Promise<void> {
  const { familyId, userId, scopes } = args
  if (scopes.length === 0) return

  const keys: Array<readonly unknown[]> = []
  const has = (s: SyncScope) => scopes.includes(s)

  // ── Expenses cluster (también disparado por fixedPayment vía trigger DB)
  if (familyId && (has('expenses') || has('fixedPayment'))) {
    keys.push(expenseQueryKeys.family(familyId))
    keys.push(expenseQueryKeys.recentFamily(familyId))
    keys.push(expenseQueryKeys.total(familyId))
    keys.push(expenseQueryKeys.periodTotalFamily(familyId))
    keys.push(expenseQueryKeys.monthlySpentFamily(familyId))
    keys.push(gastosEndpointKeys.heroFamily(familyId))
    keys.push(gastosEndpointKeys.calendarFamily(familyId))
    keys.push(gastosEndpointKeys.categoriesFamily(familyId))
    keys.push(gastosEndpointKeys.paginatedFamily(familyId))
    keys.push(gastosEndpointKeys.forDayFamily(familyId))
    // gastos_snapshot tiene una key larga (cycle window, today, cupo, cat);
    // invalidamos por prefijo de familia para cubrir todas las variantes.
    keys.push(['gastos-snapshot', familyId])
    if (userId) {
      keys.push(streakQueryKey(familyId, userId))
      keys.push(markedDaysQueryKey(familyId, userId))
    }
  }

  // ── Fixed cluster
  if (familyId && (has('fixed') || has('fixedPayment'))) {
    keys.push(fixedExpenseQueryKeys.family(familyId))
    keys.push(fixedExpenseQueryKeys.paymentsFamily(familyId))
  }

  // ── Notifications (varias scopes las tocan vía triggers DB)
  if (
    familyId &&
    (has('expenses') ||
      has('fixed') ||
      has('fixedPayment') ||
      has('notifications'))
  ) {
    keys.push(notificationQueryKeys.family(familyId))
  }

  // ── Income — incluido también por scope 'expenses' porque ahora el
  // activity feed (Home + Gastos) muestra ingresos intercalados con
  // gastos. Al crear/editar/borrar un gasto no movés un ingreso, pero
  // mantener ambos sincronizados evita inconsistencias si la lista se
  // refetcha por staleness y la otra no.
  if (familyId && (has('income') || has('expenses') || has('fixedPayment'))) {
    keys.push(incomeEventQueryKeys.list(familyId))
    keys.push(['income-events-cycle-sum', familyId]) // prefix por familia
  }
  if (familyId && has('income')) {
    keys.push(familyFinanceQueryKey(familyId))
  }

  // ── Savings
  if (familyId && has('savings')) {
    keys.push(savingsGoalQueryKey(familyId))
    // Latest goal — usado por Settings (incluye inactivas). Invalidar
    // junto con la query de activas para que ambos consumers
    // (Settings + Home/Control) reaccionen en sincronía.
    keys.push(latestSavingsGoalQueryKey(familyId))
    // cycle-acumulado depende del goal (chip "+\$X acumulado de mayo"
    // referencia el periodo origen vía monthly_summaries). Al
    // desactivar/eliminar la meta, ese chip puede quedar stale si no
    // invalidamos. Code review M1 finding (2026-06-08).
    keys.push(['cycle-acumulado', familyId])
  }

  // ── Wrapped — control intelligence ya cubre wrapped_seen_at vía homeSnapshot
  if (familyId && has('wrapped')) {
    keys.push(monthlyEditionsQueryKey(familyId))
  }

  // ── Achievements — cualquier expense/fixed/payment puede unlock vía trigger
  if (userId && (has('expenses') || has('fixed') || has('fixedPayment'))) {
    keys.push(achievementsEarnedQueryKey(userId))
  }

  // ── Control v2 — afectado por casi todo lo financiero
  if (
    familyId &&
    (has('expenses') ||
      has('fixed') ||
      has('fixedPayment') ||
      has('income') ||
      has('savings') ||
      has('wrapped'))
  ) {
    keys.push(controlIntelligenceQueryKey(familyId))
  }
  if (
    userId &&
    (has('expenses') ||
      has('fixed') ||
      has('fixedPayment') ||
      has('income') ||
      has('savings'))
  ) {
    keys.push(controlSnapshotKey(userId))
  }

  // ── Snapshot root — invalidamos siempre que haya algún scope, así el
  // próximo refetch re-siembra los derivados con data fresca del server.
  if (userId) {
    keys.push(homeSnapshotQueryKey(userId))
  }

  // Dedup por shape JSON (suficiente para este tamaño).
  const seen = new Set<string>()
  const unique = keys.filter((k) => {
    const sig = JSON.stringify(k)
    if (seen.has(sig)) return false
    seen.add(sig)
    return true
  })

  await Promise.all(
    unique.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}
