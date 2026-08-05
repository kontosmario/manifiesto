import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  Keyframe,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import {
  decorativeDurations,
  motionDurations,
  motionEasings,
  motionSprings,
  motionStagger,
} from '@/lib/motion/tokens'
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
  dismissKeyFor,
} from '@/features/insights/control-dismiss-store'
import {
  bubbleHeadline,
  bubbleType,
  impactChipLabel,
  type BubbleType,
} from '@/components/control-v2/asesor-bubble-meta'
import { iconForSignal } from '@/components/control-v2/asesor-signal-meta'
import { getActionMeta, resolveCtaLabel } from '@/components/control-v2/asesor-action-meta'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import type { ControlAction, ControlSectionAnchor } from '@/features/insights/control-action'
import { ControlAnchorsContext } from '@/features/insights/control-section-anchors'
import {
  cssGradient,
  neoCategoryPastels,
  neoParticlePresets,
  neoRadii,
  neoTokens,
  pastelDark,
  type NeoTokens,
} from '@/theme/neo-tokens'
import { useThemeTokens } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

interface AsistenteScreenProps {
  familyId: string
  userId: string
}

/**
 * Rediseño 2026-07 — esta pantalla dejó de tener su propio set de
 * tokens. `features/insights/asistente-theme.ts` (V1 "Mint Saturado":
 * #A6EF8F / #297811 / #12211A / #305A47…) era un SEGUNDO design system
 * paralelo y ya no se consume desde acá: todo el material sale de
 * `neoTokens(mode)`. Lo mismo con `TYPE_TONES` de `asesor-bubble-meta`
 * —otra paleta V1 entera— que acá se reemplaza por los pasteles de
 * categoría del handoff (`TYPE_PASTEL`, abajo). Ninguno de los dos
 * módulos se BORRA en este cambio: `asesor-bubble-meta` lo consumen
 * también las cards de Control, que todavía no migraron.
 */

/**
 * Tile de ícono por tipo de burbuja. El handoff pinta los tiles de
 * ícono como pastel de categoría plano (`screens/3c.html` L44-62); acá
 * se elige el pastel cuyo matiz codifica el tipo: salmón para crítico,
 * durazno para advertencia, verde para refuerzo, verde agua para
 * insight. En oscuro el mismo pastel va translúcido (`pastelDark`).
 */
const TYPE_PASTEL: Record<BubbleType, string> = {
  critical: neoCategoryPastels.transferencia,
  warning: neoCategoryPastels.comida,
  positive: neoCategoryPastels.hogar,
  insight: neoCategoryPastels.mascotas,
}

/**
 * Tinta del acento positivo. En claro NO se usa `neo.green` (#2E7C39):
 * sobre el tinte de selección da 4.06:1 y estos son valores de 13-16px
 * en negrita, que necesitan 4.5:1. `greenDeep` es un token del mismo
 * sistema y llega a ~7:1. En oscuro el par se invierte y `green`
 * (#A4E3A6) es el correcto.
 */
function positiveInk(neo: NeoTokens, isDark: boolean): string {
  return isDark ? neo.green : neo.greenDeep
}

/** Opacidad base de las partículas de fondo, por tema (valor V1 conservado). */
function starOpacityScale(isDark: boolean): number {
  return isDark ? 0.55 : 0.45
}

/**
 * Partículas del fondo. En oscuro es literal el preset `hero` del
 * handoff; en claro NO se puede usar el mismo, porque esos tres tonos
 * (#C9F3C6 / #FBD9BC / #EFF6E2) están pensados para caer sobre el hero
 * verde y sobre la hoja crema (#F0EFE3) desaparecerían. La versión
 * clara usa los acentos del MISMO sistema, que sí contrastan contra la
 * hoja.
 */
