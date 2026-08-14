import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import type { ExpenseAnalyticsSuggestion } from '@/features/expenses/expense-analytics'
import { buildTonePalette } from '@/features/insights/control-model'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

export function ExpenseIntelligenceSuggestionCard({
  suggestion,
}: {
  suggestion: ExpenseAnalyticsSuggestion
}) {
  const { theme } = useAppTheme()
  const palette = buildTonePalette(
    theme.isDark,
    suggestion.tone,
    theme.colors.primary,
    theme.colors.success,
    theme.colors.warning,
  )

  return (
    <View
      style={[
        styles.suggestionCard,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
        },
      ]}
    >
      <View style={[styles.suggestionDot, { backgroundColor: palette.accentColor }]} />

      <View style={styles.suggestionCopy}>
        <Text style={[styles.suggestionTitle, { color: theme.colors.text }]}>{suggestion.title}</Text>
        <Text style={[styles.suggestionDetail, theme.typography.bodySmall, { color: theme.colors.textMuted }]}>
          {suggestion.detail}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  suggestionDot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
    marginTop: 4,
  },
  suggestionCopy: {
    flex: 1,
    gap: 3,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  suggestionDetail: {},
})
