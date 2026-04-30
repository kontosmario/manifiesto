import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native'
import { useRouter } from 'expo-router'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Line } from 'react-native-svg'

// Explicit absolute-fill style — SVG props don't accept the
// `AbsoluteFillStyle` type returned by `StyleSheet.absoluteFillObject`,
// so we pass an inline object that matches the same intent.
const SVG_FILL = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
}
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { motionDurations } from '@/lib/motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { formatMoneyShort } from '@/utils/money'
import { useAdvisorNotificationSync } from '@/features/insights/use-advisor-notification-sync'
import { useControlActionDispatcher } from '@/features/insights/use-control-action-dispatcher'
import { useBlockSignalFamily } from '@/features/insights/use-signal-blocklist'
import { signalFamilyOf } from '@/features/insights/signal-family'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import {
  dismissCard,
  useDismissedIds,
} from '@/features/insights/control-dismiss-store'
import {
  TYPE_TONES,
  bubbleHeadline,
  bubbleIntro,
  bubbleType,
  confidenceDots,
  confidenceLabel,
  impactChipLabel,
  type BubbleType,
} from '@/components/control-v2/asesor-bubble-meta'
import { iconForSignal } from '@/components/control-v2/asesor-signal-meta'
import { ForecastSparkline } from '@/components/control-v2/forecast-sparkline'
import { TrustReceiptStrip } from '@/components/control-v2/trust-receipt-strip'
import { useAdvisorValueSummary } from '@/features/insights/use-advisor-value-summary'
import { getActionMeta, resolveCtaLabel } from '@/components/control-v2/asesor-action-meta'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import type { ControlSectionAnchor } from '@/features/insights/control-action'
import { ControlAnchorsContext } from '@/features/insights/control-section-anchors'

interface AsistenteScreenProps {
  familyId: string
  userId: string
}

const SHELL_GRADIENT = ['#0F2A1E', '#143B2A', '#0A1410'] as const
const STAR_COLOR = '#C7EE9C'
const ASSISTANT_GRADIENT = ['#C7EE9C', '#2E9A5F'] as const
const STATUS_DOT = '#6FE09A'
const TEXT_PRIMARY = '#F6FBEF'
const TEXT_ACCENT = '#C7EE9C'
const TEXT_SECONDARY = 'rgba(246,251,239,0.70)'
const TEXT_TERTIARY = 'rgba(199,238,156,0.55)'
const TEXT_MUTED = 'rgba(246,251,239,0.45)'
const COUNT_PILL_BG = 'rgba(199,238,156,0.14)'
const COUNT_PILL_BORDER = 'rgba(199,238,156,0.20)'
const STRIP_BG = 'rgba(0,0,0,0.25)'
const STRIP_BORDER = 'rgba(199,238,156,0.12)'

/**
 * Asistente Financiero — full conversation screen.
 *
 * Renders all visible signals as chat bubbles, with a constellation
 * strip header that maps the cycle at a glance. Tapping a star
 * scrolls to its message; tapping a bubble's CTA fires the dispatcher
 * (navigate / open-fixed / contribute / dismiss / etc.); tapping
 * "Visto" calls the dismiss store with a 7-day TTL.
 *
 * All backend wiring (signals, dispatch, dismiss) is shared with the
 * compact home card so dismissing here also clears the teaser.
 */
