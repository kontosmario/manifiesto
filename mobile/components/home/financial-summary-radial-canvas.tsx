import { StyleSheet } from 'react-native'
import type { FinancialSummaryRadialModel } from '@/components/home/financial-summary-radial.model'
import type { FinancialSummaryUiPalette } from '@/components/home/financial-summary-radial.theme'
import {
  buildCirclePath,
  getVisibleRange,
  hexToRgba,
} from '@/components/home/financial-summary-radial.utils'
import { getOptionalSkiaModule } from '@/lib/optional-skia'
import type { AppTheme } from '@/theme/palette'

const SEGMENT_OVERLAP = 0.0012
const SEGMENT_TRANSITION_CORE = 0.004

interface FinancialSummaryRadialCanvasProps {
  model: FinancialSummaryRadialModel
  theme: AppTheme
  uiPalette: FinancialSummaryUiPalette
}

export function FinancialSummaryRadialCanvas({
  model,
  theme,
  uiPalette,
}: FinancialSummaryRadialCanvasProps) {
  const skia = getOptionalSkiaModule()
  const {
    animationHead,
    animatedVisibleEnd,
    center,
    centerAccentColor,
    closureReveal,
    drawnSegments,
    innerCoreRadius,
    isDailyVariant,
    loopClosure,
    radius,
    segmentTheme,
    segmentTransitions,
    strokeWidth,
    trackLength,
    trackStart,
  } = model

  if (!skia) {
    return null
  }

  const circlePath = buildCirclePath(skia, center, center, radius)
  const { BlurMask, Canvas, Circle, Path } = skia

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Circle color={segmentTheme.panel} cx={center} cy={center} r={radius + strokeWidth / 2 + 8} />
      {uiPalette.chartHalo ? (
        <Circle
          color={uiPalette.chartHalo}
          cx={center}
          cy={center}
          r={radius + strokeWidth / 2 + 18}
        />
      ) : null}

      <Path
        color={segmentTheme.ringTrack}
        end={trackStart + trackLength}
        path={circlePath}
        start={trackStart}
        strokeCap="butt"
        style="stroke"
        strokeWidth={strokeWidth}
      />

      {drawnSegments.map((segment) => {
        const visibleRange = getVisibleRange(segment.renderStart, segment.renderEnd, animatedVisibleEnd)

        if (!visibleRange) {
          return null
        }

        return (
          <Path
            key={`${segment.label}-glow`}
            color={segment.color}
            end={visibleRange.visibleEnd}
            path={circlePath}
            start={visibleRange.visibleStart}
            strokeCap="butt"
            style="stroke"
            strokeWidth={strokeWidth}
          >
            <BlurMask blur={isDailyVariant ? 11 : 15} style="solid" />
          </Path>
        )
      })}

      {segmentTransitions.map((transition) => {
        const visibleRange = getVisibleRange(
          transition.start,
          transition.boundary + SEGMENT_OVERLAP,
          animatedVisibleEnd,
        )

        if (!visibleRange) {
          return null
        }

        return (
          <Path
            key={`${transition.key}-before-glow`}
            color={hexToRgba(transition.beforeColor, theme.isDark ? 0.46 : 0.28)}
            end={visibleRange.visibleEnd}
            path={circlePath}
            start={visibleRange.visibleStart}
            strokeCap="butt"
            style="stroke"
            strokeWidth={strokeWidth - 1}
          >
            <BlurMask blur={isDailyVariant ? 8 : 12} style="solid" />
          </Path>
        )
      })}

      {segmentTransitions.map((transition) => {
        const visibleRange = getVisibleRange(
          transition.boundary - SEGMENT_OVERLAP,
          transition.end,
          animatedVisibleEnd,
        )

        if (!visibleRange) {
          return null
        }

        return (
          <Path
            key={`${transition.key}-after-glow`}
            color={hexToRgba(transition.afterColor, theme.isDark ? 0.5 : 0.3)}
            end={visibleRange.visibleEnd}
            path={circlePath}
            start={visibleRange.visibleStart}
            strokeCap="butt"
            style="stroke"
            strokeWidth={strokeWidth - 1}
          >
            <BlurMask blur={isDailyVariant ? 8 : 12} style="solid" />
          </Path>
        )
      })}

      {drawnSegments.map((segment) => {
        const visibleRange = getVisibleRange(segment.renderStart, segment.renderEnd, animatedVisibleEnd)

        if (!visibleRange) {
          return null
        }

        return (
          <Path
            key={segment.label}
            color={segment.color}
            end={visibleRange.visibleEnd}
            path={circlePath}
            start={visibleRange.visibleStart}
            strokeCap="butt"
            style="stroke"
            strokeWidth={strokeWidth - 4}
          />
        )
      })}

      {segmentTransitions.map((transition) => {
        const visibleRange = getVisibleRange(
          transition.boundary - SEGMENT_TRANSITION_CORE / 2,
          transition.boundary + SEGMENT_TRANSITION_CORE / 2,
          animatedVisibleEnd,
        )

        if (!visibleRange) {
          return null
        }

        return (
          <Path
            key={`${transition.key}-core`}
            color={hexToRgba(transition.midColor, theme.isDark ? 0.3 : 0.18)}
            end={visibleRange.visibleEnd}
            path={circlePath}
            start={visibleRange.visibleStart}
            strokeCap="butt"
            style="stroke"
            strokeWidth={strokeWidth - 9}
          >
            <BlurMask blur={isDailyVariant ? 4 : 6} style="solid" />
          </Path>
        )
      })}

      {loopClosure ? (
        <>
          <Path
            color={hexToRgba(loopClosure.beforeColor, (theme.isDark ? 0.28 : 0.18) * closureReveal)}
            end={trackStart + trackLength}
            path={circlePath}
            start={loopClosure.endStart}
            strokeCap="butt"
            style="stroke"
            strokeWidth={strokeWidth - 1}
          >
            <BlurMask blur={isDailyVariant ? 7 : 10} style="solid" />
          </Path>
          <Path
            color={hexToRgba(loopClosure.afterColor, (theme.isDark ? 0.3 : 0.19) * closureReveal)}
            end={loopClosure.startEnd}
            path={circlePath}
            start={trackStart}
            strokeCap="butt"
            style="stroke"
            strokeWidth={strokeWidth - 1}
          >
            <BlurMask blur={isDailyVariant ? 7 : 10} style="solid" />
          </Path>
          <Path
            color={hexToRgba(loopClosure.midColor, (theme.isDark ? 0.2 : 0.13) * closureReveal)}
            end={trackStart + trackLength}
            path={circlePath}
            start={loopClosure.closingCoreStart}
            strokeCap="butt"
            style="stroke"
            strokeWidth={strokeWidth - 8}
          >
            <BlurMask blur={isDailyVariant ? 4 : 5} style="solid" />
          </Path>
          <Path
            color={hexToRgba(loopClosure.midColor, (theme.isDark ? 0.2 : 0.13) * closureReveal)}
            end={loopClosure.openingCoreEnd}
            path={circlePath}
            start={trackStart}
            strokeCap="butt"
            style="stroke"
            strokeWidth={strokeWidth - 8}
          >
            <BlurMask blur={isDailyVariant ? 4 : 5} style="solid" />
          </Path>
        </>
      ) : null}

      {animationHead ? (
        <>
          <Path
            color={hexToRgba(animationHead.color, 0.84 * animationHead.opacity)}
            end={animatedVisibleEnd}
            path={circlePath}
            start={animationHead.start}
            strokeCap="round"
            style="stroke"
            strokeWidth={strokeWidth}
          >
            <BlurMask blur={isDailyVariant ? 8 : 11} style="solid" />
          </Path>
          <Path
            color={hexToRgba(animationHead.color, 0.98 * animationHead.opacity)}
            end={animatedVisibleEnd}
            path={circlePath}
            start={animationHead.start}
            strokeCap="round"
            style="stroke"
            strokeWidth={strokeWidth - 4}
          />
        </>
      ) : null}

      <Circle color={segmentTheme.core} cx={center} cy={center} r={innerCoreRadius} />
      <Circle
        color={
          isDailyVariant
            ? hexToRgba(centerAccentColor, theme.isDark ? 0.08 : 0.12)
            : theme.isDark
              ? theme.colors.surface
              : uiPalette.centerHighlightLight
        }
        cx={center}
        cy={center}
        opacity={theme.isDark ? (isDailyVariant ? 0.16 : 0.08) : isDailyVariant ? 0.28 : 0.22}
        r={innerCoreRadius - 10}
      />
    </Canvas>
  )
}
