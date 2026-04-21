import { StyleSheet, View } from 'react-native'
import { ControlActionCard } from '@/components/home/control-primitives'
import { ControlSignalTile } from '@/components/home/control-visuals'
import { ExpenseIntelligencePanel } from '@/components/home/expense-intelligence-panel'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingBlock } from '@/components/ui/loading-block'
import { SectionHeader } from '@/components/ui/section-header'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import type { ControlAction, MetricDescriptor } from '@/features/insights/control-model'

interface ControlPlanSectionProps {
  cyclePlanActions: ControlAction[]
  expenseAnalytics: ExpenseAnalyticsSummary | null
  focusMetrics: MetricDescriptor[]
  isCompactWidth: boolean
  isLoading: boolean
}

export function ControlPlanSection({
  cyclePlanActions,
  expenseAnalytics,
  focusMetrics,
  isCompactWidth,
  isLoading,
}: ControlPlanSectionProps) {
  if (isLoading) {
    return (
      <BrandedPanel style={styles.card}>
        <LoadingBlock label="Detectando focos de gasto..." />
      </BrandedPanel>
    )
  }

  return (
    <>
      <BrandedPanel style={styles.card} variant="accent">
        <SectionHeader
          subtitle="La idea es corregir poco y con impacto, no revisar todo."
          title="Plan simple del ciclo"
        />
        <View style={styles.actionList}>
          {cyclePlanActions.map((action, index) => (
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

      {expenseAnalytics ? (
        <ExpenseIntelligencePanel
          analytics={expenseAnalytics}
          compact={isCompactWidth}
          isLoading={false}
          title="Proyección inteligente"
        />
      ) : (
        <BrandedPanel style={styles.card}>
          <SectionHeader
            subtitle="La app necesita algunos gastos variables para proyectar el cierre con contexto."
            title="Proyección inteligente"
          />
          <EmptyState
            icon="psychology"
            subtitle="Apenas haya historial suficiente, acá vas a ver alertas de ritmo, concentración y hábitos."
            title="Todavía falta lectura suficiente"
          />
        </BrandedPanel>
      )}

      <BrandedPanel style={styles.card}>
        <SectionHeader
          subtitle="Los focos se construyen con gasto variable, compromisos y deuda cargada en la app."
          title="Dónde mirar primero"
        />
        {focusMetrics.length === 0 ? (
          <EmptyState
            icon="insights"
            subtitle="Seguí registrando para que la app detecte patrones más finos."
            title="Sin focos relevantes todavía"
          />
        ) : (
          <View style={[styles.metricsGrid, isCompactWidth ? styles.metricsGridCompact : null]}>
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
        )}
      </BrandedPanel>
    </>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  actionList: {
    gap: 10,
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
})