export function AsistenteScreen({ familyId, userId }: AsistenteScreenProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { signals, data, forecast } = useControlV2Data(familyId, userId)
  const valueSummaryQuery = useAdvisorValueSummary(userId, familyId)
  const dismissed = useDismissedIds()
  const [expanded, setExpanded] = useState(false)

  // Pipe high-confidence signals into push notifications. The hook is
  // device-deduplicated with an 18h cooldown per signal id, so it's
  // safe to mount in both Control v2 AND the Asistente screen — only
  // one will actually write per cooldown window. This guarantees the
  // sync runs even for users who land directly on the chat (push
  // deep-link, future home shortcut) without ever opening Control.
  useAdvisorNotificationSync({ signals, familyId, userId })

  // Anchors context required by the dispatcher's `scroll-to-section`
  // action kind. From this screen we don't have section anchors, so
  // we wire a controller that navigates back to the Control tab and
  // forwards the section param — Control v2 screen reads it on focus
  // and performs the scroll+pulse there.
  const anchorsController = useMemo(
    () => ({
      scrollRef: { current: null },
      registerOffset: () => {},
      scrollToSection: (section: ControlSectionAnchor) => {
        router.push({
          pathname: '/(app)/(tabs)/insights',
          params: { section },
        } as never)
      },
      pulsingSection: null,
    }),
    [router],
  )
  const dispatch = useControlActionDispatcher({ familyId, userId })

  const visible = signals.filter(
    (t) => !dismissed.has(dismissKeyFor(t)),
  )
  const totalImpact = visible.reduce((s, t) => s + t.impactRaw, 0)

  const scrollRef = useRef<ScrollView | null>(null)
  const offsetsRef = useRef<Record<string, number>>({})
  const pendingScrollIdRef = useRef<string | null>(null)
  const [active, setActive] = useState(0)

  const tryScrollToId = useCallback((id: string): boolean => {
    const y = offsetsRef.current[id]
    if (y == null) return false
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true })
    return true
  }, [])

  const onMessageLayout = useCallback(
    (id: string) => (e: LayoutChangeEvent) => {
      offsetsRef.current[id] = e.nativeEvent.layout.y
      // If the user tapped a star while this message was still
      // mounting, flush the pending scroll now that we know its y.
      if (pendingScrollIdRef.current === id) {
        pendingScrollIdRef.current = null
        tryScrollToId(id)
      }
    },
    [tryScrollToId],
  )

  const handleStarTap = useCallback(
    (i: number) => {
      void triggerHaptic('selection')
      setActive(i)
      const target = visible[i]
      if (!target) return
      if (!tryScrollToId(target.id)) {
        // Layout not ready yet — queue and let onMessageLayout flush.
        pendingScrollIdRef.current = target.id
      }
    },
    [visible, tryScrollToId],
  )

  const handleDismiss = useCallback((task: ControlAdvisorTask) => {
    void triggerHaptic('success')
    dismissCard(dismissKeyFor(task))
  }, [])

  const blockMutation = useBlockSignalFamily()
  const handleLongPress = useCallback(
    (task: ControlAdvisorTask) => {
      void triggerHaptic('selection')
      const family = signalFamilyOf(task.id)
      Alert.alert(
        task.title,
        '¿Qué querés hacer con esta sugerencia?',
        [
          {
            text: '¿Por qué veo esto?',
            onPress: () => {
              Alert.alert(
                '¿Por qué veo esto?',
                task.dummyExplanation ??
                  'Esta sugerencia se basa en patrones detectados en tus gastos del ciclo. La acción del CTA es la palanca más directa para mover el número.',
              )
            },
          },
          {
            text: 'No mostrar más esta familia',
            style: 'destructive',
            onPress: () => {
              if (!userId) return
              blockMutation.mutate(
                { userId, signalId: task.id },
                {
                  onSuccess: () => {
                    void triggerHaptic('success')
                    Alert.alert(
                      'Listo',
                      `No vas a ver más señales de tipo "${family}" hasta que las desbloquees desde Ajustes.`,
                    )
                  },
                  onError: () => {
                    void triggerHaptic('error')
                    Alert.alert(
                      'No pudimos guardar',
                      'Probá de nuevo en unos segundos.',
                    )
                  },
                },
              )
            },
          },
          { text: 'Cancelar', style: 'cancel' },
        ],
        { cancelable: true },
      )
    },
    [userId, blockMutation],
  )

  const handleAction = useCallback(
    (task: ControlAdvisorTask) => {
      // The dispatcher fires its own haptic for `dismiss` and
      // `quick-savings-contribution` (after async confirmation). For
      // other action kinds the dispatcher is silent, so we fire the
      // wrapper haptic. This avoids the double-buzz the reviewer
      // flagged on dismiss/contribution.
      const meta = getActionMeta(task.action)
      const dispatcherFiresHaptic =
        task.action?.kind === 'dismiss' ||
        task.action?.kind === 'quick-savings-contribution'
      if (!dispatcherFiresHaptic) void triggerHaptic(meta.haptic)
      if (task.action) {
        dispatch(task.action, {
          taskId: task.id,
          surface: 'asistente_screen',
          taskContext: {
            urgency: task.urgency,
            confidence: task.confidence,
            impactRaw: task.impactRaw,
            cat: task.cat,
          },
        })
      }
    },
    [dispatch],
  )

  return (
    <ControlAnchorsContext.Provider value={anchorsController}>
      <LinearGradient
        colors={SHELL_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.root}
      >
        <TwinklingStars count={18} />

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            // iOS modal already inset by the system; Android card needs
            // the regular safe area top.
            paddingTop:
              Platform.OS === 'ios' ? 6 : insets.top + 6,
            paddingBottom: insets.bottom + 24,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grabHandleArea} pointerEvents="none">
            <View style={styles.grabHandle} />
          </View>
          <TopBar count={visible.length} totalImpact={totalImpact} />

          {forecast && visible.length > 0 ? (
            <ForecastStrip forecast={forecast} />
          ) : null}

          {visible.length > 0 ? (
            <ConstellationHeader
              signals={visible}
              active={active}
              onTap={handleStarTap}
              expanded={expanded}
              setExpanded={setExpanded}
              diaActual={data.diaActual}
              diasMes={data.diasMes}
            />
          ) : null}

          {valueSummaryQuery.data ? (
            <TrustReceiptStrip summary={valueSummaryQuery.data} />
          ) : null}

          <View style={styles.chatBody}>
            {visible.length === 0 ? (
              <EmptyState />
            ) : (
              visible.map((task, i) => (
                <Animated.View
                  key={task.id}
                  layout={LinearTransition.duration(220)}
                  entering={FadeIn.duration(280).delay(80 * i)}
                  exiting={FadeOut.duration(140)}
                  onLayout={onMessageLayout(task.id)}
                >
                  <ChatMessage
                    task={task}
                    isActive={i === active}
                    onPressBubble={() => setActive(i)}
                    onLongPressBubble={() => handleLongPress(task)}
                    onAction={() => handleAction(task)}
                    onDismiss={() => handleDismiss(task)}
                  />
                </Animated.View>
              ))
            )}

          </View>
        </ScrollView>
      </LinearGradient>
    </ControlAnchorsContext.Provider>
  )
}

