import { StyleSheet, View } from 'react-native'
import type { FinancialSummaryRadialModel } from '@/components/home/financial-summary-radial.model'
import { hexToRgba } from '@/components/home/financial-summary-radial.utils'
import { radii, type AppTheme } from '@/theme/palette'

interface FinancialSummaryRadialFallbackProps {
  compact: boolean
  model: FinancialSummaryRadialModel
  theme: AppTheme
}

export function FinancialSummaryRadialFallback({
  compact,
  model,
  theme,
}: FinancialSummaryRadialFallbackProps) {
  const { centerAccentColor, donutSize, segments, segmentTheme, strokeWidth } = model

  return (
    <View
      style={[
        styles.chartFallbackShell,
        {
          backgroundColor: segmentTheme.panel,
          borderColor: segmentTheme.ringTrack,
          borderWidth: Math.max(6, strokeWidth - 8),
          height: donutSize,
          width: donutSize,
        },
      ]}
    >
      <View
        style={[
          styles.chartFallbackInnerRing,
          {
            borderColor: hexToRgba(centerAccentColor, theme.isDark ? 0.18 : 0.14),
          },
        ]}
      />
      {segments
        .filter((segment) => segment.share > 0)
        .map((segment, index, list) => {
          const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(list.length, 1)
          const markerRadius = donutSize / 2 - Math.max(10, strokeWidth * 0.6)
          const markerSize = compact ? 10 : 12
          const markerCenterX = donutSize / 2 + Math.cos(angle) * markerRadius
          const markerCenterY = donutSize / 2 + Math.sin(angle) * markerRadius

          return (
            <View
              key={`${segment.label}-fallback-marker`}
              style={[
                styles.chartFallbackMarker,
                {
                  backgroundColor: segment.color,
                  height: markerSize,
                  left: markerCenterX - markerSize / 2,
                  top: markerCenterY - markerSize / 2,
                  width: markerSize,
                },
              ]}
            />
          )
        })}
    </View>
  )
}

const styles = StyleSheet.create({
  chartFallbackShell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  chartFallbackInnerRing: {
    position: 'absolute',
    inset: 20,
    borderRadius: radii.pill,
    borderWidth: 1.5,
  },
  chartFallbackMarker: {
    position: 'absolute',
    borderRadius: radii.pill,
  },
})
