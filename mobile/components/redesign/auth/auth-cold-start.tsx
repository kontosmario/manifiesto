// @i18n-ignore-file — réplica dev-only del handoff de arranque; sin copy propio (el wordmark es marca).
import { useCallback, useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { FernLogo } from '@/components/auth/fern-logo'
import { BrotParticles } from '@/components/brot'
import {
  SOAR_AWAY_MS,
  SOAR_SCALE_TO,
  SOAR_TRANSLATE_Y,
} from '@/features/auth-flow/auth-flow-motion'
import { AuthHomeIndicator, AuthStatusBar, AuthWordmark } from './auth-kit'
import { AUTH_SPEC, type AuthMode } from './auth-spec'

/**
 * Cold start — réplica del handoff de arranque
 * (design/rediseno-2026-07/arranque/coldstart.js + README §1): splash
 * de apertura como OVERLAY sobre la Bienvenida ya montada. El logo
 * brota con overshoot sobre partículas, aparece el wordmark y el splash
 * se disuelve revelando la 3a idéntica debajo — una única transición.
 *
 * Timeline literal (README):
 *   0.00s splash opaco (bg del tema) + partículas; logo scale 0.55 op 0
 *   0.08s logo: opacity→1 (0.7s ease) + scale→1 overshoot
 *         cubic-bezier(0.3, 1.5, 0.4, 1) 0.9s
 *   0.75s wordmark fade-in + translateY 10→0 (0.6s ease)
 *   2.40s splash opacity→0 (0.65s ease, SIN zoom) → onDone
 * Corre UNA vez (el loop del demo.html se elimina, README §Notas).
 *
 * CENTRADO (owner 2026-07-18): el splash muestra SOLO el logo + wordmark,
 * así que se centran en el eje REAL de la pantalla (hero flex:1 entre la
 * status bar y el home indicator) para que se lean balanceados. Antes se
 * replicaba el esqueleto completo de 3a con un clon INVISIBLE del footer
 * (CTA + legal) para alinear pixel-perfect con la Bienvenida — pero en 3a
 * ese bloque está lleno de botones y acá quedaba vacío, dejando el logo
 * flotando "muy arriba" sobre un hueco muerto. La alineación con 3a se
 * cede a favor del centrado; la transición de salida (soar del success /
 * fade del guest) absorbe la diferencia de altura con la Bienvenida.
 *
 * pointerEvents="none" (como el handoff): la Bienvenida de abajo queda
 * interactiva incluso durante el splash.
 *
 * CONTRATO LIVE (cableado arranque 2026-07-17): como visual del launch
 * splash real (neo-launch-splash.tsx) el caller toma el control de la
 * SALIDA con la misma coordinación que AuthLaunchSplash (spec auth-flow
 * 2026-06-11): `autoHide={false}` suprime el auto-fade (modo persistente
 * — el splash es la superficie de marca durante el unlock) y `exitMode`
 * ordena la salida una única vez (latched): 'soar' = soar-away premium
 * del success · 'fade' = fade clásico de 220ms (cancel → login, errores).
 * El auto-fade usa setTimeout (no withDelay) para poder CANCELARSE si
 * `autoHide` pasa a false después del mount (probing → locked resuelve
 * en cientos de ms). Con los defaults el comportamiento del preview es
 * EXACTO al aprobado.
 */

/** CSS `ease` — Easing del MISMO runtime que withTiming (gotcha repo). */
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1)
/** Overshoot del pop del logo (compartido con el bridge). */
const OVERSHOOT = Easing.bezier(0.3, 1.5, 0.4, 1)

const T_POP_MS = 80
const T_WORD_MS = 750
const T_FADE_MS = 2400
/** Fade clásico del exit controlado (mismo valor que el EXIT_MS del
 *  AuthLaunchSplash que este visual reemplaza). */
const EXIT_FADE_MS = 220

