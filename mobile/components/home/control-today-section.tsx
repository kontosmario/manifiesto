import { StyleSheet, Text, View } from 'react-native'
import { CommitmentPreviewRow, ControlActionCard, DailyBudgetSuggestionCard } from '@/components/home/control-primitives'
import { ControlSignalTile } from '@/components/home/control-visuals'
import { DailyBudgetRing } from '@/components/home/daily-budget-ring'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingBlock } from '@/components/ui/loading-block'
import { SectionHeader } from '@/components/ui/section-header'
import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { CommitmentSummary, ControlAction, MetricDescriptor } from '@/features/insights/control-model'
import { useAppTheme } from '@/theme/theme-provider'

interface ControlTodaySectionProps {
  commitmentSummary: CommitmentSummary
  dailyBudgetSummary: DailyBudgetSummary
  expensesAreLoading: boolean
  hasDailyBudgetBase: boolean
  isCompactWidth: boolean
  financeIsLoading: boolean
  todayActions: ControlAction[]
  todayMetrics: MetricDescriptor[]
}

export function ControlTodaySection({
  commitmentSummary,
  dailyBudgetSummary,
  expensesAreLoading,
  financeIsLoading,
  hasDailyBudgetBase,
  isCompactWidth,
  todayActions,
  todayMetrics,
}: ControlTodaySectionProps) {
  const { theme } = useAppTheme()

  if (financeIsLoading || expensesAreLoading) {
    return (
      <BrandedPanel elevated style={styles.card} variant="hero">
        <LoadingBlock label="Armando la guía diaria..." />
      </BrandedPanel>
    )
  }

  if (!hasDailyBudgetBase) {
    return (
      <BrandedPanel style={styles.card}>
        <EmptyState
          icon="insights"
          subtitle="Define ingreso, ahorro meta y día de cobro para convertir esta tab en un copiloto real."
          title="Todavía no hay base para Control"
        />
      </BrandedPanel>
    )
  }

  return (
    <>
      <BrandedPanel elevated style={styles.card} variant="hero">
        <SectionHeader
          subtitle="Una lectura simple para decidir rápido sin entrar en detalle."
          title="Presupuesto de hoy"
        />

        <View style={[styles.todayHeroLayout, isCompactWidth ? styles.todayHeroLayoutCompact : null]}>
          <View style={styles.todayRingWrap}>
            <DailyBudgetRing
              compact={isCompactWidth}
              openingBudget={dailyBudgetSummary.openingBudget}
              projectedTomorrowOpening={dailyBudgetSummary.projectedTomorrowOpening}
              remainingRatio={dailyBudgetSummary.remainingRatio}
              remainingToday={dailyBudgetSummary.remainingToday}
              status={dailyBudgetSummary.status}
            />
          </View>

          <View style={styles.todayInsightColumn}>
            <Text style={[styles.todayInsightEyebrow, { color: theme.colors.primaryStrong }]}>
              Núcleo diario
            </Text>
            <Text style={[styles.todayInsightTitle, { color: theme.colors.text }]}>
              {dailyBudgetSummary.remainingToday < 0
                ? 'El día ya pide freno'
                : dailyBudgetSummary.remainingRatio <= 0.2
                  ? 'El margen de hoy es fino'
                  : 'Todavía hay aire útil'}
            </Text>
            <Text style={[styles.todayInsightCopy, theme.typography.bodySmall, { color: theme.colors.textMuted }]}>
              {dailyBudgetSummary.remainingToday < 0
                ? 'La prioridad es no seguir trasladando gasto a mañana.'
                : 'Toma este número como referencia antes de cargar algo nuevo.'}
            </Text>

            <View style={styles.todayMiniDeck}>
              {todayMetrics.slice(0, 2).map((metric) => (
                <ControlSignalTile
                  key={metric.label}
                  helper={metric.helper}
                  icon={metric.icon}
                  label={metric.label}
                  tone={metric.tone}
                  value={metric.value}
                  variant="glass"
                />
              ))}
            </View>
          </View>
        </View>

        <View style={[styles.metricsGrid, isCompactWidth ? styles.metricsGridCompact : null]}>
          {todayMetrics.slice(2).map((metric) => (
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

        {dailyBudgetSummary.suggestions.length > 0 ? (
          <DailyBudgetSuggestionCard
            detail={dailyBudgetSummary.suggestions[0].detail}
            title={dailyBudgetSummary.suggestions[0].title}
            tone={dailyBudgetSummary.suggestions[0].tone}
          />
        ) : null}
      </BrandedPanel>

      <BrandedPanel style={styles.card}>
        <SectionHeader
          subtitle="Pasos concretos, ordenados por utilidad para hoy."
          title="Qué conviene hacer ahora"
        />
        <View style={styles.actionList}>
          {todayActions.map((action, index) => (
            <ControlActionCard
              key={`${action.title}-${index}`}
              detail={action.detail}
              index={index + 1}
              title={action.title}
              tone={action.tone}
            />
          ))}
        </View>
      </BrandedPanel>

      {commitmentSummary.upcomingItems.length > 0 ? (
        <BrandedPanel style={styles.card}>
          <SectionHeader
            subtitle="Para no olvidar fijos, cuotas y deudas que ya impactan este ciclo."
            title="Próximos compromisos"
          />
          <View style={styles.rows}>
            {commitmentSummary.upcomingItems.slice(0, 3).map((item) => (
              <CommitmentPreviewRow key={item.id} item={item} />
            ))}
          </View>
        </BrandedPanel>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
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
  todayHeroLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  todayHeroLayoutCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  todayRingWrap: {
    minWidth: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayInsightColumn: {
    flex: 1,
    gap: 10,
  },
  todayInsightEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  todayInsightTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  todayInsightCopy: {},
  todayMiniDeck: {
    gap: 10,
  },
  actionList: {
    gap: 10,
  },
  rows: {
    gap: 10,
  },
})
