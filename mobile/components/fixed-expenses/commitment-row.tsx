import { StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'
import {
  fixedExpenseFrequencyLabel,
  fixedExpenseKindLabel,
  fixedExpenseStatusLabel,
} from '@/features/fixed-expenses/fixed-expense-types'
import { type DerivedFixedExpense } from '@/features/fixed-expenses/commitment-utils'
import { radii } from '@/theme/palette'

const shortDateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
})

interface CommitmentRowProps {
  categoryName: string | null
  fixedExpense: DerivedFixedExpense
  isBusy: boolean
  onDelete: () => void
  onEdit: () => void
  onRegisterPayment: () => void
  onToggleStatus: () => void
}

export function CommitmentRow({
  categoryName,
  fixedExpense,
  isBusy,
  onDelete,
  onEdit,
  onRegisterPayment,
  onToggleStatus,
}: CommitmentRowProps) {
  const { theme } = useAppTheme()
  const nextDueDate = new Date(`${fixedExpense.next_due_on}T00:00:00`)
  const isActionable = fixedExpense.status === 'active'
  const canRegisterPayment = isActionable && Boolean(fixedExpense.category_id)
  const statusToneColor = fixedExpense.isOverdue
    ? theme.colors.danger
    : fixedExpense.isDueSoon
      ? theme.colors.warning
      : fixedExpense.status === 'paused'
        ? theme.colors.textSoft
        : theme.colors.primaryStrong
  const metaBits = [
    fixedExpenseKindLabel(fixedExpense.kind),
    fixedExpenseFrequencyLabel(fixedExpense.frequency),
    Number.isNaN(nextDueDate.getTime())
      ? 'Sin vencimiento'
      : `Vence ${shortDateFormatter.format(nextDueDate)}`,
  ]

  if (categoryName) {
    metaBits.push(categoryName)
  } else if (isActionable) {
    metaBits.push('Falta categoría')
  }

  if (fixedExpense.kind === 'installment' && typeof fixedExpense.remainingInstallments === 'number') {
    metaBits.push(
      fixedExpense.remainingInstallments > 0
        ? `${fixedExpense.remainingInstallments} cuotas restantes`
        : 'Plan cerrado',
    )
  }

  if (fixedExpense.kind === 'debt' && typeof fixedExpense.remaining_balance === 'number') {
    metaBits.push(`Saldo ${currencyFormatter.format(fixedExpense.remaining_balance)}`)
  }

  return (
    <View
      style={[
        styles.itemRow,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: fixedExpense.isOverdue
            ? theme.colors.danger
            : fixedExpense.isDueSoon
              ? theme.colors.warning
              : theme.colors.border,
        },
      ]}
    >
      <View style={styles.itemHeader}>
        <View style={styles.itemCopy}>
          <View style={styles.itemTitleRow}>
            <Text style={[styles.itemTitle, { color: theme.colors.text }]}>{fixedExpense.name}</Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: theme.isDark
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(255, 255, 255, 0.72)',
                  borderColor: theme.isDark ? theme.colors.border : 'rgba(17, 17, 17, 0.08)',
                },
              ]}
            >
              <Text style={[styles.statusPillLabel, { color: statusToneColor }]}>
                {fixedExpense.isOverdue
                  ? 'Vencido'
                  : fixedExpense.isDueSoon
                    ? 'Por vencer'
                    : fixedExpenseStatusLabel(fixedExpense.status)}
              </Text>
            </View>
          </View>
          <Text style={[styles.itemMeta, { color: theme.colors.textMuted }]}>
            {metaBits.join(' · ')}
          </Text>
          {fixedExpense.notes ? (
            <Text style={[styles.itemNotes, { color: theme.colors.textSoft }]}>{fixedExpense.notes}</Text>
          ) : null}
        </View>

        <View style={styles.itemAmountBlock}>
          <Text style={[styles.itemAmount, { color: theme.colors.text }]}>
            {currencyFormatter.format(fixedExpense.amount)}
          </Text>
          {fixedExpense.paidInCycleAmount > 0 ? (
            <Text style={[styles.itemAmountHelper, { color: theme.colors.primaryStrong }]}>
              Pagado {currencyFormatter.format(fixedExpense.paidInCycleAmount)}
            </Text>
          ) : fixedExpense.reservedAmountInCycle > 0 ? (
            <Text style={[styles.itemAmountHelper, { color: theme.colors.warning }]}>
              Pendiente {currencyFormatter.format(fixedExpense.reservedAmountInCycle)}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.itemActions}>
        {canRegisterPayment ? (
          <AppButton
            disabled={isBusy}
            fullWidth={false}
            label="Registrar pago"
            onPress={onRegisterPayment}
            size="compact"
            variant="primary"
          />
        ) : null}
        {isActionable && !canRegisterPayment ? (
          <AppButton
            disabled={isBusy}
            fullWidth={false}
            label="Completar"
            onPress={onEdit}
            size="compact"
            variant="secondary"
          />
        ) : null}
        <View style={styles.iconActions}>
          {fixedExpense.status === 'active' || fixedExpense.status === 'paused' ? (
            <IconButton
              accessibilityLabel={fixedExpense.status === 'paused' ? 'Reactivar gasto fijo' : 'Pausar gasto fijo'}
              buttonSize={36}
              icon={fixedExpense.status === 'paused' ? 'play-arrow' : 'pause'}
              onPress={onToggleStatus}
              size={18}
              variant="ghost"
            />
          ) : null}
          <IconButton
            accessibilityLabel="Editar gasto fijo"
            buttonSize={36}
            icon="edit"
            onPress={onEdit}
            size={18}
            symbolName="square.and.pencil"
            variant="ghost"
          />
          <IconButton
            accessibilityLabel="Borrar gasto fijo"
            buttonSize={36}
            icon="delete-outline"
            onPress={onDelete}
            size={18}
            symbolName="trash"
            variant="ghost"
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  itemRow: {
    borderWidth: 1,
    borderRadius: radii['2xl'],
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    gap: 14,
  },
  itemCopy: {
    flex: 1,
    gap: 5,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '900',
    flexShrink: 1,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  itemMeta: {
    fontSize: 13,
    lineHeight: 18,
  },
  itemNotes: {
    fontSize: 12,
    lineHeight: 17,
  },
  itemAmountBlock: {
    alignItems: 'flex-end',
    gap: 4,
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: '900',
  },
  itemAmountHelper: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  iconActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
  },
})
