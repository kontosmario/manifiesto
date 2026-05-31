import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { RiseView } from '@/components/home/animated/rise-view'
import { pickIconForFixedExpenseCategory } from '@/features/gastos/category-icons'
import type {
  FijoHikeAlert,
  FijoItem,
} from '@/features/fijos/fijos-aggregates.model'
import {
  dismissHike,
  isHikeDismissed,
  useDismissedHikes,
} from '@/features/fijos/use-hike-dismiss-store'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { motionEasings } from '@/lib/motion/tokens'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

const ENTER = motionEasings.enterSmooth

interface FijosProximosCardProps {
  upcoming?: FijoItem[]
  hikes?: FijoHikeAlert[]
  advisorSignals?: ControlAdvisorTask[]
  todayDay?: number
  categoriesById?: Map<string, { id: string; name: string; color: string }>
  onOpenHike?: (fixedExpenseId: string) => void
  /**
   * Modo empty / preview (onboarding). Renderea el MISMO card frame —
   * header "PRÓXIMOS A PAGAR" + RuleScale + filas con su layout (label
   * de día · dot de categoría · nombre · monto) — pero con dashes
   * neutros, sin ítems fabricados. Backwards-compatible default `false`.
   */
  empty?: boolean
}

/**
 * Reemplaza `FijosUpcomingStrip` + `FijosSmartAlerts` con una sola card
 * compacta de dos sub-secciones:
 *
 *   PRÓXIMOS A PAGAR
 *   ─────────
 *   • Hasta 3 rows: día · nombre + cat dot · amount
 *     (sin nested cards, sin emojis, sin acciones)
 *
 *   AVISOS  ──────
 *   • Compacto: ↑ +X% nombre · semana cargada · ratio alto
 *
 * La sub-section AVISOS solo se renderea cuando hay hikes o signals
 * relevantes al dominio fijos. Si no hay próximos, primer slot pasa a
 * un check + "Sin pendientes este ciclo" calmo.
 *
 * Animación cascade interna por row (40-60ms stagger). RiseView wrap
 * para la entrada del card desde el screen.
 */
