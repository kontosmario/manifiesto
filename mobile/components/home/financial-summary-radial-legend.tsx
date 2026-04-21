import { MaterialIcons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import type {
  FinancialSummaryRadialModel,
  SegmentDefinition,
} from '@/components/home/financial-summary-radial.model'
import type { FinancialSummaryUiPalette } from '@/components/home/financial-summary-radial.theme'
import { radii, type AppTheme } from '@/theme/palette'

interface FinancialSummaryRadialLegendProps {
  isDailyVariant: boolean
  segments: FinancialSummaryRadialModel['segments']
  theme: AppTheme
  uiPalette: FinancialSummaryUiPalette
  useCompactLegend: boolean
}

function CompactLegendItem({
  isDailyVariant,
  segment,
  theme,
  uiPalette,
}: {
  isDailyVariant: boolean
  segment: SegmentDefinition
  theme: AppTheme
  uiPalette: FinancialSummaryUiPalette
}) {
  return (
    <View
      style={[
        styles.legendCompactItem,
        isDailyVariant ? styles.legendCompactItemDaily : null,
        {
          backgroundColor: uiPalette.compactLegendBackground,
          borderColor: uiPalette.compactLegendBorder(segment.color),
        },
      ]}
    >
      <View style={styles.legendCompactHeader}>
        <View style={styles.legendCompactLeading}>
          <View style={[styles.legendCompactDot, { backgroundColor: segment.color }]} />
          <Text numberOfLines={1} style={[styles.legendCompactLabel, { color: theme.colors.textSoft }]}>
            {segment.label}
          </Text>
        </View>
        <MaterialIcons color={uiPalette.compactLegendIcon} name={segment.icon} size={18} />
      </View>
      <Text numberOfLines={1} style={[styles.legendCompactValue, { color: theme.colors.text }]}>
        {segment.value}
      </Text>
    </View>
  )
}

function LegendPanelRow({
  isLast,
  segment,
  theme,
  uiPalette,
}: {
  isLast: boolean
  segment: SegmentDefinition
  theme: AppTheme
  uiPalette: FinancialSummaryUiPalette
}) {
  return (
    <View
      style={[
        styles.legendRow,
        !isLast
          ? {
              borderBottomColor: theme.colors.border,
              borderBottomWidth: StyleSheet.hairlineWidth,
            }
          : null,
      ]}
    >
      <View style={styles.legendLeading}>
        <View style={[styles.legendIconWrap, { backgroundColor: segment.color }]}>
          <MaterialIcons color={uiPalette.legendIconForeground} name={segment.icon} size={13} />
        </View>
        <View style={styles.legendCopy}>
          <Text style={[styles.legendLabel, { color: theme.colors.text }]}>{segment.label}</Text>
          <Text style={[styles.legendSubtitle, { color: theme.colors.textSoft }]}>{segment.subtitle}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={[styles.legendValue, { color: theme.colors.text }]}>
        {segment.value}
      </Text>
    </View>
  )
}

export function FinancialSummaryRadialLegend({
  isDailyVariant,
  segments,
  theme,
  uiPalette,
  useCompactLegend,
}: FinancialSummaryRadialLegendProps) {
  if (useCompactLegend) {
    return (
      <View style={styles.legendCompactGrid}>
        {segments.map((segment) => (
          <CompactLegendItem
            key={segment.label}
            isDailyVariant={isDailyVariant}
            segment={segment}
            theme={theme}
            uiPalette={uiPalette}
          />
        ))}
      </View>
    )
  }

  return (
    <View
      style={[
        styles.legendPanel,
        {
          backgroundColor: uiPalette.legendPanelBackground,
          borderColor: uiPalette.legendPanelBorder,
        },
      ]}
    >
      {segments.map((segment, index) => (
        <LegendPanelRow
          key={segment.label}
          isLast={index === segments.length - 1}
          segment={segment}
          theme={theme}
          uiPalette={uiPalette}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  legendPanel: {
    width: '100%',
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  legendCompactGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendCompactItem: {
    width: '48.6%',
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  legendCompactItemDaily: {
    borderRadius: radii.lg,
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 5,
  },
  legendCompactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  legendCompactLeading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendCompactDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  legendCompactLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  legendCompactValue: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  legendRow: {
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  legendLeading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendCopy: {
    flex: 1,
    gap: 1,
  },
  legendLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  legendSubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  legendValue: {
    maxWidth: '38%',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
    letterSpacing: -0.3,
  },
})
