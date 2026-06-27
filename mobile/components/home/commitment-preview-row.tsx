import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { CommitmentSummary } from '@/features/insights/control-model'
import { formatRemainingDays } from '@/features/insights/control-model'
import { formatFixedExpenseDateInput } from '@/features/fixed-expenses/commitment-utils'
import { fixedExpenseKindLabel } from '@/features/fixed-expenses/fixed-expense-types'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'
import { getDateTimeFormat } from '@/lib/i18n/active-locale'

const shortDateOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
}

export function CommitmentPreviewRow({
  item,
}: {
  item: CommitmentSummary['upcomingItems'][number]
}) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const nextDueDate = new Date(`${item.next_due_on}T00:00:00`)
  const dueText = item.isOverdue
    ? t('home:commitmentRow.overdue', {
        date: formatFixedExpenseDateInput(item.next_due_on),
      })
    : item.daysUntilDue === 0
      ? t('home:commitmentRow.dueToday')
      : item.daysUntilDue === 1
        ? t('home:commitmentRow.dueTomorrow')
        : item.daysUntilDue != null && Number.isFinite(item.daysUntilDue)
          ? t('home:commitmentRow.dueIn', {
              days: formatRemainingDays(item.daysUntilDue),
            })
          : Number.isNaN(nextDueDate.getTime())
            ? t('home:commitmentRow.noDueDate')
            : t('home:commitmentRow.dueOn', {
                date: getDateTimeFormat(shortDateOptions).format(nextDueDate),
              })
  const metaBits = [fixedExpenseKindLabel(item.kind), dueText]

  return (
    <View
      style={[
        styles.rowItem,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: item.isOverdue
            ? theme.colors.danger
            : item.isDueSoon
              ? theme.colors.warning
              : theme.colors.border,
        },
      ]}
    >
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{item.name}</Text>
        <Text style={[styles.rowMeta, { color: theme.colors.textMuted }]}>
          {metaBits.join(' · ')}
        </Text>
      </View>
      <Text
        style={[
          styles.rowAmount,
          { color: item.isOverdue ? theme.colors.danger : theme.colors.text },
        ]}
      >
        {currencyFormatter.format(item.reservedAmountInCycle)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  rowMeta: {
    fontSize: 12,
    lineHeight: 17,
  },
  rowAmount: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.35,
    textAlign: 'right',
  },
})
