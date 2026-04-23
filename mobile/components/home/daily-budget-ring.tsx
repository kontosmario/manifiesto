import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { DailyBudgetStatus } from '@/features/expenses/daily-budget-engine'
import { DailyBudgetRingChart } from '@/components/home/daily-budget-ring-chart'
import { buildDailyBudgetRingViewModel, clamp } from '@/components/home/daily-budget-ring.model'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'

interface DailyBudgetRingProps {
  compact?: boolean
  openingBudget: number
  projectedTomorrowOpening: number
  remainingRatio: number
  remainingToday: number
  status: DailyBudgetStatus
}

export function DailyBudgetRing({
  compact = false,
  openingBudget,
  projectedTomorrowOpening,
  remainingRatio,
  remainingToday,
  status,
}: DailyBudgetRingProps) {
  const { theme } = useAppTheme()
  const isReducedMotionEnabled = useReducedMotion()
  const [animationProgress, setAnimationProgress] = useState(0)

  useEffect(() => {
    if (isReducedMotionEnabled) {
      return
    }

    let frameId = 0
    const duration = 720
    let startedAt = 0

    const tick = () => {
      const elapsed = Date.now() - startedAt
      const rawProgress = clamp(elapsed / duration)
      const eased = 1 - Math.pow(1 - rawProgress, 3)
      setAnimationProgress(eased)

      if (rawProgress < 1) {
        frameId = requestAnimationFrame(tick)
      }
    }

    frameId = requestAnimationFrame(() => {
      startedAt = Date.now()
      setAnimationProgress(0)
      tick()
    })

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [isReducedMotionEnabled, remainingRatio, remainingToday, status])

  const visibleProgress = isReducedMotionEnabled ? 1 : animationProgress
  const ringModel = useMemo(
    () =>
      buildDailyBudgetRingViewModel({
        compact,
        openingBudget,
        projectedTomorrowOpening,
        remainingRatio,
        remainingToday,
        status,
        theme,
        visibleProgress,
      }),
    [
      compact,
      openingBudget,
      projectedTomorrowOpening,
      remainingRatio,
      remainingToday,
      status,
      theme,
      visibleProgress,
    ],
  )
  const { centerLabel, chartSize, footnote, innerRadius, mainProgress, overrunProgress, palette, radius, ringWidth } = ringModel

  return (
    <View style={[styles.container, compact ? styles.containerCompact : null]}>
      <View style={styles.chartWrap}>
        <DailyBudgetRingChart
          chartSize={chartSize}
          compact={compact}
          innerRadius={innerRadius}
          isReducedMotionEnabled={isReducedMotionEnabled}
          mainProgress={mainProgress}
          overrunColor={palette.overrunColor}
          overrunProgress={overrunProgress}
          radius={radius}
          ringWidth={ringWidth}
          status={status}
          trackColor={palette.trackColor}
        />

        <View style={[styles.centerValue, { pointerEvents: 'none' }]}>
          <Text style={[styles.centerLabel, compact ? styles.centerLabelCompact : null, { color: theme.colors.textMuted }]}>
            {centerLabel}
          </Text>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.52}
            numberOfLines={1}
            style={[
              styles.centerAmount,
              compact ? styles.centerAmountCompact : null,
              { color: palette.valueColor, maxWidth: compact ? 140 : 176 },
            ]}
          >
            {currencyFormatter.format(remainingToday)}
          </Text>
          <Text style={[styles.centerHelper, compact ? styles.centerHelperCompact : null, { color: theme.colors.textSoft }]}>
            Apertura {currencyFormatter.format(openingBudget)}
          </Text>
        </View>
      </View>

      <View style={styles.footnoteWrap}>
        <Text style={[styles.footnote, compact ? styles.footnoteCompact : null, { color: theme.colors.textMuted }]}>
          {footnote}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  containerCompact: {
    gap: 6,
  },
  chartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  centerLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  centerLabelCompact: {
    fontSize: 11,
    letterSpacing: 0.35,
  },
  centerAmount: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  centerAmountCompact: {
    fontSize: 21,
    letterSpacing: -0.6,
  },
  centerHelper: {
    fontSize: 12,
    lineHeight: 16,
  },
  centerHelperCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  footnoteWrap: {
    alignItems: 'center',
  },
  footnote: {
    fontSize: 12,
    textAlign: 'center',
  },
  footnoteCompact: {
    fontSize: 11,
  },
})
