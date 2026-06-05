import { StyleSheet, Text, View } from 'react-native'
import {
  ControlForecastStrip,
  ControlSignalTile,
} from '@/components/home/control-visuals'
import { ExpenseIntelligenceSuggestionCard } from '@/components/home/expense-intelligence-suggestion-card'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { LoadingBlock } from '@/components/ui/loading-block'
import { SectionHeader } from '@/components/ui/section-header'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import { buildExpenseIntelligenceViewModel } from '@/features/expenses/expense-intelligence-model'
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'

interface ExpenseIntelligencePanelProps {
  analytics: ExpenseAnalyticsSummary | null
  compact?: boolean
  isLoading?: boolean
  title?: string
}

export function ExpenseIntelligencePanel({
  analytics,
  compact = false,
  isLoading = false,
  title = 'Gasto inteligente',
}: ExpenseIntelligencePanelProps) {
  const { theme } = useAppTheme()

  if (isLoading) {
    return (
      <BrandedPanel style={[styles.card, compact ? styles.cardCompact : null]} variant="section">
        <SectionHeader title={title} />
        <LoadingBlock label="Proyectando cierre..." />
      </BrandedPanel>
    )
  }

  if (!analytics) {
    return null
  }

  const { focusMetrics, hasRisk, headlineText, leadMetrics, metricTone, suggestions } =
    buildExpenseIntelligenceViewModel(analytics)

  return (
    <BrandedPanel
      style={[styles.card, compact ? styles.cardCompact : null]}
      variant={hasRisk ? 'accent' : 'section'}
    >
      <SectionHeader
        subtitle="Proyección del cierre y focos concretos para no revisar todo."
        title={title}
      />

      <View
        style={[
          styles.headlineCard,
          {
            backgroundColor: theme.isDark
              ? theme.colors.surfaceMuted
              : withAlpha(theme.colors.backgroundElevated, 0.8),
            borderColor: theme.isDark ? theme.colors.border : withAlpha(theme.colors.text, 0.08),
          },
        ]}
      >
        <Text style={[styles.headlineLabel, { color: theme.colors.textMuted }]}>
          Proyección al cierre
        </Text>
        <Text
          style={[
            styles.headlineValue,
            { color: metricTone === 'success' ? theme.colors.success : theme.colors.warning },
          ]}
        >
          {currencyFormatter.format(analytics.projectedAvailableAtCycleEnd)}
        </Text>
        <Text style={[styles.headlineHelper, theme.typography.bodySmall, { color: theme.colors.textSoft }]}>
          {headlineText}
        </Text>
        <Text style={[styles.headlineSubhelper, { color: theme.colors.textMuted }]}>
          Gasto estimado del mes: {currencyFormatter.format(analytics.projectedCycleTotal)}
        </Text>
      </View>

      <ControlForecastStrip
        compact={compact}
        dailyCap={analytics.recommendedDailyCap}
        points={analytics.forecastSeries}
      />

      <View style={[styles.metricsGrid, compact ? styles.metricsGridCompact : null]}>
        {leadMetrics.map((metric) => (
          <ControlSignalTile
            key={metric.label}
            helper={metric.helper}
            icon={metric.icon}
            label={metric.label}
            tone={metric.tone}
            value={metric.value}
          />
        ))}
      </View>

      {focusMetrics.length > 0 ? (
        <View style={styles.focusSection}>
          <Text style={[styles.focusTitle, { color: theme.colors.text }]}>Focos detectados</Text>
          <View style={[styles.metricsGrid, compact ? styles.metricsGridCompact : null]}>
            {focusMetrics.map((metric) => (
              <ControlSignalTile
                key={metric.label}
                helper={metric.helper}
                icon={metric.icon}
                label={metric.label}
                tone={metric.tone}
                value={metric.value}
                wide={metric.wide}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.suggestionsList}>
        {suggestions.map((suggestion) => (
          <ExpenseIntelligenceSuggestionCard key={suggestion.title} suggestion={suggestion} />
        ))}
      </View>
    </BrandedPanel>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  cardCompact: {
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  headlineCard: {
    gap: 4,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  headlineLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
  headlineValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  headlineHelper: {},
  headlineSubhelper: {
    fontSize: 12,
    lineHeight: 17,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricsGridCompact: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
  },
  focusSection: {
    gap: 10,
  },
  focusTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  suggestionsList: {
    gap: 10,
  },
})