function starColors(neo: NeoTokens, isDark: boolean): readonly string[] {
  return isDark
    ? neoParticlePresets.hero.colors
    : [neo.green, neo.warm, neo.textTertiary]
}

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
  const themeTokens = useThemeTokens()
  const neo = neoTokens(themeTokens.mode)
  const isDark = themeTokens.mode === 'dark'
  const { t: translate } = useTranslation()
  const reduced = useReducedMotion()
  // `signals` ya viene filtrado (blocklist + dismissed) y vacío hasta que los
  // filtros cargaron (signalsReady) — el filtrado es central en useControlV2Data,
  // no aquí. Así el push (abajo) tampoco dispara sobre señales descartadas.
  const { signals, signalsReady, usingMock } = useControlV2Data(familyId, userId)

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

  const visible = signals
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
        translate('insights:asistente.longPress.question'),
        [
          {
            text: translate('insights:asistente.longPress.why'),
            onPress: () => {
              Alert.alert(
                translate('insights:asistente.longPress.why'),
                task.dummyExplanation ??
                  translate('insights:asistente.longPress.whyDefault'),
              )
            },
          },
          {
            text: translate('insights:asistente.longPress.blockFamily'),
            style: 'destructive',
            onPress: () => {
              if (!userId) return
              blockMutation.mutate(
                { userId, signalId: task.id },
                {
                  onSuccess: () => {
                    void triggerHaptic('success')
                    Alert.alert(
                      translate('insights:asistente.longPress.blockSuccessTitle'),
                      translate('insights:asistente.longPress.blockSuccessBody', {
                        family,
                      }),
                    )
                  },
                  onError: () => {
                    void triggerHaptic('error')
                    Alert.alert(
                      translate('insights:asistente.longPress.blockErrorTitle'),
                      translate('insights:asistente.longPress.blockErrorBody'),
                    )
                  },
                },
              )
            },
          },
          { text: translate('insights:asistente.longPress.cancel'), style: 'cancel' },
        ],
        { cancelable: true },
      )
    },
    [userId, blockMutation, translate],
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

  // Réplica rápida (escala de uso de suscripción) — dispara la action del
  // botón por el dispatcher central. El dispatcher ya emite su propio haptic
  // para los kinds sub-usage; evitamos el doble buzz.
  const handleReplyAction = useCallback(
    (task: ControlAdvisorTask, action: ControlAction) => {
      const meta = getActionMeta(action)
      const dispatcherFiresHaptic =
        action.kind === 'sub-usage-answer' ||
        action.kind === 'sub-usage-cancel' ||
        action.kind === 'dismiss' ||
        action.kind === 'quick-savings-contribution'
      if (!dispatcherFiresHaptic) void triggerHaptic(meta.haptic)
      dispatch(action, {
        taskId: task.id,
        surface: 'asistente_screen',
        taskContext: {
          urgency: task.urgency,
          confidence: task.confidence,
          impactRaw: task.impactRaw,
          cat: task.cat,
        },
      })
    },
    [dispatch],
  )

  return (
    <ControlAnchorsContext.Provider value={anchorsController}>
      {/* Carcasa de hoja del rediseño: sólido `neo.sheet` en vez del
          gradiente forest V1. NO se le ponen esquinas superiores
          redondeadas ni `shadows.sheet`: es una ruta con
          `presentation:'modal'`, así que el sistema ya redondea y
          proyecta la tarjeta; un radio propio de 32 dejaría ver el
          vacío del presentador en las esquinas. */}
      <View style={[styles.root, { backgroundColor: neo.sheet }]}>
        <TwinklingStars
          count={18}
          colors={starColors(neo, isDark)}
          opacityScale={starOpacityScale(isDark)}
        />

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
            {/* `sheetHandle` es el token dedicado a la píldora de
                arrastre (el handoff le da un valor propio por tema),
                así que reemplaza al verde brand V1. */}
            <View
              style={[styles.grabHandle, { backgroundColor: neo.sheetHandle }]}
            />
          </View>
          <Header
            count={visible.length}
            totalImpact={totalImpact}
            neo={neo}
            isDark={isDark}
          />

          <View style={styles.cardsList}>
            {!signalsReady ? (
              // Filtros (blocklist + dismissals) cargando → loading, NO la lista
              // sin filtrar (que después se achicaría = el "cards que aparecen y
              // desaparecen").
              <LoadingState neo={neo} />
            ) : visible.length === 0 ? (
              <EmptyState usingMock={usingMock} neo={neo} isDark={isDark} />
            ) : (
              visible.map((task, i) => (
                <Animated.View
                  key={task.id}
                  layout={
                    reduced
                      ? LinearTransition.duration(180)
                      : LinearTransition.springify()
                          .damping(motionSprings.enter.damping)
                          .stiffness(motionSprings.enter.stiffness)
                          .mass(motionSprings.enter.mass)
                  }
                  entering={
                    reduced
                      ? FadeIn.duration(160)
                      : new Keyframe({
                          0: {
                            opacity: 0,
                            transform: [{ translateY: 12 }, { scale: 0.96 }],
                          },
                          100: {
                            opacity: 1,
                            transform: [{ translateY: 0 }, { scale: 1 }],
                            easing: motionEasings.enterSmooth,
                          },
                        })
                          .duration(motionDurations.enterStack)
                          .delay(motionStagger.listItem * i)
                  }
                  exiting={
                    reduced
                      ? FadeOut.duration(120)
                      : new Keyframe({
                          0: {
                            opacity: 1,
                            transform: [{ translateX: 0 }, { scale: 1 }],
                          },
                          100: {
                            opacity: 0,
                            transform: [{ translateX: -24 }, { scale: 0.97 }],
                            easing: motionEasings.exitStandard,
                          },
                        }).duration(motionDurations.exitStack)
                  }
                  onLayout={onMessageLayout(task.id)}
                >
                  <InsightCard
                    task={task}
                    isActive={i === active}
                    onPressBubble={() => setActive(i)}
                    onLongPressBubble={() => handleLongPress(task)}
                    onAction={() => handleAction(task)}
                    onReply={(action) => handleReplyAction(task, action)}
                    onDismiss={() => handleDismiss(task)}
                    neo={neo}
                    isDark={isDark}
                  />
                </Animated.View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
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

// ─── Top Bar ──────────────────────────────────────────────────────────────

function Header({
  count,
  totalImpact,
  neo,
  isDark,
}: {
  count: number
  totalImpact: number
  neo: NeoTokens
  isDark: boolean
}) {
  // Minimal header: title + aggregate "potencial / mes" pill. Todo el
  // material sale de `neo`; los estilos de abajo llevan sólo el
  // layout/tipografía, que no cambia entre claro y oscuro.
  const { t: translate } = useTranslation()
  const positive = positiveInk(neo, isDark)
  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <Text style={[styles.headerTitle, { color: neo.text }]} numberOfLines={1}>
          {translate('insights:asistente.header.title')}
        </Text>
        {totalImpact > 0 ? (
          // Chip del rediseño: tinte de selección + relieve `raisedSm`.
          // Sin borde — los chips neo se separan por relieve.
          <View
            style={[
              styles.headerPill,
              {
                backgroundColor: neo.selectedTint,
                boxShadow: neo.shadows.raisedSm,
              },
            ]}
          >
            <MaterialIcons name="trending-up" size={12} color={positive} />
            <Text style={[styles.headerPillValue, { color: positive }]}>
              +{formatMoneyShort(totalImpact)}
            </Text>
            <Text style={[styles.headerPillSuffix, { color: neo.textMuted }]}>
              {translate('insights:asistente.header.potentialSuffix')}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[styles.headerSubtitle, { color: neo.textMuted }]}
        numberOfLines={1}
      >
        {count > 0
          ? translate('insights:asistente.header.subtitle', { count })
          : translate('insights:asistente.header.subtitleIdle')}
      </Text>
    </View>
  )
}

// Small reusable pressable that scales down on press-in and springs
// back on release. Wraps an Animated Pressable so the scale runs on the
// UI thread. Respects reduced motion (no transform animation, but the
// view always carries a transform array — `transform: undefined`
// crashes iOS on the bridge).
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

function PressScale({
  children,
  onPress,
  style,
  accessibilityLabel,
  accessibilityRole = 'button',
  hitSlop,
}: {
  children: ReactNode
  onPress: () => void
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
  accessibilityRole?: 'button'
  hitSlop?: number
}) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        if (!reduced) {
          scale.value = withTiming(0.96, {
            duration: motionDurations.micro,
            easing: motionEasings.standard,
          })
        }
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motionSprings.press)
      }}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
      style={[style, animStyle]}
    >
      {children}
    </AnimatedPressable>
  )
}

