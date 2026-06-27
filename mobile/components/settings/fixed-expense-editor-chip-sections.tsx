import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Chip } from '@/components/ui/chip'
import type { Category } from '@/features/categories/use-categories'
import {
  FIXED_EXPENSE_FREQUENCIES,
  FIXED_EXPENSE_KINDS,
  FIXED_EXPENSE_STATUSES,
  fixedExpenseFrequencyLabel,
  fixedExpenseKindLabel,
  fixedExpenseStatusLabel,
  type FixedExpenseFrequency,
  type FixedExpenseKind,
  type FixedExpenseStatus,
} from '@/features/fixed-expenses/fixed-expense-types'
import { useAppTheme } from '@/theme/theme-provider'

interface FixedExpenseSectionLabelProps {
  label: string
}

function FixedExpenseSectionLabel({ label }: FixedExpenseSectionLabelProps) {
  const { theme } = useAppTheme()

  return <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>{label}</Text>
}

interface FixedExpenseKindSectionProps {
  kind: FixedExpenseKind
  onChange: (value: FixedExpenseKind) => void
}

export function FixedExpenseKindSection({
  kind,
  onChange,
}: FixedExpenseKindSectionProps) {
  const { t } = useTranslation()
  return (
    <View style={styles.section}>
      <FixedExpenseSectionLabel label={t('settings:fixedEditor.kindLabel')} />
      <View style={styles.chips}>
        {FIXED_EXPENSE_KINDS.map((option) => (
          <Chip
            key={option}
            compact
            isActive={kind === option}
            label={fixedExpenseKindLabel(option)}
            onPress={() => onChange(option)}
          />
        ))}
      </View>
    </View>
  )
}

interface FixedExpenseCategorySectionProps {
  categories: Category[]
  categoryId: string
  onChange: (value: string) => void
}

export function FixedExpenseCategorySection({
  categories,
  categoryId,
  onChange,
}: FixedExpenseCategorySectionProps) {
  const { t } = useTranslation()
  return (
    <View style={styles.section}>
      <FixedExpenseSectionLabel label={t('settings:fixedEditor.categoryLabel')} />
      <View style={styles.chips}>
        {categories.map((category) => (
          <Chip
            key={category.id}
            color={category.color}
            compact
            isActive={categoryId === category.id}
            label={category.displayName}
            onPress={() => onChange(category.id)}
          />
        ))}
      </View>
    </View>
  )
}

interface FixedExpenseFrequencySectionProps {
  frequency: FixedExpenseFrequency
  onChange: (value: FixedExpenseFrequency) => void
}

export function FixedExpenseFrequencySection({
  frequency,
  onChange,
}: FixedExpenseFrequencySectionProps) {
  const { t } = useTranslation()
  return (
    <View style={styles.section}>
      <FixedExpenseSectionLabel label={t('settings:fixedEditor.frequencyLabel')} />
      <View style={styles.chips}>
        {FIXED_EXPENSE_FREQUENCIES.map((option) => (
          <Chip
            key={option}
            compact
            isActive={frequency === option}
            label={fixedExpenseFrequencyLabel(option)}
            onPress={() => onChange(option)}
          />
        ))}
      </View>
    </View>
  )
}

interface FixedExpenseStatusSectionProps {
  status: FixedExpenseStatus
  onChange: (value: FixedExpenseStatus) => void
}

export function FixedExpenseStatusSection({
  status,
  onChange,
}: FixedExpenseStatusSectionProps) {
  const { t } = useTranslation()
  return (
    <View style={styles.section}>
      <FixedExpenseSectionLabel label={t('settings:fixedEditor.statusLabel')} />
      <View style={styles.chips}>
        {FIXED_EXPENSE_STATUSES.filter((option) => option !== 'archived').map((option) => (
          <Chip
            key={option}
            compact
            isActive={status === option}
            label={fixedExpenseStatusLabel(option)}
            onPress={() => onChange(option)}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
})