function dismissKeyFor(task: ControlAdvisorTask): string {
  return task.action?.kind === 'dismiss' ? task.action.dismissId : task.id
}

// ─── Top Bar ──────────────────────────────────────────────────────────────

function TopBar({
  count,
  totalImpact,
}: {
  count: number
  totalImpact: number
}) {
  // No close button — the screen is a bottom sheet and dismisses with
  // the system swipe-down gesture (the grab handle above telegraphs
  // it). Layout: avatar on the left, identity column on the right.
  // The identity column has title + impact pill on top row and the
  // status line on a second row, so the status gets the full width.
  return (
    <View style={styles.topBar}>
      <View style={styles.identityAvatarWrap}>
        <LinearGradient
          colors={ASSISTANT_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.identityAvatar}
        >
          <MaterialIcons name="auto-awesome" size={22} color="#0F2A1E" />
        </LinearGradient>
        <PulseDot size={12} />
      </View>
      <View style={styles.identityText}>
        <View style={styles.identityTopRow}>
          <Text style={styles.identityTitle} numberOfLines={1}>
            Asistente
          </Text>
          {totalImpact > 0 ? (
            <View style={styles.totalPill}>
              <Text style={styles.totalPillText}>
                +{formatMoneyShort(totalImpact)}/mes
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.identityStatusText} numberOfLines={1}>
          {count > 0
            ? `Mirando tus números · ${count} ${count === 1 ? 'cosa' : 'cosas'} para vos`
            : 'Al día por ahora'}
        </Text>
      </View>
    </View>
  )
}

function PulseDot({ size }: { size: number }) {
  const reduced = useReducedMotion()
  const pulse = useSharedValue(0)
  useLoopAnimation(
    () => {
      if (reduced) return
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 1200, easing: Easing.out(Easing.quad) }),
        ),
        -1,
        false,
      )
    },
    [pulse],
    [reduced],
  )
  const aRing = useAnimatedStyle(() => ({
    opacity: 0.55 - pulse.value * 0.55,
    transform: [{ scale: 1 + pulse.value * 0.6 }],
  }))
  return (
    <>
      <View
        style={[
          styles.pulseDot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulseDotRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          aRing,
        ]}
      />
    </>
  )
}

// ─── Forecast strip ───────────────────────────────────────────────────────

