import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
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
const CYCLE_DAYS_DEFAULT = 30

interface ProximosBarsLiveProps {
  state: HeroState
}

/**
 * Variant B · Proximity bars. Encoding visual: el ancho de la barra
 * representa qué tan lejos está el fijo del HOY. Más cerca → barra
 * más larga (urgent peach). Más lejos → barra más corta (calm lime).
 * Overdue → barra rojo-strong y label rojo. Cero nested cards.
 *
 * Cada barra anima width L→R al mount con 80ms stagger entre rows.
 * Theme-aware: light usa #B84014 / #1F590D, dark usa #F2A78C / #A6EF8F.
 */
export function ProximosBarsLive({ state }: ProximosBarsLiveProps) {
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

      <View style={styles.barsList}>
        {items.map((item, idx) => (
          <BarRow
            key={item.id}
            item={item}
            cycleDays={state.cycleDays || CYCLE_DAYS_DEFAULT}
            delay={160 + idx * 100}
            palette={palette}
            textColor={theme.colors.text}
            textMuted={theme.colors.textMuted}
          />
        ))}
      </View>
    </View>
  )
}

function BarRow({
  item,
  cycleDays,
  delay,
  palette,
  textColor,
  textMuted,
}: {
  item: HeroState['upcoming'][number]
  cycleDays: number
  delay: number
  palette: ReturnType<typeof buildProximosPalette>
  textColor: string
  textMuted: string
}) {
  // Fill ratio: 1 - (daysUntil / cycleDays), clamped [0, 1].
  // Overdue → 1 (barra full red).
  const fillRatio = item.isOverdue
    ? 1
    : Math.max(0.08, Math.min(1, 1 - item.days / cycleDays))

  const fillColor = item.isOverdue
    ? palette.urgencyStrong
    : item.days <= 2
    ? palette.barNear
    : item.days <= 7
    ? palette.barMid
    : palette.barFar

  const reduced = useReducedMotion()
  const widthSv = useSharedValue(reduced ? fillRatio : 0)

  useEffect(() => {
    if (reduced) {
      widthSv.value = fillRatio
      return
    }
    widthSv.value = withDelay(
      delay + 120,
      withTiming(fillRatio, { duration: 720, easing: ENTER }),
    )
    return () => cancelAnimation(widthSv)
  }, [reduced, fillRatio, delay, widthSv])

  const barStyle = useAnimatedStyle(() => ({
    width: `${widthSv.value * 100}%`,
  }))

  const labelText = formatLabel(item.days, item.isOverdue)
  const labelColor = item.isOverdue
    ? palette.urgencyStrong
    : item.days <= 2
    ? palette.urgency
    : textMuted

  return (
    <RiseRow delay={delay}>
      <View style={styles.barRowWrap}>
        <View style={styles.barRowHeader}>
          <View style={styles.barNameWrap}>
            <View
              style={[styles.barCatDot, { backgroundColor: item.categoryColor }]}
            />
            <Text
              style={[styles.barName, { color: textColor }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {item.hikeDeltaPct ? (
              <View
                style={[
                  styles.barHikeBadge,
                  {
                    borderColor: palette.urgencyBadgeBorder,
                    backgroundColor: palette.urgencyBadgeBg,
                  },
                ]}
              >
                <MaterialIcons
                  name="trending-up"
                  size={9}
                  color={palette.urgency}
                />
                <Text style={[styles.barHikeText, { color: palette.urgency }]}>
                  +{item.hikeDeltaPct}%
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.barLabel, { color: labelColor }]}>
            {labelText}
          </Text>
        </View>

        <View style={[styles.barTrack, { backgroundColor: palette.trackBg }]}>
          <Animated.View
            style={[styles.barFill, { backgroundColor: fillColor }, barStyle]}
          />
        </View>

        <Text style={[styles.barAmount, { color: textColor }]}>
          {formatMoney(item.amount)}
        </Text>
      </View>
    </RiseRow>
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
          Cargá tus fijos para ver la urgencia de cada uno con la barra
          de proximidad.
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
            No queda nada por pagar este ciclo.
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

function formatLabel(days: number, isOverdue?: boolean): string {
  if (isOverdue) {
    const overdueDays = Math.abs(days)
    return overdueDays === 1 ? 'VENCIÓ AYER' : `VENCIÓ HACE ${overdueDays}D`
  }
  if (days === 0) return 'HOY'
  if (days === 1) return 'MAÑANA'
  return `EN ${days} D`
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
  barsList: {
    gap: 16,
  },
  barRowWrap: {
    gap: 6,
  },
  barRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  barNameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barCatDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  barName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  barHikeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
  },
  barHikeText: {
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  barLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  barTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
  barAmount: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
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
