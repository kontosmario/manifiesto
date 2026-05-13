import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
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
 * Variant D · El Coach · conversational. La card simula un "asistente
 * que te habla al oído" — header con icon de coach + "Hoy te digo:"
 * lead-in + mensaje conversacional + el dato clave debajo.
 *
 * Speech bubble visual: la card tiene un "tail" sutil que apunta a un
 * avatar imaginario del coach (top-left). Spring entrance bounce in.
 */
export function ControlHeroCoach({ state }: Props) {
  const { theme } = useAppTheme()
  const palette = buildControlHeroPalette()
  const msg = resolveControlMessage(state)
  const tone = statusColor(msg.status, palette)
  const reduced = useReducedMotion()

  // Spring bounce-in del bubble · entra desde scale 0.92 + offset
  const scale = useSharedValue(reduced ? 1 : 0.92)
  const opacity = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) return
    scale.value = withDelay(120, withSpring(1, { damping: 14, stiffness: 220, mass: 0.7 }))
    opacity.value = withDelay(120, withTiming(1, { duration: 320, easing: ENTER }))
    return () => {
      cancelAnimation(scale)
      cancelAnimation(opacity)
    }
  }, [reduced, scale, opacity])

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  return (
    <View>
      <Animated.View style={bubbleStyle}>
        <LinearGradient
          colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.card, { borderColor: 'rgba(166,239,143,0.12)' }]}
        >
          <ShineOverlay width={430} height={360} tint={theme.colors.shineOverlay} delayMs={1000} periodMs={4200} />
          <CardParticles count={12} accentColor={authTokens.peach} />

          {/* Coach avatar + header */}
          <View style={styles.headerRow}>
            <View
              style={[
                styles.coachAvatar,
                {
                  backgroundColor: 'rgba(166,239,143,0.18)',
                  borderColor: tone,
                },
              ]}
            >
              <MaterialIcons name="psychology" size={18} color={tone} />
            </View>
            <View style={styles.headerCol}>
              <View style={styles.eyebrowRow}>
                <BreatheDot size={6} color={tone} glow={tone} />
                <Text style={[styles.eyebrow, { color: tone }]}>COACH · {state.diaLabel}</Text>
              </View>
              <Text style={[styles.intro, { color: theme.colors.heroMuted }]}>
                Hoy te digo:
              </Text>
            </View>
          </View>

          {/* Mensaje conversacional */}
          <RiseRow delay={240}>
            <Text style={[styles.message, { color: theme.colors.heroText }]}>
              {msg.primary}
            </Text>
          </RiseRow>

          {/* Dato clave */}
          <RiseRow delay={320}>
            <View style={styles.dataBlock}>
              <Text style={[styles.dataLabel, { color: theme.colors.heroMuted2 }]}>
                {msg.primaryLabel}
              </Text>
              <CountUpText
                value={msg.primaryNumber}
                duration={1000}
                format={(n) => (msg.primaryLabel === 'DÍAS HASTA AGOTAR' ? `${Math.round(n)} días` : formatMoney(Math.round(n)))}
                style={[styles.dataValue, { color: tone }]}
              />
            </View>
          </RiseRow>

          {/* Sugerencia accionable */}
          <RiseRow delay={400}>
            <View style={[styles.suggestion, { borderColor: 'rgba(166,239,143,0.18)' }]}>
              <MaterialIcons name="lightbulb-outline" size={14} color={tone} />
              <Text style={[styles.suggestionText, { color: theme.colors.heroText }]}>
                {msg.secondary}
              </Text>
            </View>
          </RiseRow>
        </LinearGradient>
        {/* Speech tail · pequeño triángulo arriba-izquierda apuntando
            al "coach" imaginario. Usa el primer color del gradient
            para que parezca recortado del card. */}
        <View
          style={[
            styles.tail,
            { borderBottomColor: theme.colors.heroGradient[0] },
          ]}
        />
      </Animated.View>
    </View>
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
  // Speech tail · triangle at top-left "pointing back" to an imagined
  // coach avatar. Drawn with border tricks (transparent borders + 1
  // colored bottom border = upward-pointing triangle).
  tail: {
    position: 'absolute',
    top: -8,
    left: 16,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    // borderBottomColor injected dynamically
  },
  headerRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  coachAvatar: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  headerCol: { flex: 1, gap: 2 },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  intro: {
    fontSize: 13,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  message: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 26,
    marginBottom: 14,
  },
  dataBlock: {
    marginBottom: 16,
  },
  dataLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  dataValue: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.2,
    lineHeight: 34,
    fontVariant: ['tabular-nums'],
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  suggestionText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
})
