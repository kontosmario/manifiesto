import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
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
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { buildScenes } from './build-scenes'
import { CycleWrappedCta } from './scenes/cycle-wrapped-cta'
import { ProgressSegment } from './scenes/progress-segment'
import type { LeftoverOption } from './scenes/types'
import {
  EXPO_OUT,
  SCENE_DURATION_MS,
  SCENE_TRANSITION_MS,
} from './wrapped-constants'

interface CycleWrappedModalProps {
  /** Payload del ciclo cerrado. `null` mantiene el modal oculto. */
  payload: CycleWrappedPayload | null
  onDismiss: () => void
}

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
 *
 * Las scenes individuales viven en `./scenes/*`. Este file es el
 * orchestrator: hooks de animation top-level, scene index logic,
 * dispatch del render.
 */
export function CycleWrappedModal({ payload, onDismiss }: CycleWrappedModalProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
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
  // CR Sprint D Minor #3: memoizado para evitar identity churn en cada
  // render del modal — el CTA tiene `fireConfetti` en handlePress deps,
  // sin memo causaba re-creation del Pressable closure por frame.
  const fireConfettiCallback = useCallback(() => {
    setConfettiToken((t) => t + 1)
  }, [])

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
  // CR Sprint D Minor #1: derive el índice del verdict desde el array
  // en lugar de hardcodear `confettiSceneIdx: 1` en verdict-scene.ts.
  // Robusto ante reordering o conditional skip de scenes futuros.
  const verdictSceneIdx = useMemo(
    () => scenes.findIndex((s) => s.id === 'verdict'),
    [scenes],
  )

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
                accessibilityLabel={t('control:wrapped.a11yPrevScene')}
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
            {t('control:wrapped.brandMark')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('control:wrapped.a11yClose')}
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
              fireConfetti={fireConfettiCallback}
              ctaBg={scene.ctaBg}
              ctaFg={scene.ctaFg}
              reduced={reduced}
            />
          ) : (
            <Text style={[styles.hint, { color: scene.foregroundSoft }]}>
              {isPaused
                ? t('control:wrapped.hintPaused')
                : t('control:wrapped.hintHold')}
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
              accessibilityLabel={t('control:wrapped.a11yPrevScene')}
              style={styles.tapZoneLeft}
            />
            <Pressable
              onPress={handleTapRight}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              accessibilityLabel={t('control:wrapped.a11yNextScene')}
              style={styles.tapZoneRight}
            />
          </View>
        ) : null}

        {/* Confetti solo en el veredicto positivo */}
        {scene.confetti ? (
          <ConfettiBurst pulseToken={sceneIndex === verdictSceneIdx ? 1 : 0} originY={200} />
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
