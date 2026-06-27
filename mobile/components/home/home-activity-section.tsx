import { memo, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { ListRowSkeleton } from '@/components/ui/skeleton-layouts'
import { SwipeRow, type SwipeAction } from '@/components/ui/swipe-row'
import { ActivityRowV2 } from '@/components/home/activity-row-v2'
import { CategoryIcon } from '@/components/category/category-icon'
import { type DashboardErrorKind } from '@/features/home/home-dashboard-model'
import type { Expense } from '@/features/expenses/use-expenses'
import type { IncomeEvent, IncomeEventKind } from '@/features/income/use-income-events'

interface HomeActivitySectionProps {
  expenses: Expense[]
  /** Income events de la familia (top N). Se intercalan con expenses por
   *  timestamp desc; positivos en verde con ícono distinto. */
  incomeEvents?: IncomeEvent[]
  categoryNameById: Map<string, string>
  /** category_id → nombre CRUDO (no localizado). Fuente para el ícono de
   *  cada row (matcher ES). El display sale de `categoryNameById`. */
  categoryRawNameById: Map<string, string>
  /** category_id → color (hex). Tinta el icon tile de cada gasto por
   *  categoría, igual que en Gastos · Movimientos. */
  categoryColorById: Map<string, string>
  familyMembers?: Array<{ id: string; name: string; color: string }>
  isLoading: boolean
  errorKind?: DashboardErrorKind
  onDelete: (expenseId: string) => void
  /** Borra un income event (id). Si no se pasa, el row income no es
   *  swipeable (compat). Recomendado pasarlo. */
  onDeleteIncome?: (incomeId: string) => void
  onRetry: () => void
  /** Expense id currently being deleted (mutation in flight). */
  pendingExpenseId?: string | null
  /** Income id currently being deleted. */
  pendingIncomeId?: string | null
  /** Cap del feed (default 6). */
  limit?: number
}

/**
 * Builds the chronological ISO key for an income event. Anchors at
 * noon of `event_date` (YYYY-MM-DD) when present so a backdated
 * income sorts into its real day rather than its insertion timestamp.
 * Falls back to `created_at` only when event_date is missing or
 * malformed (shouldn't happen post-`useCreateIncomeEvent`, which
 * always sets event_date).
 */
function incomeChronologicalIso(income: IncomeEvent): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(income.event_date)
  if (m) return `${income.event_date}T12:00:00.000Z`
  return income.created_at
}

type MovementItem =
  | { kind: 'expense'; iso: string; expense: Expense }
  | { kind: 'income'; iso: string; income: IncomeEvent }

const INCOME_KIND_LABEL_KEY: Record<IncomeEventKind, string> = {
  transfer: 'home:activitySection.incomeKind.transfer',
  bonus: 'home:activitySection.incomeKind.bonus',
  gift: 'home:activitySection.incomeKind.gift',
  other: 'home:activitySection.incomeKind.other',
}

const INCOME_KIND_ICON: Record<IncomeEventKind, string> = {
  transfer: '💸',
  bonus: '⭐',
  gift: '🎁',
  other: '💵',
}

// Verde de crédito para el icon tile de los ingresos — no tienen categoría,
// así que matchean el color del monto positivo (success). Los gastos usan el
// color real de su categoría.
const INCOME_TILE_COLOR = '#329315'
// Fallback neutro para un gasto sin categoría conocida.
const NO_CATEGORY_COLOR = '#888888'

/**
 * Renders the body of the Home activity section — list of ActivityRowV2
 * cards, or the empty / error / loading state. The section header
 * ("ACTIVIDAD" + "Ver todos") is owned by HomeDashboard so the layout
 * stays consistent with the V1 Cuaderno mock.
 *
 * El feed es mixto: gastos (rojos, signo −) intercalados con ingresos
 * (verdes, signo +). El ActivityRowV2 ya es amount-sign aware, así que
 * la diferenciación visual sale sola del color del monto + un ícono
 * distinto por kind de ingreso. Ordenado por created_at desc, slice al
 * `limit` (default 6).
 */