function ForecastStrip({ forecast }: { forecast: NonNullable<ReturnType<typeof useControlV2Data>['forecast']> }) {
  const { width: windowWidth } = useWindowDimensions()
  const inflectionCount = forecast.inflectionDays.length
  // The chart consumes the full content width minus the strip's
  // horizontal padding (16 each side).
  const chartWidth = Math.max(160, windowWidth - 32 - 16)
  return (
    <View style={styles.forecastStrip}>
      <View style={styles.forecastHeaderRow}>
        <Text style={styles.forecastEyebrow}>Próximos 7 días</Text>
        {inflectionCount > 0 ? (
          <View style={styles.forecastChip}>
            <Text style={styles.forecastChipText}>
              {inflectionCount} {inflectionCount === 1 ? 'evento' : 'eventos'}
            </Text>
          </View>
        ) : null}
      </View>
      <ForecastSparkline forecast={forecast} width={chartWidth} />
      <Text style={styles.forecastFootnote}>
        {`Proyección base: ${formatMoneyShort(forecast.baseline.totalProjected)} en la semana`}
      </Text>
    </View>
  )
}

// ─── Constellation Header ─────────────────────────────────────────────────

// Fixed slot positions for the constellation. Signals are placed in
// score order — the highest-priority one anchors the center.
const CONSTELLATION_SLOTS: Array<{ x: number; y: number; r: number }> = [
  { x: 50, y: 48, r: 40 }, // center
  { x: 18, y: 28, r: 28 }, // NW
  { x: 80, y: 26, r: 34 }, // NE
  { x: 78, y: 72, r: 24 }, // SE
  { x: 22, y: 76, r: 20 }, // SW
]

// Connection lines between constellation nodes (by index pairs).
const CONSTELLATION_EDGES: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [1, 2],
  [2, 3],
]

function ConstellationHeader({
  signals,
  active,
  onTap,
  expanded,
  setExpanded,
  diaActual,
  diasMes,
}: {
  signals: ControlAdvisorTask[]
  active: number
  onTap: (i: number) => void
  expanded: boolean
  setExpanded: (v: boolean) => void
  diaActual: number
  diasMes: number
}) {
  return (
    <View style={styles.mapWrap}>
      <View style={styles.mapHeader}>
        <View style={styles.mapHeaderLeft}>
          <Text style={styles.mapEyebrow}>MAPA DEL CICLO</Text>
          <Text style={styles.mapDay}>
            · día {diaActual} / {diasMes}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            void triggerHaptic('selection')
            setExpanded(!expanded)
          }}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Contraer mapa' : 'Expandir mapa'}
          accessibilityState={{ expanded }}
          style={styles.toggleExpand}
          hitSlop={8}
        >
          <MaterialIcons
            name={expanded ? 'close-fullscreen' : 'open-in-full'}
            size={14}
            color={TEXT_TERTIARY}
          />
        </Pressable>
      </View>

      <AnimatedBoard expanded={expanded}>
        <ConstellationBoard
          signals={signals}
          active={active}
          onTap={onTap}
          expanded={expanded}
        />
      </AnimatedBoard>

      <View style={styles.legendRow}>
        <View style={styles.legendChips}>
          {(
            [
              { type: 'critical' as BubbleType, label: 'urgente' },
              { type: 'warning' as BubbleType, label: 'aviso' },
              { type: 'positive' as BubbleType, label: 'a favor' },
            ]
          ).map((l) => {
            const tone = TYPE_TONES[l.type]
            const count = signals.filter((s) => bubbleType(s) === l.type)
              .length
            if (count === 0) return null
            return (
              <View key={l.type} style={styles.legendChip}>
                <View
                  style={[styles.legendDot, { backgroundColor: tone.accent }]}
                />
                <Text style={styles.legendText}>
                  {count} {l.label}
                </Text>
              </View>
            )
          })}
        </View>
        <Text style={styles.legendHint}>Tocá un punto</Text>
      </View>
    </View>
  )
}

// ─── Animated Board container ─────────────────────────────────────────────

