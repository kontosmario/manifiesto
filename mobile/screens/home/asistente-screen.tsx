import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { useRouter } from 'expo-router'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { decorativeDurations } from '@/lib/motion/tokens'
import { formatMoneyShort } from '@/utils/money'
import { useAdvisorNotificationSync } from '@/features/insights/use-advisor-notification-sync'
import { useControlActionDispatcher } from '@/features/insights/use-control-action-dispatcher'
import { GlobalAdvisorActionHost } from '@/components/control-v2/global-advisor-action-host'
import { useBlockSignalFamily } from '@/features/insights/use-signal-blocklist'
import { signalFamilyOf } from '@/features/insights/signal-family'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import { selectAsistenteEmptyCopy } from '@/features/insights/asistente-empty-copy'
import {
  dismissCard,
  useDismissedIds,
} from '@/features/insights/control-dismiss-store'
import {
  TYPE_TONES,
  bubbleType,
} from '@/components/control-v2/asesor-bubble-meta'
import { iconForSignal } from '@/components/control-v2/asesor-signal-meta'
import { getActionMeta, resolveCtaLabel } from '@/components/control-v2/asesor-action-meta'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import type { ControlSectionAnchor } from '@/features/insights/control-action'
import { ControlAnchorsContext } from '@/features/insights/control-section-anchors'
import { ZombieFeedSection } from '@/components/control-v2/zombie-feed-section'
import {
  useAsistenteTheme,
  type AsistenteTokens,
} from '@/features/insights/asistente-theme'

interface AsistenteScreenProps {
  familyId: string
  userId: string
}

