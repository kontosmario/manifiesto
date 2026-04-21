import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { ExpenseDaySection } from '@/features/expenses/expense-history'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'

export const ExpenseHistorySectionHeader = memo(function ExpenseHistorySectionHeader({
  section,
}: {
  section: ExpenseDaySection
}) {
  const { theme } = useAppTheme()

  return (
    <View style={styles.dayGroup}>
      <View style={styles.dayHeader}>
        <View style={styles.dayHeaderCopy}>
          <Text style={[styles.dayLabel, { color: theme.colors.text }]}>{section.label}</Text>
          <Text style={[styles.dayMeta, { color: theme.colors.textMuted }]}>
            {section.data.length} {section.data.length === 1 ? 'movimiento' : 'movimientos'}
          </Text>
        </View>
        <Text style={[styles.dayTotal, { color: theme.colors.text }]}>
          {currencyFormatter.format(section.total)}
        </Text>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  dayGroup: {
    gap: 10,
    paddingTop: 2,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dayHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dayMeta: {
    fontSize: 12,
  },
  dayTotal: {
    fontSize: 15,
    fontWeight: '900',
  },
})
