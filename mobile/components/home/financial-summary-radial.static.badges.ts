import {
  BADGE_HEIGHT,
  BADGE_MARGIN,
  BADGE_THETA_BY_LABEL,
  INLINE_LABEL_BOX_HEIGHT,
  INLINE_LABEL_BOX_WIDTH,
  INLINE_LABEL_END_INSET,
  INLINE_LABEL_START_INSET,
} from '@/components/home/financial-summary-radial.static.constants'
import { clamp } from '@/components/home/financial-summary-radial.utils'
import type {
  BadgeLayoutDefinition,
  DrawnSegment,
  SegmentValueLabelAnchor,
} from '@/components/home/financial-summary-radial.model'

function boxesOverlap(
  first: { bottom: number; left: number; right: number; top: number },
  second: { bottom: number; left: number; right: number; top: number },
  margin = 8,
) {
  return !(
    first.right + margin < second.left ||
    second.right + margin < first.left ||
    first.bottom + margin < second.top ||
    second.bottom + margin < first.top
  )
}

function getBadgePlacement(
  anchorX: number,
  anchorY: number,
  badgeWidth: number,
  dx: number,
  dy: number,
  radius: number,
) {
  if (dy > radius * 0.34) {
    return {
      left: anchorX - badgeWidth / 2,
      top: anchorY + BADGE_MARGIN * 0.7,
    }
  }

  if (dy < -radius * 0.82) {
    return {
      left: anchorX - badgeWidth / 2,
      top: anchorY - BADGE_HEIGHT - BADGE_MARGIN * 0.7,
    }
  }

  if (dx >= 0) {
    return {
      left: anchorX + BADGE_MARGIN * 0.75,
      top: anchorY - BADGE_HEIGHT / 2,
    }
  }

  return {
    left: anchorX - badgeWidth - BADGE_MARGIN * 0.75,
    top: anchorY - BADGE_HEIGHT / 2,
  }
}

function getPreferredBadgeTheta(label: string, fallbackTheta: number) {
  return BADGE_THETA_BY_LABEL[label] ?? fallbackTheta
}

function getStableBadgePlacement(label: string, anchorX: number, anchorY: number, badgeWidth: number) {
  if (label === 'Ahorro' || label === 'Gastado') {
    return {
      left: anchorX - badgeWidth - BADGE_MARGIN * 0.9,
      top: anchorY - BADGE_HEIGHT / 2,
    }
  }

  if (label === 'Disponible' || label === 'Fijos') {
    return {
      left: anchorX + BADGE_MARGIN * 0.9,
      top: anchorY - BADGE_HEIGHT / 2,
    }
  }

  return null
}

function getInlineLabelRotation(midpoint: number) {
  let degrees = midpoint * 360 + 90

  if (degrees > 90 && degrees < 270) {
    degrees += 180
  }

  if (degrees > 360) {
    degrees -= 360
  }

  return degrees
}

function getInlineLabelProgress(segment: DrawnSegment) {
  const startInset = Math.min(INLINE_LABEL_START_INSET, segment.share * 0.28)
  const endInset = Math.min(INLINE_LABEL_END_INSET, segment.share * 0.18)
  const startSafe = Math.min(segment.end, segment.start + startInset)
  const endSafe = Math.max(startSafe, segment.end - endInset)

  return clamp(segment.midpoint, startSafe, endSafe)
}

export function buildBadgeLayouts({
  center,
  drawnSegments,
  isDailyVariant,
  radius,
  stageSize,
  strokeWidth,
  spentSafe,
}: {
  center: number
  drawnSegments: DrawnSegment[]
  isDailyVariant: boolean
  radius: number
  stageSize: number
  spentSafe: number
  strokeWidth: number
}): {
  badgeLayouts: BadgeLayoutDefinition[]
  useCompactLegend: boolean
} {
  const badgeSegments = drawnSegments.filter(
    (segment) => segment.rawShare >= 0.08 || (segment.label === 'Gastado' && spentSafe > 0),
  )
  const useCompactLegend = badgeSegments.length >= 3 || isDailyVariant
  const edgePadding = 4
  const stageMin = edgePadding
  const stageMax = stageSize - edgePadding
  const baseRadius = radius + strokeWidth * 0.82 + BADGE_MARGIN
  const placed: Array<{ bottom: number; left: number; right: number; top: number }> = []

  const badgeLayouts = badgeSegments.map((segment) => {
    let chosen: BadgeLayoutDefinition | null = null

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const fallbackTheta = segment.midpoint * Math.PI * 2
      const theta = getPreferredBadgeTheta(segment.label, fallbackTheta)
      const radialOffset = baseRadius + attempt * 10
      const anchorX = center + Math.cos(theta) * radialOffset
      const anchorY = center + Math.sin(theta) * radialOffset
      const placement =
        getStableBadgePlacement(segment.label, anchorX, anchorY, segment.badgeWidth) ??
        getBadgePlacement(anchorX, anchorY, segment.badgeWidth, anchorX - center, anchorY - center, radius)
      const left = clamp(placement.left, stageMin, stageMax - segment.badgeWidth)
      const top = clamp(placement.top, stageMin, stageMax - BADGE_HEIGHT)
      const candidateBox = {
        bottom: top + BADGE_HEIGHT,
        left,
        right: left + segment.badgeWidth,
        top,
      }

      if (!placed.some((box) => boxesOverlap(box, candidateBox))) {
        chosen = {
          ...segment,
          left,
          top,
        }
        placed.push(candidateBox)
        break
      }
    }

    if (chosen) {
      return chosen
    }

    const fallbackTheta = getPreferredBadgeTheta(segment.label, segment.midpoint * Math.PI * 2)
    const fallbackAnchorX = center + Math.cos(fallbackTheta) * baseRadius
    const fallbackAnchorY = center + Math.sin(fallbackTheta) * baseRadius
    const fallbackPlacement =
      getStableBadgePlacement(segment.label, fallbackAnchorX, fallbackAnchorY, segment.badgeWidth) ??
      getBadgePlacement(
        fallbackAnchorX,
        fallbackAnchorY,
        segment.badgeWidth,
        fallbackAnchorX - center,
        fallbackAnchorY - center,
        radius,
      )
    const fallbackLeft = clamp(fallbackPlacement.left, stageMin, stageMax - segment.badgeWidth)
    const fallbackTop = clamp(fallbackPlacement.top, stageMin, stageMax - BADGE_HEIGHT)

    return {
      ...segment,
      left: fallbackLeft,
      top: fallbackTop,
    }
  })

  return {
    badgeLayouts,
    useCompactLegend,
  }
}

export function buildSegmentValueAnchors({
  center,
  drawnSegments,
  radius,
}: {
  center: number
  drawnSegments: DrawnSegment[]
  radius: number
}): SegmentValueLabelAnchor[] {
  return drawnSegments
    .filter((segment) => segment.rawShare > 0)
    .map((segment) => {
      const labelProgress = getInlineLabelProgress(segment)
      const theta = labelProgress * Math.PI * 2
      const centerX = center + Math.cos(theta) * radius
      const centerY = center + Math.sin(theta) * radius

      return {
        icon: segment.icon,
        key: `${segment.label}-value`,
        labelProgress,
        left: centerX - INLINE_LABEL_BOX_WIDTH / 2,
        rotation: getInlineLabelRotation(labelProgress),
        share: segment.share,
        top: centerY - INLINE_LABEL_BOX_HEIGHT / 2,
      }
    })
}
