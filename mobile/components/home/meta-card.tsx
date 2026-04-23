import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated'
import { RiseView } from '@/components/home/animated/rise-view'
import { FloatView } from '@/components/home/animated/float-view'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { formatMoneyShort } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'

interface MetaCardProps {
  goal: SavingsGoal
  onPress?: () => void
}

export function MetaCard({ goal, onPress }: MetaCardProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const pct = Math.min(100, Math.round((goal.currentAmount / goal.goalAmount) * 100))
  const scaleX = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) return
    scaleX.value = withDelay(500, withTiming(pct / 100, { duration: 1300, easing: Easing.bezier(0.2, 0.9, 0.2, 1) }))
  }, [pct, reduced, scaleX])
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: scaleX.value }] }))

  return (
    <RiseView delay={300}>
      <Pressable
        onPress={onPress}
        style={[styles.card, { backgroundColor: '#0F2A1E' }]}
        accessibilityRole="button"
        accessibilityLabel={`Meta ${goal.title}: ${pct}% alcanzado`}
      >
        <View style={styles.topRow}>
          <View style={styles.flex}>
            <Text style={[styles.label, { color: '#9EE5BA' }]}>
              META · {goal.title.toUpperCase()}
            </Text>
            <Text style={styles.amount}>
              {formatMoneyShort(goal.currentAmount)}
              <Text style={styles.goalText}>{' / '}{formatMoneyShort(goal.goalAmount)}</Text>
            </Text>
          </View>
          <FloatView amplitude={4} periodMs={3000}>
            <Text style={styles.emoji}>{goal.emoji}</Text>
          </FloatView>
        </View>

        <View style={styles.barWrap}>
          <Animated.View style={[styles.barInner, { transformOrigin: 'left' as const }, barStyle]}>
            <LinearGradient
              colors={['#6FE09A', '#F2B58A']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <ShineOverlay width={300} height={8} tint="rgba(255,255,255,0.4)" delayMs={1800} periodMs={3200} />
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>{pct}% alcanzado</Text>
          {goal.targetMonths != null ? <Text style={styles.footerText}>faltan ~{goal.targetMonths} {goal.targetMonths === 1 ? 'mes' : 'meses'}</Text> : null}
        </View>
      </Pressable>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 16, paddingVertical: 14, overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex: { flex: 1 },
  label: { fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  amount: { color: '#FFFBF2', fontSize: 22, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 },
  goalText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '500' },
  emoji: { fontSize: 30 },
  barWrap: { marginTop: 10, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', position: 'relative' },
  barInner: { height: '100%', width: '100%' },
  footerRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
})
