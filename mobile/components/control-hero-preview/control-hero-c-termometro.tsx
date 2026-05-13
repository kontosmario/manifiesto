import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { CardParticles } from '@/components/ui/card-particles'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionEasings } from '@/lib/motion/tokens'
import { formatMoney } from '@/utils/money'
import { authTokens } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import {
  buildControlHeroPalette,
  resolveControlMessage,
  statusColor,
} from './control-hero-helpers'
import type { ControlHeroState } from './control-hero-states'

const ENTER = motionEasings.enterSmooth

interface Props {
  state: ControlHeroState
}

/**
 * Variant C · El Termómetro · vertical bar visceral. La columna se
 * llena bottom-up al ratio `gastoHoy / cupoDiario`. Un marker line
 * horizontal a la altura `horaF / 24` muestra el "ritmo ideal" de la
 * hora. El visual gap entre el top del fill y el marker line ES el
 * delta — si el fill SUPERA al marker, el bar se vuelve peach urgent.
 *
 * Visceral · ver el termómetro alto = "vas pasando el ritmo" sin
 * leer números.
 */
export function ControlHeroTermometro({ state }: Props) {
  const { theme } = useAppTheme()
  const palette = buildControlHeroPalette()
  const msg = resolveControlMessage(state)
  const tone = statusColor(msg.status, palette)
  const reduced = useReducedMotion()

  const usagePct = Math.min(1, Math.max(0, state.gastoHoy / state.cupoDiario))
  const horaPct = Math.min(1, Math.max(0, state.horaF / 24))

  // Animated fill — bottom-up
  const fill = useSharedValue(reduced ? usagePct : 0)
  useEffect(() => {
    if (reduced) {
      fill.value = usagePct
      return
    }
    fill.value = withDelay(240, withTiming(usagePct, { duration: 900, easing: ENTER }))
    return () => cancelAnimation(fill)
  }, [reduced, usagePct, fill])

  const fillStyle = useAnimatedStyle(() => ({
    height: `${fill.value * 100}%`,
  }))

  return (
    <LinearGradient
      colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, { borderColor: 'rgba(166,239,143,0.12)' }]}
    >
      <ShineOverlay width={430} height={360} tint={theme.colors.shineOverlay} delayMs={1000} periodMs={4200} />
      <CardParticles count={12} accentColor={authTokens.peach} />

      <RiseRow delay={0}>
        <View style={styles.headerRow}>
          <BreatheDot size={7} color={tone} glow={tone} />
          <Text style={[styles.eyebrow, { color: tone }]}>{state.diaLabel}</Text>
        </View>
      </RiseRow>

      <View style={styles.body}>
        <RiseRow delay={120}>
          <View style={styles.thermoCol}>
            <View
              style={[
                styles.thermoTrack,
                { backgroundColor: palette.trackBg, borderColor: palette.trackMuted },
              ]}
            >
              <Animated.View
                style={[
                  styles.thermoFill,
                  { backgroundColor: tone },
                  fillStyle,
                ]}
              />
              {/* Marker line at horaF/24 of the height (from bottom) */}
              <View
                style={[
                  styles.thermoMarker,
                  {
                    bottom: `${horaPct * 100}%`,
                    backgroundColor: theme.colors.heroText,
                  },
                ]}
                pointerEvents="none"
              />
              <Text
                style={[
                  styles.thermoMarkerLabel,
                  {
                    bottom: `${horaPct * 100}%`,
                    color: theme.colors.heroMuted,
                  },
                ]}
              >
                AHORA
              </Text>
            </View>
            <Text style={[styles.thermoFooter, { color: theme.colors.heroMuted2 }]}>
              cupo {formatMoney(state.cupoDiario)}
            </Text>
          </View>
        </RiseRow>

        <View style={styles.copyCol}>
          <RiseRow delay={200}>
            <Text style={[styles.numberLabel, { color: theme.colors.heroMuted2 }]}>
              {msg.primaryLabel}
            </Text>
            <CountUpText
              value={msg.primaryNumber}
              duration={1000}
              format={(n) => (msg.primaryLabel === 'DÍAS HASTA AGOTAR' ? `${Math.round(n)}d` : formatMoney(Math.round(n)))}
              style={[styles.numberValue, { color: tone }]}
            />
          </RiseRow>

          <RiseRow delay={320}>
            <Text style={[styles.primary, { color: theme.colors.heroText }]}>
              {msg.primary}
            </Text>
          </RiseRow>
          <RiseRow delay={400}>
            <Text style={[styles.secondary, { color: theme.colors.heroMuted }]}>
              {msg.secondary}
            </Text>
          </RiseRow>
        </View>
      </View>
    </LinearGradient>
  )
}

function RiseRow({ delay, children }: { delay: number; children: React.ReactNode }) {
  const reduced = useReducedMotion()
  const y = useSharedValue(reduced ? 0 : 10)
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

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  body: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  thermoCol: {
    alignItems: 'center',
    gap: 6,
  },
  thermoTrack: {
    width: 36,
    height: 200,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  thermoFill: {
    width: '100%',
    borderRadius: 18,
  },
  thermoMarker: {
    position: 'absolute',
    left: -4,
    right: -4,
    height: 2,
    opacity: 0.85,
  },
  thermoMarkerLabel: {
    position: 'absolute',
    left: 40,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: -4,
  },
  thermoFooter: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  copyCol: {
    flex: 1,
    gap: 12,
  },
  numberLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  numberValue: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1.2,
    lineHeight: 36,
    fontVariant: ['tabular-nums'],
  },
  primary: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 20,
  },
  secondary: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
})
