import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney } from '@/utils/money'
import { GoalIcon } from '../goal-icon'

export interface StepSummaryProps {
  emoji: string
  title: string
  goalAmount: number
  months: number
  monthlyEstimate: number
  suggestedApply: number | null
}

export function StepSummary({
  emoji,
  title,
  goalAmount,
  months,
  monthlyEstimate,
  suggestedApply,
}: StepSummaryProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const cardBg = theme.isDark
    ? theme.colors.surfaceMuted
    : theme.colors.creamCard
  return (
    <View style={styles.step4Body}>
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: cardBg, borderColor: theme.colors.line },
        ]}
      >
        <GoalIcon value={emoji} size={52} emojiStyle={styles.summaryEmoji} />
        <Text
          style={[
            typography.sectionTitle,
            styles.summaryTitle,
            { color: theme.colors.text },
          ]}
          numberOfLines={2}
        >
          {title || t('settings:savingsWizard.defaultTitle')}
        </Text>
        <Text
          style={[
            typography.displayLarge,
            styles.summaryAmount,
            { color: theme.colors.text },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatMoney(goalAmount)}
        </Text>
        <Text
          style={[styles.summarySub, { color: theme.colors.textMuted }]}
        >
          {t('settings:savingsWizard.summarySub', {
            amount: formatMoney(monthlyEstimate),
            months: t('settings:savingsWizard.monthsValue', { count: months }),
          })}
        </Text>
      </View>

      {suggestedApply ? (
        <View
          style={[
            styles.summaryApply,
            {
              backgroundColor: theme.isDark
                ? 'rgba(122,216,163,0.16)'
                : 'rgba(28,126,58,0.10)',
              borderColor: theme.isDark
                ? 'rgba(122,216,163,0.32)'
                : 'rgba(28,126,58,0.26)',
            },
          ]}
        >
          <MaterialIcons
            name="bolt"
            size={16}
            color={theme.colors.success}
          />
          <Text
            style={[
              styles.summaryApplyText,
              { color: theme.colors.success },
            ]}
          >
            {t('settings:savingsWizard.applyNote', { amount: formatMoney(suggestedApply) })}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  step4Body: {
    gap: 12,
  },
  summaryCard: {
    borderRadius: radii['2xl'],
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 6,
  },
  summaryEmoji: {
    fontSize: 48,
    lineHeight: 56,
    marginBottom: 4,
  },
  summaryTitle: {
    textAlign: 'center',
  },
  summaryAmount: {
    marginTop: 4,
  },
  summarySub: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  summaryApply: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  summaryApplyText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
})