function AnimatedBoard({
  expanded,
  children,
}: {
  expanded: boolean
  children: React.ReactNode
}) {
  // Smoothly animate the board's height between collapsed (140) and
  // expanded (240). Padding also relaxes when expanded so 1.6×-scaled
  // nodes near the corners stay inside the rounded frame and the
  // delta labels below the bottom row don't get clipped.
  //
  // Note on the anti-pattern: animating `height`/`padding` triggers a
  // layout pass per frame. We accept the cost here because (a) it's
  // a one-shot 320ms toggle, not a per-frame gesture, and (b) the
  // child constellation nodes scale 1.6× independently — using
  // `transform: scaleY` on the container would double-scale them. We
  // mitigate by canceling in-flight tweens on unmount.
  const reduced = useReducedMotion()
  const h = useSharedValue(expanded ? 240 : 140)
  const p = useSharedValue(expanded ? 12 : 0)
  useEffect(() => {
    const cfg = {
      duration: reduced ? 0 : motionDurations.deliberate,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    }
    h.value = withTiming(expanded ? 240 : 140, cfg)
    p.value = withTiming(expanded ? 12 : 0, cfg)
  }, [expanded, reduced, h, p])
  useEffect(() => {
    return () => {
      cancelAnimation(h)
      cancelAnimation(p)
    }
  }, [h, p])
  const a = useAnimatedStyle(() => ({
    height: h.value,
    paddingHorizontal: p.value,
    paddingVertical: p.value,
  }))
  return (
    <Animated.View
      style={[
        styles.board,
        { backgroundColor: 'rgba(46,154,95,0.06)' },
        a,
      ]}
    >
      {children}
    </Animated.View>
  )
}

// ─── Constellation Board (Mapa) ───────────────────────────────────────────

function ConstellationBoard({
  signals,
  active,
  onTap,
  expanded,
}: {
  signals: ControlAdvisorTask[]
  active: number
  onTap: (i: number) => void
  expanded: boolean
}) {
  // Place up to 5 signals into the fixed slots. With <5, we leave the
  // unused slots empty rather than crowding the center.
  const placed = signals
    .slice(0, CONSTELLATION_SLOTS.length)
    .map((sig, i) => ({ ...CONSTELLATION_SLOTS[i]!, sig, index: i }))

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {/* Connection lines via SVG (viewBox 100×100 stretches to fill) */}
      <Svg
        style={[SVG_FILL]}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        pointerEvents="none"
      >
        {CONSTELLATION_EDGES.map(([a, b], i) => {
          const A = placed[a]
          const B = placed[b]
          if (!A || !B) return null
          const isActiveEdge = active === a || active === b
          return (
            <Line
              key={i}
              x1={A.x}
              y1={A.y}
              x2={B.x}
              y2={B.y}
              stroke={
                isActiveEdge
                  ? 'rgba(199,238,156,0.55)'
                  : 'rgba(199,238,156,0.18)'
              }
              strokeWidth={0.18}
              strokeDasharray="0.6 0.6"
            />
          )
        })}
      </Svg>

      {/* Nodes positioned absolutely by % */}
      {placed.map((n) => (
        <ConstellationNode
          key={n.sig.id}
          slot={n}
          isActive={active === n.index}
          expanded={expanded}
          onPress={() => onTap(n.index)}
        />
      ))}
    </View>
  )
}

