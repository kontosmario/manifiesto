import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { formatMoney } from '@/utils/money'
import { motionEasings } from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import type { HeroState } from './hero-states'

const ENTER = motionEasings.enterSmooth

interface ProximosTimelineLiveProps {
  state: HeroState
}

/**
 * Variant C · Timeline horizontal. Una sola línea de tiempo con HOY
 * a la izquierda y FIN DE CICLO a la derecha. Tres dots posicionados
 * por daysUntil/maxDays. Cada dot tiene su nombre y monto abajo.
 *
 * Animation:
 *   eyebrow + count + rule cascade (0/80ms)
 *   timeline draws L→R 560ms linear (delay 240ms)
 *   dots scale-in spring después que el timeline pase su posición,
 *     stagger 100ms entre dots
 *   labels fade-in 200ms después del dot que les corresponde
 *
 * Theme-aware: track usa palette.trackBg, dots usan urgency/success/
 * neutral según proximidad.
 */
export function ProximosTimelineLive({ state }: ProximosTimelineLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)

  if (state.isEmpty) {
    return <EmptyCard />
  }
  if (state.isAllPaid) {
    return <AllPaidCard daysRemaining={state.daysRemaining} />
  }

  const items = state.upcoming.slice(0, 3)
  const overdueCount = items.filter((i) => i.isOverdue).length
  // Max days to plot: max(daysRemaining, items max days, 14 min for breathing)
  const maxDays = Math.max(
    state.daysRemaining,
    ...items.map((i) => Math.max(0, i.days)),
    14,
  )

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <RiseRow delay={0}>
        <View style={styles.headerRow}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            PRÓXIMOS A PAGAR
          </Text>
          <Text style={[styles.headerCount, { color: theme.colors.textMuted }]}>
            {state.cantidadPorPagarTotal} {state.cantidadPorPagarTotal === 1 ? 'ítem' : 'ítems'}
            {overdueCount > 0 ? ` · ${overdueCount} vencidos` : ''}
          </Text>
        </View>
      </RiseRow>

      <RuleScale color={theme.colors.text} delay={80} />

      {/* Timeline labels */}
      <View style={styles.timelineLabels}>
        <Text style={[styles.timelineEdge, { color: theme.colors.textMuted }]}>
          HOY
        </Text>
        <Text style={[styles.timelineEdge, { color: theme.colors.textMuted }]}>
          {state.daysRemaining}D · FIN CICLO
        </Text>
      </View>

      {/* Timeline */}
      <View style={styles.timelineWrap}>
        <TimelineTrack color={palette.trackBg} fillColor={palette.success} />
        {items.map((item, idx) => (
          <TimelineDot
            key={item.id}
            item={item}
            maxDays={maxDays}
            delay={400 + idx * 100}
            palette={palette}
          />
        ))}
      </View>

      {/* Labels below each dot */}
      <View style={styles.timelineLabelsRow}>
        {items.map((item, idx) => {
          const pct = item.isOverdue
            ? 0
            : Math.max(0, Math.min(1, item.days / maxDays))
          return (
            <DotLabel
              key={item.id}
              item={item}
              pct={pct}
              delay={620 + idx * 100}
              palette={palette}
              textColor={theme.colors.text}
              textMuted={theme.colors.textMuted}
            />
          )
        })}
      </View>
    </View>
  )
}

function TimelineTrack({
  color,
  fillColor,
}: {
  color: string
  fillColor: string
}) {
  const reduced = useReducedMotion()
  const draw = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) {
      draw.value = 1
      return
    }
    draw.value = withDelay(
      240,
      withTiming(1, { duration: 560, easing: Easing.linear }),
    )
    return () => cancelAnimation(draw)
  }, [reduced, draw])

  const fillStyle = useAnimatedStyle(() => ({
    width: `${draw.value * 100}%`,
  }))

  return (
    <View style={[styles.timelineTrack, { backgroundColor: color }]}>
      <Animated.View
        style={[styles.timelineTrackFill, { backgroundColor: fillColor }, fillStyle]}
      />
    </View>
  )
}

function TimelineDot({
  item,
  maxDays,
  delay,
  palette,
}: {
  item: HeroState['upcoming'][number]
  maxDays: number
  delay: number
  palette: ReturnType<typeof buildProximosPalette>
}) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) {
      scale.value = 1
      return
    }
    scale.value = withDelay(
      delay,
      withSpring(1, { damping: 12, stiffness: 200, mass: 0.7 }),
    )
    return () => cancelAnimation(scale)
  }, [reduced, delay, scale])

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const pct = item.isOverdue
    ? 0
    : Math.max(0, Math.min(1, item.days / maxDays))

  const color = item.isOverdue
    ? palette.urgencyStrong
    : item.days <= 2
    ? palette.urgency
    : item.days <= 7
    ? palette.barMid
    : palette.success

  return (
    <Animated.View
      style={[
        styles.timelineDot,
        {
          left: `${pct * 100}%`,
          backgroundColor: color,
          // Halo via shadow keeps it crisp in both themes
          shadowColor: color,
        },
        style,
      ]}
      pointerEvents="none"
    />
  )
}

