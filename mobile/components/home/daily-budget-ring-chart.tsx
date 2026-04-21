import { StyleSheet, View } from 'react-native'
import type { DailyBudgetStatus } from '@/features/expenses/daily-budget-engine'
import { getOptionalSkiaModule } from '@/lib/optional-skia'
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { clamp } from '@/components/home/daily-budget-ring.model'

function buildArcPath(
  skia: NonNullable<ReturnType<typeof getOptionalSkiaModule>>,
  cx: number,
  cy: number,
  radius: number,
  progress: number,
) {
  const path = skia.Skia.Path.Make()

  path.addArc(
    {
      x: cx - radius,
      y: cy - radius,
      width: radius * 2,
      height: radius * 2,
    },
    -90,
    360 * clamp(progress),
  )

  return path
}

function getArcPoint(cx: number, cy: number, radius: number, progress: number) {
  const angle = -Math.PI / 2 + Math.PI * 2 * clamp(progress)

  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  }
}

interface DailyBudgetRingChartProps {
  chartSize: number
  compact: boolean
  innerRadius: number
  isReducedMotionEnabled: boolean
  mainProgress: number
  overrunProgress: number
  radius: number
  ringWidth: number
  status: DailyBudgetStatus
  trackColor: string
  overrunColor: string
}

export function DailyBudgetRingChart({
  chartSize,
  compact,
  innerRadius,
  isReducedMotionEnabled,
  mainProgress,
  overrunProgress,
  radius,
  ringWidth,
  status,
  trackColor,
  overrunColor,
}: DailyBudgetRingChartProps) {
  const skia = getOptionalSkiaModule()
  const { theme } = useAppTheme()
  const center = chartSize / 2

  const trackPath = skia ? buildArcPath(skia, center, center, radius, 1) : null
  const mainPath = skia ? buildArcPath(skia, center, center, radius, mainProgress) : null
  const overrunPath = skia
    ? buildArcPath(skia, center, center, radius - ringWidth * 0.9, overrunProgress)
    : null
  const markerPoint = getArcPoint(center, center, radius, mainProgress)

  if (skia && trackPath && mainPath) {
    const { BlurMask, Canvas, Circle, Path } = skia

    return (
      <Canvas style={{ height: chartSize, width: chartSize }}>
        <Path
          color={withAlpha(theme.colors.text, theme.isDark ? 0.08 : 0.07)}
          path={trackPath}
          strokeCap="round"
          strokeJoin="round"
          strokeWidth={ringWidth}
          style="stroke"
        />
        <Path
          color={trackColor}
          path={mainPath}
          strokeCap="round"
          strokeJoin="round"
          strokeWidth={ringWidth}
          style="stroke"
        >
          {!isReducedMotionEnabled ? <BlurMask blur={14} style="solid" /> : null}
        </Path>
        {status === 'exceeded' && overrunProgress > 0 && overrunPath ? (
          <Path
            color={overrunColor}
            path={overrunPath}
            strokeCap="round"
            strokeJoin="round"
            strokeWidth={compact ? 7 : 8}
            style="stroke"
          />
        ) : null}

        <Circle
          color={theme.colors.backgroundElevated}
          cx={center}
          cy={center}
          r={innerRadius}
        />
        <Circle
          color={withAlpha(theme.colors.text, theme.isDark ? 0.06 : 0.05)}
          cx={center}
          cy={center}
          r={innerRadius}
          style="stroke"
          strokeWidth={1}
        />

        {status !== 'exceeded' && mainProgress > 0 ? (
          <>
            {!isReducedMotionEnabled ? (
              <Circle color={trackColor} cx={markerPoint.x} cy={markerPoint.y} r={compact ? 8 : 10}>
                <BlurMask blur={12} style="solid" />
              </Circle>
            ) : null}
            <Circle
              color={theme.colors.backgroundElevated}
              cx={markerPoint.x}
              cy={markerPoint.y}
              r={compact ? 4 : 5}
            />
          </>
        ) : null}
      </Canvas>
    )
  }

  return (
    <View
      style={[
        styles.fallbackStage,
        {
          height: chartSize,
          width: chartSize,
        },
      ]}
    >
      <View
        style={[
          styles.fallbackTrackRing,
          {
            backgroundColor: withAlpha(
              theme.colors.backgroundElevated,
              theme.isDark ? 0.03 : 0.9,
            ),
            borderColor: withAlpha(theme.colors.text, theme.isDark ? 0.08 : 0.07),
            borderWidth: Math.max(8, ringWidth - 4),
            height: radius * 2 + ringWidth,
            width: radius * 2 + ringWidth,
          },
        ]}
      >
        <View
          style={[
            styles.fallbackTintRing,
            {
              borderColor: trackColor,
              opacity: status === 'exceeded' ? 0.56 : 0.24 + mainProgress * 0.38,
            },
          ]}
        />
      </View>
      <View
        style={[
          styles.fallbackMeter,
          {
            backgroundColor: withAlpha(theme.colors.text, 0.08),
            width: compact ? 154 : 190,
          },
        ]}
      >
        <View
          style={[
            styles.fallbackMeterFill,
            {
              backgroundColor: trackColor,
              width: `${Math.max(10, Math.round((status === 'exceeded' ? 1 : mainProgress) * 100))}%`,
            },
          ]}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fallbackStage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackTrackRing: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  fallbackTintRing: {
    position: 'absolute',
    inset: 16,
    borderRadius: radii.pill,
    borderWidth: 2,
  },
  fallbackMeter: {
    position: 'absolute',
    bottom: 36,
    height: 8,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fallbackMeterFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
})