export function AuthColdStart({
  mode,
  onDone,
  autoHide = true,
  exitMode,
}: {
  mode: AuthMode
  /** Salida terminada (auto-fade o exitMode) — el caller desmonta. */
  onDone?: () => void
  /** false = modo persistente (launch splash real): sin auto-fade; la
   *  salida la ordena `exitMode`. */
  autoHide?: boolean
  /** Salida controlada por el caller (ver header). Latched: corre UNA
   *  vez; cambios posteriores del prop se ignoran. */
  exitMode?: 'fade' | 'soar'
}) {
  const s = AUTH_SPEC[mode]

  const logoOpacity = useSharedValue(0)
  const logoScale = useSharedValue(0.55)
  const wordOpacity = useSharedValue(0)
  const wordY = useSharedValue(10)
  const overlayOpacity = useSharedValue(1)
  const overlayScale = useSharedValue(1)
  const overlayTranslateY = useSharedValue(0)

  // onDone estable para el callback del worklet (el caller puede pasar
  // una arrow nueva por render).
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const fireDone = useCallback(() => onDoneRef.current?.(), [])

  useEffect(() => {
    logoOpacity.value = withDelay(T_POP_MS, withTiming(1, { duration: 700, easing: EASE })) // @motion-allow: timing literal del handoff de arranque (README §timeline)
    logoScale.value = withDelay(T_POP_MS, withTiming(1, { duration: 900, easing: OVERSHOOT })) // @motion-allow: timing literal del handoff de arranque (README §timeline)
    wordOpacity.value = withDelay(T_WORD_MS, withTiming(1, { duration: 600, easing: EASE })) // @motion-allow: timing literal del handoff de arranque (README §timeline)
    wordY.value = withDelay(T_WORD_MS, withTiming(0, { duration: 600, easing: EASE })) // @motion-allow: timing literal del handoff de arranque (README §timeline)
    // Entrada de una sola corrida por mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-fade del handoff (§timeline: 2.40s → 0.65s). Cancelable: si el
  // caller pasa a persistente (autoHide=false) antes de que venza, el
  // timer se limpia y la salida queda en manos de exitMode.
  useEffect(() => {
    if (!autoHide) return
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      overlayOpacity.value = withTiming(0, { duration: 650, easing: EASE }, (finished) => { // @motion-allow: timing literal del handoff de arranque (README §timeline)
        if (finished) runOnJS(fireDone)()
      })
    }, T_FADE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [autoHide, fireDone, overlayOpacity])

  // Salida controlada (modo persistente): soar-away (success del unlock)
  // o fade clásico (cancel/error) — misma coordinación y valores que el
  // AuthLaunchSplash que este visual reemplaza. Latched: corre una vez.
  const exitStartedRef = useRef(false)
  useEffect(() => {
    if (!exitMode || exitStartedRef.current) return
    exitStartedRef.current = true
    if (exitMode === 'soar') {
      const config = { duration: SOAR_AWAY_MS, easing: Easing.bezier(0.4, 0, 0.2, 1) }
      overlayScale.value = withTiming(SOAR_SCALE_TO, config)
      overlayTranslateY.value = withTiming(SOAR_TRANSLATE_Y, config)
      overlayOpacity.value = withTiming(0, config, (finished) => {
        if (finished) runOnJS(fireDone)()
      })
      return
    }
    overlayOpacity.value = withTiming(
      0,
      { duration: EXIT_FADE_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(fireDone)()
      },
    )
  }, [exitMode, fireDone, overlayOpacity, overlayScale, overlayTranslateY])

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    // Array SIEMPRE presente (gotcha iOS: transform undefined crashea).
    transform: [{ translateY: overlayTranslateY.value }, { scale: overlayScale.value }],
  }))
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }))
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
    transform: [{ translateY: wordY.value }],
  }))

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, overlayStyle, { backgroundColor: s.welcomeBg }]}
    >
      {/* Partículas del splash (README: 16, mismas del paquete). */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BrotParticles colors={s.particleColors} count={16} />
      </View>

      <AuthStatusBar mode={mode} bars={4} />

      {/* Logo + wordmark centrados en el eje real (entre status bar y
          home indicator) — ver doc-comment (centrado 2026-07-18). */}
      <View style={styles.hero}>
        <Animated.View style={logoStyle}>
          <FernLogo size={160} palette={s.fernPalette} />
        </Animated.View>
        <Animated.View style={[styles.wordmarkWrap, wordStyle]}>
          <AuthWordmark mode={mode} size={42} />
        </Animated.View>
      </View>

      <AuthHomeIndicator mode={mode} marginTop={6} opacity={mode === 'dark' ? 0.7 : 0.75} />
    </Animated.View>
  )
}

// ─── Estilos: espejo del esqueleto de auth-3a-bienvenida.tsx ─────────

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  wordmarkWrap: { marginTop: 22 },
})
