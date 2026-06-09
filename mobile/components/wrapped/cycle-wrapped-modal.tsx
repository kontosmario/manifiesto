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
  FadeIn,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion'
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
const SCENE_TRANSITION_MS = 280
const EXPO_OUT = Easing.bezier(0.16, 1, 0.30, 1) // ease-out-expo
// Stagger entrance entre OptionCards (Spec B). Solo aplica al primer
// mount de la closing scene en MODE pending.
const OPTION_STAGGER_MS = 70
const OPTION_ENTER_MS = 260

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
  // Confetti pulse — increment cuando el user confirma una decisión
  // real (meta/acumular/reserva). NO en flow vanilla "Empezar el
  // próximo" ni en past mode (read-only).
  const [confettiToken, setConfettiToken] = useState(0)

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
  // Parallax X slide al cambiar de escena — incoming arranca en +12
  // y baja a 0 en 280ms ease-out-expo. Movimiento sutil que da sensación
  // de "página que entra" sin distraer del contenido.
  const sceneTranslateX = useSharedValue(0)
  // Background crossfade entre escenas. 0 = bg previo, 1 = bg actual.
  // Se anima junto con sceneAlpha en cada transición → en vez del salto
  // duro de color (forest→cream→…), el bg interpola smooth.
  const sceneBgProgress = useSharedValue(1)
  // Background previo como SHARED VALUE (no ref) — el worklet del
  // cardBgStyle lo lee. Si fuera ref-en-worklet, Reanimated alerta
  // sobre mutación de propiedad ya serializada.
  const prevSceneBgSv = useSharedValue<string>('#000000')

  // sceneIndex como ref JS-only (no entra al worklet). Permite que
  // los event handlers lean el index actual sin recrear el callback en
  // cada render — y critically, evita warnings "modify key current of
  // serialized worklet object" si lo refactoreáramos para entrar al UI
  // thread (lo cual NO hacemos: solo lo lee JS).
  const sceneIndexRef = useRef(0)
  useEffect(() => {
    sceneIndexRef.current = sceneIndex
  }, [sceneIndex])

  // ── Reset on new payload ────────────────────────────────────
  // Hydrate scene state cada vez que llega un wrapped nuevo. Fires
  // raramente (1×/ciclo en prod) — no es un sync-state-in-effect
  // peligroso, es el reset del estado interno al abrirse el modal.
  useEffect(() => {
    if (!payload) return
    void triggerHaptic('success')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset interno al abrir
    setSceneIndex(0)
    sceneIndexRef.current = 0
    setIsPaused(false)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset interno al abrir
    setLeftoverSelected(null)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset interno al abrir
    setApplyingLeftover(false)
    enter.value = 0
    if (reduced) {
      enter.value = 1
    } else {
      // @motion-allow: 420ms wrapped scene entrance — designer-tuned para el deck cinemático del wrapped; entre standard (240) y slow (480), matches el feel del source-of-truth deck.
      enter.value = withTiming(1, { duration: 420, easing: EXPO_OUT })
    }
    // CRITICAL: deps == solo lo que define una NUEVA sesión de wrapped.
    // NO incluir leftoverSelected / handleSelectLeftover / scenes
    // porque cualquiera cambia al tap-ear una opción → el effect se
    // re-ejecutaría → setSceneIndex(0) → reset desde escena 1. Bug
    // exacto reportado por el owner.
  }, [payload, reduced, enter])

  // Init del bg previo cuando llega un payload nuevo. Separado del
  // reset arriba para mantener sus deps mínimas (ver comentario).
  // Lee la primera escena directamente del useMemo `scenes` — para el
  // bg, leftoverSelected no influye porque las primeras escenas no
  // tocan el leftover state.
  useEffect(() => {
    if (!payload) return
    const firstBg = scenes[0]?.background
    if (firstBg) prevSceneBgSv.value = firstBg
    // Deps incluyen `theme.isDark` porque `buildScenes` rebuildea las
    // escenas con esa flag — si el user switcha el tema mientras está
    // abierto el wrapped, el bg base de la primera escena cambia y
    // queremos que el SharedValue refleje el nuevo tono. NO incluimos
    // `scenes` ni `leftoverSelected` (cambian al tap-ear option y
    // dispararían un reset incorrecto del bg previo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, prevSceneBgSv, theme.isDark])

  // Transición a una escena nueva. Captura el bg previo en el shared
  // value, resetea sceneAlpha/translateX/bgProgress a sus initialValues
  // SINCRÓNICAMENTE en el event handler (BEFORE el setState), y dispara
  // setSceneIndex. Como las shared value mutations pasan ANTES del
  // re-render de React, el primer paint del scene nuevo ya tiene los
  // valores iniciales correctos — no hay flash. Y como las mutations
  // pasan en handler (no en render), no hay warning de strict mode.
  const transitionToScene = useCallback(
    (nextIdx: number) => {
      const currentIdx = sceneIndexRef.current
      if (nextIdx === currentIdx) return
      const prevScene = scenes[currentIdx]
      if (prevScene) prevSceneBgSv.value = prevScene.background
      if (!reduced) {
        sceneAlpha.value = 0
        sceneTranslateX.value = 12
        sceneBgProgress.value = 0
      }
      sceneIndexRef.current = nextIdx
      setSceneIndex(nextIdx)
    },
    [
      scenes,
      reduced,
      sceneAlpha,
      sceneTranslateX,
      sceneBgProgress,
      prevSceneBgSv,
    ],
  )

  // ── Auto-advance driver ─────────────────────────────────────
  // Maneja: (a) avanzar al cumplirse la duración, (b) llenar el
  // progress bar linearmente, (c) respetar pausa por long-press,
  // (d) reduced motion → no auto-advance (usuario controla manual).
  const advance = useCallback(() => {
    const idx = sceneIndexRef.current
    if (idx + 1 >= sceneCount) {
      onDismiss()
      return
    }
    transitionToScene(idx + 1)
  }, [sceneCount, onDismiss, transitionToScene])

  useEffect(() => {
    if (!payload) return
    // Cancel cualquier animación previa y resetea
    cancelAnimation(progress)
    progress.value = 0
    // Animar hacia los valores finales. Los initialValues (alpha=0,
    // translateX=12, bgProgress=0) ya están seteados sincrónicamente
    // durante el render via el tracker abajo — sin eso, el primer
    // paint del scene nuevo flasheaba a opacity=1.
    if (!reduced) {
      sceneAlpha.value = withTiming(1, {
        duration: SCENE_TRANSITION_MS,
        easing: EXPO_OUT,
      })
      sceneTranslateX.value = withTiming(0, {
        duration: SCENE_TRANSITION_MS,
        easing: EXPO_OUT,
      })
      sceneBgProgress.value = withTiming(1, {
        duration: SCENE_TRANSITION_MS,
        easing: EXPO_OUT,
      })
    } else {
      sceneAlpha.value = 1
      sceneTranslateX.value = 0
      sceneBgProgress.value = 1
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
    sceneTranslateX,
    sceneBgProgress,
    advance,
  ])

  // ── Touch zone handlers ─────────────────────────────────────
  const handleTapLeft = useCallback(() => {
    void triggerHaptic('selection')
    const next = Math.max(0, sceneIndexRef.current - 1)
    transitionToScene(next)
  }, [transitionToScene])
  const handleTapRight = useCallback(() => {
    void triggerHaptic('selection')
    const idx = sceneIndexRef.current
    if (idx + 1 >= sceneCount) {
      onDismiss()
    } else {
      transitionToScene(idx + 1)
    }
  }, [sceneCount, onDismiss, transitionToScene])
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
    transform: [{ translateX: sceneTranslateX.value }],
  }))

  // Background interpolado entre el bg de la escena previa y la actual.
  // sceneBgProgress 0→1 driveado en el useEffect de cambio de escena;
  // prevSceneBgSv lo seta `transitionToScene` ANTES del setSceneIndex,
  // así que el worklet siempre tiene el color de origen correcto para
  // el crossfade.
  const currentSceneBg = scenes[sceneIndex]?.background ?? '#000000'
  const cardBgStyle = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(
        sceneBgProgress.value,
        [0, 1],
        [prevSceneBgSv.value, currentSceneBg],
      ),
    }),
    [currentSceneBg],
  )

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
            paddingTop: Math.max(16, insets.top + 8),
            paddingBottom: Math.max(20, insets.bottom + 16),
          },
          cardBgStyle,
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
          {/* Back chevron — visible SIEMPRE en la última escena (no
              solo cuando hay pending decision). Las tap zones se
              deshabilitan en la última escena para que el CTA y los
              OptionCards reciban taps; el chevron es la única manera
              de retroceder de la última escena. Antes solo aparecía
              con pending → en mes neutro (sin pending) el user no
              podía volver atrás y al tocar el CTA caía sobre la tap
              zone. */}
          {sceneIndex > 0 && sceneIndex + 1 >= sceneCount ? (
            <Animated.View
              entering={
                reduced
                  ? undefined
                  : FadeIn.duration(220).easing(EXPO_OUT)
              }
            >
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
            </Animated.View>
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
          {sceneIndex === sceneCount - 1 ? (
            <CycleWrappedCta
              payload={payload}
              leftoverSelected={leftoverSelected}
              applyingLeftover={applyingLeftover}
              setApplyingLeftover={setApplyingLeftover}
              onDismiss={onDismiss}
              fireConfetti={() => setConfettiToken((t) => t + 1)}
              ctaBg={scene.ctaBg}
              ctaFg={scene.ctaFg}
              reduced={reduced}
            />
          ) : (
            <Text style={[styles.hint, { color: scene.foregroundSoft }]}>
              {isPaused ? 'En pausa. Soltá para seguir.' : 'Mantené presionado para pausar.'}
            </Text>
          )}
        </View>

        {/* ── Tap zones (above content, below close) ─────────
            En la ÚLTIMA escena NO mostramos las tap zones (de cualquier
            tipo: vanilla, pending, past). Razones:
              - El CTA ("Empezar el próximo" / "Confirmar y empezar")
                recibe los taps directo sin que el wrapper los intercepte.
              - Los OptionCards (pending decision) reciben los taps directo.
              - El chevron back del header reemplaza la tap zone
                izquierda para retroceder al scene anterior.
              - El close X cierra el modal.
            Antes el gate dependía de pending decision → en mes neutro
            las tap zones quedaban activas y tapaban el CTA (owner
            feedback 2026-06-08). */}
        {sceneIndex + 1 < sceneCount ? (
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
              accessibilityLabel="Escena siguiente"
              style={styles.tapZoneRight}
            />
          </View>
        ) : null}

        {/* Confetti solo en el veredicto positivo */}
        {scene.confetti ? (
          <ConfettiBurst pulseToken={sceneIndex === scene.confettiSceneIdx ? 1 : 0} originY={200} />
        ) : null}

        {/* Confetti al confirmar decisión de leftover real (meta /
            acumular / reserva). Disparado por setConfettiToken en el
            CTA. Skip en reduced motion (es decorativo). */}
        {!reduced ? (
          <ConfettiBurst pulseToken={confettiToken} originY={400} />
        ) : null}
      </Animated.View>
    </Animated.View>
  )
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
    render: ({ reduced }) => (
      <ClosingSceneRender
        payload={payload}
        leftoverSelected={leftoverSelected}
        onSelectLeftover={onSelectLeftover}
        reduced={reduced}
      />
    ),
  }
}