function ConstellationNode({
  slot,
  isActive,
  expanded,
  onPress,
}: {
  slot: { x: number; y: number; r: number; sig: ControlAdvisorTask; index: number }
  isActive: boolean
  expanded: boolean
  onPress: () => void
}) {
  const { sig } = slot
  const type = bubbleType(sig)
  const tone = TYPE_TONES[type]
  const isCritical = sig.urgency === 'alta'
  // Layout box stays at the base diameter so the wrapper anchor never
  // shifts when the node grows visually (mirrors the web design's
  // `transform: translate(-50%, -50%)` which is independent of size).
  const baseR = slot.r
  const icon = iconForSignal(sig.id)
  const reduced = useReducedMotion()

  // Smooth grow on expand — apply via `transform: scale()` so the node
  // tile + its icon scale together without changing layout. The
  // wrapper width/height stay at baseR.
  const scale = useSharedValue(expanded ? 1.6 : 1)
  useEffect(() => {
    scale.value = withTiming(expanded ? 1.6 : 1, {
      duration: reduced ? 0 : 320,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    })
  }, [expanded, reduced, scale])
  const aTile = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  // Pulse ring for critical nodes (skipped under reduced-motion).
  const ring = useSharedValue(0)
  useLoopAnimation(
    () => {
      if (reduced || !isCritical) return
      ring.value = withDelay(
        slot.index * 200,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 2000, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: 0 }),
          ),
          -1,
          false,
        ),
      )
    },
    [ring],
    [reduced, isCritical, slot.index],
  )
  const aRing = useAnimatedStyle(() => ({
    opacity: 0.55 - ring.value * 0.55,
    transform: [{ scale: 1 + ring.value * 0.5 }],
  }))

  // Render the node centered at slot.x/y. The anchor (-baseR/2 on both
  // axes) is fixed because the wrapper itself is baseR×baseR — the
  // visual scale of children doesn't move it.
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.nodeAbs,
        {
          left: `${slot.x}%`,
          top: `${slot.y}%`,
          width: baseR,
          height: baseR,
          marginLeft: -baseR / 2,
          marginTop: -baseR / 2,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={sig.title}
        accessibilityState={{ selected: isActive }}
        style={styles.nodeWrap}
      >
        <Animated.View style={aTile}>
          <LinearGradient
            colors={[tone.accent, tone.fg]}
            start={{ x: 0.3, y: 0.3 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: baseR,
              height: baseR,
              borderRadius: baseR / 2,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: isActive ? 2.5 : 1.5,
              borderColor: isActive ? '#F6FBEF' : 'rgba(246,251,239,0.35)',
            }}
          >
            <MaterialIcons name={icon} size={baseR * 0.42} color="#0A1410" />
          </LinearGradient>
          {isCritical ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.nodeRing,
                {
                  width: baseR + 6,
                  height: baseR + 6,
                  borderRadius: (baseR + 6) / 2,
                  borderColor: tone.accent,
                  top: -3,
                  left: -3,
                },
                aRing,
              ]}
            />
          ) : null}
          {isActive ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -6,
                left: -6,
                width: baseR + 12,
                height: baseR + 12,
                borderRadius: (baseR + 12) / 2,
                borderWidth: 4,
                borderColor: 'rgba(246,251,239,0.10)',
              }}
            />
          ) : null}
        </Animated.View>
      </Pressable>

      {/* Delta label — absolute-positioned below the node, centered.
          Visible only when expanded; entrance fades in so the layout
          doesn't pop. The label sits OUTSIDE the layout box (top:
          100%) so it never displaces the avatar's anchor. */}
      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(140)}
          pointerEvents="none"
          style={styles.nodeLabelWrap}
        >
          <View style={styles.nodeLabel}>
            <Text style={styles.nodeLabelText} numberOfLines={1}>
              {sig.impact}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  )
}

// ─── Chat Message ─────────────────────────────────────────────────────────