function DotLabel({
  item,
  pct,
  delay,
  palette,
  textColor,
  textMuted,
}: {
  item: HeroState['upcoming'][number]
  pct: number
  delay: number
  palette: ReturnType<typeof buildProximosPalette>
  textColor: string
  textMuted: string
}) {
  const reduced = useReducedMotion()
  const opacity = useSharedValue(reduced ? 1 : 0)
  const y = useSharedValue(reduced ? 0 : 6)

  useEffect(() => {
    if (reduced) return
    opacity.value = withDelay(delay, withTiming(1, { duration: 360, easing: ENTER }))
    y.value = withDelay(delay, withTiming(0, { duration: 360, easing: ENTER }))
    return () => {
      cancelAnimation(opacity)
      cancelAnimation(y)
    }
  }, [reduced, delay, opacity, y])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }))

  const labelColor = item.isOverdue
    ? palette.urgencyStrong
    : item.days <= 2
    ? palette.urgency
    : textMuted

  const labelText = item.isOverdue
    ? `VENCIÓ ${Math.abs(item.days)}D`
    : item.days === 0
    ? 'HOY'
    : item.days === 1
    ? 'MAÑANA'
    : `EN ${item.days}D`

  // Clamp horizontal position so labels don't clip card edges. We
  // approximate by using marginLeft offset on the absolute label.
  const useLeftClamp = pct < 0.12
  const useRightClamp = pct > 0.88

  return (
    <Animated.View
      style={[
        styles.dotLabel,
        useLeftClamp
          ? { left: '0%' }
          : useRightClamp
          ? { right: '0%' }
          : { left: `${pct * 100}%`, marginLeft: -50 },
        style,
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.dotLabelDays, { color: labelColor }]} numberOfLines={1}>
        {labelText}
      </Text>
      <View style={styles.dotLabelNameRow}>
        <View
          style={[styles.dotLabelCatDot, { backgroundColor: item.categoryColor }]}
        />
        <Text
          style={[styles.dotLabelName, { color: textColor }]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
      </View>
      <View style={styles.dotLabelAmountRow}>
        <Text style={[styles.dotLabelAmount, { color: textColor }]}>
          {formatMoney(item.amount)}
        </Text>
        {item.hikeDeltaPct ? (
          <View
            style={[
              styles.dotLabelHike,
              {
                borderColor: palette.urgencyBadgeBorder,
                backgroundColor: palette.urgencyBadgeBg,
              },
            ]}
          >
            <Text style={[styles.dotLabelHikeText, { color: palette.urgency }]}>
              ↑{item.hikeDeltaPct}%
            </Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  )
}

function EmptyCard() {
  const { theme } = useAppTheme()
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <RiseRow delay={0}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          PRÓXIMOS A PAGAR
        </Text>
      </RiseRow>
      <RuleScale color={theme.colors.text} delay={80} />
      <RiseRow delay={160}>
        <Text style={[styles.emptyLine1, { color: theme.colors.text }]}>
          Sin fijos cargados.
        </Text>
        <Text style={[styles.emptyLine2, { color: theme.colors.textMuted }]}>
          Cargá tus fijos para ver la línea de tiempo del ciclo.
        </Text>
      </RiseRow>
    </View>
  )
}

function AllPaidCard({ daysRemaining }: { daysRemaining: number }) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <RiseRow delay={0}>
        <View style={styles.headerRow}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            PRÓXIMOS A PAGAR
          </Text>
          <Text style={[styles.headerCount, { color: theme.colors.textMuted }]}>
            0 ítems
          </Text>
        </View>
      </RiseRow>
      <RuleScale color={theme.colors.text} delay={80} />
      <RiseRow delay={160}>
        <View style={styles.allPaidRow}>
          <MaterialIcons name="check-circle" size={18} color={palette.success} />
          <Text style={[styles.allPaidText, { color: theme.colors.text }]}>
            Línea limpia hasta el cierre.
          </Text>
        </View>
        <Text style={[styles.allPaidSub, { color: theme.colors.textMuted }]}>
          {daysRemaining <= 2
            ? `El ciclo cierra en ${daysRemaining === 0 ? 'horas' : `${daysRemaining} ${daysRemaining === 1 ? 'día' : 'días'}`}.`
            : `Te quedan ${daysRemaining} días tranquilos hasta el cobro.`}
        </Text>
      </RiseRow>
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

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  headerCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  rule: {
    width: 28,
    height: 2,
    marginTop: 10,
    marginBottom: 16,
    opacity: 0.55,
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timelineEdge: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  timelineWrap: {
    position: 'relative',
    height: 14,
    justifyContent: 'center',
    marginBottom: 8,
  },
  timelineTrack: {
    height: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  timelineTrackFill: {
    height: '100%',
    borderRadius: 999,
    opacity: 0.55,
  },
  timelineDot: {
    position: 'absolute',
    top: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
  timelineLabelsRow: {
    height: 78,
    position: 'relative',
  },
  dotLabel: {
    position: 'absolute',
    top: 0,
    width: 100,
    gap: 2,
  },
  dotLabelDays: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  dotLabelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  dotLabelCatDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotLabelName: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  dotLabelAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  dotLabelAmount: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  dotLabelHike: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
  },
  dotLabelHikeText: {
    fontSize: 8,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  emptyLine1: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  emptyLine2: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  allPaidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  allPaidText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    flex: 1,
  },
  allPaidSub: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    marginLeft: 28,
  },
})
