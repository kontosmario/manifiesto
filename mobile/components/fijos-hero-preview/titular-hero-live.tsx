import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { formatMoney } from '@/utils/money'
import { motionEasings } from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'
import type { HeroState } from './hero-states'

const ENTER = motionEasings.enterSmooth

interface TitularHeroLiveProps {
  state: HeroState
}

/**
 * Variant A · El Titular — magazine cover. State-aware headline.
 * Cascade entrance row by row (RiseView equivalent, in-place):
 *   0ms    eyebrow
 *   60ms   rule scaleX
 *   140ms  headline
 *   220ms  subhead
 *   300ms  footer band
 *   380ms  bottom line (próximo)
 *
 * CountUp on the 3 footer $ values.
 * BreatheDot pulse on the urgency indicator when state has vencidos.
 */
export function TitularHeroLive({ state }: TitularHeroLiveProps) {
  const { theme } = useAppTheme()
  const headline = resolveHeadline(state)

  return (
    <LinearGradient
      colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, { borderColor: 'rgba(166,239,143,0.12)' }]}
    >
      {/* Eyebrow editorial */}
      <RiseRow delay={0}>
        <View style={styles.eyebrowRow}>
          <Text style={[styles.brand, { color: theme.colors.heroAccent }]}>
            MANIFIESTO
          </Text>
          <Text style={[styles.sep, { color: theme.colors.heroMuted2 }]}>·</Text>
          <Text style={[styles.edition, { color: theme.colors.heroMuted2 }]}>
            edición {state.monthLong.toLowerCase()}
          </Text>
          <View style={{ flex: 1 }} />
          <Text style={[styles.days, { color: theme.colors.heroMuted2 }]}>
            {state.isEmpty
              ? `${state.daysRemaining} días al cierre`
              : `${state.daysRemaining} días al cierre`}
          </Text>
        </View>
      </RiseRow>

      {/* Rule scaleX */}
      <RuleScale color={theme.colors.heroAccent} delay={60} />

      {/* Headline state-aware */}
      <RiseRow delay={140}>
        <View style={styles.headlineBlock}>
          <Text
            style={[styles.headline, { color: headline.color }]}
            accessibilityRole="header"
          >
            {headline.line1}
          </Text>
          {headline.line2 ? (
            <Text style={[styles.headline, { color: headline.color }]}>
              {headline.line2}
            </Text>
          ) : null}

          {headline.urgent ? (
            <View style={styles.urgencyRow}>
              <BreatheDot color="#FFB59E" />
              <Text style={[styles.urgencyText, { color: '#FFB59E' }]}>
                resolvé primero los vencidos
              </Text>
            </View>
          ) : null}
        </View>
      </RiseRow>

      {/* Subhead */}
      <RiseRow delay={220}>
        <Text style={[styles.subhead, { color: theme.colors.heroMuted }]}>
          {headline.subhead}
        </Text>
      </RiseRow>

      {/* Footer band */}
      <RiseRow delay={300}>
        <View style={[styles.footerBand, { borderTopColor: 'rgba(255,255,255,0.10)' }]}>
          <FooterMetric
            label="pagado"
            value={state.montoPagado}
            display={(n) => formatMoney(Math.round(n))}
            accent={theme.colors.heroAccent}
          />
          <Divider />
          <FooterMetric
            label="libre"
            value={state.dineroLibre}
            display={(n) => formatMoney(Math.round(n))}
            accent={theme.colors.heroText}
          />
          <Divider />
          <FooterMetric
            label="del sueldo"
            value={state.pctSueldo}
            display={(n) => `${Math.round(n)}%`}
            accent={theme.colors.heroMuted}
          />
        </View>
      </RiseRow>

      {/* Próximo bottom line */}
      <RiseRow delay={380}>
        <View style={styles.nextRow}>
          {state.nextItem ? (
            <>
              <MaterialIcons name="arrow-forward" size={13} color={theme.colors.heroAccent} />
              <Text style={[styles.nextLabel, { color: theme.colors.heroAccent }]}>
                PRÓXIMO
              </Text>
              <Text style={[styles.nextBody, { color: theme.colors.heroText }]}>
                {state.nextItem.name} en {state.nextItem.days} {state.nextItem.days === 1 ? 'día' : 'días'} · {formatMoney(state.nextItem.amount)}
              </Text>
            </>
          ) : (
            <>
              <MaterialIcons
                name={state.isAllPaid ? 'check-circle' : 'add-circle-outline'}
                size={13}
                color={theme.colors.heroAccent}
              />
              <Text style={[styles.nextLabel, { color: theme.colors.heroAccent }]}>
                {state.isAllPaid ? 'COMPLETO' : 'CARGAR'}
              </Text>
              <Text style={[styles.nextBody, { color: theme.colors.heroText }]}>
                {state.isAllPaid
                  ? 'No queda nada por pagar este ciclo.'
                  : 'Agregá tus primeros fijos para empezar.'}
              </Text>
            </>
          )}
        </View>
      </RiseRow>
    </LinearGradient>
  )
}

// ── Headline state resolver ───────────────────────────────────────

