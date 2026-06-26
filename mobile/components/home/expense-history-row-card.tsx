import { StyleSheet, Text, View } from 'react-native'
import { RectButton } from 'react-native-gesture-handler'
import { useTranslation } from 'react-i18next'
import type { Category } from '@/features/categories/use-categories'
import type { Expense } from '@/features/expenses/use-expenses'
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
import { useThemeTokens } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'

const shortDateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
})

interface ExpenseHistoryRowCardProps {
  category: Category | null
  expense: Expense
  hideCategory: boolean
  onPress: () => void
  palette: {
    backgroundColor: string
    borderColor: string
    pillBackgroundColor: string
  }
}

export function ExpenseHistoryRowCard({
  category,
  expense,
  hideCategory,
  onPress,
  palette,
}: ExpenseHistoryRowCardProps) {
  const theme = useThemeTokens()
  const { t } = useTranslation()

  return (
    <RectButton
      accessibilityHint={t('home:historyRow.editHint')}
      accessibilityLabel={`${expense.description}. ${currencyFormatter.format(expense.price)}.`}
      rippleColor={withAlpha(theme.colors.text, theme.isDark ? 0.16 : 0.06)}
      onPress={onPress}
      style={[
        styles.expenseRow,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
        },
      ]}
    >
      <View style={styles.expenseMain}>
        <View
          style={[
            styles.expenseDot,
            {
              backgroundColor: category?.color ?? theme.colors.primary,
            },
          ]}
        />

        <View style={styles.expenseCopy}>
          <View style={styles.expenseTitleRow}>
            <Text numberOfLines={1} style={[styles.expenseDescription, { color: theme.colors.text }]}>
              {expense.description}
            </Text>

            {!hideCategory ? (
              <ExpenseCategoryPill
                borderColor={palette.borderColor}
                color={category?.color ?? theme.colors.primary}
                label={category?.name ?? t('home:historyRow.noCategory')}
                pillBackgroundColor={palette.pillBackgroundColor}
                textColor={theme.colors.textMuted}
              />
            ) : null}
          </View>

          <Text style={[styles.expenseMeta, { color: theme.colors.textMuted }]}>
            {expense.creator_display_name} · {shortDateFormatter.format(new Date(expense.created_at))}
          </Text>
        </View>
      </View>

      <View style={styles.expenseSide}>
        <Text style={[styles.expensePrice, { color: theme.colors.text }]}>
          {currencyFormatter.format(expense.price)}
        </Text>
        <Text style={[styles.expenseHint, { color: theme.colors.textSoft }]}>{t('home:historyRow.swipe')}</Text>
      </View>
    </RectButton>
  )
}

function ExpenseCategoryPill({
  borderColor,
  color,
  label,
  pillBackgroundColor,
  textColor,
}: {
  borderColor: string
  color: string
  label: string
  pillBackgroundColor: string
  textColor: string
}) {
  return (
    <View
      style={[
        styles.categoryPill,
        {
          backgroundColor: pillBackgroundColor,
          borderColor,
        },
      ]}
    >
      <View
        style={[
          styles.categoryPillDot,
          {
            backgroundColor: color,
          },
        ]}
      />
      <Text numberOfLines={1} style={[styles.categoryPillLabel, { color: textColor }]}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  expenseMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
    gap: 10,
  },
  expenseDot: {
    width: 9,
    height: 9,
    borderRadius: radii.pill,
    marginTop: 7,
  },
  expenseCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  expenseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  expenseDescription: {
    flex: 1,
    minWidth: 110,
    fontSize: 15,
    fontWeight: '800',
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 120,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  categoryPillDot: {
    width: 7,
    height: 7,
    borderRadius: radii.pill,
  },
  categoryPillLabel: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
  },
  expenseMeta: {
    fontSize: 12,
    lineHeight: 16,
  },
  expenseSide: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  expensePrice: {
    fontSize: 16,
    fontWeight: '900',
  },
  expenseHint: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})
