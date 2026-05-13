import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import type { HeroState } from './hero-states'

const ENTER = motionEasings.enterSmooth

interface ProximosLiveProps {
  state: HeroState
}

/**
 * Próximos — segundo componente Wrapped-DNA del Fijos refactor.
 *
 * Reemplaza al `FijosUpcomingStrip` viejo (3 cards anidadas con emojis
 * de categoría). El nuevo lenguaje es **editorial list**: una sección
 * con header eyebrow + rule + 3 rows tipográficas, cada una con su
 * label "EN X DÍAS / VENCIÓ HACE Xd / HOY", su nombre + amount, y un
 * thin divider entre rows. Sin nested cards, sin emojis, restraint.
 *
 * State-aware:
 *   sin fijos   → CTA suave "Cargá tus fijos para ver qué se viene"
 *   todo pagado → "No queda nada por pagar este ciclo"
 *   con vencidos→ overdue rows primero, peach urgency
 *   default     → 3 upcoming sorted by daysUntilDue
 *
 * Animations:
 *   eyebrow + count + rule cascade (0/80/160ms)
 *   3 rows stagger entrance (240/320/400ms)
 *   chevron rotation on press (handled internamente por el Pressable)
 */
export function ProximosLive({ state }: ProximosLiveProps) {
  const { theme } = useAppTheme()

  // Empty state — no fijos
  if (state.isEmpty) {
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
            Una vez los configures, esta sección te dice qué se viene en
            los próximos días.
          </Text>
        </RiseRow>
      </View>
    )
  }

  // All-paid state — nothing upcoming this cycle
  if (state.isAllPaid) {
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
            <MaterialIcons name="check-circle" size={18} color={theme.colors.heroAccent} />
            <Text style={[styles.allPaidText, { color: theme.colors.text }]}>
              No queda nada por pagar este ciclo.
            </Text>
          </View>
          {state.daysRemaining <= 2 ? (
            <Text style={[styles.allPaidSub, { color: theme.colors.textMuted }]}>
              El ciclo cierra en {state.daysRemaining === 0 ? 'horas' : `${state.daysRemaining} ${state.daysRemaining === 1 ? 'día' : 'días'}`}. Empezás el siguiente con margen.
            </Text>
          ) : (
            <Text style={[styles.allPaidSub, { color: theme.colors.textMuted }]}>
              Te quedan {state.daysRemaining} días tranquilos hasta el cobro.
            </Text>
          )}
        </RiseRow>
      </View>
    )
  }

  // Default — list of upcoming items (max 3)
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

      {/* Editorial list */}
      <View style={styles.list}>
        {items.map((item, idx) => (
          <View key={item.id}>
            <ProximoRow item={item} delay={160 + idx * 80} />
            {idx < items.length - 1 ? (
              <View style={[styles.divider, { backgroundColor: theme.colors.line }]} />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  )
}

// ── Row component ────────────────────────────────────────────────

function ProximoRow({
  item,
  delay,
}: {
  item: HeroState['upcoming'][number]
  delay: number
}) {
  const { theme } = useAppTheme()
  const press = usePressScale({ pressedScale: 0.98 })

  const labelText = formatLabel(item.days, item.isOverdue)
  const isUrgent = item.isOverdue || item.days <= 1
  const labelColor = item.isOverdue
    ? '#C8341A'
    : item.days <= 1
    ? '#B84014'
    : theme.colors.textMuted

  return (
    <RiseRow delay={delay}>
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${labelText}, ${formatMoney(item.amount)}`}
      >
        <Animated.View style={[styles.row, press.animatedStyle]}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowLabel, { color: labelColor }]}>
              {labelText}
            </Text>
            <View style={styles.rowNameWrap}>
              {/* Color dot de categoría — visual sutil, no decoración */}
              <View
                style={[
                  styles.categoryDot,
                  { backgroundColor: item.categoryColor },
                ]}
              />
              <Text
                style={[styles.rowName, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {item.hikeDeltaPct ? (
                <View style={[styles.hikeBadge, { borderColor: '#B84014' }]}>
                  <MaterialIcons name="trending-up" size={10} color="#B84014" />
                  <Text style={styles.hikeBadgeText}>+{item.hikeDeltaPct}%</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.rowRight}>
            <Text
              style={[
                styles.rowAmount,
                { color: isUrgent ? '#B84014' : theme.colors.text },
              ]}
            >
              {formatMoney(item.amount)}
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    </RiseRow>
  )
}

function formatLabel(days: number, isOverdue?: boolean): string {
  if (isOverdue) {
    const overdueDays = Math.abs(days)
    return overdueDays === 1 ? 'VENCIÓ AYER' : `VENCIÓ HACE ${overdueDays}D`
  }
  if (days === 0) return 'HOY'
  if (days === 1) return 'MAÑANA'
  return `EN ${days} DÍAS`
}

// ── Cascade row entrance ─────────────────────────────────────────

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

// ── Rule scaleX ──────────────────────────────────────────────────

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
  list: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowLeft: {
    flex: 1,
    gap: 4,
  },
  rowLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  rowNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  hikeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  hikeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B84014',
    fontVariant: ['tabular-nums'],
  },
  rowRight: {
    marginLeft: 12,
  },
  rowAmount: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    opacity: 0.4,
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
