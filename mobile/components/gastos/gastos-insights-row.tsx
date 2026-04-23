import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { MiniBars } from '@/components/home/mini-bars'
import { GastosInsightCard } from '@/components/gastos/gastos-insight-card'
import { formatMoney } from '@/utils/money'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

interface GastosInsightsRowProps {
  averageDaily: number
  windowDays?: number
  streakDays: number
}

/**
 * Two-card insights row under the hero:
 *   PROMEDIO DÍA — average daily spend + 7-bar mini histogram
 *   RACHA DE REGISTRO — consecutive days registering + wiggling 🔥
 */
export function GastosInsightsRow({
  averageDaily,
  windowDays = 22,
  streakDays,
}: GastosInsightsRowProps) {
  const { theme } = useAppTheme()
  const streakAccent = theme.isDark ? '#E8976A' : '#6B3A4F'
  return (
    <View style={styles.row}>
      <GastosInsightCard
        label="PROMEDIO DÍA"
        value={formatMoney(averageDaily)}
        sub={`últimos ${windowDays} días`}
        subColor={theme.colors.textMuted}
        chart={
          <MiniBars
            values={[0.4, 0.6, 0.3, 0.7, 0.5, 0.8, 0.55]}
            color={theme.isDark ? theme.colors.heroAccent : '#2E7D5B'}
            barWidth={6}
            totalHeight={24}
          />
        }
        delay={200}
      />
      <GastosInsightCard
        label="RACHA DE REGISTRO"
        value={streakDays === 1 ? '1 día' : `${streakDays} días`}
        sub={streakDays > 0 ? 'sin olvidarte' : 'empezá hoy'}
        subColor={streakAccent}
        chart={<WigglingFlame active={streakDays > 0} />}
        delay={260}
      />
    </View>
  )
}

function WigglingFlame({ active }: { active: boolean }) {
  const reduced = useReducedMotion()
  const rotate = useSharedValue(0)
  useEffect(() => {
    if (reduced || !active) return
    rotate.value = withRepeat(
      withSequence(
        withTiming(-3, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
        withTiming(3, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    )
  }, [active, reduced, rotate])
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }))
  return (
    <Animated.View style={[styles.emojiWrap, style]}>
      <Text style={[styles.emoji, { opacity: active ? 1 : 0.45 }]}>🔥</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  emojiWrap: { alignItems: 'flex-start', justifyContent: 'center' },
  emoji: { fontSize: 24 },
})
