import { buildBadgeLayouts, buildSegmentValueAnchors } from '@/components/home/financial-summary-radial.static.badges'
import { buildFinancialSummaryGeometry, buildFinancialSummarySegments } from '@/components/home/financial-summary-radial.static.segments'
import {
  TRACK_LENGTH,
  TRACK_START,
} from '@/components/home/financial-summary-radial.static.constants'
import type {
  StaticRadialModel,
  UseFinancialSummaryRadialModelInput,
} from '@/components/home/financial-summary-radial.model'

export function buildFinancialSummaryStaticModel({
  availableValue,
  compact = false,
  config,
  fixedValue,
  monthlyIncome,
  savingsGoal,
  savingsValue,
  spentValue,
  theme,
  variant = 'overview',
}: Omit<UseFinancialSummaryRadialModelInput, 'animationProgress'>): StaticRadialModel {
  const isDailyVariant = variant === 'daily'
  const geometry = buildFinancialSummaryGeometry({
    compact,
    isDailyVariant,
  })
  const segmentState = buildFinancialSummarySegments({
    availableValue,
    config,
    fixedValue,
    isDailyVariant,
    monthlyIncome,
    savingsGoal,
    savingsValue,
    spentValue,
    theme,
  })
  const { badgeLayouts, useCompactLegend } = buildBadgeLayouts({
    center: geometry.center,
    drawnSegments: segmentState.drawnSegments,
    isDailyVariant,
    radius: geometry.radius,
    stageSize: geometry.stageSize,
    spentSafe: segmentState.spentSafe,
    strokeWidth: geometry.strokeWidth,
  })
  const segmentValueAnchors = buildSegmentValueAnchors({
    center: geometry.center,
    drawnSegments: segmentState.drawnSegments,
    radius: geometry.radius,
  })

  return {
    ...geometry,
    ...segmentState,
    badgeLayouts,
    centerDisplayValue: config?.centerDisplayValue ?? segmentState.availableSafe,
    isDailyVariant,
    segmentValueAnchors,
    trackLength: TRACK_LENGTH,
    trackStart: TRACK_START,
    useCompactLegend,
  }
}