function resolveHeadline(state: HeroState): {
  line1: string
  line2?: string
  subhead: string
  color: string
  urgent: boolean
} {
  if (state.isEmpty) {
    return {
      line1: 'Cargá tus',
      line2: 'gastos fijos.',
      subhead: 'Una vez que estén cargados, este espacio te dice cómo vas en cada ciclo.',
      color: '#F2EAD3',
      urgent: false,
    }
  }
  if (state.isAllPaid) {
    return {
      line1: 'Estás al día.',
      subhead:
        state.daysRemaining <= 2
          ? 'Cierre del ciclo en horas. Empezás el siguiente con margen.'
          : `Te quedan ${state.daysRemaining} días sin nada por pagar.`,
      color: '#A6EF8F',
      urgent: false,
    }
  }
  if (state.cantidadVencidos > 0) {
    return {
      line1: `Tenés ${state.cantidadVencidos} ${state.cantidadVencidos === 1 ? 'fijo' : 'fijos'}`,
      line2: 'vencidos.',
      subhead: `${formatMoney(state.montoVencido)} en atraso. Es lo primero a resolver.`,
      color: '#FFB59E',
      urgent: true,
    }
  }
  if (state.cycleDayIndex <= 3 && state.cantidadPagados === 0) {
    return {
      line1: 'Arranca',
      line2: 'el ciclo.',
      subhead: `${state.cantidadFijos} fijos por delante · ${formatMoney(state.totalFijos)} total.`,
      color: '#F2EAD3',
      urgent: false,
    }
  }
  return {
    line1: `Te quedan ${state.cantidadPorPagarTotal}`,
    line2: state.cantidadPorPagarTotal === 1 ? 'fijo por pagar.' : 'fijos por pagar.',
    subhead: `${formatMoney(state.montoPorPagarTotal)} en lo que resta del ciclo.`,
    color: '#F2EAD3',
    urgent: false,
  }
}

// ── Cascade entrance row ──────────────────────────────────────────

function RiseRow({ delay, children }: { delay: number; children: React.ReactNode }) {
  const reduced = useReducedMotion()
  const y = useSharedValue(reduced ? 0 : 12)
  const opacity = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) return
    y.value = withDelay(delay, withTiming(0, { duration: 460, easing: ENTER }))
    opacity.value = withDelay(delay, withTiming(1, { duration: 460, easing: ENTER }))
    return () => {
      cancelAnimation(y)
      cancelAnimation(opacity)
    }
  }, [delay, reduced, y, opacity])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }))

  return <Animated.View style={style}>{children}</Animated.View>
}

// ── Rule scaleX ───────────────────────────────────────────────────

function RuleScale({ color, delay }: { color: string; delay: number }) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0)
  const opacity = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) return
    scale.value = withDelay(delay, withTiming(1, { duration: 540, easing: ENTER }))
    opacity.value = withDelay(delay, withTiming(1, { duration: 320, easing: ENTER }))
    return () => {
      cancelAnimation(scale)
      cancelAnimation(opacity)
    }
  }, [delay, reduced, scale, opacity])

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scaleX: scale.value }],
  }))

  return (
    <Animated.View
      style={[
        styles.rule,
        { backgroundColor: color, transformOrigin: 'left' },
        animStyle,
      ]}
    />
  )
}

// ── BreatheDot ────────────────────────────────────────────────────

function BreatheDot({ color }: { color: string }) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(1)
  const opacity = useSharedValue(0.85)

  useEffect(() => {
    if (reduced) return
    scale.value = withRepeat(
      withSequence(
        withTiming(1.22, { duration: 900, easing: motionEasings.warm }),
        withTiming(1, { duration: 900, easing: motionEasings.warm }),
      ),
      -1,
      true,
    )
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: motionEasings.warm }),
        withTiming(0.6, { duration: 900, easing: motionEasings.warm }),
      ),
      -1,
      true,
    )
    return () => {
      cancelAnimation(scale)
      cancelAnimation(opacity)
    }
  }, [reduced, scale, opacity])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  return (
    <Animated.View
      style={[
        {
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: color,
        },
        style,
      ]}
    />
  )
}

// ── Footer metric con CountUp ─────────────────────────────────────

function FooterMetric({
  label,
  value,
  display,
  accent,
}: {
  label: string
  value: number
  display: (n: number) => string
  accent: string
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.footerCol}>
      <Text style={[styles.footerLabel, { color: theme.colors.heroMuted2 }]}>
        {label}
      </Text>
      <CountUpText
        value={value}
        duration={900}
        format={display}
        style={[styles.footerValue, { color: accent }]}
      />
    </View>
  )
}

function Divider() {
  return <View style={styles.footerDivider} />
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 22,
    overflow: 'hidden',
    borderWidth: 1,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  brand: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  sep: {
    fontSize: 11,
    fontWeight: '700',
  },
  edition: {
    fontSize: 11,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  days: {
    fontSize: 11,
    fontWeight: '600',
  },
  rule: {
    width: 32,
    height: 2,
    marginBottom: 18,
  },
  headlineBlock: {
    marginBottom: 14,
  },
  headline: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.4,
    lineHeight: 38,
  },
  urgencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  urgencyText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  subhead: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
    marginBottom: 22,
    maxWidth: 300,
  },
  footerBand: {
    flexDirection: 'row',
    paddingTop: 14,
    borderTopWidth: 1,
    marginBottom: 12,
  },
  footerCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  footerDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginHorizontal: 4,
  },
  footerLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  footerValue: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  nextLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  nextBody: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
})
