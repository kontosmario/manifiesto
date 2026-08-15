import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BackHandler,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BrotParticles } from '@/components/brot/brot-particles'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import {
  decorativeDurations,
  motionEasings,
  motionSprings,
} from '@/lib/motion/tokens'
import { cssGradient } from '@/theme/neo-tokens'
import { useThemeTokens } from '@/theme/theme-provider'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { buildWrappedScenes, type WrappedDecisionState } from './build-scenes'
import { resolveVerdictState } from './scenes/veredicto-scene'
import { WRAPPED_ANIM, wrappedSpec } from './wrapped-spec'
import { WrCta, WrMarker, WrProgressBar } from './wrapped-primitives'

interface CycleWrappedModalProps {
  /** Payload del ciclo cerrado. `null` mantiene el modal oculto. */
  payload: CycleWrappedPayload | null
  onDismiss: () => void
}

/**
 * Wrapped de cierre — "La Edición" (rediseño design/wrapped-2026-08).
 *
 * Marco editorial (sello, estampa, estantería) que SIGUE EL TEMA DEL
 * SISTEMA ([OWNER-1], decisión del owner 2026-08-13): forest nocturno en
 * oscuro, material del sistema en claro. Un solo fondo para todas las
 * pantallas; tipografía Nunito 800/900; Brot como guía en cada página.
 *
 * Navegación: el BOTÓN PRIMARIO del pie es la vía principal en TODAS las
 * páginas (orden del owner — más intuitivo que la gramática de story).
 * Sin auto-avance (README:20 regla 2). Tap derecha/izquierda y
 * swipe-down quedan como atajos (la edición queda guardada igual). La
 * barra story de N segmentos y el marcador "N DE M" salen de
 * `scenes.length` (JUSTO salta la 06 → flujo de 5 en V1).
 *
 * Reglas de la carcasa que este archivo cumple a propósito:
 *   · Tap zones declaradas PRIMERO — header, CTA y option cards vienen
 *     después en el árbol y les ganan el hit-test (regla del repo:
 *     último hermano gana; zIndex sólo refuerza el pintado).
 *   · SIN `overflow: 'hidden'` en el card — la tinta de Brot sobresale
 *     ~12u de su caja y un clip la guillotina.
 *   · El efecto de reset tiene deps acotadas AL PAYLOAD: incluir
 *     `selected`/`scenes` re-ejecutaría el reset al tocar una opción y
 *     el wrapped arrancaría de nuevo desde la portada (bug reportado
 *     por el owner en la versión anterior).
 *   · Pan de cierre con `activeOffsetY(8)` + `failOffsetX(±16)` y
 *     resolución en `onEnd` — receta de `modal-card.tsx` (en iOS un Pan
 *     que no activa muere sin emitir).
 */
