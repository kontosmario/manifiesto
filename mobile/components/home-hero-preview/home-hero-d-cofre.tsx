import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionEasings } from '@/lib/motion/tokens'
import { formatMoney } from '@/utils/money'
import { moneyShort } from './home-hero-helpers'
import type { HomeHeroState } from './home-hero-states'

const ENTER = motionEasings.enterSmooth
const COIN_W = 220
const COIN_H = 32
const STACK_OFFSET = 6

/**
 * Variant D · El Cofre · skeuomorphic physical-money
 *
 * Saldo representado como pila de monedas física. Altura del stack
 * = saldo / monthlyIncome. Tap → top coin se voltea (rotateY 180°)
 * y revela proyección al cierre del ciclo. Drop shadows + degradés
 * radiales hacen las monedas tridimensionales sin SVG.
 */
export function HomeHeroCofre({ state }: { state: HomeHeroState }) {
  const reduced = useReducedMotion()

  // Stack height · 4-12 coins según ratio saldo/ingreso
  const stackCount = state.incomeConfigured
    ? Math.max(2, Math.min(12, Math.round((state.availableToday / Math.max(1, state.monthlyIncome)) * 12)))
    : 0
  const isProjectionNegative = state.projectedClose < 0

  // Flip state · tap top coin to reveal projection
  const [flipped, setFlipped] = useState(false)
  const flip = useSharedValue(0)
  useEffect(() => {
    flip.value = withTiming(flipped ? 1 : 0, { duration: 460, easing: ENTER })
    return () => cancelAnimation(flip)
  }, [flipped, flip])

  const frontStyle = useAnimatedStyle(() => ({
    opacity: 1 - flip.value,
    transform: [{ rotateY: `${flip.value * 180}deg` }],
  }))
  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value,
    transform: [{ rotateY: `${(1 - flip.value) * -180}deg` }],
  }))

  const onFlip = useCallback(() => setFlipped((v) => !v), [])

  return (
    <LinearGradient
      colors={['#1B2632', '#0E1822'] as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={[styles.card, { borderColor: 'rgba(248,209,140,0.18)' }]}
    >
      <View style={styles.labelRow}>
        <Text style={styles.label}>EL COFRE · {state.cycleMonth.toUpperCase()}</Text>
        <Text style={styles.dayChip}>{state.cycleDay}/{state.cycleTotalDays}</Text>
      </View>

      <View style={styles.stackWrap}>
        {/* Bottom coins (decorative) */}
        {Array.from({ length: stackCount - 1 }).map((_, i) => (
          <Coin
            key={i}
            index={i}
            total={stackCount - 1}
            delay={i * 60}
            reduced={reduced}
          />
        ))}

        {/* Top coin · tap-to-flip · shows saldo / proyección */}
        {stackCount > 0 ? (
          <Pressable
            onPress={onFlip}
            accessibilityRole="button"
            accessibilityLabel={
              flipped
                ? 'Mostrar saldo del mes'
                : 'Mostrar proyección al cierre'
            }
            style={[
              styles.topCoinPress,
              { bottom: (stackCount - 1) * STACK_OFFSET },
            ]}
          >
            <View style={styles.topCoinAnchor}>
              <Animated.View style={[styles.coinFace, frontStyle]} pointerEvents={flipped ? 'none' : 'auto'}>
                <LinearGradient
                  colors={['#F4D89E', '#D6A85A', '#A77F3A'] as unknown as readonly [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.coinFaceGradient}
                >
                  <Text style={styles.coinLabel}>SALDO DEL MES</Text>
                  <CountUpText
                    value={state.availableToday}
                    format={(n) => formatMoney(n)}
                    style={styles.coinAmount}
                  />
                </LinearGradient>
              </Animated.View>

              <Animated.View
                style={[styles.coinFace, styles.coinFaceBack, backStyle]}
                pointerEvents={flipped ? 'auto' : 'none'}
              >
                <LinearGradient
                  colors={
                    isProjectionNegative
                      ? (['#C36F73', '#8B3D45', '#5C2730'] as unknown as readonly [string, string, ...string[]])
                      : (['#F4D89E', '#D6A85A', '#A77F3A'] as unknown as readonly [string, string, ...string[]])
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.coinFaceGradient}
                >
                  <Text style={styles.coinLabel}>CIERRE PROYECTADO</Text>
                  <Text style={styles.coinAmount}>
                    {state.projectionReliable
                      ? `${state.projectedClose >= 0 ? '+' : '−'}$${moneyShort(state.projectedClose)}`
                      : '—'}
                  </Text>
                </LinearGradient>
              </Animated.View>
            </View>
          </Pressable>
        ) : (
          <View style={styles.emptyCofre}>
            <Text style={styles.emptyCofreText}>cofre vacío · sin ingreso</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <FooterTile
          label="por día"
          value={state.dailyBudget > 0 ? `$${moneyShort(state.dailyBudget)}` : '—'}
        />
        <FooterTile
          label="al cobro"
          value={`${Math.max(0, state.cycleTotalDays - state.cycleDay)}d`}
        />
      </View>

      <Text style={styles.hint}>tocá la moneda para ver el cierre</Text>
    </LinearGradient>
  )
}

function Coin({ index, total, delay, reduced }: { index: number; total: number; delay: number; reduced: boolean }) {
  const y = useSharedValue(reduced ? 0 : -120)
  const opacity = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) {
      y.value = 0
      opacity.value = 1
      return
    }
    y.value = withDelay(
      delay,
      withSpring(0, { mass: 1, stiffness: 180, damping: 14 }),
    )
    opacity.value = withDelay(delay, withTiming(1, { duration: 220, easing: ENTER }))
    return () => {
      cancelAnimation(y)
      cancelAnimation(opacity)
    }
  }, [delay, reduced, y, opacity])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: opacity.value,
  }))

  return (
    <Animated.View
      style={[
        styles.coin,
        {
          bottom: index * STACK_OFFSET,
          zIndex: index,
          opacity: 1 - (total - index) * 0.02,
        },
        animStyle,
      ]}
    >
      <LinearGradient
        colors={['#D6A85A', '#A77F3A'] as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.coinDeco}
      />
    </Animated.View>
  )
}

function FooterTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.footerTile}>
      <Text style={styles.footerLabel}>{label}</Text>
      <Text style={styles.footerValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    color: '#F4D89E',
  },
  dayChip: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(244,216,158,0.55)',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  stackWrap: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  coin: {
    position: 'absolute',
    width: COIN_W,
    height: COIN_H,
    borderRadius: COIN_H,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    overflow: 'hidden',
  },
  coinDeco: { flex: 1 },
  topCoinPress: {
    position: 'absolute',
    width: COIN_W,
    height: 88,
  },
  topCoinAnchor: { flex: 1 },
  coinFace: {
    position: 'absolute',
    width: COIN_W,
    height: 88,
    borderRadius: 16,
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  coinFaceBack: { top: 0 },
  coinFaceGradient: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    justifyContent: 'center',
  },
  coinLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: '#3F2D0F',
    marginBottom: 4,
  },
  coinAmount: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1.2,
    color: '#1F1408',
    fontVariant: ['tabular-nums'],
  },
  emptyCofre: { paddingVertical: 40, alignItems: 'center' },
  emptyCofreText: {
    fontSize: 12,
    color: 'rgba(244,216,158,0.55)',
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  footerTile: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(244,216,158,0.18)',
    backgroundColor: 'rgba(244,216,158,0.05)',
  },
  footerLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(244,216,158,0.55)',
    marginBottom: 2,
  },
  footerValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F4D89E',
    fontVariant: ['tabular-nums'],
  },
  hint: {
    marginTop: 10,
    fontSize: 10,
    fontStyle: 'italic',
    color: 'rgba(244,216,158,0.45)',
    textAlign: 'center',
  },
})
