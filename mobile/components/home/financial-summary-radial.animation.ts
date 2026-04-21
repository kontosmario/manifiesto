import { clamp, formatCompactCurrency } from '@/components/home/financial-summary-radial.utils'
import type {
  StaticRadialModel,
  UseFinancialSummaryRadialModelInput,
} from '@/components/home/financial-summary-radial.model'

const ANIMATION_HEAD_SPAN = 0.032
const ANIMATION_HEAD_SOFTEN_START = 0.88
const LOOP_CLOSURE_REVEAL_START = 0.84
const DRAW_PHASE_END = 0.9
const SETTLE_PHASE_START = 0.76

export function buildFinancialSummaryAnimationState(
  model: StaticRadialModel,
  { animationProgress }: Pick<UseFinancialSummaryRadialModelInput, 'animationProgress'>,
) {
  const drawProgress = clamp(animationProgress / DRAW_PHASE_END)
  const settleProgress = clamp((animationProgress - SETTLE_PHASE_START) / (1 - SETTLE_PHASE_START))
  const closureReveal = clamp((drawProgress - LOOP_CLOSURE_REVEAL_START) / (1 - LOOP_CLOSURE_REVEAL_START))
  const headClosureSoftness = clamp(
    (drawProgress - ANIMATION_HEAD_SOFTEN_START) / (1 - ANIMATION_HEAD_SOFTEN_START),
  )
  const animatedVisibleEnd = model.trackStart + model.trackLength * drawProgress
  const animatedPercent = Math.round(model.availablePercent * drawProgress)
  const animatedAvailableValue = formatCompactCurrency(model.centerDisplayValue * drawProgress)
  const chartSettleScale = 0.992 + settleProgress * 0.008
  const centerSettleScale = 0.984 + settleProgress * 0.016
  const centerSettleOpacity = 0.9 + settleProgress * 0.1

  const animationHead = (() => {
    const headOpacity = (1 - settleProgress) * (1 - headClosureSoftness * 0.58)

    if (headOpacity <= 0.001) {
      return null
    }

    const activeSegment = model.drawnSegments.find(
      (segment) => animatedVisibleEnd > segment.start && animatedVisibleEnd <= segment.end,
    )

    if (!activeSegment) {
      return null
    }

    return {
      color: activeSegment.color,
      opacity: headOpacity,
      start: clamp(
        animatedVisibleEnd - ANIMATION_HEAD_SPAN * (1 - headClosureSoftness * 0.42),
        activeSegment.start,
        animatedVisibleEnd,
      ),
    }
  })()

  const segmentValueLabels = model.segmentValueAnchors.map((label) => {
    const reveal = clamp(
      (animatedVisibleEnd - (label.labelProgress - label.share * 0.03)) /
        Math.max(label.share * 0.14, 0.001),
    )

    return {
      icon: label.icon,
      key: label.key,
      left: label.left,
      opacity: reveal,
      rotation: label.rotation,
      top: label.top,
    }
  })

  const badgeLayouts = model.badgeLayouts.map((segment) => {
    const reveal = clamp(
      (animatedVisibleEnd - (segment.start + (segment.end - segment.start) * 0.55)) /
        Math.max((segment.end - segment.start) * 0.45, 0.001),
    )

    return {
      ...segment,
      reveal,
    }
  })

  return {
    animatedAvailableValue,
    animatedPercent,
    animatedVisibleEnd,
    animationHead,
    badgeLayouts,
    centerSettleOpacity,
    centerSettleScale,
    chartSettleScale,
    closureReveal,
    drawProgress,
    segmentValueLabels,
    settleProgress,
  }
}