// Closing scene como sub-componente: necesita hooks propios para el
// pulse del amount y el stagger de las OptionCards. Extraerlo del
// builder mantiene los hooks dentro de una React component (no en una
// pure function), evitando "hooks called in non-component".
function ClosingSceneRender({
  payload,
  leftoverSelected,
  onSelectLeftover,
  reduced,
}: {
  payload: CycleWrappedPayload
  leftoverSelected: LeftoverOption | null
  onSelectLeftover: (next: LeftoverOption) => void
  reduced: boolean
}) {
  const hasPending = Boolean(
    payload.pendingLeftoverDecision && payload.onApplyLeftoverDecision,
  )
  // `past` solo se considera cuando NO hay pending (mutuamente
  // exclusivos en spec). Si por error llegan los dos, `pending`
  // gana porque está actualmente operando un flow no-decidido.
  const past = hasPending ? undefined : payload.pastLeftoverDecision
  // skip no es interesante visualizarlo (el user explícitamente
  // se saltó la decisión) → fallback a la closing scene vanilla.
  const showLeftoverSection =
    hasPending || (past != null && past.decision !== 'skip')
  const goalTitle = payload.activeGoal?.title ?? null

  // ── Pulse del amount en mode pending ────────────────────
  // Loop sutil 1 → 1.015 → 1 cada 2.5s (1250ms por dirección).
  // Solo en pending — past mode es read-only, sería ruido.
  const amountPulse = useSharedValue(1)
  useEffect(() => {
    if (reduced || !hasPending) {
      cancelAnimation(amountPulse)
      amountPulse.value = 1
      return
    }
    amountPulse.value = withRepeat(
      withSequence(
        // @motion-allow: 1250ms amount idle pulse (cycle 2.5s) — calm-urgent breathing del monto pendiente; entre decorativeDurations.pulse (1200) y pulseSlow (2400) por diseño.
        withTiming(1.015, {
          duration: 1250,
          easing: Easing.inOut(Easing.quad),
        }),
        // @motion-allow: 1250ms — paired with the up-phase above.
        withTiming(1, {
          duration: 1250,
          easing: Easing.inOut(Easing.quad),
        }),
      ),
      -1,
      false,
    )
    return () => {
      cancelAnimation(amountPulse)
    }
  }, [reduced, hasPending, amountPulse])

  const amountAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: amountPulse.value }],
  }))

  // Memoize selection handlers para que las LeftoverOptionCard hijas
  // no re-rendereen por una nueva fn ref en cada render del parent.
  // El `disabled` de las cards se pasa explícito (no usamos `undefined`
  // con `() => {}` no-op).
  const handleSelectMeta = useCallback(
    () => onSelectLeftover('meta'),
    [onSelectLeftover],
  )
  const handleSelectAcumular = useCallback(
    () => onSelectLeftover('acumular'),
    [onSelectLeftover],
  )
  const handleSelectReserva = useCallback(
    () => onSelectLeftover('reserva'),
    [onSelectLeftover],
  )

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
          {hasPending ? (
            <Animated.Text
              style={[
                closingStyles.leftoverAmount,
                { color: '#A6EF8F' },
                amountAnimatedStyle,
              ]}
            >
              {formatMoney(Math.round(payload.pendingLeftoverDecision!.sobrante))}
            </Animated.Text>
          ) : (
            <Text style={[closingStyles.leftoverAmount, { color: '#A6EF8F' }]}>
              {formatMoney(Math.round(past!.sobrante))}
            </Text>
          )}
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
              onPress={handleSelectMeta}
              staggerIndex={0}
              stagger={hasPending && !reduced}
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
              onPress={handleSelectAcumular}
              staggerIndex={1}
              stagger={hasPending && !reduced}
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
              onPress={handleSelectReserva}
              staggerIndex={2}
              stagger={hasPending && !reduced}
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
}