export function FijosProximosCard({
  upcoming = [],
  hikes = [],
  advisorSignals = [],
  categoriesById,
  onOpenHike,
  empty = false,
}: FijosProximosCardProps) {
  const { theme } = useAppTheme()
  const router = useRouter()
  const dismissedHikes = useDismissedHikes()

  // Hikes visibles: el dismiss store oculta los ya aceptados al precio
  // actual. Si el precio sube de nuevo, el dismissedAtPrice no coincide
  // y la alerta vuelve a aparecer (lógica preservada del original).
  const visibleHikes = useMemo(
    () =>
      hikes.filter(
        (h) => !isHikeDismissed(h.fixedExpenseId, h.currentPrice, dismissedHikes),
      ),
    [hikes, dismissedHikes],
  )

  // Signals filtrados al dominio fijos (mismo criterio que el SmartAlerts
  // viejo)
  const relevantSignals = useMemo(
    () =>
      advisorSignals.filter(
        (s) => s.id === 'stress-week' || s.id === 'fijos-ratio',
      ),
    [advisorSignals],
  )

  const hasAlerts = visibleHikes.length > 0 || relevantSignals.length > 0
  const hasUpcoming = upcoming.length > 0

  // ¿Hay items urgentes (≤2d)? Lo usa el header dot para pulsar.
  // Computado ANTES del early return de `empty` para mantener el
  // hook order (rules-of-hooks: useMemo no puede ir condicionalmente).
  const hasUrgent = useMemo(
    () => upcoming.some((u) => Math.max(0, u.daysUntilDue) <= 2),
    [upcoming],
  )

  // ── Empty / preview mode ─────────────────────────────────────────
  // Mismo card frame (header PRÓXIMOS A PAGAR + RuleScale) con filas
  // placeholder: cada fila conserva el layout real (label de día · dot
  // de categoría · nombre · monto) pero con dashes neutros. Sin ítems
  // inventados. Renderea después de los hooks.
  if (empty) {
    return <FijosProximosCardEmpty />
  }

  if (!hasUpcoming && !hasAlerts) return null

  // Color del card padre — necesario para las edge fade gradients del
  // marquee (los items deben desvanecer HACIA este color, no hacia
  // transparente generico).
  const cardBg = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <RiseView delay={80}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor: theme.colors.line,
          },
        ]}
      >
        {/* Header — eyebrow + header dot urgente (si aplica) + count */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
              PRÓXIMOS A PAGAR
            </Text>
            {hasUrgent ? (
              <UrgentHeaderDot
                color={theme.isDark ? '#F2A78C' : '#B84014'}
              />
            ) : null}
          </View>
          {hasUpcoming ? (
            <Text style={[styles.headerCount, { color: theme.colors.textMuted }]}>
              {upcoming.length} {upcoming.length === 1 ? 'ítem' : 'ítems'}
            </Text>
          ) : null}
        </View>
        <RuleScale color={theme.colors.text} delay={60} />

        {/* Upcoming MARQUEE — ticker horizontal premium con edge fades
            + ticket-style items + urgency treatment con pulse. */}
        {hasUpcoming ? (
          <UpcomingMarquee
            items={upcoming}
            categoriesById={categoriesById}
            cardBg={cardBg}
          />
        ) : (
          <View style={styles.calmRow}>
            <MaterialIcons name="check-circle" size={18} color={theme.colors.primary} />
            <Text style={[styles.calmText, { color: theme.colors.text }]}>
              Sin pendientes. Volvé a chequear en unos días.
            </Text>
          </View>
        )}

        {/* AVISOS sub-section */}
        {hasAlerts ? (
          <>
            <View style={styles.alertsBreak}>
              <Text style={[styles.alertsLabel, { color: theme.colors.textMuted }]}>
                AVISOS
              </Text>
              <View
                style={[styles.alertsLine, { backgroundColor: theme.colors.line }]}
              />
            </View>

            <View style={styles.alertsList}>
              {visibleHikes.slice(0, 3).map((h, idx) => (
                <HikeAlertRow
                  key={`hike-${h.fixedExpenseId}`}
                  hike={h}
                  delay={
                    120 + Math.min(3, upcoming.length) * 60 + 80 + idx * 50
                  }
                  onPress={
                    onOpenHike ? () => onOpenHike(h.fixedExpenseId) : undefined
                  }
                  onDismiss={() => {
                    void triggerHaptic('light')
                    void dismissHike(h.fixedExpenseId, h.currentPrice)
                  }}
                />
              ))}
              {relevantSignals.map((s, idx) => (
                <SignalRow
                  key={`sig-${s.id}`}
                  signal={s}
                  delay={
                    120 +
                    Math.min(3, upcoming.length) * 60 +
                    80 +
                    (visibleHikes.length + idx) * 50
                  }
                  onPress={
                    s.id === 'stress-week'
                      ? () => router.push('/(app)/(tabs)/fixed-expenses')
                      : undefined
                  }
                />
              ))}
            </View>
          </>
        ) : null}
      </View>
    </RiseView>
  )
}

/**
 * Empty-state twin del card "Próximos a pagar". Mismo frame + header +
 * rule, y tres filas que conservan el layout de UpcomingRow (label de
 * día arriba · dot de categoría + nombre · monto a la derecha) pero con
 * dashes neutros. Sin ítems fabricados, sin animación (preview inerte).
 */
