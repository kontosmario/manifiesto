import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { FinancialSummaryRadialLegend } from '@/components/home/financial-summary-radial-legend'
import {
  type FinancialSummaryRadialProps,
  useFinancialSummaryRadialModel,
} from '@/components/home/financial-summary-radial.model'
import { FinancialSummaryRadialChart } from '@/components/home/financial-summary-radial-chart'
import { buildFinancialSummaryUiPalette } from '@/components/home/financial-summary-radial.theme'
import { clamp } from '@/components/home/financial-summary-radial.utils'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

export function FinancialSummaryRadial({
  availableValue,
  compact = false,
  config,
  fixedValue,
  monthlyIncome,
  savingsGoal,
  savingsValue,
  spentValue,
  variant = 'overview',
}: FinancialSummaryRadialProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const [animatedProgress, setAnimatedProgress] = useState(0)
  const isDailyVariant = variant === 'daily'
  const animationProgress = reduceMotion ? 1 : animatedProgress
  const uiPalette = useMemo(
    () => buildFinancialSummaryUiPalette(theme, isDailyVariant),
    [theme, isDailyVariant],
  )

  useEffect(() => {
    if (reduceMotion) {
      return
    }

    let frameId = 0
    const duration = isDailyVariant ? 980 : 1150
    let startedAt = 0

    const tick = () => {
      const elapsed = Date.now() - startedAt
      const rawProgress = clamp(elapsed / duration)
      const eased = 1 - Math.pow(1 - rawProgress, 3)
      setAnimatedProgress(eased)

      if (rawProgress < 1) {
        frameId = requestAnimationFrame(tick)
      }
    }

    frameId = requestAnimationFrame(() => {
      startedAt = Date.now()
      setAnimatedProgress(0)
      tick()
    })

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [
    availableValue,
    compact,
    fixedValue,
    isDailyVariant,
    monthlyIncome,
    reduceMotion,
    savingsGoal,
    savingsValue,
    spentValue,
  ])

  const radialModel = useFinancialSummaryRadialModel({
    animationProgress,
    availableValue,
    compact,
    config,
    fixedValue,
    monthlyIncome,
    savingsGoal,
    savingsValue,
    spentValue,
    theme,
    variant,
  })
  const { segments, useCompactLegend } = radialModel

  return (
    <View style={[styles.root, isDailyVariant ? styles.rootDaily : null]}>
      <FinancialSummaryRadialChart
        compact={compact}
        config={config}
        model={radialModel}
        uiPalette={uiPalette}
      />

      <FinancialSummaryRadialLegend
        isDailyVariant={isDailyVariant}
        segments={segments}
        theme={theme}
        uiPalette={uiPalette}
        useCompactLegend={useCompactLegend}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  rootDaily: {
    gap: 2,
  },
})
