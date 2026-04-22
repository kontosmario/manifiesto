import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated'
import { AnimatedAmount } from '@/components/ui/animated-amount'
import { motionDurations, motionSprings, motionStagger } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeMetricStripProps {
  savedAmount: number
  fixedAmount: number
}

export function HomeMetricStrip({ savedAmount, fixedAmount }: HomeMetricStripProps) {
  return (
    <View style={styles.row}>
      <MetricCard index={0} label="Ahorro" sublabel="del mes" value={savedAmount} />
      <MetricCard index={1} label="Fijos" sublabel="del mes" value={fixedAmount} />
    </View>
  )
}

function MetricCard({
  index,
  label,
  sublabel,
  value,
}: {
  index: number
  label: string
  sublabel: string
  value: number
}) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const opacity = useSharedValue(reduceMotion ? 1 : 0)
  const translateY = useSharedValue(reduceMotion ? 0 : 6)

  useEffect(() => {
    if (reduceMotion) return
    const delay = index * motionStagger.listItem
    opacity.value = withDelay(delay, withTiming(1, { duration: motionDurations.standard }))
    translateY.value = withDelay(delay, withSpring(0, motionSprings.enter))
  }, [index, reduceMotion, opacity, translateY])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))

  return (
    <Animated.View
      accessible
      accessibilityLabel={`${label}: $${Math.round(value).toLocaleString('es-AR')} ${sublabel}`}
      style={[
        styles.card,
        animatedStyle,
        {
          backgroundColor: theme.colors.surface,
          shadowColor: '#000',
        },
      ]}
    >
      <Text style={[typography.fieldLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <AnimatedAmount value={value} variant="metricValue" style={styles.value} />
      <Text style={[typography.caption, { color: theme.colors.textSoft }]}>{sublabel}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    padding: 16,
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  value: {
    marginTop: 2,
  },
})