function FijosProximosCardEmpty() {
  const { theme } = useAppTheme()
  const ph = theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,30,0.07)'
  return (
    <View
      style={[
        styles.card,
        styles.emptyCard,
        {
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          PRÓXIMOS A PAGAR
        </Text>
      </View>
      {/* Rule estático (sin scaleX animation) — preview inerte. */}
      <View style={[styles.rule, { backgroundColor: theme.colors.text }]} />

      <View style={styles.upcomingList}>
        {[0, 1, 2].map((i) => (
          <View key={i}>
            <View style={styles.upcomingRow}>
              <View style={styles.upcomingLeft}>
                <View style={[styles.phBar, { width: 40, height: 8, backgroundColor: ph }]} />
                <View style={styles.upcomingNameRow}>
                  <View style={[styles.categoryDot, { backgroundColor: ph }]} />
                  <View
                    style={[styles.phBar, { width: i === 1 ? '52%' : '70%', height: 11, backgroundColor: ph }]}
                  />
                </View>
              </View>
              <View style={[styles.phBar, { width: 52, height: 11, marginLeft: 12, backgroundColor: ph }]} />
            </View>
            {i < 2 ? (
              <View style={[styles.rowDivider, { backgroundColor: theme.colors.line }]} />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  )
}

/**
 * UrgentHeaderDot — punto de 7pt al lado del eyebrow "PRÓXIMOS A
 * PAGAR" que pulsa cuando hay items urgentes (≤2d). Anuncio sutil
 * pero notorio del estado del card sin agregar texto extra. Pulso
 * de scale 0.85 → 1.15 + opacity 0.65 → 1, 1.4s ease-in-out
 * (breath-like). ReduceMotion-aware.
 */
function UrgentHeaderDot({ color }: { color: string }) {
  const reduced = useReducedMotion()
  const pulse = useSharedValue(0)

  useEffect(() => {
    if (reduced) return
    pulse.value = withRepeat(
      withTiming(1, { duration: 700, easing: motionEasings.warm }),
      -1,
      true, // reverse = respiración
    )
    return () => cancelAnimation(pulse)
  }, [reduced, pulse])

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.85 + pulse.value * 0.3 }],
    opacity: 0.65 + pulse.value * 0.35,
  }))

  return (
    <Animated.View
      style={[styles.urgentHeaderDot, { backgroundColor: color }, style]}
    />
  )
}

/**
 * Marquee horizontal "premium" de próximos a pagar.
 *
 * Visual:
 *   · Items renderean DUPLICADOS dentro de un Animated.View que
 *     slidea de derecha → izquierda. Cuando el primer set sale por
 *     la izquierda, el segundo set queda exactamente en posición
 *     inicial → loop seamless sin "jump".
 *   · Edge fade gradients (left + right): items se desvanecen
 *     entrando/saliendo del card en vez de cortarse hard. Misma
 *     técnica que tickers premium tipo Bloomberg / Apple Stocks.
 *   · Speed: 35 px/seg — read-speed cómodo sin marear.
 *   · Easing: linear (ticker = velocidad constante, no orgánica).
 *
 * Performance: animación corre en UI thread vía Reanimated v3
 * `withRepeat` — 0 impacto JS thread, scroll de la screen no se
 * afecta. ReduceMotion-aware: fallback a ScrollView manual.
 *
 * Diseño de Item: ver `MarqueeTicket` abajo (ticket-style con timing
 * block + info block + urgency treatment para ≤2d).
 */
function UpcomingMarquee({
  items,
  categoriesById,
  cardBg,
}: {
  items: FijoItem[]
  categoriesById?: Map<string, { id: string; name: string; color: string }>
  /** Color de fondo del card padre — usado para las edge fade
   *  gradients que tienen que terminar en este color para "desvanecer"
   *  hacia el card. */
  cardBg: string
}) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const translateX = useSharedValue(0)
  const [setWidth, setSetWidth] = useState(0)

  const onLayoutRow = (e: LayoutChangeEvent) => {
    const full = e.nativeEvent.layout.width
    if (full > 0 && full / 2 !== setWidth) {
      setSetWidth(full / 2)
    }
  }

  useEffect(() => {
    if (setWidth === 0 || reduced) return
    const SPEED_PX_PER_SEC = 35
    const duration = (setWidth / SPEED_PX_PER_SEC) * 1000
    translateX.value = 0
    translateX.value = withRepeat(
      withTiming(-setWidth, { duration, easing: Easing.linear }),
      -1,
      false,
    )
    return () => cancelAnimation(translateX)
  }, [setWidth, reduced, translateX])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  // Conversion del cardBg a "transparent" para las gradient stops.
  // expo-linear-gradient acepta colors array, así que pasamos
  // [cardBg, transparent].
  const fadeColors = [cardBg, 'rgba(0,0,0,0)'] as const

  if (reduced) {
    return (
      <View style={styles.marqueeContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.marqueeStaticRow}
        >
          {items.map((item) => (
            <MarqueeTicket
              key={item.id}
              item={item}
              category={
                item.category_id ? categoriesById?.get(item.category_id) : undefined
              }
              theme={theme}
            />
          ))}
        </ScrollView>
        {/* Edge fades estáticas en modo reduced también. */}
        <LinearGradient
          pointerEvents="none"
          colors={fadeColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.fadeLeft}
        />
        <LinearGradient
          pointerEvents="none"
          colors={fadeColors}
          start={{ x: 1, y: 0.5 }}
          end={{ x: 0, y: 0.5 }}
          style={styles.fadeRight}
        />
      </View>
    )
  }

  return (
    <View style={styles.marqueeContainer}>
      <Animated.View
        style={[styles.marqueeRow, animStyle]}
        onLayout={onLayoutRow}
      >
        {items.map((item) => (
          <MarqueeTicket
            key={`a-${item.id}`}
            item={item}
            category={
              item.category_id ? categoriesById?.get(item.category_id) : undefined
            }
            theme={theme}
          />
        ))}
        {items.map((item) => (
          <MarqueeTicket
            key={`b-${item.id}`}
            item={item}
            category={
              item.category_id ? categoriesById?.get(item.category_id) : undefined
            }
            theme={theme}
          />
        ))}
      </Animated.View>
      {/* Edge fade gradients — los items se desvanecen entrando y
          saliendo del card en vez de cortarse hard. Misma técnica
          que tickers premium (Bloomberg, Apple Stocks). pointerEvents
          none para no interceptar taps. */}
      <LinearGradient
        pointerEvents="none"
        colors={fadeColors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.fadeLeft}
      />
      <LinearGradient
        pointerEvents="none"
        colors={fadeColors}
        start={{ x: 1, y: 0.5 }}
        end={{ x: 0, y: 0.5 }}
        style={styles.fadeRight}
      />
    </View>
  )
}

/**
 * MarqueeTicket — item individual del marquee, premium ticket-style.
 *
 * Layout horizontal:
 *   ┌────────────┬──────────────────────┐
 *   │  EN        │  ● Cochera           │
 *   │  5 días    │  $103.500            │
 *   └────────────┴──────────────────────┘
 *
 * - Left block (timing): label "EN" (uppercase, micro) sobre número
 *   grande + unidad ("5 días" / "HOY" / "MAÑANA"). Visual anchor del
 *   ticket — el ojo capta primero "cuándo".
 * - Right block (info): catColor dot + nombre del fijo (línea 1),
 *   amount tabular (línea 2).
 * - Divider vertical sutil entre los dos blocks.
 *
 * Urgency treatment (≤2d):
 *   · Bg tinted peach/red (alpha bajo)
 *   · Border 1pt peach/red brand-deep
 *   · Timing number en color brand-deep (no muted)
 *   · Subtle pulse en el border (2.4s warm — solo borderColor opacity)
 *
 * No urgent (>2d):
 *   · Bg sutil (alpha 0.04)
 *   · Border 1pt line
 *   · Timing number en textMuted
 *   · Sin pulse
 *
 * Width fijo (180pt) para uniformidad de velocidad del marquee.
 */
function MarqueeTicket({
  item,
  category,
  theme,
}: {
  item: FijoItem
  category?: { id: string; name: string; color: string }
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  const reduced = useReducedMotion()
  const diffDays = Math.max(0, item.daysUntilDue)
  const urgent = diffDays <= 2

  // Timing display: lead "EN" (excepto HOY/MAÑANA), número grande,
  // unidad chica.
  const timing = (() => {
    if (diffDays === 0) return { lead: '', main: 'HOY', tail: '' }
    if (diffDays === 1) return { lead: '', main: 'MAÑANA', tail: '' }
    return { lead: 'EN', main: String(diffDays), tail: diffDays === 1 ? 'día' : 'días' }
  })()

  // Paleta urgente vs neutral. `urgentBorderRgba` ya no se
  // pre-calcula afuera del worklet — el borderStyle lo computa con
  // alpha animada según el pulse.
  const urgentSolid = theme.isDark ? '#F2A78C' : '#B84014'
  const urgentBgRgba = theme.isDark
    ? 'rgba(242,167,140,0.10)'
    : 'rgba(184,64,20,0.06)'

  const bg = urgent
    ? urgentBgRgba
    : theme.isDark
      ? 'rgba(255,255,255,0.035)'
      : 'rgba(15,42,30,0.035)'

  // Border pulse (solo urgent) — opacity oscila para que el ticket
  // "respire" pidiendo atención. ReduceMotion-aware.
  const pulse = useSharedValue(0)
  useEffect(() => {
    if (!urgent || reduced) {
      cancelAnimation(pulse)
      pulse.value = 0
      return
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: motionEasings.warm }),
      -1,
      true, // reverse = breath-like
    )
    return () => cancelAnimation(pulse)
  }, [urgent, reduced, pulse])

  const borderStyle = useAnimatedStyle(() => {
    if (!urgent) {
      return { borderColor: theme.colors.line }
    }
    // Border opacity oscila 0.45 → 0.85 (light) o 0.45 → 0.95 (dark)
    const minA = 0.45
    const maxA = theme.isDark ? 0.95 : 0.85
    const a = minA + pulse.value * (maxA - minA)
    return {
      borderColor: theme.isDark
        ? `rgba(242,167,140,${a})`
        : `rgba(184,64,20,${a})`,
    }
  })

  const catColor = category?.color ?? theme.colors.peach

  return (
    <Animated.View
      style={[
        styles.ticket,
        { backgroundColor: bg },
        borderStyle,
      ]}
    >
      {/* Timing block (left) */}
      <View style={styles.ticketTimingBlock}>
        {timing.lead ? (
          <Text
            style={[
              styles.ticketTimingLead,
              { color: urgent ? urgentSolid : theme.colors.textMuted },
            ]}
          >
            {timing.lead}
          </Text>
        ) : null}
        <Text
          style={[
            styles.ticketTimingMain,
            {
              color: urgent ? urgentSolid : theme.colors.text,
              // HOY / MAÑANA son strings — los reducimos un poco para
              // que no rompan el ancho.
              fontSize: timing.lead === '' ? 16 : 24,
            },
          ]}
          numberOfLines={1}
        >
          {timing.main}
        </Text>
        {timing.tail ? (
          <Text
            style={[
              styles.ticketTimingTail,
              { color: urgent ? urgentSolid : theme.colors.textMuted },
            ]}
          >
            {timing.tail}
          </Text>
        ) : null}
      </View>

      {/* Divider vertical entre blocks */}
      <View style={[styles.ticketDivider, { backgroundColor: theme.colors.line }]} />

      {/* Info block (right) */}
      <View style={styles.ticketInfoBlock}>
        <View style={styles.ticketNameRow}>
          <View style={[styles.categoryDot, { backgroundColor: catColor }]} />
          <Text
            style={[styles.ticketName, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
        </View>
        <Text style={[styles.ticketAmount, { color: theme.colors.text }]}>
          {formatMoney(item.amount)}
        </Text>
      </View>
    </Animated.View>
  )
}

// UpcomingRow (v1 — lista vertical de 3 rows con fade-in stagger)
// fue removida 2026-05-31 cuando el upcoming list pasó al marquee
// horizontal (`UpcomingMarquee` arriba). Mantengo el comentario
// ancla por si alguien busca el cambio.

function HikeAlertRow({
  hike,
  delay,
  onPress,
  onDismiss,
}: {
  hike: FijoHikeAlert
  delay: number
  onPress?: () => void
  onDismiss?: () => void
}) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const opacity = useSharedValue(reduced ? 1 : 0)
  const y = useSharedValue(reduced ? 0 : 6)
  const press = usePressScale({ pressedScale: 0.98 })
  const dismissPress = usePressScale({ pressedScale: 0.92 })

  useEffect(() => {
    if (reduced) return
    opacity.value = withDelay(delay, withTiming(1, { duration: 280, easing: ENTER }))
    y.value = withDelay(delay, withTiming(0, { duration: 280, easing: ENTER }))
    return () => {
      cancelAnimation(opacity)
      cancelAnimation(y)
    }
  }, [delay, reduced, opacity, y])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }))

  const urgencyColor = theme.isDark ? '#F2A78C' : '#B84014'
  const urgencyBg = theme.isDark
    ? 'rgba(242,167,140,0.12)'
    : 'rgba(184,64,20,0.06)'
  const urgencyBorder = theme.isDark
    ? 'rgba(242,167,140,0.45)'
    : 'rgba(184,64,20,0.35)'

  return (
    <Animated.View style={[styles.alertRow, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`${hike.name} subió ${hike.deltaPct}%`}
        style={styles.alertPressable}
      >
        <Animated.View style={[styles.alertContent, press.animatedStyle]}>
          <View
            style={[
              styles.alertIcon,
              { backgroundColor: urgencyBg, borderColor: urgencyBorder },
            ]}
          >
            <MaterialIcons name="trending-up" size={11} color={urgencyColor} />
          </View>
          <Text
            style={[styles.alertText, { color: theme.colors.text }]}
            numberOfLines={2}
          >
            <Text style={[styles.alertName, { color: urgencyColor }]}>
              {hike.name}
            </Text>{' '}
            +{hike.deltaPct}% · {formatMoney(hike.previousPrice)} →{' '}
            {formatMoney(hike.currentPrice)}
          </Text>
        </Animated.View>
      </Pressable>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          onPressIn={dismissPress.onPressIn}
          onPressOut={dismissPress.onPressOut}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Ya lo vi"
        >
          <Animated.View style={[styles.dismissBtn, dismissPress.animatedStyle]}>
            <MaterialIcons name="check" size={13} color={theme.colors.textMuted} />
          </Animated.View>
        </Pressable>
      ) : null}
    </Animated.View>
  )
}