function InsightCard({
  task,
  isActive,
  onPressBubble,
  onLongPressBubble,
  onAction,
  onReply,
  onDismiss,
  neo,
  isDark,
}: {
  task: ControlAdvisorTask
  isActive: boolean
  onPressBubble: () => void
  onLongPressBubble: () => void
  onAction: () => void
  onReply: (action: ControlAction) => void
  onDismiss: () => void
  neo: NeoTokens
  isDark: boolean
}) {
  const { t: translate } = useTranslation()
  const type = bubbleType(task)
  const pastel = TYPE_PASTEL[type]
  const tileBg = isDark ? pastelDark(pastel) : pastel
  const isCritical = task.urgency === 'alta'
  const icon = iconForSignal(task.id)
  const ctaLabel = resolveCtaLabel(task.cta, task.action)
  const isDismissAction = task.action?.kind === 'dismiss'
  const eyebrow = bubbleHeadline(task)
  const impactLabel = impactChipLabel(task)
  const positive = positiveInk(neo, isDark)
  // Valor de impacto: verde del sistema para lo positivo, naranja de
  // alerta para lo que hay que corregir.
  const impactColor = type === 'warning' ? neo.warm : positive
  // La card ACTIVA es el estado seleccionado del sistema: anillo verde
  // 2.5px + relieve hundido + tinte. La CRÍTICA ya no lleva borde de
  // acento (no existe en el vocabulario neo) — se distingue subiendo un
  // escalón de relieve, que es como el rediseño jerarquiza.
  const bubbleShadow = isActive
    ? neo.shadows.ringSelected
    : isCritical
      ? neo.shadows.raisedXl
      : neo.shadows.raisedLg

  const cardReduced = useReducedMotion()
  // Press-scale + active-lift on the bubble. Combined in a single
  // transform array so neither slot is ever `undefined` (that coerces
  // to null on the bridge and crashes iOS). The scale multiplies the
  // press value (1 → 0.97) by the active-lift factor (1 → 1.012).
  const pressS = useSharedValue(1)
  const lift = useSharedValue(isActive ? 1 : 0)
  useEffect(() => {
    lift.value = withTiming(isActive ? 1 : 0, {
      duration: 200,
      easing: motionEasings.standard,
    })
  }, [isActive, lift])
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressS.value * (1 + lift.value * 0.012) }],
  }))

  // Coreografía de respuesta de la escala (sub-usage): al elegir, el botón
  // elegido se confirma (fill + check con pop) y los otros se atenúan; tras un
  // beat disparamos onReply (que descarta la card → sale con el slide-out
  // direccional). El haptic de 'success' lo dispara el dispatcher al commit.
  const [pickedReply, setPickedReply] = useState<string | null>(null)
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (replyTimer.current) clearTimeout(replyTimer.current)
    },
    [],
  )
  const handlePickReply = useCallback(
    (label: string, action: ControlAction) => {
      if (pickedReply) return
      setPickedReply(label)
      replyTimer.current = setTimeout(() => onReply(action), 440)
    },
    [pickedReply, onReply],
  )

  return (
    <View style={styles.message}>
      {/*
        Card surface contains BOTH the visual content and the action
        buttons. Buttons sit on the card surface so the theme-aware
        button colors render with the right contrast in both modes.
      */}
      <Animated.View
        style={[
          styles.bubble,
          isActive
            ? { backgroundColor: neo.selectedTint }
            : cssGradient(neo.raisedGradientCss, neo.surface),
          {
            boxShadow: bubbleShadow,
            // La card en reposo se lee SÓLO por su sombra: su gradiente
            // contra la hoja es ~1.05:1. Android < API 28/29 descarta el
            // boxShadow en silencio, así que ahí cae a un hairline del
            // separador de hoja para no dejar la lista sin bordes.
            borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
            borderColor: isActive ? neo.green : neo.sheetDivider,
          },
          pressStyle,
        ]}
      >
        <Pressable
          onPress={onPressBubble}
          onPressIn={() => {
            if (!cardReduced) {
              pressS.value = withTiming(0.97, {
                duration: motionDurations.micro,
                easing: motionEasings.standard,
              })
            }
          }}
          onPressOut={() => {
            pressS.value = withSpring(1, motionSprings.press)
          }}
          onLongPress={onLongPressBubble}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityLabel={`${task.title}. ${translate('insights:asistente.card.longPressHint')}`}
        >
          <View style={styles.head}>
            {/* Tile de ícono — mantiene el ícono por señal como
                personalidad. Pastel de categoría plano + relieve chico,
                el vocabulario de tiles del rediseño. */}
            <View
              style={[
                styles.tile,
                { backgroundColor: tileBg, boxShadow: neo.shadows.raisedSm },
              ]}
            >
              <MaterialIcons name={icon} size={20} color={neo.text} />
            </View>
            <View style={styles.headtext}>
              <Text
                style={[styles.eyebrow, { color: neo.textMuted }]}
                numberOfLines={1}
              >
                {eyebrow.toUpperCase()}
              </Text>
              <Text
                style={[styles.bubbleTitle, { color: neo.text }]}
                numberOfLines={2}
              >
                {task.title}
              </Text>
            </View>
          </View>

          <Text
            style={[styles.bubbleBody, { color: neo.textMuted }]}
            numberOfLines={4}
          >
            {task.body}
          </Text>

          {/* Impact "jewel" — uppercase label + tabular value. The
              value is a pre-formatted string (no Intl in a worklet). */}
          <View style={styles.impactRow}>
            <Text
              style={[styles.impactRowLabel, { color: neo.textMuted }]}
              numberOfLines={1}
            >
              {impactLabel}
            </Text>
            <Text
              style={[styles.impactRowValue, { color: impactColor }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {task.impact}
            </Text>
          </View>
        </Pressable>

        {task.replies && task.replies.length > 0 ? (
          // Fila de escala (Mucho / A veces / Casi nunca, o Cancelar / La sigo
          // usando) — reemplaza el CTA único para las cards de uso de sub.
          <View style={styles.scaleRow}>
            {task.replies.map((r) => {
              const isPicked = pickedReply === r.label
              const isFaded = pickedReply != null && !isPicked
              return (
                <PressScale
                  key={r.label}
                  accessibilityRole="button"
                  accessibilityLabel={translate('insights:asistente.card.replyA11y', {
                    label: r.label,
                    title: task.title,
                  })}
                  onPress={() => handlePickReply(r.label, r.action)}
                  style={[
                    styles.scaleBtn,
                    isPicked
                      ? {
                          // Chip seleccionado del sistema: tinte + anillo
                          // verde. En Android < API 29 el inset del anillo
                          // se descarta en silencio → borde de respaldo.
                          backgroundColor: neo.selectedTint,
                          boxShadow: neo.shadows.ringSelected,
                          borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1.5,
                          borderColor: neo.green,
                        }
                      : {
                          backgroundColor: neo.surface,
                          boxShadow: neo.shadows.raisedSm,
                          borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
                          borderColor: neo.sheetDivider,
                        },
                    isFaded ? styles.scaleBtnFaded : null,
                  ]}
                >
                  {isPicked ? (
                    <Animated.View
                      entering={
                        cardReduced
                          ? FadeIn.duration(120)
                          : ZoomIn.springify()
                              .damping(motionSprings.celebrate.damping)
                              .stiffness(motionSprings.celebrate.stiffness)
                              .mass(motionSprings.celebrate.mass)
                      }
                    >
                      <MaterialIcons name="check" size={15} color={positive} />
                    </Animated.View>
                  ) : null}
                  <Text
                    style={[
                      styles.scaleBtnText,
                      { color: isPicked ? positive : neo.textMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {r.label}
                  </Text>
                </PressScale>
              )
            })}
          </View>
        ) : (
          <View style={styles.replies}>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={translate('insights:asistente.card.ctaA11y', {
                cta: ctaLabel,
                title: task.title,
              })}
              onPress={onAction}
              style={[
                styles.replyCta,
                // CTA primario del handoff: fill radial `circle at 32% 28%`
                // sobre el par `ctaGradient` + la receta `shadows.cta`
                // (que en oscuro incluye el glow verde).
                cssGradient(
                  `radial-gradient(circle at 32% 28%, ${neo.ctaGradient[0]}, ${neo.ctaGradient[1]} 85%)`,
                  neo.ctaGradient[1],
                ),
                { boxShadow: neo.shadows.cta },
              ]}
            >
              <Text
                style={[styles.replyCtaText, { color: neo.ctaText }]}
                numberOfLines={1}
              >
                {ctaLabel}
              </Text>
              <MaterialIcons
                name="arrow-forward"
                size={14}
                color={neo.ctaText}
              />
            </PressScale>
            {!isDismissAction ? (
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={translate('insights:asistente.card.seenA11y')}
                onPress={onDismiss}
                hitSlop={4}
                style={[
                  styles.replySeen,
                  {
                    // Secundario = tile extruido, la misma receta que el
                    // `ghost` de NeoButton (fill del tema + `raisedSm`).
                    backgroundColor: neo.surface,
                    boxShadow: neo.shadows.raisedSm,
                    borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
                    borderColor: neo.sheetDivider,
                  },
                ]}
              >
                <Text style={[styles.replySeenText, { color: neo.textMuted }]}>
                  {translate('insights:asistente.card.seen')}
                </Text>
              </PressScale>
            ) : null}
          </View>
        )}
      </Animated.View>
    </View>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────

function EmptyState({
  usingMock,
  neo,
  isDark,
}: {
  usingMock: boolean
  neo: NeoTokens
  isDark: boolean
}) {
  const copy = selectAsistenteEmptyCopy({ usingMock })
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={styles.emptyState}
    >
      {/* Disco de "todo en orden": tinte de selección + relieve chico y
          el check en el verde del sistema (antes heredaba el fill
          saturado del set V1). */}
      <View
        style={[
          styles.emptyCheck,
          {
            backgroundColor: neo.selectedTint,
            boxShadow: neo.shadows.raisedSm,
          },
        ]}
      >
        <MaterialIcons
          name="check"
          size={20}
          color={positiveInk(neo, isDark)}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: neo.text }]}>
        {copy.title}
      </Text>
      <Text style={[styles.emptyBody, { color: neo.textMuted }]}>
        {copy.body}
      </Text>
    </Animated.View>
  )
}

// Loading mientras los filtros (blocklist + dismissals) cargan — evita
// mostrar la lista sin filtrar que después se achica.
function LoadingState({ neo }: { neo: NeoTokens }) {
  const { t: translate } = useTranslation()
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.emptyState}>
      <ActivityIndicator color={neo.textMuted} />
      <Text style={[styles.emptyBody, { color: neo.textMuted, marginTop: 12 }]}>
        {translate('insights:asistente.loading')}
      </Text>
    </Animated.View>
  )
}

