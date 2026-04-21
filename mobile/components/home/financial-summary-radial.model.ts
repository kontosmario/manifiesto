import { MaterialIcons } from '@expo/vector-icons'
import { useMemo } from 'react'
import { buildFinancialSummaryAnimationState } from '@/components/home/financial-summary-radial.animation'
import { buildFinancialSummaryStaticModel } from '@/components/home/financial-summary-radial.static'
import { type FinancialSummarySegmentTheme as SegmentTheme } from '@/components/home/financial-summary-radial.theme'
import type { AppTheme } from '@/theme/palette'

type RadialIconName = keyof typeof MaterialIcons.glyphMap

export interface FinancialSummaryRadialProps {
  availableValue: number
  compact?: boolean
  config?: FinancialSummaryRadialConfig
  fixedValue: number
  monthlyIncome: number
  savingsGoal: number
  savingsValue: number
  spentValue: number
  variant?: 'overview' | 'daily'
}

export interface RadialSlotConfig {
  color?: string
  icon?: RadialIconName
  label?: string
  subtitle?: string
}

export interface FinancialSummaryRadialConfig {
  centerAccentColor?: string
  available?: RadialSlotConfig
  centerDisplayValue?: number
  centerLabel?: string
  fixed?: RadialSlotConfig
  savings?: RadialSlotConfig
  spent?: RadialSlotConfig
}

export interface SegmentDefinition {
  color: string
  icon: RadialIconName
  label: string
  rawShare: number
  share: number
  subtitle: string
  value: string
}

export interface DrawnSegment extends SegmentDefinition {
  badgeWidth: number
  end: number
  midpoint: number
  renderEnd: number
  renderStart: number
  start: number
}

export interface BadgeLayout extends DrawnSegment {
  left: number
  reveal: number
  top: number
}

export interface BadgeLayoutDefinition extends DrawnSegment {
  left: number
  top: number
}

export interface SegmentValueLabelAnchor {
  icon: RadialIconName
  key: string
  labelProgress: number
  left: number
  rotation: number
  share: number
  top: number
}

export interface SegmentValueLabel {
  icon: RadialIconName
  key: string
  left: number
  opacity: number
  rotation: number
  top: number
}

export interface SegmentTransition {
  afterColor: string
  beforeColor: string
  boundary: number
  end: number
  key: string
  midColor: string
  start: number
}

export interface SegmentLoopClosure {
  afterColor: string
  beforeColor: string
  closingCoreStart: number
  endStart: number
  key: string
  midColor: string
  openingCoreEnd: number
  startEnd: number
}

export interface AnimationHead {
  color: string
  opacity: number
  start: number
}

export interface StaticRadialModel {
  availablePercent: number
  availableSafe: number
  badgeLayouts: BadgeLayoutDefinition[]
  center: number
  centerAccentColor: string
  centerDisplayValue: number
  chartBase: number
  donutSize: number
  drawnSegments: DrawnSegment[]
  fixedPercent: number
  innerCoreRadius: number
  isDailyVariant: boolean
  loopClosure: SegmentLoopClosure | null
  radius: number
  savingsPercent: number
  segmentTheme: SegmentTheme
  segmentTransitions: SegmentTransition[]
  segmentValueAnchors: SegmentValueLabelAnchor[]
  segments: SegmentDefinition[]
  spentPercent: number
  spentSafe: number
  stageSize: number
  strokeWidth: number
  trackLength: number
  trackStart: number
  useCompactLegend: boolean
}

export interface FinancialSummaryRadialModel extends StaticRadialModel {
  animatedAvailableValue: string
  animatedPercent: number
  animatedVisibleEnd: number
  animationHead: AnimationHead | null
  badgeLayouts: BadgeLayout[]
  centerSettleOpacity: number
  centerSettleScale: number
  chartSettleScale: number
  closureReveal: number
  drawProgress: number
  segmentValueLabels: SegmentValueLabel[]
  settleProgress: number
}

export interface UseFinancialSummaryRadialModelInput extends FinancialSummaryRadialProps {
  animationProgress: number
  theme: AppTheme
}

export function useFinancialSummaryRadialModel(input: UseFinancialSummaryRadialModelInput) {
  const {
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
  } = input

  const staticModel = useMemo(
    () =>
      buildFinancialSummaryStaticModel({
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
      }),
    [
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
    ],
  )

  const animationState = useMemo(
    () => buildFinancialSummaryAnimationState(staticModel, { animationProgress }),
    [animationProgress, staticModel],
  )

  return useMemo(
    () => ({
      ...staticModel,
      ...animationState,
    }),
    [animationState, staticModel],
  )
}