// Card de opción de leftover. Compacta, dark-friendly sobre forest deep.
// Radio button visual a la derecha + tap full-card → onPress.
//
// Motion stack:
// 1. Entrance stagger (solo MODE pending, primer mount): opacity + Y
//    rise con delay por staggerIndex.
// 2. Selected state interpolado: borderColor + backgroundColor + glow
//    shadow animados con interpolateColor sobre selectedProgress 0→1.
// 3. Press scale 0.97 via usePressScale.
function LeftoverOptionCard({
  icon,
  title,
  subtitle,
  selected,
  disabled = false,
  readOnly = false,
  onPress,
  staggerIndex,
  stagger,
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
  staggerIndex: number
  /** Si true, la card entra con stagger (delay = idx * 70ms). False
   *  en past mode (read-only) y en reduced motion. */
  stagger: boolean
}) {
  // selectedProgress va de 0 a 1 al seleccionar — interpolado a
  // borderColor / backgroundColor / glow opacity para feedback layered.
  const selectedProgress = useSharedValue(selected ? 1 : 0)
  useEffect(() => {
    selectedProgress.value = withTiming(selected ? 1 : 0, {
      duration: motionDurations.standard,
      easing: EXPO_OUT,
    })
  }, [selected, selectedProgress])

  const press = usePressScale({ pressedScale: 0.97 })

  const cardAnimatedStyle = useAnimatedStyle(() => {
    const p = selectedProgress.value
    return {
      borderColor: interpolateColor(
        p,
        [0, 1],
        ['rgba(244,253,242,0.10)', '#A6EF8F'],
      ),
      backgroundColor: interpolateColor(
        p,
        [0, 1],
        ['rgba(244,253,242,0.05)', 'rgba(166,239,143,0.12)'],
      ),
      // Glow halo lime alrededor de la card seleccionada. Animado por
      // la misma progress shared value para que aparezca on-select y
      // desaparezca al deseleccionar.
      shadowColor: '#A6EF8F',
      shadowOpacity: 0.35 * p,
      shadowRadius: 16 * p,
      shadowOffset: { width: 0, height: 0 },
    }
  })

  // Opacity wrapper — opaco siempre que esté enabled. Las cards en
  // readOnly no-seleccionadas se silencian, y los disabled bajan.
  const baseOpacity =
    readOnly && !selected ? 0.35 : disabled ? 0.4 : 1

  return (
    // Outer wrapper: SOLO el entering (FadeIn) layout animation. Sin
    // estilos de opacity/transform compitiendo — Reanimated alertaba
    // "Property opacity may be overwritten by a layout animation" si
    // el mismo Animated.View tenía entering={FadeIn} + style={opacity}.
    <Animated.View
      entering={
        stagger
          ? FadeIn.delay(staggerIndex * OPTION_STAGGER_MS)
              .duration(OPTION_ENTER_MS)
              .easing(EXPO_OUT)
          : undefined
      }
    >
      {/* Inner wrapper: press scale + opacity statica del estado
          (readOnly/disabled/normal). Separado del entering = sin
          conflicto. */}
      <Animated.View
        style={[press.animatedStyle, { opacity: baseOpacity }]}
      >
      <Pressable
        // `disabled` ya bloquea taps; no necesitamos un no-op fn cuando
        // está en readOnly. Mantener `onPress={onPress}` directo evita
        // crear una nueva fn ref en cada render.
        onPress={onPress}
        onPressIn={readOnly || disabled ? undefined : press.onPressIn}
        onPressOut={readOnly || disabled ? undefined : press.onPressOut}
        disabled={disabled || readOnly}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: disabled || readOnly }}
      >
        <Animated.View style={[leftoverCardStyles.card, cardAnimatedStyle]}>
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
        </Animated.View>
      </Pressable>
      </Animated.View>
    </Animated.View>
  )
}