function ChatMessage({
  task,
  isActive,
  onPressBubble,
  onLongPressBubble,
  onAction,
  onDismiss,
}: {
  task: ControlAdvisorTask
  isActive: boolean
  onPressBubble: () => void
  onLongPressBubble: () => void
  onAction: () => void
  onDismiss: () => void
}) {
  const type = bubbleType(task)
  const tone = TYPE_TONES[type]
  const isCritical = task.urgency === 'alta'
  const intro = bubbleIntro(task)
  const headline = bubbleHeadline(task)
  const icon = iconForSignal(task.id)
  const meta = getActionMeta(task.action)
  const ctaLabel = resolveCtaLabel(task.cta, task.action)
  const isDismissAction = task.action?.kind === 'dismiss'

  return (
    <View style={styles.message}>
      <View style={styles.messageIntroRow}>
        <Text style={styles.messageIntro}>{intro}</Text>
        <Text style={styles.messageStamp}>· ahora</Text>
      </View>

      <Pressable
        onPress={onPressBubble}
        onLongPress={onLongPressBubble}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}. Mantené presionado para opciones.`}
      >
        <View
          style={[
            styles.bubble,
            {
              borderColor: isActive
                ? tone.accent
                : isCritical
                  ? `${tone.accent}AA`
                  : 'rgba(15,42,30,0.12)',
              backgroundColor: '#FFFBF2',
              shadowColor: tone.accent,
              shadowOpacity: isActive ? 0.32 : 0.18,
              shadowRadius: isActive ? 16 : 10,
            },
          ]}
        >
          <View style={styles.bubbleTop}>
            <View
              style={[
                styles.bubbleIconTile,
                { backgroundColor: tone.bg },
              ]}
            >
              <MaterialIcons name={icon} size={13} color={tone.fg} />
            </View>
            <Text
              style={[styles.bubbleHeadline, { color: tone.fg }]}
              numberOfLines={1}
            >
              {headline.toUpperCase()}
            </Text>
            {isCritical ? (
              <View
                style={[styles.urgentBadge, { backgroundColor: tone.fg }]}
              >
                <Text style={styles.urgentBadgeText}>URGENTE</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.bubbleTitle} numberOfLines={3}>
            {task.title}
          </Text>
          <Text style={styles.bubbleBody} numberOfLines={4}>
            {task.body}
          </Text>

          <View
            style={[
              styles.impactBar,
              {
                backgroundColor: tone.soft,
                borderColor: tone.edge,
              },
            ]}
          >
            <Text
              style={[styles.impactBarLabel, { color: tone.fg }]}
              numberOfLines={1}
            >
              {impactChipLabel(task)}
            </Text>
            <Text style={[styles.impactBarValue, { color: tone.fg }]}>
              {task.impact}
            </Text>
          </View>

          <View style={styles.bubbleFooter}>
            <Text style={styles.confidenceDots}>
              {confidenceDots(task.confidence)}
            </Text>
            <Text style={styles.confidenceLabel}>
              {confidenceLabel(task.confidence)}
            </Text>
            {task.dataDays > 0 ? (
              <>
                <Text style={styles.confidenceSep}>·</Text>
                <Text style={styles.confidenceBuilder}>
                  {task.dataDays}d de datos
                </Text>
              </>
            ) : null}
          </View>
        </View>
      </Pressable>

      {/* Quick replies (CTA + Visto) */}
      <View style={styles.replies}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${ctaLabel} para ${task.title}`}
          onPress={onAction}
          style={({ pressed }) => [
            styles.replyCtaWrap,
            { opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <LinearGradient
            colors={[tone.accent, tone.fg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.replyCta}
          >
            <Text
              style={[
                styles.replyCtaText,
                { color: type === 'warning' ? '#0F2A1E' : '#FFFFFF' },
              ]}
              numberOfLines={1}
            >
              {ctaLabel}
            </Text>
            <MaterialIcons
              name={meta.icon}
              size={12}
              color={type === 'warning' ? '#0F2A1E' : '#FFFFFF'}
            />
          </LinearGradient>
        </Pressable>
        {!isDismissAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Marcar como visto"
            onPress={onDismiss}
            hitSlop={4}
            style={({ pressed }) => [
              styles.replySeen,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={styles.replySeenText}>Visto</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={styles.emptyState}
    >
      <View style={styles.emptyCheck}>
        <MaterialIcons name="check" size={20} color="#0F2A1E" />
      </View>
      <Text style={styles.emptyTitle}>Revisaste todas las sugerencias</Text>
      <Text style={styles.emptyBody}>
        El asistente sigue mirando tus números. Si los patrones persisten,
        las sugerencias volverán a aparecer.
      </Text>
    </Animated.View>
  )
}

// ─── Twinkling Stars ──────────────────────────────────────────────────────

function TwinklingStars({ count }: { count: number }) {
  const reduced = useReducedMotion()
  const phase = useSharedValue(0)
  useLoopAnimation(
    () => {
      if (reduced) return
      phase.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      )
    },
    [phase],
    [reduced],
  )
  return (
    <View style={styles.starsBg} pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => {
        const left = ((i * 73 + i * 17) % 100) / 100
        const top = ((i * 41 + 7) % 100) / 100
        const sz = 1 + (i % 3)
        const baseOpacity = 0.18 + (i % 5) * 0.06
        const offset = (i % 6) * 0.16
        return (
          <BgStar
            key={i}
            left={left}
            top={top}
            size={sz}
            baseOpacity={baseOpacity}
            phaseOffset={offset}
            phase={phase}
          />
        )
      })}
    </View>
  )
}

function BgStar({
  left,
  top,
  size,
  baseOpacity,
  phaseOffset,
  phase,
}: {
  left: number
  top: number
  size: number
  baseOpacity: number
  phaseOffset: number
  phase: { value: number }
}) {
  const a = useAnimatedStyle(() => {
    const v = (phase.value + phaseOffset) % 1
    const wave = Math.sin(v * Math.PI)
    return { opacity: baseOpacity + wave * 0.32 }
  })
  return (
    <Animated.View
      style={[
        styles.bgStar,
        {
          left: `${left * 100}%`,
          top: `${top * 100}%`,
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: STAR_COLOR,
        },
        a,
      ]}
    />
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  starsBg: {
    ...StyleSheet.absoluteFillObject,
  },
  bgStar: {
    position: 'absolute',
  },
  // Grab handle (telegraphs swipe-down dismiss on iOS modals)
  grabHandleArea: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  // Forecast strip — slim 7-day projection above the constellation.
  forecastStrip: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(199, 238, 156, 0.16)',
  },
  forecastHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  forecastEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(199, 238, 156, 0.78)',
  },
  forecastChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(242, 197, 138, 0.18)',
  },
  forecastChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F2C58A',
    letterSpacing: 0.4,
  },
  forecastFootnote: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.55)',
    marginTop: 4,
  },
  grabHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(199,238,156,0.45)',
  },
  // Top bar — single identity row (no close button; sheet dismisses
  // via system swipe-down gesture).
  topBar: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  identityAvatarWrap: {
    width: 48,
    height: 48,
  },
  identityAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  identityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pulseDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    backgroundColor: STATUS_DOT,
    borderWidth: 2,
    borderColor: '#0F2A1E',
  },
  pulseDotRing: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    borderWidth: 2,
    borderColor: STATUS_DOT,
  },
  identityTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  identityStatusText: {
    fontSize: 11,
    color: TEXT_TERTIARY,
    fontWeight: '600',
  },
  totalPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COUNT_PILL_BG,
    borderWidth: 1,
    borderColor: COUNT_PILL_BORDER,
  },
  totalPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: TEXT_ACCENT,
    letterSpacing: 0.3,
  },
  // Map / Constellation
  mapWrap: {
    marginHorizontal: 18,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: STRIP_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: STRIP_BORDER,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  mapHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  mapEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: TEXT_TERTIARY,
  },
  mapDay: {
    fontSize: 9,
    color: 'rgba(246,251,239,0.35)',
    letterSpacing: 0.2,
  },
  // Expand button (toggles board height 140 ↔ 240)
  toggleExpand: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(199,238,156,0.12)',
  },
  // Board (Mapa or Radar canvas)
  board: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  // Constellation node positioning
  nodeAbs: {
    position: 'absolute',
    // Width / height are set inline (= baseR) so the layout box stays
    // pinned to the slot's anchor regardless of the avatar's visual
    // scale. Children that need to escape this box use position:
    // absolute (label + halo).
  },
  nodeWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  nodeRing: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  // Label wrapper — sits below the avatar without displacing its anchor.
  // `top: '100%'` puts the wrapper just below the avatar's bottom edge;
  // `left: 0, right: 0` + alignItems center makes the label centered on
  // the avatar's horizontal midpoint. Stays inside the board's overflow
  // because the board grows to 240 + has paddingVertical when expanded.
  nodeLabelWrap: {
    position: 'absolute',
    top: '100%',
    left: -40,
    right: -40,
    alignItems: 'center',
    marginTop: 8,
  },
  nodeLabel: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  nodeLabelText: {
    fontSize: 9,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: 0.3,
  },
  // Legend
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  legendChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flexShrink: 1,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 9,
    fontWeight: '700',
    color: TEXT_SECONDARY,
    letterSpacing: 0.3,
  },
  legendHint: {
    fontSize: 9,
    color: TEXT_MUTED,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  // Chat
  chatBody: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  message: {
    marginTop: 14,
  },
  messageIntroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 6,
    marginBottom: 4,
  },
  messageIntro: {
    fontSize: 10,
    fontWeight: '700',
    color: TEXT_TERTIARY,
    letterSpacing: 0.2,
  },
  messageStamp: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(246,251,239,0.30)',
  },
  bubble: {
    borderWidth: 1.5,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },
  bubbleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  bubbleIconTile: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleHeadline: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.3,
    flexShrink: 1,
  },
  urgentBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  urgentBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  bubbleTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F2A1E',
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  bubbleBody: {
    fontSize: 12,
    color: '#3E5A4A',
    lineHeight: 17,
    marginTop: 6,
    fontWeight: '500',
  },
  impactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 11,
  },
  impactBarLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  impactBarValue: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  confidenceDots: {
    fontSize: 9,
    color: '#9AA39D',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  confidenceLabel: {
    fontSize: 9,
    color: '#9AA39D',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  confidenceSep: {
    fontSize: 9,
    color: '#C9C0AB',
  },
  confidenceBuilder: {
    fontSize: 9,
    color: '#9AA39D',
    fontWeight: '600',
  },
  // Replies
  replies: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 6,
    paddingRight: 6,
    flexWrap: 'wrap',
  },
  replyCtaWrap: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 4,
    overflow: 'hidden',
  },
  replyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  replyCtaText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  replySeen: {
    backgroundColor: 'rgba(255,251,242,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(246,251,239,0.18)',
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 4,
  },
  replySeenText: {
    fontSize: 12,
    fontWeight: '700',
    color: TEXT_SECONDARY,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyCheck: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TEXT_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    lineHeight: 17,
    textAlign: 'center',
    fontWeight: '500',
    maxWidth: 320,
  },
})
