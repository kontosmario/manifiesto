import { buildFinancialSummarySegmentTheme } from '@/components/home/financial-summary-radial.theme'
import {
  LOOP_CLOSURE_CORE,
  LOOP_CLOSURE_SPAN,
  MIN_SEGMENT_SHARE,
  SEGMENT_GAP,
  SEGMENT_OVERLAP,
  SEGMENT_TRANSITION_SPAN,
  TRACK_LENGTH,
  TRACK_START,
} from '@/components/home/financial-summary-radial.static.constants'
import { clamp, formatCompactCurrency, mixHexColors } from '@/components/home/financial-summary-radial.utils'
import type {
  DrawnSegment,
  FinancialSummaryRadialConfig,
  SegmentDefinition,
  StaticRadialModel,
} from '@/components/home/financial-summary-radial.model'
import type { AppTheme } from '@/theme/palette'

function getBadgeWidth(label: string) {
  return Math.max(76, Math.min(96, 30 + label.length * 7))
}

export function buildFinancialSummaryGeometry({
  compact,
  isDailyVariant,
}: {
  compact: boolean
  isDailyVariant: boolean
}) {
  const donutSize = compact ? (isDailyVariant ? 224 : 232) : isDailyVariant ? 244 : 252
  const glowBleed = compact ? (isDailyVariant ? 28 : 34) : isDailyVariant ? 36 : 42
  const stageSize = donutSize + glowBleed * 2
  const center = stageSize / 2
  const strokeWidth = compact ? (isDailyVariant ? 32 : 34) : isDailyVariant ? 37 : 40
  const radius = donutSize / 2 - strokeWidth / 2
  const innerCoreRadius = radius - strokeWidth / 2 - (compact ? 10 : 12)

  return {
    center,
    donutSize,
    innerCoreRadius,
    radius,
    stageSize,
    strokeWidth,
  }
}

export function buildFinancialSummarySegments({
  availableValue,
  config,
  fixedValue,
  isDailyVariant,
  monthlyIncome,
  savingsGoal,
  savingsValue,
  spentValue,
  theme,
}: {
  availableValue: number
  config?: FinancialSummaryRadialConfig
  fixedValue: number
  isDailyVariant: boolean
  monthlyIncome: number
  savingsGoal: number
  savingsValue: number
  spentValue: number
  theme: AppTheme
}) {
  const centerAccentColor = config?.centerAccentColor ?? theme.colors.primary
  const spentSafe = Math.max(spentValue, 0)
  const availableSafe = Math.max(availableValue, 0)
  const chartBase = Math.max(monthlyIncome, fixedValue + savingsValue + spentSafe + availableSafe, 1)
  const availablePercent = Math.max(0, Math.min(100, Math.round((availableSafe / chartBase) * 100)))
  const fixedPercent = Math.max(0, Math.round((fixedValue / chartBase) * 100))
  const spentPercent = Math.max(0, Math.round((spentSafe / chartBase) * 100))
  const savingsPercent = Math.max(0, Math.round((savingsValue / chartBase) * 100))

  const segmentTheme = buildFinancialSummarySegmentTheme({
    availableColor: config?.available?.color,
    fixedColor: config?.fixed?.color,
    isDailyVariant,
    savingsColor: config?.savings?.color,
    spentColor: config?.spent?.color,
    theme,
  })

  const baseSegments: Array<Omit<SegmentDefinition, 'share'>> = [
    {
      color: segmentTheme.fixed,
      icon: config?.fixed?.icon ?? 'payments',
      label: config?.fixed?.label ?? 'Fijos',
      rawShare: Math.max(0, fixedValue / chartBase),
      subtitle: config?.fixed?.subtitle ?? `${fixedPercent}% del ingreso`,
      value: formatCompactCurrency(fixedValue),
    },
    {
      color: segmentTheme.spent,
      icon: config?.spent?.icon ?? 'receipt-long',
      label: config?.spent?.label ?? 'Gastado',
      rawShare: Math.max(0, spentSafe / chartBase),
      subtitle: config?.spent?.subtitle ?? `${spentPercent}% cargado`,
      value: formatCompactCurrency(spentSafe),
    },
    {
      color: segmentTheme.savings,
      icon: config?.savings?.icon ?? 'savings',
      label: config?.savings?.label ?? 'Ahorro',
      rawShare: Math.max(0, savingsValue / chartBase),
      subtitle:
        config?.savings?.subtitle ?? (savingsGoal > 0 ? `${savingsPercent}% reservado` : 'Sin meta'),
      value: formatCompactCurrency(savingsValue),
    },
    {
      color: segmentTheme.available,
      icon: config?.available?.icon ?? 'account-balance-wallet',
      label: config?.available?.label ?? 'Disponible',
      rawShare: Math.max(0, availableSafe / chartBase),
      subtitle: config?.available?.subtitle ?? `${availablePercent}% libre`,
      value: formatCompactCurrency(availableSafe),
    },
  ]

  const visibleSegments = baseSegments.filter((segment) => segment.rawShare > 0)
  const segments =
    visibleSegments.length === 0
      ? baseSegments.map((segment) => ({ ...segment, share: 0 }))
      : normalizeSegmentShares(baseSegments, visibleSegments)

  const drawnSegments = buildDrawnSegments(segments)
  const segmentTransitions = buildSegmentTransitions(drawnSegments)
  const loopClosure = buildSegmentLoopClosure(drawnSegments)

  return {
    availablePercent,
    availableSafe,
    centerAccentColor,
    chartBase,
    drawnSegments,
    fixedPercent,
    loopClosure,
    savingsPercent,
    segmentTheme,
    segmentTransitions,
    segments,
    spentPercent,
    spentSafe,
  }
}

