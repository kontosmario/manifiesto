import { StyleSheet, View } from 'react-native'
import { FinancialSummaryRadialCanvas } from '@/components/home/financial-summary-radial-canvas'
import {
  type FinancialSummaryRadialConfig,
  type FinancialSummaryRadialModel,
} from '@/components/home/financial-summary-radial.model'
import { FinancialSummaryRadialFallback } from '@/components/home/financial-summary-radial-fallback'
import { FinancialSummaryRadialOverlay } from '@/components/home/financial-summary-radial-overlay'
import type { FinancialSummaryUiPalette } from '@/components/home/financial-summary-radial.theme'
import { getOptionalSkiaModule } from '@/lib/optional-skia'
import { useAppTheme } from '@/theme/theme-provider'

interface FinancialSummaryRadialChartProps {
  compact: boolean
  config?: FinancialSummaryRadialConfig
  model: FinancialSummaryRadialModel
  uiPalette: FinancialSummaryUiPalette
}

export function FinancialSummaryRadialChart({
  compact,
  config,
  model,
  uiPalette,
}: FinancialSummaryRadialChartProps) {
  const skia = getOptionalSkiaModule()
  const { theme } = useAppTheme()
  const {
    chartSettleScale,
    stageSize,
  } = model
  const isDailyVariant = model.isDailyVariant

  return (
    <View
      style={[
        styles.chartStage,
        isDailyVariant ? styles.chartStageDaily : null,
        {
          height: stageSize,
          transform: [{ scale: chartSettleScale }],
          width: stageSize,
        },
      ]}
    >
      {skia ? (
        <FinancialSummaryRadialCanvas model={model} theme={theme} uiPalette={uiPalette} />
      ) : (
        <FinancialSummaryRadialFallback compact={compact} model={model} theme={theme} />
      )}

      <FinancialSummaryRadialOverlay
        compact={compact}
        config={config}
        model={model}
        theme={theme}
        uiPalette={uiPalette}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  chartStage: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -14,
    position: 'relative',
  },
  chartStageDaily: {
    marginBottom: -8,
  },
})
