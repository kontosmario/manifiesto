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
import Svg, { Circle, G, Line } from 'react-native-svg'
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
 * Variant B · El Velocímetro · radial gauge SVG. El % consumido del
 * cupo se representa como un arco que se llena 0 → consumo. Un tick
 * mark separado a la posición de la hora actual (horaF/24) marca
 * dónde "debería" estar el consumo si fuera proporcional. La distancia
 * visual entre el final del arco y el tick = delta visible.
 *
 * Center: libreHoy big · primary number
 * Below center: status copy
 */
export function ControlHeroVelocimetro({ state }: Props) {
  const { theme } = useAppTheme()
  const palette = buildControlHeroPalette()
  const msg = resolveControlMessage(state)
  const tone = statusColor(msg.status, palette)

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

      <RiseRow delay={120}>
        <View style={styles.gaugeWrap}>
          <Gauge state={state} tone={tone} muted={palette.trackMuted} cream={theme.colors.heroText} />
          <View style={styles.gaugeCenter}>
            <Text style={[styles.centerLabel, { color: theme.colors.heroMuted2 }]}>
              {msg.primaryLabel}
            </Text>
            <CountUpText
              value={msg.primaryNumber}
              duration={1100}
              format={(n) => (msg.primaryLabel === 'DÍAS HASTA AGOTAR' ? `${Math.round(n)}d` : formatMoney(Math.round(n)))}
              style={[styles.centerValue, { color: tone }]}
            />
          </View>
        </View>
      </RiseRow>

      <RiseRow delay={400}>
        <Text style={[styles.primary, { color: theme.colors.heroText }]}>
          {msg.primary}
        </Text>
      </RiseRow>

      <RiseRow delay={480}>
        <Text style={[styles.secondary, { color: theme.colors.heroMuted }]}>
          {msg.secondary}
        </Text>
      </RiseRow>
    </LinearGradient>
  )
}

function Gauge({
  state,
  tone,
  muted,
  cream,
}: {
  state: ControlHeroState
  tone: string
  muted: string
  cream: string
}) {
  const reduced = useReducedMotion()
  const size = 160
  const cx = size / 2
  const cy = size / 2
  const r = 64
  const stroke = 8
  // Solo 75% del círculo (270°) — quedan 90° libres abajo para el
  // espacio visual del "centro abierto".
  const arcSpan = 0.75
  const fullCirc = 2 * Math.PI * r
  const arcLen = fullCirc * arcSpan
  const usagePct = Math.min(1, Math.max(0, state.gastoHoy / state.cupoDiario))
  const filledLen = arcLen * usagePct
  const horaPct = Math.min(1, Math.max(0, state.horaF / 24))

  // Animated draw 0 → filledLen
  const draw = useSharedValue(reduced ? filledLen : 0)
  useEffect(() => {
    if (reduced) {
      draw.value = filledLen
      return
    }
    draw.value = withDelay(240, withTiming(filledLen, { duration: 900, easing: ENTER }))
    return () => cancelAnimation(draw)
  }, [reduced, filledLen, draw])

  const animProps = useAnimatedStyle(() => ({
    // strokeDasharray no es animatable directamente en RN-SVG con Reanimated 3,
    // pero podemos usar interpolar via useAnimatedProps. Para simplicidad
    // dejamos un static dasharray y animamos opacity del arc.
  }))
  void animProps

  const drawAnimProps = useAnimatedStyle(() => ({}))
  void drawAnimProps

  // Static rendering for simplicity. Animation reduced to fade-in.
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Rotate -225° so the arc starts at the bottom-left (270° span) */}
        <G rotation={135} originX={cx} originY={cy}>
          {/* Track */}
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={muted}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${arcLen} ${fullCirc}`}
          />
          {/* Fill */}
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={tone}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${filledLen} ${fullCirc}`}
          />
          {/* "AHORA" tick — small radial line at horaF/24 of the arc */}
          {(() => {
            const tickPct = horaPct
            // Position the tick along the arc (0..arcSpan of the circle)
            const tickAngle = tickPct * arcSpan * 2 * Math.PI
            const tickX1 = cx + Math.cos(tickAngle) * (r - stroke / 2 - 2)
            const tickY1 = cy + Math.sin(tickAngle) * (r - stroke / 2 - 2)
            const tickX2 = cx + Math.cos(tickAngle) * (r + stroke / 2 + 4)
            const tickY2 = cy + Math.sin(tickAngle) * (r + stroke / 2 + 4)
            return (
              <Line
                x1={tickX1}
                y1={tickY1}
                x2={tickX2}
                y2={tickY2}
                stroke={cream}
                strokeWidth={2}
                strokeLinecap="round"
              />
            )
          })()}
        </G>
      </Svg>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  gaugeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 6,
  },
  gaugeCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  centerLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  centerValue: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  primary: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 22,
    marginTop: 12,
    textAlign: 'center',
  },
  secondary: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 280,
    alignSelf: 'center',
  },
})
