import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionEasings } from '@/lib/motion/tokens'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow } from './smart-alerts-helpers'
import type { HeroState } from './hero-states'

interface HeaderDProps {
  state: HeroState
  onPressAdd?: () => void
}

/**
 * Variant D · Health pulse. Un breathe dot 10pt color-coded por
 * salud del ciclo a la izquierda del title. El color comunica
 * estado sin texto:
 *   lime    → todo en orden / al día
 *   amber   → pendientes en plazo
 *   peach   → urgentes próximos (1-2 días)
 *   red     → vencidos
 *   muted   → empty
 *
 * Sub-line state-aware acompaña como contexto narrativo. Pulse es
 * continuous warm 1.6s loop. Cualquiera capta el "semáforo" en 1s.
 */
export function HeaderHealthPulse({ state, onPressAdd }: HeaderDProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const press = usePressScale({ pressedScale: 0.94 })

  const health = resolveHealth(state, palette, theme.colors.textMuted)

  return (
    <View style={styles.row}>
      <View style={styles.titleBlock}>
        <RiseRow delay={0}>
          <View style={styles.titleRow}>
            <BreatheDot color={health.color} />
            <Text style={[styles.title, { color: theme.colors.text }]}>Fijos</Text>
          </View>
        </RiseRow>
        <RiseRow delay={80}>
          <Text style={[styles.subtitle, { color: health.color }]} numberOfLines={2}>
            {health.label}
          </Text>
        </RiseRow>
      </View>

      <RiseRow delay={140}>
        <Pressable
          onPress={onPressAdd}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
          accessibilityLabel="Agregar fijo"
        >
          <Animated.View
            style={[
              styles.addButton,
              {
                backgroundColor: theme.colors.creamCard,
                borderColor: theme.colors.line,
              },
              press.animatedStyle,
            ]}
          >
            <PlusIcon color={theme.colors.text} />
          </Animated.View>
        </Pressable>
      </RiseRow>
    </View>
  )
}

function resolveHealth(
  state: HeroState,
  palette: ReturnType<typeof buildProximosPalette>,
  mutedColor: string,
): { color: string; label: string } {
  if (state.isEmpty) {
    return { color: mutedColor, label: 'Sin fijos cargados todavía' }
  }
  if (state.cantidadVencidos > 0) {
    return {
      color: palette.urgencyStrong,
      label: `${state.cantidadVencidos} ${state.cantidadVencidos === 1 ? 'fijo vencido' : 'fijos vencidos'}`,
    }
  }
  // Tomorrow/today urgency
  const tomorrow = state.upcoming.find((u) => u.days <= 1)
  if (tomorrow && !state.isAllPaid) {
    return {
      color: palette.urgency,
      label:
        tomorrow.days === 0
          ? `${tomorrow.name} vence hoy`
          : `${tomorrow.name} vence mañana`,
    }
  }
  if (state.isAllPaid) {
    return {
      color: palette.success,
      label:
        state.daysRemaining <= 1
          ? 'Todo pagado · cobrás mañana'
          : `Todo pagado · ${state.daysRemaining} días al cierre`,
    }
  }
  // Default — pendiente sin urgencia inmediata
  return {
    color: palette.barMid,
    label: `${state.cantidadPorPagarTotal} ${state.cantidadPorPagarTotal === 1 ? 'fijo' : 'fijos'} por pagar`,
  }
}

function BreatheDot({ color }: { color: string }) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(1)
  const opacity = useSharedValue(0.85)

  useEffect(() => {
    if (reduced) return
    scale.value = withRepeat(
      withSequence(
        withTiming(1.22, { duration: 800, easing: motionEasings.warm }),
        withTiming(1, { duration: 800, easing: motionEasings.warm }),
      ),
      -1,
      true,
    )
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: motionEasings.warm }),
        withTiming(0.55, { duration: 800, easing: motionEasings.warm }),
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
        styles.dot,
        { backgroundColor: color },
        style,
      ]}
    />
  )
}

const PlusIcon = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 5v14M5 12h14"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
)

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  titleBlock: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 260,
    fontWeight: '600',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginLeft: 8,
    borderWidth: 1,
  },
})