export function CycleWrappedModal({ payload, onDismiss }: CycleWrappedModalProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const theme = useThemeTokens()
  const shell = wrappedSpec(theme.mode).shell
  const { height: windowHeight } = useWindowDimensions()
  /**
   * Umbral de densidad. El frame del handoff es 830pt de alto SIN status
   * bar ni safe areas; sumando insets típicos (59 + 34) el diseño pide
   * ~800pt de ventana para respirar como fue dibujado. Por debajo de 800
   * (iPhone SE 667, 13 mini 812 al filo, ventanas divididas de iPad) las
   * escenas comprimen aire y bloques fijos. Por encima —el device del
   * owner, 874— `compact` es false y la composición es la del handoff,
   * intacta.
   */
  const compact = windowHeight < 800

  const [sceneIndex, setSceneIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [decided, setDecided] = useState<WrappedDecisionState['decided']>(null)
  const [confettiToken, setConfettiToken] = useState(0)

  const sceneIndexRef = useRef(0)
  useEffect(() => {
    sceneIndexRef.current = sceneIndex
  }, [sceneIndex])

  // ── Animación de entrada + transición entre páginas ─────────────────
  const enter = useSharedValue(0)
  const sceneAlpha = useSharedValue(1)
  const sceneTranslateX = useSharedValue(0)
  const dragY = useSharedValue(0)

  // ── Reset por payload nuevo ─────────────────────────────────────────
  // Deps acotadas a la sesión (ver encabezado). El default de selección
  // sale del README:46 — meta activa si existe; si no, "Reservar aparte";
  // EXCEDIDO arranca en "Ajustar el nuevo ciclo".
  useEffect(() => {
    if (!payload) return
    void triggerHaptic('success')
    setSceneIndex(0)
    sceneIndexRef.current = 0
    setApplying(false)
    setDecided(null)
    setConfettiToken(0)
    const verdict = resolveVerdictState(payload)
    if (verdict === 'excedido') {
      setSelected('ajustar')
    } else if (verdict === 'margen') {
      setSelected(payload.activeGoal ? 'meta' : 'reserva')
    } else {
      setSelected(null)
    }
    dragY.value = 0
    enter.value = 0
    if (reduced) {
      enter.value = 1
    } else {
      // @motion-allow: 420ms wrapped entrance — designer-tuned para el deck del wrapped (entre standard 240 y slow 480), heredado de la versión anterior.
      enter.value = withTiming(1, { duration: 420, easing: motionEasings.enterSmooth })
    }
  }, [payload, reduced, enter, dragY])

  // ── Transición a otra página ────────────────────────────────────────
  // Mutación SINCRÓNICA de los shared values ANTES del setState: el
  // primer paint de la página nueva ya arranca invisible/corrida y el
  // withTiming del efecto de abajo la trae. Patrón heredado 1:1.
  const transitionToScene = useCallback(
    (nextIdx: number) => {
      if (nextIdx === sceneIndexRef.current) return
      if (!reduced) {
        sceneAlpha.value = 0
        sceneTranslateX.value = WRAPPED_ANIM.navSlidePx
      }
      sceneIndexRef.current = nextIdx
      setSceneIndex(nextIdx)
    },
    [reduced, sceneAlpha, sceneTranslateX],
  )

  useEffect(() => {
    if (!payload) return
    if (reduced) {
      sceneAlpha.value = 1
      sceneTranslateX.value = 0
      return
    }
    sceneAlpha.value = withTiming(1, {
      duration: decorativeDurations.wrappedNav,
      easing: motionEasings.enterSmooth,
    })
    sceneTranslateX.value = withTiming(0, {
      duration: decorativeDurations.wrappedNav,
      easing: motionEasings.enterSmooth,
    })
  }, [sceneIndex, payload, reduced, sceneAlpha, sceneTranslateX])

  // ── Acciones ────────────────────────────────────────────────────────
  const sceneCountRef = useRef(0)

  const handleAdvance = useCallback(() => {
    const idx = sceneIndexRef.current
    if (idx + 1 >= sceneCountRef.current) {
      onDismiss()
      return
    }
    void triggerHaptic('selection')
    transitionToScene(idx + 1)
  }, [onDismiss, transitionToScene])

  const handleBack = useCallback(() => {
    const idx = sceneIndexRef.current
    if (idx === 0) return
    void triggerHaptic('selection')
    transitionToScene(idx - 1)
  }, [transitionToScene])

  const handleSelect = useCallback((id: string) => {
    setSelected(id)
  }, [])

  const payloadRef = useRef(payload)
  useEffect(() => {
    payloadRef.current = payload
  }, [payload])

  const handleConfirmDestino = useCallback(async () => {
    const p = payloadRef.current
    if (!p || !selected || applying) return
    const verdict = resolveVerdictState(p)

    if (verdict === 'margen') {
      const pending = p.pendingLeftoverDecision
      if (!pending || !p.onApplyLeftoverDecision) {
        handleAdvance()
        return
      }
      setApplying(true)
      try {
        await p.onApplyLeftoverDecision({
          monthlySummaryId: pending.monthlySummaryId,
          decision: selected as 'meta' | 'reserva' | 'acumular',
          metaGoalId: selected === 'meta' ? p.activeGoal?.id : undefined,
          newCycleAnchor: selected === 'acumular' ? p.nextCycleAnchor : undefined,
        })
        // Confetti POST-await (regla M2 del review viejo): nunca antes
        // de que el RPC confirme.
        setDecided({
          kind: selected,
          metaTitle: selected === 'meta' ? (p.activeGoal?.title ?? null) : null,
        })
        setConfettiToken((n) => n + 1)
        handleAdvance()
      } catch {
        // El wrapper del caller ya toasteó el error — acá sólo se
        // resetea el spinner y el usuario puede reintentar.
      } finally {
        setApplying(false)
      }
      return
    }

    // EXCEDIDO — plan de recuperación.
    if (selected === 'cubrir' && p.onApplyReserve && p.reserveAvailable) {
      setApplying(true)
      try {
        await p.onApplyReserve({
          amount: Math.min(p.reserveAvailable, Math.abs(p.savingsDelta)),
        })
        setDecided({ kind: 'plan-cubrir' })
        handleAdvance()
      } catch {
        // Toast del wrapper del caller; spinner abajo.
      } finally {
        setApplying(false)
      }
    } else if (selected === 'revisar') {
      // "Revisar el top 3" = navegación, no persistencia: cierra la
      // edición y aterriza en Gastos para mirar el ciclo.
      setDecided({ kind: 'plan-revisar' })
      onDismiss()
      router.push('/(app)/(tabs)/expenses')
    } else {
      // "Ajustar el nuevo ciclo": no persiste nada — el rojo se
      // descuenta solo del arranque del ciclo (copy honesto, plan §6.5).
      setDecided({ kind: 'plan-ajustar' })
      handleAdvance()
    }
  }, [selected, applying, handleAdvance, onDismiss, router])

  // ── Escenas ─────────────────────────────────────────────────────────
  const state = useMemo<WrappedDecisionState>(
    () => ({ selected, applying, decided }),
    [selected, applying, decided],
  )
  const handlers = useMemo(
    () => ({
      onSelect: handleSelect,
      onConfirmDestino: () => void handleConfirmDestino(),
      onAdvance: handleAdvance,
      onDismiss,
    }),
    [handleSelect, handleConfirmDestino, handleAdvance, onDismiss],
  )
  const scenes = useMemo(
    () =>
      payload
        ? buildWrappedScenes(payload, t, state, handlers, wrappedSpec(theme.mode))
        : [],
    [payload, t, state, handlers, theme.mode],
  )
  sceneCountRef.current = scenes.length

  // ── Back físico (Android) ───────────────────────────────────────────
  useEffect(() => {
    if (!payload) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss()
      return true
    })
    return () => sub.remove()
  }, [payload, onDismiss])

  // ── Swipe-down para cerrar (receta modal-card.tsx) ──────────────────
  const handleDragDismissed = useCallback(() => {
    onDismiss()
  }, [onDismiss])
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(12)
        .failOffsetX([-16, 16])
        .onUpdate((event) => {
          'worklet'
          if (event.translationY > 0) {
            dragY.value = event.translationY
          }
        })
        .onEnd((event) => {
          'worklet'
          const shouldDismiss = event.translationY > 110 || event.velocityY > 900
          if (shouldDismiss) {
            runOnJS(handleDragDismissed)()
          } else {
            dragY.value = withSpring(0, motionSprings.sheetDismiss)
          }
        }),
    [dragY, handleDragDismissed],
  )

  // ── Estilos animados ────────────────────────────────────────────────
  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value * interpolate(dragY.value, [0, 600], [1, 0.5], 'clamp'),
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [24, 0]) + dragY.value },
      { scale: interpolate(enter.value, [0, 1], [0.97, 1]) },
    ],
  }))
  const sceneContentStyle = useAnimatedStyle(() => ({
    opacity: sceneAlpha.value,
    transform: [{ translateX: sceneTranslateX.value }],
  }))

  // ── Early return ────────────────────────────────────────────────────
  if (!payload || scenes.length === 0) return null
  const scene = scenes[sceneIndex] ?? scenes[0]
  if (!scene) return null

  const isLast = sceneIndex + 1 >= scenes.length
  const markerText = t('control:wrapped.edicion.marker', {
    n: sceneIndex + 1,
    total: scenes.length,
  })

  return (
    <View style={styles.host} pointerEvents="auto">
      <StatusBar style={shell.statusBarStyle} />
      <GestureDetector gesture={panGesture}>
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              paddingTop: Math.max(16, insets.top + 8),
              paddingBottom: Math.max(20, insets.bottom + 14),
            },
            cardStyle,
          ]}
        >
          {/* Fondo en capa PROPIA, no en el nodo animado: claro = sólido
              del sistema, oscuro = gradiente forest. Un
              `experimental_backgroundImage` sobre un nodo que Reanimated
              anima pinta una forma rectangular fantasma fuera de su caja
              (QA del owner 2026-08-13, mismo síntoma en el sello, la
              option card y la mini-card nueva). */}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              shell.bgCss
                ? cssGradient(shell.bgCss, shell.bgFallback)
                : { backgroundColor: shell.bgFallback },
            ]}
          />

          {/* Partículas — capa de fondo de la escena que las pide. */}
          {scene.particleCount > 0 ? (
            <BrotParticles
              key={scene.id}
              colors={shell.particleColors}
              count={scene.particleCount}
              animated={!reduced}
            />
          ) : null}

          {/* Tap zones — PRIMERO en el árbol a propósito: todo lo
              interactivo declarado después (header, CTA, option cards)
              les gana el hit-test donde se superponen. */}
          <View style={styles.tapZones} pointerEvents="box-none">
            <Pressable
              accessibilityLabel={t('control:wrapped.a11yPrevScene')}
              onPress={handleBack}
              style={styles.tapZoneLeft}
            />
            {!scene.blockTapAdvance ? (
              <Pressable
                accessibilityLabel={
                  isLast
                    ? t('control:wrapped.a11yClose')
                    : t('control:wrapped.a11yNextScene')
                }
                onPress={handleAdvance}
                style={styles.tapZoneRight}
              />
            ) : null}
          </View>

          {/* Barra story + cierre. */}
          <View style={styles.topRow} pointerEvents="box-none">
            <View style={styles.progressWrap} pointerEvents="none">
              <WrProgressBar count={scenes.length} current={sceneIndex} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('control:wrapped.a11yClose')}
              onPress={onDismiss}
              hitSlop={14}
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <MaterialIcons name="close" size={20} color={shell.marker.ink} />
            </Pressable>
          </View>

          {/* Página actual. */}
          <Animated.View style={[styles.sceneStage, sceneContentStyle]}>
            {scene.render({ active: true, reduced, compact })}
          </Animated.View>

          {/* Pie: CTA de la página + marcador. */}
          <View style={styles.footer}>
            {scene.cta ? (
              <WrCta
                label={scene.cta.label}
                onPress={scene.cta.onPress}
                disabled={scene.cta.disabled}
                busy={scene.cta.busy}
              />
            ) : null}
            <WrMarker text={markerText} />
          </View>

          {/* Confetti al confirmar una decisión real (post-await). */}
          {!reduced ? (
            <ConfettiBurst
              pulseToken={confettiToken}
              originY={400}
              colors={shell.particleColors}
            />
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

// ── Styles ───────────────────────────────────────────────────────────
// SIN overflow:'hidden' en `card` (la tinta de Brot sobresale de su caja).

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingHorizontal: 26,
  },
  closeBtn: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  footer: {
    gap: 12,
    justifyContent: 'flex-end',
    minHeight: 84,
    paddingTop: 10,
  },
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  progressWrap: { flex: 1 },
  sceneStage: {
    flex: 1,
    justifyContent: 'center',
  },
  tapZoneLeft: { height: '100%', width: '38%' },
  tapZoneRight: { flex: 1, height: '100%' },
  tapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingTop: 10,
  },
})
