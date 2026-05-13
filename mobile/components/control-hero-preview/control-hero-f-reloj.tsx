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
 * Variant F · El Reloj del día · analog clock + arc del cupo
 * consumido. Mapping único: time + money en un solo visual.
 *
 *   - Outer ring: arco del 0% al consumo del cupo, color por status
 *   - 12 tick marks alrededor (12h analog clock)
 *   - Hour hand: línea hacia la hora actual
 *   - Center: libre hoy big
 *
 * Visceral metaphor: "el reloj se va llenando a medida que pasa el
 * día Y a medida que gastás". Visual rich pero único.
 */
export function ControlHeroReloj({ state }: Props) {
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

      <View style={styles.body}>
        <RiseRow delay={120}>
          <View style={styles.clockWrap}>
            <Clock
              state={state}
              tone={tone}
              muted={palette.trackMuted}
              cream={theme.colors.heroText}
              muted2={theme.colors.heroMuted2}
            />
            <View style={styles.clockCenter}>
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
      </View>
    </LinearGradient>
  )
}

function Clock({
  state,
  tone,
  muted,
  cream,
  muted2,
}: {
  state: ControlHeroState
  tone: string
  muted: string
  cream: string
  muted2: string
}) {
  const size = 180
  const cx = size / 2
  const cy = size / 2
  const r = 72
  const stroke = 8

  // Hour hand · ángulo según hora actual (24h mapeado a 360°)
  const hourPct = (state.horaF % 24) / 24
  const hourAngle = hourPct * 2 * Math.PI

  // Arc del cupo consumido · 0 → 100% del cupo a lo largo del 360°
  const usagePct = Math.min(1, Math.max(0, state.gastoHoy / state.cupoDiario))
  const fullCirc = 2 * Math.PI * r
  const filledLen = fullCirc * usagePct

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} originX={cx} originY={cy}>
          {/* Track */}
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={muted}
            strokeWidth={stroke}
            fill="none"
          />
          {/* Cupo arc */}
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={tone}
            strokeWidth={stroke}
            strokeDasharray={`${filledLen} ${fullCirc}`}
            strokeLinecap="round"
            fill="none"
          />
          {/* 12 tick marks · clock hours */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * 2 * Math.PI
            const inner = r - stroke / 2 - 6
            const outer = r - stroke / 2 - 2
            const x1 = cx + Math.cos(angle) * inner
            const y1 = cy + Math.sin(angle) * inner
            const x2 = cx + Math.cos(angle) * outer
            const y2 = cy + Math.sin(angle) * outer
            return (
              <Line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={muted2}
                strokeWidth={1}
                strokeLinecap="round"
              />
            )
          })}
          {/* Hour hand */}
          <Line
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(hourAngle) * (r - stroke / 2 - 12)}
            y2={cy + Math.sin(hourAngle) * (r - stroke / 2 - 12)}
            stroke={cream}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {/* Center cap */}
          <Circle cx={cx} cy={cy} r={3} fill={cream} />
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
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  body: {
    alignItems: 'center',
  },
  clockWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  clockCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  centerLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  centerValue: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  primary: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 22,
    marginTop: 14,
    textAlign: 'center',
  },
  secondary: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 280,
  },
})
