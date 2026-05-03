import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { formatMoney } from '@/utils/money'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

export interface CategoryWeight {
  id: string
  label: string
  color: string
  amount: number
  percent: number
}

interface CategoryWeightsListProps {
  items: CategoryWeight[]
  /** Optional overrides — when omitted, defaults come from the theme.
   *  Most callers (Hero card sobre fondo oscuro) pueden omitirlos
   *  para heredar `heroText` automáticamente. */
  textColor?: string
  mutedColor?: string
  trackColor?: string
}

export function CategoryWeightsList({
  items,
  textColor,
  mutedColor,
  trackColor,
}: CategoryWeightsListProps) {
  const { theme } = useAppTheme()
  const resolvedText = textColor ?? theme.colors.heroText
  const resolvedMuted = mutedColor ?? theme.colors.heroMuted
  const resolvedTrack = trackColor ?? 'rgba(255,255,255,0.12)'
  if (items.length === 0) return null
  return (
    <Animated.View style={styles.list} layout={LinearTransition.duration(260)}>
      {items.map((item, index) => (
        <Animated.View
          key={item.id}
          style={styles.row}
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(160)}
          layout={LinearTransition.duration(260)}
        >
          <View style={styles.rowHeader}>
            <View style={styles.rowLeft}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={[styles.label, { color: resolvedText }]}>{item.label}</Text>
            </View>
            <Text style={[styles.amountText, { color: resolvedText }]}>
              {formatMoney(item.amount)}{' '}
              <Text style={{ color: resolvedMuted, fontWeight: '500' }}>· {item.percent}%</Text>
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: resolvedTrack }]}>
            <AnimatedBar
              key={`${item.id}-${item.percent}`}
              percent={item.percent}
              color={item.color}
              delay={80 + index * 25}
            />
          </View>
        </Animated.View>
      ))}
    </Animated.View>
  )
}

function AnimatedBar({
  percent,
  color,
  delay,
}: {
  percent: number
  color: string
  delay: number
}) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    scale.value = withDelay(
      delay,
      // @motion-allow: 1000ms category-bar growth on stagger-in; deliberately slower than pulse (1200) for staggered reveal
      withTiming(1, { duration: 1000, easing: Easing.bezier(0.2, 0.9, 0.2, 1) }),
    )
  }, [delay, reduced, scale])
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: scale.value }],
    transformOrigin: 'left' as const,
  }))
  const endColor = lighten(color, 20)
  return (
    <Animated.View style={[styles.barWrap, { width: `${Math.min(100, percent)}%` }, style]}>
      <LinearGradient
        colors={[color, endColor] as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  )
}

function lighten(hex: string, pct: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized
  const r = clamp(parseInt(full.slice(0, 2), 16) + Math.round(2.55 * pct))
  const g = clamp(parseInt(full.slice(2, 4), 16) + Math.round(2.55 * pct))
  const b = clamp(parseInt(full.slice(4, 6), 16) + Math.round(2.55 * pct))
  return `rgb(${r}, ${g}, ${b})`
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, n))
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  row: {},
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 12, fontWeight: '600' },
  amountText: { fontSize: 12, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barWrap: { height: '100%', borderRadius: 3, overflow: 'hidden' },
})