function normalizeSegmentShares(
  baseSegments: Array<Omit<SegmentDefinition, 'share'>>,
  visibleSegments: Array<Omit<SegmentDefinition, 'share'>>,
): SegmentDefinition[] {
  const minimumCount = visibleSegments.filter((segment) => segment.rawShare < MIN_SEGMENT_SHARE).length
  const minimumBudget = Math.min(0.48, minimumCount * MIN_SEGMENT_SHARE)
  const flexibleSegments = visibleSegments.filter((segment) => segment.rawShare >= MIN_SEGMENT_SHARE)
  const flexibleTotal = flexibleSegments.reduce((sum, segment) => sum + segment.rawShare, 0)
  const remainingBudget = Math.max(0, 1 - minimumBudget)

  return baseSegments.map((segment) => {
    if (segment.rawShare <= 0) {
      return { ...segment, share: 0 }
    }

    if (segment.rawShare < MIN_SEGMENT_SHARE) {
      return { ...segment, share: MIN_SEGMENT_SHARE }
    }

    if (flexibleTotal <= 0) {
      return { ...segment, share: segment.rawShare }
    }

    return {
      ...segment,
      share: remainingBudget * (segment.rawShare / flexibleTotal),
    }
  })
}

function buildDrawnSegments(segments: SegmentDefinition[]): DrawnSegment[] {
  const activeSegments = segments.filter((segment) => segment.share > 0.001)

  if (activeSegments.length === 0) {
    return []
  }

  const totalGap = SEGMENT_GAP * Math.max(0, activeSegments.length)
  const usableTrack = Math.max(0, TRACK_LENGTH - totalGap)
  let cursor = TRACK_START

  return activeSegments.map((segment) => {
    const length = usableTrack * segment.share
    const start = cursor
    const end = cursor + length
    cursor = end + SEGMENT_GAP

    return {
      ...segment,
      badgeWidth: getBadgeWidth(segment.label),
      end,
      midpoint: start + length / 2,
      renderEnd: clamp(end + SEGMENT_OVERLAP / 2, TRACK_START, TRACK_START + TRACK_LENGTH),
      renderStart: clamp(start - SEGMENT_OVERLAP / 2, TRACK_START, TRACK_START + TRACK_LENGTH),
      start,
    }
  })
}

function buildSegmentTransitions(drawnSegments: DrawnSegment[]): StaticRadialModel['segmentTransitions'] {
  if (drawnSegments.length < 2) {
    return []
  }

  return drawnSegments.slice(0, -1).map((segment, index) => {
    const nextSegment = drawnSegments[index + 1]
    const boundary = segment.end

    return {
      afterColor: nextSegment.color,
      beforeColor: segment.color,
      boundary,
      end: clamp(boundary + SEGMENT_TRANSITION_SPAN / 2, TRACK_START, TRACK_START + TRACK_LENGTH),
      key: `${segment.label}-${nextSegment.label}`,
      midColor: mixHexColors(segment.color, nextSegment.color, 0.5),
      start: clamp(boundary - SEGMENT_TRANSITION_SPAN / 2, TRACK_START, TRACK_START + TRACK_LENGTH),
    }
  })
}

function buildSegmentLoopClosure(drawnSegments: DrawnSegment[]): StaticRadialModel['loopClosure'] {
  if (drawnSegments.length === 0) {
    return null
  }

  const firstSegment = drawnSegments[0]
  const lastSegment = drawnSegments[drawnSegments.length - 1]

  return {
    afterColor: firstSegment.color,
    beforeColor: lastSegment.color,
    closingCoreStart: clamp(
      TRACK_START + TRACK_LENGTH - LOOP_CLOSURE_CORE / 2,
      TRACK_START,
      TRACK_START + TRACK_LENGTH,
    ),
    endStart: clamp(
      TRACK_START + TRACK_LENGTH - LOOP_CLOSURE_SPAN / 2,
      TRACK_START,
      TRACK_START + TRACK_LENGTH,
    ),
    key: `${lastSegment.label}-${firstSegment.label}-loop`,
    midColor: mixHexColors(lastSegment.color, firstSegment.color, 0.5),
    openingCoreEnd: clamp(TRACK_START + LOOP_CLOSURE_CORE / 2, TRACK_START, TRACK_START + TRACK_LENGTH),
    startEnd: clamp(TRACK_START + LOOP_CLOSURE_SPAN / 2, TRACK_START, TRACK_START + TRACK_LENGTH),
  }
}
