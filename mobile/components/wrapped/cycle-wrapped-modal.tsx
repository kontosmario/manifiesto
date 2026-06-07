import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { currencyFormatter, formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import type { ApplyDecisionInput } from '@/features/month-close/use-month-close-decision'

type LeftoverOption = 'meta' | 'acumular' | 'reserva'

interface CycleWrappedModalProps {
  /** Payload del ciclo cerrado. `null` mantiene el modal oculto. */
  payload: CycleWrappedPayload | null
  onDismiss: () => void
}

// ── Pacing tokens ────────────────────────────────────────────────────
// El Wrapped se dispara una vez al mes. No hay que apurarse — el
// usuario quiere leer. 4500ms por escena permite mirar el número,
// procesar la copy, y avanzar antes de aburrir.
const SCENE_DURATION_MS = 4500
const SCENE_TRANSITION_MS = 360
const EXPO_OUT = Easing.bezier(0.16, 1, 0.30, 1) // ease-out-expo

const SCREEN_WIDTH = Dimensions.get('window').width

// ── Component ────────────────────────────────────────────────────────

/**
 * "Manifiesto Wrapped" — post-cobro recap del ciclo cerrado.
 *
 * Diseñado como una edición de revista mensual de finanzas personales,
 * no como un slideshow tipo Spotify Wrapped. La gramática de stories
 * (progress bars + tap-to-advance) se mantiene porque el usuario la
 * reconoce y comunica "esto es un momento, no un popup"; pero la
 * estética se aleja deliberadamente del cliché dark + neón:
 *
 *   • Paleta committed cream + forest green del producto (no dark).
 *   • Tipografía editorial weight-driven (sin custom font, system+800/900).
 *   • Un solo elemento dominante por escena — sin grids de widgets.
 *   • Color strategy committed: cada escena toma su tinte saturado.
 *   • Confetti restrained, solo en la escena del veredicto si ahorraste.
 *
 * Motion: ease-out-expo 360ms entre escenas, stagger 60ms eyebrow →
 * hero → subtitle dentro de cada escena. Progress bar linear sobre
 * 4.5s. Long-press pausa, tap left/right navega, swipe-down dismiss.
 */
export function CycleWrappedModal({ payload, onDismiss }: CycleWrappedModalProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const insets = useSafeAreaInsets()

  const [sceneIndex, setSceneIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  // Spec B — selección dentro de la closing scene cuando hay decisión
  // pendiente. Null = aún no eligió → CTA queda disabled. Se resetea
  // al llegar un payload nuevo (ver effect de hidratación más abajo).
  const [leftoverSelected, setLeftoverSelected] = useState<LeftoverOption | null>(null)
  const [applyingLeftover, setApplyingLeftover] = useState(false)

  const handleSelectLeftover = useCallback((next: LeftoverOption) => {
    void triggerHaptic('selection')
    setLeftoverSelected(next)
  }, [])

  const scenes = useMemo(
    () =>
      payload
        ? buildScenes(payload, theme.isDark, leftoverSelected, handleSelectLeftover)
        : [],
    [payload, theme.isDark, leftoverSelected, handleSelectLeftover],
  )
  const sceneCount = scenes.length

  // Master entrance driver: scrim + first scene fade-in.
  const enter = useSharedValue(0)
  // Per-scene progress bar fill. Resets every scene transition.
  const progress = useSharedValue(0)
  // Scene-content opacity for crossfade between scenes.
  const sceneAlpha = useSharedValue(1)
  // Tiny rise on each scene reveal.
  const sceneRise = useSharedValue(0)

  // ── Reset on new payload ────────────────────────────────────
  // Hydrate scene state cada vez que llega un wrapped nuevo. Fires
  // raramente (1×/ciclo en prod) — no es un sync-state-in-effect
  // peligroso, es el reset del estado interno al abrirse el modal.
  useEffect(() => {
    if (!payload) return
    void triggerHaptic('success')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset interno al abrir
    setSceneIndex(0)
    setIsPaused(false)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset interno al abrir
    setLeftoverSelected(null)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset interno al abrir
    setApplyingLeftover(false)
    enter.value = 0
    if (reduced) {
      enter.value = 1
    } else {
      enter.value = withTiming(1, { duration: 420, easing: EXPO_OUT })
    }
  }, [payload, reduced, enter])

  // ── Auto-advance driver ─────────────────────────────────────
  // Maneja: (a) avanzar al cumplirse la duración, (b) llenar el
  // progress bar linearmente, (c) respetar pausa por long-press,
  // (d) reduced motion → no auto-advance (usuario controla manual).
  const advance = useCallback(() => {
    setSceneIndex((idx) => {
      if (idx + 1 >= sceneCount) {
        // Último: dismiss
        runOnJSDismiss(onDismiss)
        return idx
      }
      return idx + 1
    })
  }, [sceneCount, onDismiss])

  useEffect(() => {
    if (!payload) return
    // Cancel cualquier animación previa y resetea
    cancelAnimation(progress)
    progress.value = 0
    // Crossfade del contenido entre escenas
    if (!reduced) {
      sceneAlpha.value = 0
      sceneRise.value = 8
      sceneAlpha.value = withTiming(1, {
        duration: SCENE_TRANSITION_MS,
        easing: EXPO_OUT,
      })
      sceneRise.value = withTiming(0, {
        duration: SCENE_TRANSITION_MS,
        easing: EXPO_OUT,
      })
    } else {
      sceneAlpha.value = 1
      sceneRise.value = 0
    }

    if (isPaused || reduced) return
    // Última escena con decisión pendiente → no auto-advance. El user
    // tiene que tomar la decisión con el CTA; cerrar solo por timer le
    // saca tiempo y desactiva la oportunidad de Spec B inline.
    const isLastScene = sceneIndex + 1 >= sceneCount
    const hasPendingOnLast =
      isLastScene &&
      Boolean(payload.pendingLeftoverDecision && payload.onApplyLeftoverDecision)
    if (hasPendingOnLast) return
    // Arranca el progress timer — al llegar a 1, avanza.
    progress.value = withTiming(
      1,
      { duration: SCENE_DURATION_MS, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(advance)()
      },
    )
    return () => {
      cancelAnimation(progress)
    }
  }, [
    sceneIndex,
    sceneCount,
    isPaused,
    payload,
    reduced,
    progress,
    sceneAlpha,
    sceneRise,
    advance,
  ])

  // ── Touch zone handlers ─────────────────────────────────────
  const handleTapLeft = useCallback(() => {
    void triggerHaptic('selection')
    setSceneIndex((i) => Math.max(0, i - 1))
  }, [])
  const handleTapRight = useCallback(() => {
    void triggerHaptic('selection')
    if (sceneIndex + 1 >= sceneCount) {
      onDismiss()
    } else {
      setSceneIndex((i) => Math.min(sceneCount - 1, i + 1))
    }
  }, [sceneIndex, sceneCount, onDismiss])
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handlePressIn = useCallback(() => {
    // Hold ≥160ms → pause. Tap simple no debe pausar.
    pauseTimerRef.current = setTimeout(() => {
      setIsPaused(true)
    }, 160)
  }, [])
  const handlePressOut = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current)
      pauseTimerRef.current = null
    }
    if (isPaused) setIsPaused(false)
  }, [isPaused])

  // ── Animated styles ─────────────────────────────────────────
  const scrimStyle = useAnimatedStyle(() => ({ opacity: enter.value }))
  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [24, 0]) },
      { scale: interpolate(enter.value, [0, 1], [0.97, 1]) },
    ],
  }))
  const sceneContentStyle = useAnimatedStyle(() => ({
    opacity: sceneAlpha.value,
    transform: [{ translateY: sceneRise.value }],
  }))

  // ── Early return ────────────────────────────────────────────
  if (!payload || sceneCount === 0) return null

  const scene = scenes[sceneIndex]
  if (!scene) return null

  return (
    <Animated.View
      pointerEvents={payload ? 'auto' : 'none'}
      style={[
        styles.scrim,
        scrimStyle,
        // Scrim casi opaco — el wrapped es modal pesado, ocupa pantalla
        // entera y la cream-on-black queda con suficiente contraste
        // para el card sin competir con el fondo.
        { backgroundColor: 'rgba(8, 20, 14, 0.78)' },
      ]}
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: scene.background,
            paddingTop: Math.max(16, insets.top + 8),
            paddingBottom: Math.max(20, insets.bottom + 16),
          },
          cardStyle,
        ]}
      >
        {/* ── Progress bars (top) ──────────────────────────── */}
        <View style={styles.progressRow}>
          {scenes.map((_, idx) => (
            <ProgressSegment
              key={idx}
              index={idx}
              currentIndex={sceneIndex}
              progress={progress}
              trackColor={scene.progressTrack}
              fillColor={scene.progressFill}
            />
          ))}
        </View>

        {/* ── Header strip: back (cuando aplica) + brand + close ── */}
        <View style={styles.headerRow}>
          {/* Back chevron — visible cuando estamos en la última escena
              con decisión pendiente (las tap zones de navegación están
              deshabilitadas en ese modo para que los OptionCards reciban
              taps). Permite revisar las historias anteriores antes de
              decidir. En otras escenas las tap zones manejan la
              navegación, así que no hace falta el botón. */}
          {sceneIndex > 0 &&
          sceneIndex + 1 >= sceneCount &&
          Boolean(payload?.pendingLeftoverDecision && payload?.onApplyLeftoverDecision) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Escena anterior"
              onPress={handleTapLeft}
              hitSlop={16}
              style={({ pressed }) => [
                styles.closeBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <MaterialIcons
                name="chevron-left"
                size={22}
                color={scene.foregroundSoft}
              />
            </Pressable>
          ) : null}
          <Text
            style={[styles.brandMark, { color: scene.foregroundSoft }]}
            accessibilityRole="header"
          >
            MANIFIESTO
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar resumen"
            onPress={onDismiss}
            hitSlop={16}
            style={({ pressed }) => [
              styles.closeBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <MaterialIcons
              name="close"
              size={20}
              color={scene.foregroundSoft}
            />
          </Pressable>
        </View>

        {/* ── Scene content ─────────────────────────────────── */}
        <Animated.View style={[styles.sceneStage, sceneContentStyle]}>
          {scene.render({ reduced })}
        </Animated.View>

        {/* ── Footer: CTA on last scene, hint otherwise ────── */}
        <View style={styles.footer}>
          {sceneIndex === sceneCount - 1 ? (() => {
            const hasPendingDecision = Boolean(
              payload?.pendingLeftoverDecision && payload?.onApplyLeftoverDecision,
            )
            const disabled =
              applyingLeftover || (hasPendingDecision && leftoverSelected === null)
            const label = hasPendingDecision
              ? leftoverSelected
                ? 'Confirmar y empezar'
                : 'Elegí una opción'
              : 'Empezar el próximo'
            const handlePress = async () => {
              if (disabled) return
              void triggerHaptic('selection')
              if (
                hasPendingDecision &&
                leftoverSelected &&
                payload?.onApplyLeftoverDecision &&
                payload?.pendingLeftoverDecision
              ) {
                setApplyingLeftover(true)
                try {
                  let input: ApplyDecisionInput
                  if (leftoverSelected === 'meta') {
                    if (!payload.activeGoal) {
                      // Sin meta: la opción NO debe ser seleccionable
                      // (gating en la card). Defensa por si llega acá.
                      setApplyingLeftover(false)
                      return
                    }
                    input = {
                      monthlySummaryId: payload.pendingLeftoverDecision.monthlySummaryId,
                      decision: 'meta',
                      metaGoalId: payload.activeGoal.id,
                    }
                  } else if (leftoverSelected === 'acumular') {
                    input = {
                      monthlySummaryId: payload.pendingLeftoverDecision.monthlySummaryId,
                      decision: 'acumular',
                      newCycleAnchor:
                        payload.nextCycleAnchor ??
                        new Date().toISOString().slice(0, 10),
                    }
                  } else {
                    input = {
                      monthlySummaryId: payload.pendingLeftoverDecision.monthlySummaryId,
                      decision: 'reserva',
                    }
                  }
                  await payload.onApplyLeftoverDecision(input)
                  setApplyingLeftover(false)
                  onDismiss()
                } catch {
                  setApplyingLeftover(false)
                  // Errores de RPC los maneja el caller (mutation onError).
                }
                return
              }
              onDismiss()
            }
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => void handlePress()}
                style={({ pressed }) => [
                  styles.cta,
                  {
                    backgroundColor: scene.ctaBg,
                    opacity: disabled ? 0.4 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                <Text style={[styles.ctaText, { color: scene.ctaFg }]}>
                  {label}
                </Text>
                <MaterialIcons
                  name="arrow-forward"
                  size={18}
                  color={scene.ctaFg}
                />
              </Pressable>
            )
          })() : (
            <Text style={[styles.hint, { color: scene.foregroundSoft }]}>
              {isPaused ? 'En pausa. Soltá para seguir.' : 'Mantené presionado para pausar.'}
            </Text>
          )}
        </View>

        {/* ── Tap zones (above content, below close) ─────────
            En la última escena con decisión pendiente NO mostramos las
            tap zones — los OptionCards deben recibir los taps directo
            (sin que el wrapper de "siguiente/anterior escena" los
            intercepte). El user maneja el flow con el CTA y el botón
            de cerrar (X) sigue disponible. */}
        {!(sceneIndex + 1 >= sceneCount &&
          Boolean(payload?.pendingLeftoverDecision && payload?.onApplyLeftoverDecision)) ? (
          <View style={styles.tapZones} pointerEvents="box-none">
            <Pressable
              onPress={handleTapLeft}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              accessibilityLabel="Escena anterior"
              style={styles.tapZoneLeft}
            />
            <Pressable
              onPress={handleTapRight}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              accessibilityLabel={
                sceneIndex + 1 >= sceneCount
                  ? 'Cerrar resumen'
                  : 'Escena siguiente'
              }
              style={styles.tapZoneRight}
            />
          </View>
        ) : null}

        {/* Confetti solo en el veredicto positivo */}
        {scene.confetti ? (
          <ConfettiBurst pulseToken={sceneIndex === scene.confettiSceneIdx ? 1 : 0} originY={200} />
        ) : null}
      </Animated.View>
    </Animated.View>
  )
}

// Worklet-safe wrapper para llamar dismiss desde el callback de
// withTiming (que corre en el UI thread).
function runOnJSDismiss(fn: () => void) {
  'worklet'
  runOnJS(fn)()
}

// ── Progress bar segment ─────────────────────────────────────────────

interface ProgressSegmentProps {
  index: number
  currentIndex: number
  progress: SharedValue<number>
  trackColor: string
  fillColor: string
}

function ProgressSegment({
  index,
  currentIndex,
  progress,
  trackColor,
  fillColor,
}: ProgressSegmentProps) {
  const fillStyle = useAnimatedStyle(() => {
    // Past: 100%, current: progress, future: 0%
    let pct: number
    if (index < currentIndex) pct = 1
    else if (index === currentIndex) pct = progress.value
    else pct = 0
    return { width: `${pct * 100}%` }
  })

  return (
    <View style={[progressStyles.track, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[progressStyles.fill, { backgroundColor: fillColor }, fillStyle]}
      />
    </View>
  )
}

// ── Scene model ──────────────────────────────────────────────────────

interface SceneRenderArgs {
  reduced: boolean
}

interface Scene {
  id: string
  background: string
  foreground: string
  foregroundSoft: string
  progressTrack: string
  progressFill: string
  ctaBg: string
  ctaFg: string
  confetti?: boolean
  confettiSceneIdx?: number
  render: (args: SceneRenderArgs) => React.ReactNode
}

function buildScenes(
  payload: CycleWrappedPayload,
  isDark: boolean,
  leftoverSelected: LeftoverOption | null,
  onSelectLeftover: (next: LeftoverOption) => void,
): Scene[] {
  // El veredicto carga su propia paleta state-driven. El cierre usa
  // forest-deep para hacer statement de cierre, deliberadamente
  // desvinculado del estado anímico del veredicto (un over-budget
  // sigue cerrando con la misma identidad de marca).
  const verdict = resolveVerdictTone(payload.savingsDelta, isDark)

  return [
    buildCoverScene(payload),
    buildVerdictScene(payload, verdict),
    ...(payload.topCategory ? [buildTopCategoryScene(payload)] : []),
    ...(payload.topExpense ? [buildTopExpenseScene(payload)] : []),
    buildClosingScene(payload, leftoverSelected, onSelectLeftover),
  ]
}

// ── Scene builders ───────────────────────────────────────────────────

interface VerdictTone {
  background: string
  foreground: string
  foregroundSoft: string
  accent: string
  progressTrack: string
  progressFill: string
  ctaBg: string
  ctaFg: string
  eyebrow: string
  copyPositive: string
}

function resolveVerdictTone(savingsDelta: number, isDark: boolean): VerdictTone {
  if (savingsDelta > 0) {
    return {
      background: isDark ? '#1F4530' : '#E3F2D2',
      foreground: isDark ? '#F4FDF2' : '#0F2E1F',
      // Soft variants bumped a ~30% para AA legible sobre el tint
      // sin perder la diferenciación con el foreground principal.
      foregroundSoft: isDark ? 'rgba(244,253,242,0.78)' : 'rgba(15,46,31,0.74)',
      // Accent darker para mayor contraste sobre el tint verde claro.
      accent: isDark ? '#A6EF8F' : '#10410A',
      progressTrack: isDark ? 'rgba(244,253,242,0.22)' : 'rgba(15,46,31,0.20)',
      progressFill: isDark ? '#A6EF8F' : '#1F590D',
      ctaBg: isDark ? '#A6EF8F' : '#1F590D',
      ctaFg: isDark ? '#0F2E1F' : '#FFFBF2',
      eyebrow: 'CERRASTE CON MARGEN',
      copyPositive: 'Te queda margen para el siguiente.',
    }
  }
  if (savingsDelta < 0) {
    return {
      background: isDark ? '#4A2418' : '#F8D1C3',
      foreground: isDark ? '#FFFBF2' : '#3B1107',
      foregroundSoft: isDark ? 'rgba(255,251,242,0.78)' : 'rgba(59,17,7,0.74)',
      // Accent oscurecido sobre peach para AA + crisp edge con halo.
      accent: isDark ? '#F2A78C' : '#8E2A0C',
      progressTrack: isDark ? 'rgba(255,251,242,0.22)' : 'rgba(59,17,7,0.22)',
      progressFill: isDark ? '#F2A78C' : '#B84014',
      ctaBg: isDark ? '#F2A78C' : '#B84014',
      ctaFg: isDark ? '#3B1107' : '#FFFBF2',
      eyebrow: 'CERRASTE EXCEDIDO',
      copyPositive: 'Empezás el siguiente con menos colchón.',
    }
  }
  return {
    background: isDark ? '#2A3A2F' : '#EEE9DF',
    foreground: isDark ? '#F4FDF2' : '#12211A',
    foregroundSoft: isDark ? 'rgba(244,253,242,0.78)' : 'rgba(18,33,26,0.74)',
    accent: isDark ? '#A6EF8F' : '#1F590D',
    progressTrack: isDark ? 'rgba(244,253,242,0.22)' : 'rgba(18,33,26,0.20)',
    progressFill: isDark ? '#A6EF8F' : '#1F590D',
    ctaBg: isDark ? '#A6EF8F' : '#1F590D',
    ctaFg: isDark ? '#0F2E1F' : '#FFFBF2',
    eyebrow: 'CERRASTE EMPATADO',
    copyPositive: 'Justo lo que tenías, ni más ni menos.',
  }
}

// 1. Cover scene
function buildCoverScene(payload: CycleWrappedPayload): Scene {
  return {
    id: 'cover',
    background: '#FFFBF2', // cream paper
    foreground: '#0F2E1F',
    // Soft text alphas bumpeados a 0.72 (era 0.55) — AA legible sobre
    // cream sin colapsar la jerarquía con el foreground primario.
    foregroundSoft: 'rgba(15,46,31,0.72)',
    progressTrack: 'rgba(15,46,31,0.18)',
    progressFill: '#1F590D',
    ctaBg: '#1F590D',
    ctaFg: '#FFFBF2',
    render: () => (
      <View style={coverStyles.stage}>
        <Text style={[coverStyles.eyebrow, { color: 'rgba(15,46,31,0.72)' }]}>
          EDICIÓN {payload.periodLabel.toUpperCase()}
        </Text>
        <Text style={[coverStyles.title, { color: '#0F2E1F' }]} accessibilityRole="header">
          Tu mes,{'\n'}en cifras.
        </Text>
        {payload.periodRange ? (
          <Text style={[coverStyles.range, { color: 'rgba(15,46,31,0.72)' }]}>
            {payload.periodRange}
          </Text>
        ) : null}
        <View style={coverStyles.rule} />
        <Text style={[coverStyles.kicker, { color: 'rgba(15,46,31,0.85)' }]}>
          Una lectura corta de cómo cerraste.
        </Text>
      </View>
    ),
  }
}

// 2. Verdict scene (savings delta)
function buildVerdictScene(
  payload: CycleWrappedPayload,
  tone: VerdictTone,
): Scene {
  const hasDelta =
    payload.deltaVsPreviousPercent != null &&
    Number.isFinite(payload.deltaVsPreviousPercent)
  const deltaRounded = hasDelta ? Math.round(payload.deltaVsPreviousPercent!) : 0
  const sign = payload.savingsDelta > 0 ? '+' : payload.savingsDelta < 0 ? '−' : ''

  return {
    id: 'verdict',
    background: tone.background,
    foreground: tone.foreground,
    foregroundSoft: tone.foregroundSoft,
    progressTrack: tone.progressTrack,
    progressFill: tone.progressFill,
    ctaBg: tone.ctaBg,
    ctaFg: tone.ctaFg,
    confetti: payload.savingsDelta > 0,
    confettiSceneIdx: 1, // segunda escena
    render: ({ reduced }) => {
      const heroAmount = Math.abs(payload.savingsDelta)
      // Halo cream sutil detrás del hero — crea "respiración" entre la
      // tinta del número y el tint del fondo cuando son del mismo hue
      // (peach-on-peach, green-on-green). No es un stroke duro: es un
      // glow blando 8pt radius que solo se nota si te acercás.
      const heroHalo = {
        textShadowColor: 'rgba(255,251,242,0.55)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
      }
      return (
        <View style={verdictStyles.stage}>
          <Text
            style={[verdictStyles.eyebrow, { color: tone.foregroundSoft }]}
          >
            {tone.eyebrow}
          </Text>

          <View style={verdictStyles.numberRow}>
            <Text style={[verdictStyles.sign, { color: tone.accent }, heroHalo]}>
              {sign}
            </Text>
            {reduced ? (
              <Text style={[verdictStyles.hero, { color: tone.accent }, heroHalo]}>
                {formatMoney(Math.round(heroAmount))}
              </Text>
            ) : (
              <CountUpText
                value={heroAmount}
                duration={1800}
                format={(n) => formatMoney(Math.round(n))}
                style={[verdictStyles.hero, { color: tone.accent }, heroHalo]}
              />
            )}
          </View>

          <Text style={[verdictStyles.copy, { color: tone.foreground }]}>
            {tone.copyPositive}
          </Text>

          {hasDelta && deltaRounded !== 0 ? (
            <View
              style={[
                verdictStyles.deltaPill,
                // Pill background más opaco para crisp legibility.
                { backgroundColor: 'rgba(255,251,242,0.55)' },
              ]}
            >
              <MaterialIcons
                name={deltaRounded < 0 ? 'south' : 'north'}
                size={14}
                color={tone.foreground}
              />
              <Text
                style={[verdictStyles.deltaText, { color: tone.foreground }]}
              >
                {Math.abs(deltaRounded)}% vs el ciclo anterior
              </Text>
            </View>
          ) : null}
        </View>
      )
    },
  }
}

// 3. Top category scene
function buildTopCategoryScene(payload: CycleWrappedPayload): Scene {
  return {
    id: 'top-category',
    background: '#F6EFE3', // cream warm
    foreground: '#0F2E1F',
    foregroundSoft: 'rgba(15,46,31,0.72)',
    progressTrack: 'rgba(15,46,31,0.18)',
    progressFill: '#1F590D',
    ctaBg: '#1F590D',
    ctaFg: '#FFFBF2',
    render: () => {
      const top = payload.topCategory!
      return (
        <View style={detailStyles.stage}>
          <Text style={[detailStyles.eyebrow, { color: 'rgba(15,46,31,0.72)' }]}>
            DONDE MÁS SE FUE
          </Text>
          <Text
            style={[detailStyles.titleDisplay, { color: '#0F2E1F' }]}
            numberOfLines={2}
            accessibilityRole="header"
          >
            {top.name}
          </Text>
          <View style={detailStyles.amountRow}>
            <Text style={[detailStyles.amount, { color: '#10410A' }]}>
              {formatMoney(Math.round(top.amount))}
            </Text>
            <Text style={[detailStyles.share, { color: 'rgba(15,46,31,0.72)' }]}>
              {Math.round(top.share * 100)}% del mes
            </Text>
          </View>

          {/* Full-bleed share bar — track más oscuro para visibilidad */}
          <View style={[detailStyles.barTrack, { backgroundColor: 'rgba(15,46,31,0.14)' }]}>
            <View
              style={[
                detailStyles.barFill,
                {
                  width: `${Math.max(8, Math.round(top.share * 100))}%`,
                  backgroundColor: '#10410A',
                },
              ]}
            />
          </View>
        </View>
      )
    },
  }
}

// 4. Top expense scene
function buildTopExpenseScene(payload: CycleWrappedPayload): Scene {
  // Halo cream sutil para el amount peach-on-peach — mismo recurso que
  // el veredicto negativo. Crisp edge sin parecer stroke.
  const amountHalo = {
    textShadowColor: 'rgba(255,251,242,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  }
  return {
    id: 'top-expense',
    background: '#F8D1C3', // peach band, warm accent
    foreground: '#3B1107',
    foregroundSoft: 'rgba(59,17,7,0.74)',
    progressTrack: 'rgba(59,17,7,0.22)',
    progressFill: '#8E2A0C',
    ctaBg: '#8E2A0C',
    ctaFg: '#FFFBF2',
    render: () => {
      const top = payload.topExpense!
      return (
        <View style={detailStyles.stage}>
          <Text style={[detailStyles.eyebrow, { color: 'rgba(59,17,7,0.74)' }]}>
            EL GASTO QUE MÁS PESÓ
          </Text>
          <Text
            style={[detailStyles.titleDisplay, { color: '#3B1107' }]}
            numberOfLines={3}
            accessibilityRole="header"
          >
            {top.description || 'Sin descripción'}
          </Text>
          <Text style={[detailStyles.amount, { color: '#8E2A0C', marginTop: 16 }, amountHalo]}>
            {currencyFormatter.format(top.price)}
          </Text>
          <Text style={[detailStyles.dateMark, { color: 'rgba(59,17,7,0.74)' }]}>
            {formatLongDate(top.occurredAt)}
          </Text>
        </View>
      )
    },
  }
}

// 5. Closing scene
function buildClosingScene(
  payload: CycleWrappedPayload,
  leftoverSelected: LeftoverOption | null,
  onSelectLeftover: (next: LeftoverOption) => void,
): Scene {
  return {
    id: 'closing',
    background: '#0F2E1F', // forest deep, brand statement
    foreground: '#F4FDF2',
    // Sobre forest deep el contraste es altísimo, pero bumpeamos a
    // 0.82 para que eyebrow/labels no parezcan "apagados".
    foregroundSoft: 'rgba(244,253,242,0.82)',
    progressTrack: 'rgba(244,253,242,0.24)',
    progressFill: '#A6EF8F',
    ctaBg: '#A6EF8F',
    ctaFg: '#0F2E1F',
    render: () => {
      const hasPending = Boolean(
        payload.pendingLeftoverDecision && payload.onApplyLeftoverDecision,
      )
      // `past` solo se considera cuando NO hay pending (mutuamente
      // exclusivos en spec). Si por error llegan los dos, `pending`
      // gana porque está actualmente operando un flow no-decidido.
      // — la guard del spec dice "prevalece pastLeftoverDecision",
      // pero acá lo invertimos para preservar el contrato actual del
      // CTA aplicador (si el caller pidió pending+callback es porque
      // todavía hay decisión que tomar). En la práctica los dos NUNCA
      // vienen juntos: control-v2-screen y home-dashboard branch-an
      // entre uno u el otro.
      const past = hasPending ? undefined : payload.pastLeftoverDecision
      // skip no es interesante visualizarlo (el user explícitamente
      // se saltó la decisión) → fallback a la closing scene vanilla.
      const showLeftoverSection =
        hasPending || (past != null && past.decision !== 'skip')
      const goalTitle = payload.activeGoal?.title ?? null
      return (
        <View style={closingStyles.stage}>
          {/* ── Sección histórica (siempre presente) ────────── */}
          <Text style={[closingStyles.eyebrow, { color: 'rgba(244,253,242,0.82)' }]}>
            EL PRÓXIMO ARRANCA HOY
          </Text>
          <Text
            style={[
              showLeftoverSection ? closingStyles.titleCompact : closingStyles.title,
              { color: '#F4FDF2' },
            ]}
            accessibilityRole="header"
          >
            Tenés{'\n'}{formatMoney(Math.round(payload.monthlyIncome))}{'\n'}para administrar.
          </Text>
          {payload.achievementsEarnedInCycle > 0 ? (
            <View
              style={[
                closingStyles.achievementsRow,
                { borderColor: 'rgba(166,239,143,0.55)' },
              ]}
            >
              <MaterialIcons name="emoji-events" size={16} color="#A6EF8F" />
              <Text style={[closingStyles.achievementsText, { color: '#A6EF8F' }]}>
                {payload.achievementsEarnedInCycle === 1
                  ? '1 logro desbloqueado este mes'
                  : `${payload.achievementsEarnedInCycle} logros desbloqueados este mes`}
              </Text>
            </View>
          ) : null}
          <View style={closingStyles.summaryRow}>
            <SummaryStat
              label="Gastaste"
              value={formatMoney(Math.round(payload.totalSpent))}
              color="#F4FDF2"
              mutedColor="rgba(244,253,242,0.82)"
            />
            <View style={closingStyles.summaryDivider} />
            <SummaryStat
              label="Movimientos"
              value={String(payload.expensesCount)}
              color="#F4FDF2"
              mutedColor="rgba(244,253,242,0.82)"
            />
          </View>

          {/* ── Sección decisión sobrante (pending o past) ── */}
          {showLeftoverSection ? (
            <>
              <View style={closingStyles.sectionDivider} />
              <Text style={[closingStyles.leftoverEyebrow, { color: 'rgba(244,253,242,0.82)' }]}>
                {past ? 'YA DECIDISTE' : 'Y TE SOBRARON'}
              </Text>
              <Text style={[closingStyles.leftoverAmount, { color: '#A6EF8F' }]}>
                {formatMoney(
                  Math.round(
                    past ? past.sobrante : payload.pendingLeftoverDecision!.sobrante,
                  ),
                )}
              </Text>
              {!past ? (
                <Text style={[closingStyles.leftoverSubtitle, { color: 'rgba(244,253,242,0.82)' }]}>
                  ¿Qué hacés con esto?
                </Text>
              ) : null}
              <View style={closingStyles.optionsStack}>
                <LeftoverOptionCard
                  icon="track-changes"
                  title={
                    past?.decision === 'meta' && past?.metaGoalTitle
                      ? `Aportaste a ${past.metaGoalTitle}`
                      : goalTitle
                        ? `Sumar a ${goalTitle}`
                        : 'A una meta'
                  }
                  subtitle={
                    past?.decision === 'meta'
                      ? 'Aporte realizado'
                      : goalTitle
                        ? 'Aporte directo'
                        : 'Primero creá una meta'
                  }
                  selected={past ? past.decision === 'meta' : leftoverSelected === 'meta'}
                  disabled={Boolean(past) || !payload.activeGoal}
                  readOnly={Boolean(past)}
                  onPress={past ? () => {} : () => onSelectLeftover('meta')}
                />
                <LeftoverOptionCard
                  icon="trending-up"
                  title="Sumar al mes actual"
                  subtitle={
                    past?.decision === 'acumular' ? 'Hecho' : 'Queda como disponible extra'
                  }
                  selected={past ? past.decision === 'acumular' : leftoverSelected === 'acumular'}
                  disabled={Boolean(past)}
                  readOnly={Boolean(past)}
                  onPress={past ? () => {} : () => onSelectLeftover('acumular')}
                />
                <LeftoverOptionCard
                  icon="savings"
                  title="Guardar como reserva"
                  subtitle={
                    past?.decision === 'reserva' ? 'Guardado' : 'Plata aparte, sin destino'
                  }
                  selected={past ? past.decision === 'reserva' : leftoverSelected === 'reserva'}
                  disabled={Boolean(past)}
                  readOnly={Boolean(past)}
                  onPress={past ? () => {} : () => onSelectLeftover('reserva')}
                />
              </View>
              {past ? (
                <Text style={closingStyles.pastDecisionHint}>
                  Decidiste el {formatPastDate(past.decidedAt)}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      )
    },
  }
}

// Card de opción de leftover. Compacta, dark-friendly sobre forest deep.
// Radio button visual a la derecha + tap full-card → onPress.
function LeftoverOptionCard({
  icon,
  title,
  subtitle,
  selected,
  disabled = false,
  readOnly = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  title: string
  subtitle: string
  selected: boolean
  disabled?: boolean
  /** Replay mode: ya hay decisión persistida. La selected card se ve
   *  como confirmed (borde + tint primary); las no-selected se
   *  silencian con opacity 0.35. Disabled true → sin onPress, sin
   *  haptic. */
  readOnly?: boolean
  onPress: () => void
}) {
  // En readOnly: la card seleccionada brilla normal (borde + bg
  // primary), las no-seleccionadas se silencian a 0.35. Esto mantiene
  // la lectura "esta fue la decisión" sin parecer un control activo.
  return (
    <Pressable
      onPress={readOnly ? () => {} : onPress}
      disabled={disabled || readOnly}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: disabled || readOnly }}
      style={({ pressed }) => [
        leftoverCardStyles.card,
        {
          borderColor: selected ? '#A6EF8F' : 'rgba(244,253,242,0.18)',
          backgroundColor: selected
            ? 'rgba(166,239,143,0.10)'
            : 'rgba(244,253,242,0.04)',
          opacity:
            readOnly && !selected
              ? 0.35
              : disabled
                ? 0.4
                : pressed
                  ? 0.85
                  : 1,
        },
      ]}
    >
      <View style={leftoverCardStyles.iconWrap}>
        <MaterialIcons
          name={icon}
          size={18}
          color={selected ? '#A6EF8F' : 'rgba(244,253,242,0.82)'}
        />
      </View>
      <View style={leftoverCardStyles.text}>
        <Text style={leftoverCardStyles.title} numberOfLines={1}>{title}</Text>
        <Text style={leftoverCardStyles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <MaterialIcons
        name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
        size={18}
        color={selected ? '#A6EF8F' : 'rgba(244,253,242,0.62)'}
      />
    </Pressable>
  )
}

const leftoverCardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(244,253,242,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F4FDF2',
    marginBottom: 1,
  },
  subtitle: { fontSize: 11, color: 'rgba(244,253,242,0.72)' },
})

// ── Small subcomponents ──────────────────────────────────────────────

function SummaryStat({
  label,
  value,
  color,
  mutedColor,
}: {
  label: string
  value: string
  color: string
  mutedColor: string
}) {
  return (
    <View style={summaryStyles.cell}>
      <Text style={[summaryStyles.label, { color: mutedColor }]}>{label}</Text>
      <Text style={[summaryStyles.value, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatLongDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return ''
  const year = Number(match[1])
  const day = Number(match[3])
  const month = Number(match[2])
  return `${day} de ${MONTH_NAMES[month - 1]}, ${year}`
}

/** Formato compacto para "Decidiste el ..." en replay read-only.
 *  Parsea timestamptz/ISO completo (no solo YYYY-MM-DD) — `decided_at`
 *  es timestamptz en la DB. */
function formatPastDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dd = d.getDate()
  const mm = MONTH_NAMES[d.getMonth()]
  const yy = d.getFullYear()
  return `${dd} de ${mm} ${yy}`
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  card: {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  brandMark: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sceneStage: {
    flex: 1,
    justifyContent: 'center',
  },
  footer: {
    paddingTop: 12,
    minHeight: 56,
    justifyContent: 'center',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 18,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  hint: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  tapZones: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    // Sit below the close button and progress bar (which have higher
    // z by virtue of declaration order in the parent View).
  },
  tapZoneLeft: { width: '33%', height: '100%' },
  tapZoneRight: { flex: 1, height: '100%' },
})

const progressStyles = StyleSheet.create({
  track: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
})

// Scene-specific styles
const coverStyles = StyleSheet.create({
  stage: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  title: {
    fontSize: Math.min(60, SCREEN_WIDTH * 0.16),
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: Math.min(62, SCREEN_WIDTH * 0.17),
  },
  range: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  rule: {
    width: 48,
    height: 2,
    backgroundColor: '#1F590D',
    marginTop: 12,
    marginBottom: 4,
  },
  kicker: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 20,
    maxWidth: 260,
  },
})

const verdictStyles = StyleSheet.create({
  stage: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  sign: {
    fontSize: Math.min(54, SCREEN_WIDTH * 0.14),
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: Math.min(60, SCREEN_WIDTH * 0.16),
  },
  hero: {
    fontSize: Math.min(56, SCREEN_WIDTH * 0.15),
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: Math.min(60, SCREEN_WIDTH * 0.16),
    fontVariant: ['tabular-nums'],
  },
  copy: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.3,
    lineHeight: 25,
    maxWidth: 300,
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
})

const detailStyles = StyleSheet.create({
  stage: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  titleDisplay: {
    fontSize: Math.min(44, SCREEN_WIDTH * 0.115),
    fontWeight: '900',
    letterSpacing: -1.4,
    lineHeight: Math.min(48, SCREEN_WIDTH * 0.125),
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  amount: {
    fontSize: Math.min(36, SCREEN_WIDTH * 0.095),
    fontWeight: '900',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  share: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  barTrack: {
    marginTop: 16,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,46,31,0.10)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
  dateMark: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginTop: 4,
  },
})

const closingStyles = StyleSheet.create({
  stage: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  title: {
    fontSize: Math.min(40, SCREEN_WIDTH * 0.105),
    fontWeight: '900',
    letterSpacing: -1.2,
    lineHeight: Math.min(46, SCREEN_WIDTH * 0.12),
    fontVariant: ['tabular-nums'],
  },
  // Variant compacta cuando la closing scene tiene además la sección
  // de decisión de sobrante debajo — entra todo sin clip en pantallas
  // chicas (SE).
  titleCompact: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 38,
    textAlign: 'left',
    marginBottom: 12,
    fontVariant: ['tabular-nums'],
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(244,253,242,0.18)',
    marginVertical: 18,
    marginHorizontal: -4,
  },
  leftoverEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  leftoverAmount: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  leftoverSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  optionsStack: {
    width: '100%',
    gap: 8,
    marginTop: 4,
  },
  pastDecisionHint: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(244,253,242,0.62)',
    textAlign: 'center',
  },
  achievementsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  achievementsText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 18,
    gap: 16,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    // Bump del divider para que se vea en pantallas tipo OLED donde
    // la hairline a 0.32 se traga.
    backgroundColor: 'rgba(244,253,242,0.5)',
  },
})

const summaryStyles = StyleSheet.create({
  cell: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
})
