import { MaterialIcons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import type {
  FinancialSummaryRadialConfig,
  FinancialSummaryRadialModel,
} from '@/components/home/financial-summary-radial.model'
import type { FinancialSummaryUiPalette } from '@/components/home/financial-summary-radial.theme'
import { hexToRgba } from '@/components/home/financial-summary-radial.utils'
import { radii, type AppTheme } from '@/theme/palette'

const SHOW_SEGMENT_BADGES = false
const INLINE_LABEL_BOX_WIDTH = 28
const INLINE_LABEL_BOX_HEIGHT = 28
const BADGE_HEIGHT = 30

interface FinancialSummaryRadialOverlayProps {
  compact: boolean
  config?: FinancialSummaryRadialConfig
  model: FinancialSummaryRadialModel
  theme: AppTheme
  uiPalette: FinancialSummaryUiPalette
}

export function FinancialSummaryRadialOverlay({
  compact,
  config,
  model,
  theme,
  uiPalette,
}: FinancialSummaryRadialOverlayProps) {
  const {
    animatedAvailableValue,
    animatedPercent,
    badgeLayouts,
    centerAccentColor,
    centerSettleOpacity,
    centerSettleScale,
    innerCoreRadius,
    isDailyVariant,
    segmentTheme,
    segmentValueLabels,
    settleProgress,
  } = model

  return (
    <>
      {SHOW_SEGMENT_BADGES
        ? badgeLayouts.map((segment) => (
            <View
              key={`${segment.label}-badge`}
              style={[
                styles.segmentBadge,
                {
                  pointerEvents: 'none',
                  backgroundColor: uiPalette.segmentBadgeBackground,
                  borderColor: `${segment.color}55`,
                  left: segment.left,
                  opacity: segment.reveal,
                  top: segment.top,
                  transform: [{ scale: 0.88 + segment.reveal * 0.12 }],
                  width: segment.badgeWidth,
                },
              ]}
            >
              <View style={[styles.segmentBadgeDot, { backgroundColor: segment.color }]} />
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.88}
                numberOfLines={1}
                style={[styles.segmentBadgeText, { color: theme.colors.text }]}
              >
                {segment.label}
              </Text>
            </View>
          ))
        : null}

      {segmentValueLabels.map((label) => (
        <View
          key={label.key}
          style={[
            styles.segmentValueLabelWrap,
            {
              pointerEvents: 'none',
              left: label.left,
              opacity: label.opacity * (0.92 + settleProgress * 0.08),
              top: label.top,
              transform: [
                { scale: 0.9 + label.opacity * 0.08 + settleProgress * 0.02 },
                { rotate: `${label.rotation}deg` },
              ],
            },
          ]}
        >
          <MaterialIcons
            color={uiPalette.floatingLabelIcon}
            name={label.icon}
            size={compact ? 16 : 18}
            style={styles.segmentValueLabelIcon}
          />
        </View>
      ))}

      <View
        style={[
          styles.centerCore,
          isDailyVariant ? styles.centerCoreDaily : null,
          {
            backgroundColor: segmentTheme.core,
            borderColor: isDailyVariant ? hexToRgba(centerAccentColor, theme.isDark ? 0.26 : 0.18) : theme.colors.border,
            height: innerCoreRadius * 2,
            opacity: centerSettleOpacity,
            transform: [{ scale: centerSettleScale }],
            width: innerCoreRadius * 2,
          },
        ]}
      >
        <Text
          style={[
            styles.centerPercent,
            isDailyVariant ? styles.centerPercentDaily : null,
            { color: isDailyVariant ? centerAccentColor : theme.colors.text },
          ]}
        >
          {animatedPercent}%
        </Text>
        <Text
          style={[
            styles.centerLabel,
            isDailyVariant ? styles.centerLabelDaily : null,
            { color: theme.colors.textSoft },
          ]}
        >
          {config?.centerLabel ?? 'Disponible'}
        </Text>
        <Text
          style={[
            styles.centerValue,
            isDailyVariant ? styles.centerValueDaily : null,
            { color: theme.colors.textMuted },
          ]}
        >
          {animatedAvailableValue}
        </Text>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  segmentBadge: {
    position: 'absolute',
    height: BADGE_HEIGHT,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    boxShadow: '0px 5px 10px rgba(0, 0, 0, 0.08)',
  },
  segmentBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  segmentBadgeText: {
    fontSize: 9.8,
    fontWeight: '800',
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  segmentValueLabelWrap: {
    position: 'absolute',
    width: INLINE_LABEL_BOX_WIDTH,
    height: INLINE_LABEL_BOX_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentValueLabelIcon: {
    textShadowColor: 'rgba(0, 0, 0, 0.34)',
    textShadowOffset: {
      width: 0,
      height: 1,
    },
    textShadowRadius: 3,
  },
  centerCore: {
    position: 'absolute',
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
  },
  centerCoreDaily: {
    paddingHorizontal: 14,
  },
  centerPercent: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 36,
  },
  centerPercentDaily: {
    fontSize: 32,
  },
  centerLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  centerLabelDaily: {
    letterSpacing: 0.65,
  },
  centerValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  centerValueDaily: {
    fontSize: 17,
  },
})