function SignalRow({
  signal,
  delay,
  onPress,
}: {
  signal: ControlAdvisorTask
  delay: number
  onPress?: () => void
}) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const opacity = useSharedValue(reduced ? 1 : 0)
  const y = useSharedValue(reduced ? 0 : 6)
  const press = usePressScale({ pressedScale: 0.98 })

  useEffect(() => {
    if (reduced) return
    opacity.value = withDelay(delay, withTiming(1, { duration: 280, easing: ENTER }))
    y.value = withDelay(delay, withTiming(0, { duration: 280, easing: ENTER }))
    return () => {
      cancelAnimation(opacity)
      cancelAnimation(y)
    }
  }, [delay, reduced, opacity, y])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }))

  const accent =
    signal.urgency === 'alta'
      ? theme.isDark
        ? '#FFB59E'
        : '#8E2A0C'
      : theme.isDark
        ? '#F2A78C'
        : '#B84014'
  const bg = theme.isDark
    ? 'rgba(242,167,140,0.12)'
    : 'rgba(184,64,20,0.06)'
  const border = theme.isDark
    ? 'rgba(242,167,140,0.45)'
    : 'rgba(184,64,20,0.35)'

  const icon: 'event-busy' | 'pie-chart' =
    signal.id === 'stress-week' ? 'event-busy' : 'pie-chart'

  return (
    <Animated.View style={[styles.alertRow, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={signal.title}
        style={styles.alertPressable}
      >
        <Animated.View style={[styles.alertContent, press.animatedStyle]}>
          <View
            style={[
              styles.alertIcon,
              { backgroundColor: bg, borderColor: border },
            ]}
          >
            <MaterialIcons name={icon} size={11} color={accent} />
          </View>
          <Text
            style={[styles.alertText, { color: theme.colors.text }]}
            numberOfLines={2}
          >
            <Text style={[styles.alertName, { color: accent }]}>
              {signal.title}
            </Text>
            {' · '}
            {signal.body.split('.')[0]}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

function RuleScale({ color, delay }: { color: string; delay: number }) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    scale.value = withDelay(delay, withTiming(1, { duration: 460, easing: ENTER }))
    opacity.value = withDelay(delay, withTiming(1, { duration: 280, easing: ENTER }))
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

// Helper exportado para que el screen pueda pickear el icono cuando lo
// necesite — mantiene la simetría con `pickIconForFixedExpenseCategory`.
export { pickIconForFixedExpenseCategory }

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  headerCount: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rule: {
    width: 24,
    height: 2,
    marginTop: 8,
    marginBottom: 10,
    opacity: 0.55,
  },
  emptyCard: { opacity: 0.86 },
  phBar: { borderRadius: 5 },
  // ── Header dot urgente ──────────────────────────────────────────
  // 7pt dot al lado del eyebrow que pulsa cuando hay items ≤2d. Solo
  // se renderea condicionalmente desde el card (no siempre).
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  urgentHeaderDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  // ── Marquee premium ─────────────────────────────────────────────
  // Container con overflow hidden para clipear items que salen por los
  // bordes. marginHorizontal:-16 hace que el marquee toque los bordes
  // del card (cancela el padding del card), el paddingHorizontal:16
  // del row restaura el espacio para que items entren alineados.
  // Las edge fade gradients viven absolute encima del marquee para
  // que items se desvanecen entrando/saliendo.
  marqueeContainer: {
    marginTop: 6,
    marginHorizontal: -16,
    overflow: 'hidden',
    position: 'relative',
  },
  marqueeRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    alignItems: 'stretch',
  },
  marqueeStaticRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    alignItems: 'stretch',
  },
  // Edge fade gradients — 32pt de ancho a cada lado. Color sólido del
  // card → transparente. Hacen que los items aparezcan "emergiendo"
  // por la derecha y "desvaneciéndose" por la izquierda en vez de
  // cortarse hard contra el border del card.
  fadeLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 32,
    zIndex: 1,
  },
  fadeRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 32,
    zIndex: 1,
  },
  // ── Ticket (item del marquee) ───────────────────────────────────
  // Layout horizontal: timing block (left) + divider + info block (right).
  // 180pt fijo para uniformidad de velocidad del marquee.
  ticket: {
    width: 180,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
  },
  // Timing block: pequeño bloque vertical a la izquierda. "EN" (small)
  // sobre número grande (tipo "5") sobre "días" (small). Visual anchor.
  ticketTimingBlock: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    minWidth: 44,
  },
  ticketTimingLead: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    lineHeight: 11,
  },
  ticketTimingMain: {
    fontWeight: '900',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
    // fontSize se inyecta inline según si es número grande (24) o
    // texto corto tipo HOY/MAÑANA (16).
    lineHeight: 26,
  },
  ticketTimingTail: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    lineHeight: 11,
  },
  // Divider vertical entre timing block e info block. 1pt theme.line.
  ticketDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    opacity: 0.5,
  },
  ticketInfoBlock: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  ticketNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ticketName: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  ticketAmount: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  upcomingList: { gap: 0 },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  upcomingLeft: { flex: 1, gap: 3 },
  upcomingLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  upcomingNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  upcomingName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  upcomingAmount: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
    marginLeft: 12,
  },
  rowDivider: {
    height: 1,
    opacity: 0.32,
  },
  calmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  calmText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  // AVISOS sub-section
  alertsBreak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 6,
  },
  alertsLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  alertsLine: {
    flex: 1,
    height: 1,
    opacity: 0.5,
  },
  alertsList: { gap: 4 },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  alertPressable: {
    flex: 1,
  },
  alertContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  alertIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginTop: 1,
  },
  alertText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '500',
  },
  alertName: {
    fontWeight: '800',
  },
  dismissBtn: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
})
