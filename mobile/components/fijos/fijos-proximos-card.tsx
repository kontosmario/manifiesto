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

  // ── Empty / preview mode ─────────────────────────────────────────
  // Mismo card frame (header PRÓXIMOS A PAGAR + RuleScale) con filas
  // placeholder: cada fila conserva el layout real (label de día · dot
  // de categoría · nombre · monto) pero con dashes neutros. Sin ítems
  // inventados. Renderea después de los hooks.
  if (empty) {
    return <FijosProximosCardEmpty />
  }

  if (!hasUpcoming && !hasAlerts) return null

  return (
    <RiseView delay={80}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.isDark
              ? theme.colors.surfaceMuted
              : theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            PRÓXIMOS A PAGAR
          </Text>
          {hasUpcoming ? (
            <Text style={[styles.headerCount, { color: theme.colors.textMuted }]}>
              {upcoming.length} {upcoming.length === 1 ? 'ítem' : 'ítems'}
            </Text>
          ) : null}
        </View>
        <RuleScale color={theme.colors.text} delay={60} />

        {/* Upcoming MARQUEE — banner horizontal con auto-scroll de
            derecha → izquierda. Antes era una lista vertical de 3 rows
            (alta y repetitiva); ahora es una sola fila ticker-style
            que muestra TODOS los upcoming items uno tras otro,
            ahorrando ~120pt verticales en la card. */}
        {hasUpcoming ? (
          <UpcomingMarquee
            items={upcoming}
            categoriesById={categoriesById}
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
 * Marquee horizontal de "próximos a pagar". Items se renderean DUPLICADOS
 * dentro de un Animated.View que slidea de derecha → izquierda. Cuando
 * el primer set sale de pantalla, el segundo set ocupa exactamente la
 * posición original → loop seamless sin "jump".
 *
 * Speed: 30 px/seg — read-speed natural para ticker, no marea ni
 * obliga a esforzarse para leer.
 * Easing: Linear (no acceleration/deceleration — un ticker debe sentir
 * velocidad CONSTANTE, no orgánica).
 * ReduceMotion: skip animación, render ScrollView horizontal estático
 * para que el user pueda scrollear manualmente.
 * Performance: animación corre en UI thread (Reanimated v3 worklets),
 * 0 impacto en JS thread.
 */
function UpcomingMarquee({
  items,
  categoriesById,
}: {
  items: FijoItem[]
  categoriesById?: Map<string, { id: string; name: string; color: string }>
}) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const translateX = useSharedValue(0)
  const [setWidth, setSetWidth] = useState(0)

  const onLayoutRow = (e: LayoutChangeEvent) => {
    // El row contiene 2 sets duplicados. setWidth = ancho de UN set
    // (la mitad del total). Cuando translateX = -setWidth, el segundo
    // set queda exactamente en la posición inicial del primero.
    const full = e.nativeEvent.layout.width
    if (full > 0 && full / 2 !== setWidth) {
      setSetWidth(full / 2)
    }
  }

  useEffect(() => {
    if (setWidth === 0 || reduced) return
    // 30 px/seg → duration en ms = setWidth / 30 * 1000.
    // Ej: setWidth 600pt → 20s por loop completo.
    const SPEED_PX_PER_SEC = 30
    const duration = (setWidth / SPEED_PX_PER_SEC) * 1000
    translateX.value = 0
    translateX.value = withRepeat(
      withTiming(-setWidth, { duration, easing: Easing.linear }),
      -1, // infinite
      false, // no reverse — el loop reset a 0 al completar (seamless por la duplicación)
    )
    return () => cancelAnimation(translateX)
  }, [setWidth, reduced, translateX])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  // ReduceMotion: fallback a ScrollView horizontal estático. El user
  // puede scrollear manualmente para ver todos los items.
  if (reduced) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.marqueeStaticRow}
      >
        {items.map((item) => (
          <MarqueeItem
            key={item.id}
            item={item}
            category={
              item.category_id ? categoriesById?.get(item.category_id) : undefined
            }
            theme={theme}
          />
        ))}
      </ScrollView>
    )
  }

  return (
    <View style={styles.marqueeContainer}>
      <Animated.View
        style={[styles.marqueeRow, animStyle]}
        onLayout={onLayoutRow}
      >
        {/* Set 1 + set 2 duplicado — necesario para el loop seamless */}
        {items.map((item) => (
          <MarqueeItem
            key={`a-${item.id}`}
            item={item}
            category={
              item.category_id ? categoriesById?.get(item.category_id) : undefined
            }
            theme={theme}
          />
        ))}
        {items.map((item) => (
          <MarqueeItem
            key={`b-${item.id}`}
            item={item}
            category={
              item.category_id ? categoriesById?.get(item.category_id) : undefined
            }
            theme={theme}
          />
        ))}
      </Animated.View>
    </View>
  )
}

/**
 * Item individual del marquee. Compacto: label de timing arriba (HOY /
 * MAÑANA / EN 5D, urgente en peach) + categoryDot · nombre + amount.
 * Width fijo (auto-hug content) para que la velocidad sea uniforme.
 */
function MarqueeItem({
  item,
  category,
  theme,
}: {
  item: FijoItem
  category?: { id: string; name: string; color: string }
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  const diffDays = Math.max(0, item.daysUntilDue)
  const urgent = diffDays <= 2
  const label = diffDays === 0 ? 'HOY' : diffDays === 1 ? 'MAÑANA' : `EN ${diffDays}D`
  const labelColor = urgent
    ? theme.isDark
      ? '#F2A78C'
      : '#B84014'
    : theme.colors.textMuted
  const catColor = category?.color ?? theme.colors.peach

  return (
    <View
      style={[
        styles.marqueeItem,
        {
          backgroundColor: theme.isDark
            ? 'rgba(255,255,255,0.04)'
            : 'rgba(15,42,30,0.04)',
          borderColor: theme.colors.line,
        },
      ]}
    >
      <Text style={[styles.marqueeLabel, { color: labelColor }]}>{label}</Text>
      <View style={styles.marqueeNameRow}>
        <View style={[styles.categoryDot, { backgroundColor: catColor }]} />
        <Text
          style={[styles.marqueeName, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
      </View>
      <Text style={[styles.marqueeAmount, { color: theme.colors.text }]}>
        {formatMoney(item.amount)}
      </Text>
    </View>
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
  // ── Marquee de upcoming ─────────────────────────────────────────
  // Container: overflow hidden recorta los items que salen por los
  // bordes del card. Sin esto, los items duplicados serían visibles
  // afuera del card durante la animación.
  marqueeContainer: {
    marginTop: 4,
    marginHorizontal: -16, // negativo para que el marquee toque los bordes del card
    overflow: 'hidden',
  },
  marqueeRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16, // restore padding interno
  },
  // Fallback estático para reduceMotion: igual layout que el animado.
  marqueeStaticRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  marqueeItem: {
    minWidth: 160,
    maxWidth: 220,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 3,
  },
  marqueeLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  marqueeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  marqueeName: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  marqueeAmount: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
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
