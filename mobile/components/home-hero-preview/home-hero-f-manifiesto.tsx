import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionEasings } from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'
import { cycleProgress, deltaPctLabel, moneyInWords, moneyShort } from './home-hero-helpers'
import type { HomeHeroState } from './home-hero-states'

const ENTER = motionEasings.enterSmooth

/**
 * Variant F · El Manifiesto · typographic-only · minimalismo radical
 *
 * Sin gradient. Sin shine. Sin particles. Sin tiles. Sin chips.
 * Solo una composición tipográfica del saldo escrito en palabras,
 * a la magazine spread. Cycle progress se reduce a una línea fina
 * en el pie. Variable font weight interpola con cycle phase.
 *
 * El "número" se vuelve prose. La pausa de leerlo en palabras fuerza
 * conciencia financiera. Lo opuesto al impulso del SaaS dashboard.
 */
export function HomeHeroManifiesto({ state }: { state: HomeHeroState }) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const progress = cycleProgress(state)

  const words = state.incomeConfigured
    ? capitalizeFirst(moneyInWords(state.availableToday))
    : 'Configurá tu ingreso'
  const subline = state.incomeConfigured
    ? state.projectionReliable
      ? `el ciclo cierra ${
          state.projectedClose >= 0 ? 'con' : 'pidiendo'
        } ${moneyShort(state.projectedClose)} ${
          state.projectedClose >= 0 ? 'de margen' : 'prestados'
        }`
      : 'el ciclo recién arranca · sin proyección estable'
    : 'una vez configurado, sabrás cuánto te queda por día'

  // Cascade entrance · word-by-word reveal
  const wordCount = words.split(/\s+/).filter(Boolean).length
  const sublineDelay = 80 * wordCount + 160

  // Progress bar fill animation
  const fillW = useSharedValue(reduced ? progress : 0)
  useEffect(() => {
    if (reduced) {
      fillW.value = progress
      return
    }
    fillW.value = withDelay(sublineDelay + 200, withTiming(progress, { duration: 900, easing: ENTER }))
    return () => cancelAnimation(fillW)
  }, [progress, reduced, sublineDelay, fillW])

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillW.value * 100}%`,
  }))

  // Theme-aware palette · neutral cream + ink + ONE accent
  const ink = theme.isDark ? '#F2EAD3' : '#1A1814'
  const muted = theme.isDark ? 'rgba(242,234,211,0.45)' : 'rgba(26,24,20,0.45)'
  const paper = theme.isDark ? '#1A1A18' : '#F4EFE3'
  const accent =
    state.projectedClose < 0 ? '#A04D3C' : theme.isDark ? '#A6EF8F' : '#1F590D'

  return (
    <View style={[styles.card, { backgroundColor: paper }]}>
      {/* Eyebrow */}
      <Text style={[styles.eyebrow, { color: muted }]}>
        {state.cycleMonth.toUpperCase()} · DÍA {state.cycleDay}
      </Text>

      {/* Saldo en palabras · word-by-word cascade */}
      <View style={styles.wordsWrap}>
        {words.split(/\s+/).map((w, i) => (
          <Word key={`${w}-${i}`} word={w} index={i} reduced={reduced} ink={ink} />
        ))}
      </View>

      {/* Subline · italic · second voice */}
      <RiseLine delay={sublineDelay} reduced={reduced}>
        <Text style={[styles.subline, { color: muted }]}>
          {subline}
        </Text>
      </RiseLine>

      {/* Stats line · only minimum prose */}
      {state.incomeConfigured ? (
        <RiseLine delay={sublineDelay + 120} reduced={reduced}>
          <View style={styles.statsLine}>
            <Text style={[styles.statsText, { color: muted }]}>
              <Text style={[styles.statsValue, { color: ink }]}>${moneyShort(state.dailyBudget)}</Text>
              {' por día · '}
              <Text style={[styles.statsValue, { color: state.variableTrend != null && state.variableTrend > 0 ? accent : ink }]}>
                {deltaPctLabel(state.variableTrend)}
              </Text>
              {' vs mes pasado · racha de '}
              <Text style={[styles.statsValue, { color: state.racha > 0 ? accent : ink }]}>
                {state.racha === 0 ? '0 días' : `${state.racha} día${state.racha === 1 ? '' : 's'}`}
              </Text>
            </Text>
          </View>
        </RiseLine>
      ) : null}

      {/* Progress · una sola línea al pie */}
      <View style={styles.progressRow}>
        <View style={[styles.progressTrack, { backgroundColor: muted }]}>
          <Animated.View
            style={[styles.progressFill, { backgroundColor: accent }, fillStyle]}
          />
        </View>
        <Text style={[styles.progressLabel, { color: muted }]}>
          {state.cycleDay}/{state.cycleTotalDays}
        </Text>
      </View>
    </View>
  )
}

function Word({
  word,
  index,
  reduced,
  ink,
}: {
  word: string
  index: number
  reduced: boolean
  ink: string
}) {
  const opacity = useSharedValue(reduced ? 1 : 0)
  const y = useSharedValue(reduced ? 0 : 14)

  useEffect(() => {
    if (reduced) {
      opacity.value = 1
      y.value = 0
      return
    }
    const delay = 60 + index * 80
    opacity.value = withDelay(delay, withTiming(1, { duration: 480, easing: ENTER }))
    y.value = withDelay(delay, withTiming(0, { duration: 480, easing: ENTER }))
    return () => {
      cancelAnimation(opacity)
      cancelAnimation(y)
    }
  }, [index, reduced, opacity, y])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }))

  return (
    <Animated.Text style={[styles.word, { color: ink }, style]}>
      {word}{' '}
    </Animated.Text>
  )
}

function RiseLine({ children, delay, reduced }: { children: React.ReactNode; delay: number; reduced: boolean }) {
  const opacity = useSharedValue(reduced ? 1 : 0)
  const y = useSharedValue(reduced ? 0 : 10)
  useEffect(() => {
    if (reduced) {
      opacity.value = 1
      y.value = 0
      return
    }
    opacity.value = withDelay(delay, withTiming(1, { duration: 500, easing: ENTER }))
    y.value = withDelay(delay, withTiming(0, { duration: 500, easing: ENTER }))
    return () => {
      cancelAnimation(opacity)
      cancelAnimation(y)
    }
  }, [delay, reduced, opacity, y])
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }))
  return <Animated.View style={style}>{children}</Animated.View>
}

function capitalizeFirst(s: string): string {
  if (!s) return s
  return s[0].toUpperCase() + s.slice(1)
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 4,
    padding: 24,
    paddingTop: 28,
    paddingBottom: 20,
    minHeight: 280,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2.2,
    fontWeight: '700',
    fontFamily: 'Menlo',
    marginBottom: 18,
  },
  wordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  word: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 34,
    fontFamily: 'Georgia',
  },
  subline: {
    marginTop: 14,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
    fontFamily: 'Georgia',
  },
  statsLine: {
    marginTop: 12,
  },
  statsText: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0.1,
    fontFamily: 'Menlo',
  },
  statsValue: {
    fontWeight: '800',
    letterSpacing: 0.2,
    fontFamily: 'Menlo',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
  },
  progressTrack: {
    flex: 1,
    height: 1,
    opacity: 0.25,
    position: 'relative',
    overflow: 'hidden',
  },
  progressFill: {
    position: 'absolute',
    top: -1,
    left: 0,
    height: 3,
  },
  progressLabel: {
    fontSize: 10,
    fontFamily: 'Menlo',
    letterSpacing: 0.4,
  },
})