// ─── Twinkling Stars ──────────────────────────────────────────────────────

function TwinklingStars({
  count,
  colors,
  opacityScale,
}: {
  count: number
  colors: readonly string[]
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
            color={colors[i % colors.length] ?? colors[0]}
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
  // NOTA: acá vivían seis estilos `forecast*` (strip / headerRow /
  // eyebrow / chip / chipText / footnote) SIN NINGÚN consumidor en el
  // archivo — restos de una tira de proyección a 7 días que se sacó del
  // render. Eran justamente los que hardcodeaban alphas de blanco y
  // verdes V1 (#C7EE9C, #F2A78C) asumiendo un panel oscuro. Se borran en
  // vez de migrarse: no se puede pintar con tokens de tema desde un
  // StyleSheet estático, y no hay nada que pintar.
  grabHandle: {
    width: 40,
    height: 4,
    borderRadius: neoRadii.pill,
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
  // Header — layout/typography only. Los colores salen de `neo` y se
  // aplican inline en el call site.
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.8,
    flexShrink: 1,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: neoRadii.pill,
  },
  headerPillValue: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  headerPillSuffix: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
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
    // Radio de card del handoff. El relieve (boxShadow) lo elige el
    // call site según el estado (activa / crítica / reposo).
    borderRadius: neoRadii.card,
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headtext: {
    flex: 1,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: neoRadii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.9,
    marginBottom: 5,
  },
  bubbleTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.4,
    lineHeight: 23,
  },
  bubbleBody: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
  },
  impactRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 7,
    marginTop: 14,
  },
  impactRowLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    // El label es corto y fijo: nunca se comprime.
    flexShrink: 0,
  },
  impactRowValue: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
    // Puede comprimirse dentro de la card: un monto en millones
    // ("+$1.250.000 por mes") escala su fuente (adjustsFontSizeToFit)
    // en vez de desbordar horizontalmente. Los montos cortos quedan a
    // tamaño completo, pegados al label como antes (no se fuerza shrink
    // si no hace falta).
    flexShrink: 1,
  },
  // La fila de acciones vive DENTRO de la card para que los botones se
  // dibujen sobre el material de la card y no sobre la hoja.
  replies: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  replyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 44,
    // El handoff usa 22, no cápsula total.
    borderRadius: neoRadii.pill,
  },
  replyCtaText: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.1,
  },
  replySeen: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: 44,
    borderRadius: neoRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replySeenText: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.1,
  },
  // Sub-usage scale row (Mucho / A veces / Casi nunca)
  scaleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  scaleBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: neoRadii.chip,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  scaleBtnFaded: {
    opacity: 0.32,
  },
  scaleBtnText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
    maxWidth: 320,
  },
})
