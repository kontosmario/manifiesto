import { Alert, StyleSheet, Text, View } from 'react-native'
import { ControlHistoryRibbon, ControlPressureMeter, ControlSignalTile } from '@/components/home/control-visuals'
import { AppButton } from '@/components/ui/button'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingBlock } from '@/components/ui/loading-block'
import { SectionHeader } from '@/components/ui/section-header'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import { formatDeltaPercent } from '@/features/insights/control-model'
import type { FamilyDashboard } from '@/hooks/use-family-dashboard'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'

interface ControlMonthsSectionProps {
  clearHistoryIsPending: boolean
  cyclePressure: number
  expenseAnalytics: ExpenseAnalyticsSummary | null
  history: Array<{ balance: number; label: string; spent: number }>
  isCompactWidth: boolean
  monthlyHistory: FamilyDashboard['monthlyHistory']
  monthlyHistoryIsLoading: boolean
  monthlyHistoryTotals: FamilyDashboard['monthlyHistoryTotals']
  monthlyIncome: number
  onClearHistory: () => void
  projectedCloseValue: number
  savingsGoal: number
  savingsRemaining: number
}

export function ControlMonthsSection({
  clearHistoryIsPending,
  cyclePressure,
  expenseAnalytics,
  history,
  isCompactWidth,
  monthlyHistory,
  monthlyHistoryIsLoading,
  monthlyHistoryTotals,
  monthlyIncome,
  onClearHistory,
  projectedCloseValue,
  savingsGoal,
  savingsRemaining,
}: ControlMonthsSectionProps) {
  const { theme } = useAppTheme()
  const weeklyDeltaLabel = formatDeltaPercent(expenseAnalytics?.weeklyDeltaRatio ?? null)
  const weeklyDeltaHelper =
    expenseAnalytics?.weeklyDeltaRatio == null
      ? 'Todavía falta historial para comparar semanas.'
      : expenseAnalytics.weeklyDeltaRatio > 0
        ? 'Esta semana viene más pesada que la anterior.'
        : expenseAnalytics.weeklyDeltaRatio < 0
          ? 'Esta semana aflojó frente a la anterior.'
          : 'La semana viene al mismo ritmo.'

  return (
    <>
      <BrandedPanel style={styles.card}>
        <SectionHeader
          subtitle="Una vista corta para entender qué tan exigido viene el ciclo."
          title="Pulso del ciclo"
        />

        <ControlPressureMeter
          helper="Variable registrado + pagos y reservas de compromisos del ciclo."
          label="Presión del ciclo"
          tone="primary"
          total={Math.max(monthlyIncome, 1)}
          value={cyclePressure}
        />

        <ControlPressureMeter
          helper={`Objetivo configurado: ${currencyFormatter.format(savingsGoal)}`}
          label="Ahorro protegido"
          tone="success"
          total={Math.max(savingsGoal, 1)}
          value={savingsRemaining}
        />

        <View style={[styles.metricsGrid, isCompactWidth ? styles.metricsGridCompact : null]}>
          <ControlSignalTile
            helper="Lo que debería quedar si el patrón actual se mantiene."
            icon="event-available"
            label="Cierre estimado"
            tone={projectedCloseValue >= 0 ? 'success' : 'warning'}
            value={currencyFormatter.format(projectedCloseValue)}
          />
          <ControlSignalTile
            helper={weeklyDeltaHelper}
            icon="speed"
            label="Ritmo semanal"
            tone={
              expenseAnalytics?.weeklyDeltaRatio == null
                ? 'default'
                : expenseAnalytics.weeklyDeltaRatio > 0
                  ? 'warning'
                  : 'success'
            }
            value={weeklyDeltaLabel}
          />
        </View>
      </BrandedPanel>

      <BrandedPanel style={styles.card}>
        <SectionHeader
          subtitle="Sirve para detectar cambios de ritmo sin abrir el historial completo."
          title="Tendencia reciente"
        />

        {monthlyHistoryIsLoading ? <LoadingBlock label="Calculando tendencia..." /> : null}

        {!monthlyHistoryIsLoading && history.length === 0 ? (
          <EmptyState
            icon="insights"
            subtitle="Necesitas algunos meses con movimientos para comparar resultados."
            title="Sin historial suficiente"
          />
        ) : null}

        {history.length > 0 ? (
          <>
            <ControlHistoryRibbon items={history} />

            <View style={[styles.metricsGrid, isCompactWidth ? styles.metricsGridCompact : null]}>
              <ControlSignalTile
                helper="Acumulado del período visible."
                icon="receipt-long"
                label="Total gastado"
                value={currencyFormatter.format(monthlyHistoryTotals.totalSpent)}
              />
              <ControlSignalTile
                helper="Lo que quedó libre después de gastar."
                icon="shield"
                label="Total guardado"
                tone="success"
                value={currencyFormatter.format(monthlyHistoryTotals.totalSaved)}
              />
            </View>
          </>
        ) : null}
      </BrandedPanel>

      <BrandedPanel style={styles.card}>
        <SectionHeader
          subtitle="Cada fila resume cuánto salió y con qué saldo cerró ese mes."
          title="Mes a mes"
        />

        {monthlyHistory.length === 0 ? (
          <EmptyState
            icon="calendar-month"
            subtitle="Cuando se acumulen cierres mensuales, aquí vas a poder comparar el resultado."
            title="Todavía no hay meses cerrados"
          />
        ) : (
          <View style={styles.rows}>
            {monthlyHistory.map((row) => (
              <View
                key={row.monthStartIso}
                style={[
                  styles.rowItem,
                  {
                    backgroundColor: theme.colors.surfaceMuted,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{row.monthLabel}</Text>
                  <Text style={[styles.rowMeta, { color: theme.colors.textMuted }]}>
                    Gastado {currencyFormatter.format(row.spent)} · Guardado {currencyFormatter.format(row.saved)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.rowAmount,
                    { color: row.endBalance >= 0 ? theme.colors.text : theme.colors.warning },
                  ]}
                >
                  {currencyFormatter.format(row.endBalance)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </BrandedPanel>

      <BrandedPanel style={styles.card} variant="accent">
        <SectionHeader
          subtitle="Usalo solo si quieres reiniciar el historial variable del hogar."
          title="Herramientas"
        />
        <AppButton
          label="Limpiar gastos cargados"
          loading={clearHistoryIsPending}
          onPress={() => {
            Alert.alert(
              'Limpiar historial',
              'Se van a borrar todos los gastos variables cargados de la familia. Esta acción no se puede deshacer.',
              [
                { style: 'cancel', text: 'Cancelar' },
                {
                  style: 'destructive',
                  text: 'Limpiar',
                  onPress: onClearHistory,
                },
              ],
            )
          }}
          variant="danger"
        />
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
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricsGridCompact: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
  },
  rows: {
    gap: 10,
  },
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