// All theme-dependent colors come from `useAsistenteTheme()` and are
// applied inline. The few palette constants the screen needs from the
// brand audit (peach accent, etc.) live in `asistente-theme.ts`.

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
  const t = useAsistenteTheme()
  const { signals, usingMock } = useControlV2Data(familyId, userId)
  const dismissed = useDismissedIds()

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
        '¿Qué quieres hacer con esta sugerencia?',
        [
          {
            text: '¿Por qué veo esto?',
            onPress: () => {
              Alert.alert(
                '¿Por qué veo esto?',
                task.dummyExplanation ??
                  'Esta sugerencia se basa en patrones detectados en tus gastos del mes. La acción del CTA es la palanca más directa para mover el número.',
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
                      'Prueba de nuevo en unos segundos.',
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
        colors={t.shellGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.root}
      >
        <TwinklingStars count={18} starColor={t.starColor} opacityScale={t.starOpacityScale} />

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
          <Header count={visible.length} totalImpact={totalImpact} t={t} />

          <View style={styles.cardsList}>
            {visible.length === 0 ? (
              <EmptyState usingMock={usingMock} t={t} />
            ) : (
              visible.map((task, i) => (
                <Animated.View
                  key={task.id}
                  layout={LinearTransition.duration(220)}
                  entering={FadeIn.duration(280).delay(80 * i)}
                  exiting={FadeOut.duration(140)}
                  onLayout={onMessageLayout(task.id)}
                >
                  <InsightCard
                    task={task}
                    isActive={i === active}
                    onPressBubble={() => setActive(i)}
                    onLongPressBubble={() => handleLongPress(task)}
                    onAction={() => handleAction(task)}
                    onDismiss={() => handleDismiss(task)}
                    t={t}
                  />
                </Animated.View>
              ))
            )}
          </View>

          <ZombieFeedSection familyId={familyId} userId={userId} />
        </ScrollView>
      </LinearGradient>
      {/* Nested instance of the advisor sheets. Required because the
          Asistente screen is itself a stack-modal — iOS doesn't
          reliably stack another RN `<Modal>` over a presented modal,
          so the AppStackShell-mounted host can't show its sheets
          while we're on top. The nested host claims the slot, makes
          the AppStackShell host step aside, and renders the same
          QuickAddSavings / MemberWarning sheets inside this view
          hierarchy where the modal opens correctly. */}
      <GlobalAdvisorActionHost
        familyId={familyId}
        userId={userId}
        isNested
      />
    </ControlAnchorsContext.Provider>
  )
}

function dismissKeyFor(task: ControlAdvisorTask): string {
  return task.action?.kind === 'dismiss' ? task.action.dismissId : task.id
}

// ─── Top Bar ──────────────────────────────────────────────────────────────

function Header({
  count,
  totalImpact,
  t,
}: {
  count: number
  totalImpact: number
  t: AsistenteTokens
}) {
  // Minimal header: title + aggregate "potencial / mes" pill. All
  // theme-dependent colors come from `t` (the asistente token set);
  // styles below carry only the layout/typography that doesn't change
  // between light and dark.
  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <Text style={[styles.headerTitle, { color: t.headerTitle }]} numberOfLines={1}>
          Asistente
        </Text>
        {totalImpact > 0 ? (
          <View
            style={[
              styles.headerPill,
              { backgroundColor: t.pillBg, borderColor: t.pillBorder },
            ]}
          >
            <MaterialIcons name="trending-up" size={12} color={t.pillIcon} />
            <Text style={[styles.headerPillValue, { color: t.pillValue }]}>
              +{formatMoneyShort(totalImpact)}
            </Text>
            <Text style={[styles.headerPillSuffix, { color: t.pillSuffix }]}>
              /mes potencial
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[styles.headerSubtitle, { color: t.headerSubtitle }]}
        numberOfLines={1}
      >
        {count > 0
          ? `${count} ${count === 1 ? 'acción' : 'acciones'} que pueden mover la aguja`
          : 'Al día por ahora'}
      </Text>
    </View>
  )
}

function InsightCard({
  task,
  isActive,
  onPressBubble,
  onLongPressBubble,
  onAction,
  onDismiss,
  t,
}: {
  task: ControlAdvisorTask
  isActive: boolean
  onPressBubble: () => void
  onLongPressBubble: () => void
  onAction: () => void
  onDismiss: () => void
  t: AsistenteTokens
}) {
  const type = bubbleType(task)
  const tone = TYPE_TONES[type]
  const isCritical = task.urgency === 'alta'
  const icon = iconForSignal(task.id)
  const ctaLabel = resolveCtaLabel(task.cta, task.action)
  const isDismissAction = task.action?.kind === 'dismiss'
  // Impact line picks the brand-aligned positive/warning color from
  // the active theme. The deep variants pass AA on light cards; the
  // mint/peach pair passes AAA on dark cards.
  const impactColor =
    type === 'warning' ? t.impactWarning : t.impactPositive

  return (
    <View style={styles.message}>
      {/*
        Card surface contains BOTH the visual content and the action
        buttons. Buttons sit on the card surface so the theme-aware
        button colors render with the right contrast in both modes.
      */}
      <View
        style={[
          styles.bubble,
          {
            borderColor: isActive
              ? t.cardBorderActive
              : isCritical
                ? `${tone.accent}AA`
                : t.cardBorder,
            backgroundColor: t.cardBg,
            shadowColor: tone.accent,
            shadowOpacity: isActive ? 0.28 : 0.12,
            shadowRadius: isActive ? 16 : 8,
          },
        ]}
      >
        <Pressable
          onPress={onPressBubble}
          onLongPress={onLongPressBubble}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityLabel={`${task.title}. Mantené presionado para opciones.`}
        >
          <View style={styles.bubbleHead}>
            <View
              style={[
                styles.bubbleIconTile,
                { backgroundColor: tone.bg },
              ]}
            >
              <MaterialIcons name={icon} size={18} color={tone.fg} />
            </View>
            <Text
              style={[styles.bubbleTitle, { color: t.cardTitle }]}
              numberOfLines={2}
            >
              {task.title}
            </Text>
          </View>

          <Text
            style={[styles.bubbleBody, { color: t.cardBody }]}
            numberOfLines={4}
          >
            {task.body}
          </Text>

          <Text
            style={[styles.impactLine, { color: impactColor }]}
            numberOfLines={1}
          >
            {task.impact}
          </Text>
        </Pressable>

        <View style={styles.replies}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${ctaLabel} para ${task.title}`}
            onPress={onAction}
            style={({ pressed }) => [
              styles.replyCta,
              {
                backgroundColor: t.ctaBg,
                shadowColor: t.ctaShadow,
                opacity: pressed ? 0.92 : 1,
              },
            ]}
          >
            <Text
              style={[styles.replyCtaText, { color: t.ctaText }]}
              numberOfLines={1}
            >
              {ctaLabel}
            </Text>
            <MaterialIcons name="arrow-forward" size={14} color={t.ctaText} />
          </Pressable>
          {!isDismissAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Marcar como visto"
              onPress={onDismiss}
              hitSlop={4}
              style={({ pressed }) => [
                styles.replySeen,
                {
                  backgroundColor: t.vistoBg,
                  borderColor: t.vistoBorder,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.replySeenText, { color: t.vistoText }]}>
                Visto
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────

function EmptyState({
  usingMock,
  t,
}: {
  usingMock: boolean
  t: AsistenteTokens
}) {
  const copy = selectAsistenteEmptyCopy({ usingMock })
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={styles.emptyState}
    >
      <View style={[styles.emptyCheck, { backgroundColor: t.pillIcon }]}>
        <MaterialIcons name="check" size={20} color={t.ctaText} />
      </View>
      <Text style={[styles.emptyTitle, { color: t.headerTitle }]}>
        {copy.title}
      </Text>
      <Text style={[styles.emptyBody, { color: t.headerSubtitle }]}>
        {copy.body}
      </Text>
    </Animated.View>
  )
}

// ─── Twinkling Stars ──────────────────────────────────────────────────────

function TwinklingStars({
  count,
  starColor,
  opacityScale,
}: {
  count: number
  starColor: string
  opacityScale: number
}) {
  const reduced = useReducedMotion()
  const phase = useSharedValue(0)
  useLoopAnimation(
    () => {
      if (reduced) return
      phase.value = withRepeat(
        withSequence(
          withTiming(1, { duration: decorativeDurations.pulseSlow, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: decorativeDurations.pulseSlow, easing: Easing.inOut(Easing.sin) }),
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
        const baseOpacity = (0.18 + (i % 5) * 0.06) * opacityScale
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
            color={starColor}
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
  color,
}: {
  left: number
  top: number
  size: number
  baseOpacity: number
  phaseOffset: number
  phase: { value: number }
  color: string
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
          backgroundColor: color,
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
    color: '#F2A78C',
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
    backgroundColor: 'rgba(166,239,143,0.45)',
  },
  // Header — minimal title row + aggregate impact pill, then a
  // hedged subtitle. No avatar, no pulse dot, no two-row layout.
  header: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 14,
    gap: 6,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  // Header — layout/typography only. Colors come from `t` and are
  // applied inline at the call site.
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.8,
    flexShrink: 1,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  headerPillValue: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  headerPillSuffix: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    paddingLeft: 2,
  },
  // Cards
  cardsList: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  message: {
    marginTop: 14,
  },
  bubble: {
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  bubbleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bubbleIconTile: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bubbleTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 22,
  },
  bubbleBody: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  impactLine: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
    paddingTop: 2,
  },
  // Action row sits inside the card so the theme-aware button colors
  // render on the card surface (instead of on the shell, where the
  // forest-tinted alphas would collapse to ~1:1 contrast).
  replies: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  replyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 44,
    borderRadius: 999,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  replyCtaText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  replySeen: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replySeenText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    fontWeight: '500',
    maxWidth: 320,
  },
})