function HomeActivitySectionImpl({
  expenses,
  incomeEvents = [],
  categoryNameById,
  categoryRawNameById,
  categoryColorById,
  familyMembers = [],
  isLoading,
  errorKind,
  onDelete,
  onDeleteIncome,
  onRetry,
  pendingExpenseId,
  pendingIncomeId,
  limit = 6,
}: HomeActivitySectionProps) {
  const { t } = useTranslation()
  const memberById = useMemo(() => {
    const map = new Map<string, (typeof familyMembers)[number]>()
    for (const m of familyMembers) map.set(m.id, m)
    return map
  }, [familyMembers])

  const movements = useMemo<MovementItem[]>(() => {
    const merged: MovementItem[] = [
      ...expenses.map<MovementItem>((e) => ({
        kind: 'expense',
        iso: e.created_at,
        expense: e,
      })),
      ...incomeEvents.map<MovementItem>((i) => ({
        kind: 'income',
        // Use `event_date` (the day the income actually happened) as
        // the chronological key — fall back to `created_at` only if
        // event_date is missing/malformed. Anchored to T12:00:00 so
        // backdated incomes slot into the right calendar day instead
        // of jumping to the top via their insertion timestamp.
        iso: incomeChronologicalIso(i),
        income: i,
      })),
    ]
    merged.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0))
    return merged.slice(0, limit)
  }, [expenses, incomeEvents, limit])

  if (isLoading) {
    return (
      <View style={styles.skeleton}>
        <ListRowSkeleton rows={3} />
      </View>
    )
  }
  if (errorKind) {
    return (
      <ErrorState
        description={errorKind === 'network' ? t('states:error.network') : t('states:error.server')}
        onAction={onRetry}
      />
    )
  }
  if (movements.length === 0) {
    return (
      <EmptyState
        icon="receipt-long"
        stateKey="expensesThisCycle"
      />
    )
  }

  return (
    <View style={styles.list}>
      {movements.map((m, index) => {
        const delay = Math.min(180 + index * 40, 360)
        if (m.kind === 'income') {
          const income = m.income
          const kindLabel = t(INCOME_KIND_LABEL_KEY[income.kind])
          const title = income.description?.trim() || kindLabel
          const row = (
            <ActivityRowV2
              icon={INCOME_KIND_ICON[income.kind]}
              title={title}
              category={t('home:activitySection.incomeCategory', { kind: kindLabel })}
              categoryColor={INCOME_TILE_COLOR}
              whoName={memberById.get(income.created_by)?.name ?? t('home:activitySection.someone')}
              whoColor={memberById.get(income.created_by)?.color ?? '#329315'}
              amount={Math.round(Math.abs(Number(income.amount ?? 0)))}
              delay={delay}
            />
          )
          if (!onDeleteIncome) {
            return <View key={`income-${income.id}`}>{row}</View>
          }
          const dangerAction: SwipeAction = {
            label: t('home:activitySection.delete'),
            tone: 'danger',
            icon: 'delete',
            onPress: () => onDeleteIncome(income.id),
          }
          return (
            <SwipeRow
              key={`income-${income.id}`}
              accessibilityHint={t('home:activitySection.swipeDeleteHint')}
              rightActions={[dangerAction]}
              isProcessing={pendingIncomeId === income.id}
            >
              {row}
            </SwipeRow>
          )
        }
        const expense = m.expense
        const categoryName = categoryNameById.get(expense.category_id) ?? t('home:activitySection.noCategory')
        // Ícono por nombre CRUDO (matcher ES); el display sigue en
        // `categoryName` (localizado). Cae al display si falta el crudo.
        const categoryRawName = categoryRawNameById.get(expense.category_id) ?? categoryName
        const dangerAction: SwipeAction = {
          label: t('home:activitySection.delete'),
          tone: 'danger',
          icon: 'delete',
          onPress: () => onDelete(expense.id),
        }
        return (
          <SwipeRow
            key={`expense-${expense.id}`}
            accessibilityHint={t('home:activitySection.swipeDeleteHint')}
            rightActions={[dangerAction]}
            isProcessing={pendingExpenseId === expense.id}
          >
            <ActivityRowV2
              icon={<CategoryIcon name={categoryRawName} scope="expense" size={24} />}
              title={expense.description || categoryName}
              category={categoryName}
              categoryColor={categoryColorById.get(expense.category_id) ?? NO_CATEGORY_COLOR}
              whoName={memberById.get(expense.created_by)?.name ?? t('home:activitySection.someone')}
              whoColor={memberById.get(expense.created_by)?.color ?? '#329315'}
              amount={-Math.round(Math.abs(Number(expense.price ?? 0)))}
              delay={delay}
            />
          </SwipeRow>
        )
      })}
    </View>
  )
}

export const HomeActivitySection = memo(HomeActivitySectionImpl)

const styles = StyleSheet.create({
  list: { gap: 6 },
  skeleton: { gap: 6 },
})

