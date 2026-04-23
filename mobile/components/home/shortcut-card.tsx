import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'

interface ShortcutCardProps {
  label: string
  value: string
  sub: string
  /** Either a string (rendered bold in trendColor) or a custom node. */
  trend?: ReactNode
  trendColor?: string
  chart?: ReactNode
  delay?: number
  onPress?: () => void
  accessibilityLabel?: string
}

/**
 * GASTOS / FIJOS shortcut card for the Home V1 Cuaderno layout.
 *
 * Structure:
 *   ┌─────────────────────────────┐
 *   │ LABEL             ›         │
 *   │ $1.545.000                  │
 *   │ este mes · 47 movs          │
 *   │                             │
 *   │ +12% vs marzo      ▁▂▃▅▇█   │
 *   └─────────────────────────────┘
 */
export function ShortcutCard({
  label,
  value,
  sub,
  trend,
  trendColor,
  chart,
  delay = 0,
  onPress,
  accessibilityLabel,
}: ShortcutCardProps) {
  const { theme } = useAppTheme()
  const isTrendString = typeof trend === 'string'
  return (
    <RiseView delay={delay} style={styles.flex}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: theme.colors.line,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
      >
        <View style={styles.header}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
          <Svg width={12} height={12} viewBox="0 0 24 24">
            <Path
              d="M9 6l6 6-6 6"
              stroke={theme.colors.text}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.35}
            />
          </Svg>
        </View>

        <Text style={[styles.value, { color: theme.colors.text }]} numberOfLines={1}>
          {value}
        </Text>
        <Text style={[styles.sub, { color: theme.colors.textSoft }]} numberOfLines={1}>
          {sub}
        </Text>

        <View style={styles.footer}>
          <View style={styles.trendSlot}>
            {trend == null || trend === '' ? null : isTrendString ? (
              <Text style={[styles.trendText, { color: trendColor ?? theme.colors.text }]}>
                {trend}
              </Text>
            ) : (
              trend
            )}
          </View>
          <View style={styles.chartSlot}>{chart}</View>
        </View>
      </Pressable>
    </RiseView>
  )
}

// Fixed height for the chart slot — both cards reserve the same vertical
// space for the chart regardless of whether it renders MiniBars (tall) or
// PagoDots (short), so the two cards line up visually.
const CHART_SLOT_HEIGHT = 26

const styles = StyleSheet.create({
  flex: { flex: 1, alignSelf: 'stretch' },
  card: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  label: { fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  value: { fontSize: 22, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
  sub: { fontSize: 11, marginTop: 1 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 'auto',
    paddingTop: 8,
    minHeight: CHART_SLOT_HEIGHT + 8,
  },
  trendSlot: { flexShrink: 1, justifyContent: 'flex-end' },
  chartSlot: {
    marginLeft: 8,
    height: CHART_SLOT_HEIGHT,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  trendText: { fontSize: 11, fontWeight: '700' },
})