// ── CTA con motion stack ─────────────────────────────────────────────
//
// Reemplaza el Pressable inline previo. Maneja:
// 1. Opacity transition cuando va de disabled → enabled (CTA emerge
//    al elegir una opción): 0.55 → 1.
// 2. Shadow bloom: 0 → 8px 22px -6px rgba(166,239,143,0.45).
// 3. Idle pulse cuando enabled: scale 1 → 1.012 → 1 cada 1.8s.
// 4. Press scale 0.97 via usePressScale combinado con el idle pulse.
// 5. Confetti dispatch al confirmar decisión REAL (no en flow vanilla
//    ni en past mode).
function CycleWrappedCta({
  payload,
  leftoverSelected,
  applyingLeftover,
  setApplyingLeftover,
  onDismiss,
  fireConfetti,
  ctaBg,
  ctaFg,
  reduced,
}: {
  payload: CycleWrappedPayload
  leftoverSelected: LeftoverOption | null
  applyingLeftover: boolean
  setApplyingLeftover: (v: boolean) => void
  onDismiss: () => void
  fireConfetti: () => void
  ctaBg: string
  ctaFg: string
  reduced: boolean
}) {
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

  // Una sola progress shared value que dispara opacity + shadow al
  // pasar de disabled → enabled. Más simple que dos animaciones y se
  // mantienen syncronizadas.
  const enabledProgress = useSharedValue(disabled ? 0 : 1)
  useEffect(() => {
    enabledProgress.value = withTiming(disabled ? 0 : 1, {
      duration: motionDurations.enterStack,
      easing: EXPO_OUT,
    })
  }, [disabled, enabledProgress])

  // Idle pulse cuando el CTA está enabled. Same vibe que el cobro CTA
  // del home — scale sutil 1 → 1.012 → 1 con cycle 1.8s. Para
  // no chocar con press scale, lo aplicamos a un wrapper externo y
  // press en el inner.
  const idlePulse = useSharedValue(1)
  useEffect(() => {
    if (reduced || disabled) {
      cancelAnimation(idlePulse)
      idlePulse.value = 1
      return
    }
    idlePulse.value = withRepeat(
      withSequence(
        // @motion-allow: 900ms CTA idle pulse (cycle 1.8s) — matches el cobro CTA del home; calm "alive" breathing sin distraer del contenido del wrapped.
        withTiming(1.012, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        // @motion-allow: 900ms — paired with the up-phase above.
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    )
    return () => {
      cancelAnimation(idlePulse)
    }
  }, [reduced, disabled, idlePulse])

  const press = usePressScale({ pressedScale: 0.97 })

  const wrapperStyle = useAnimatedStyle(() => ({
    opacity: interpolate(enabledProgress.value, [0, 1], [0.55, 1]),
    transform: [{ scale: idlePulse.value }],
    shadowColor: '#A6EF8F',
    shadowOpacity: 0.45 * enabledProgress.value,
    shadowRadius: 22 * enabledProgress.value,
    shadowOffset: { width: 0, height: 8 * enabledProgress.value },
  }))

  const handlePress = useCallback(async () => {
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
        // Confetti SOLO después del await exitoso. Si el RPC falla
        // (red, validation), el caller muestra Alert.alert con el
        // error y NO queremos que la celebración contradiga el mensaje.
        fireConfetti()
        setApplyingLeftover(false)
        onDismiss()
      } catch {
        setApplyingLeftover(false)
        // Errores de RPC los maneja el caller (mutation onError).
        // No disparamos confetti — el flow falló.
      }
      return
    }
    onDismiss()
  }, [
    disabled,
    hasPendingDecision,
    leftoverSelected,
    payload,
    fireConfetti,
    onDismiss,
    setApplyingLeftover,
  ])

  return (
    <Animated.View style={wrapperStyle}>
      <Animated.View style={press.animatedStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => void handlePress()}
          onPressIn={disabled ? undefined : press.onPressIn}
          onPressOut={disabled ? undefined : press.onPressOut}
          style={[styles.cta, { backgroundColor: ctaBg }]}
        >
          <Text style={[styles.ctaText, { color: ctaFg }]}>{label}</Text>
          <MaterialIcons name="arrow-forward" size={18} color={ctaFg} />
        </Pressable>
      </Animated.View>
    </Animated.View>
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
    // Spec H — más sutil (0.18 → 0.10) para feel premium.
    backgroundColor: 'rgba(244,253,242,0.10)',
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
    // Spec H — más caption-y (0.62 → 0.55).
    color: 'rgba(244,253,242,0.55)',
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
