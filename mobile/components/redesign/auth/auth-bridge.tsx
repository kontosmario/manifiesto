import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { AnimatedText, Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { FernLogo } from '@/components/auth/fern-logo'
import { BrotParticles } from '@/components/brot'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { nunitoFamily } from '@/theme/typography'
import { AuthHomeIndicator, AuthScreenShell, AuthStatusBar } from './auth-kit'
import { AUTH_SPEC, type AuthMode } from './auth-spec'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Bridge auth → Inicio — réplica del handoff de arranque
 * (design/rediseno-2026-07/arranque/authbridge2.js + README): logo con
 * el pop del cold start dentro de un cuenco neumórfico hundido,
 * "Hola, {nombre}", subtítulo de estado y estados success/fail.
 * SUPERSEDE al bridge derivado anterior (fern estático + Brot magic +
 * copy de transitionSplash) — el handoff manda (owner 2026-07-17:
 * "implementalos TAL CUAL").
 *
 * BARRA DE PROGRESO RETIRADA (owner 2026-07-18): el handoff traía una
 * barra de carga; se quitó por innecesaria — el pedestal + saludo +
 * subtítulo ("Cargando tu hogar…" / "Todo listo ✓" / el copy de error) +
 * partículas alcanzan como feedback, y en el fail el mensaje "No pudimos
 * sincronizar · revisa tu conexión" + Reintentar es suficiente.
 *
 * Timeline (README §2, sin la barra):
 *   0.08s pedestal fade+scale 0.85→1 · logo pop overshoot (delay 0.12)
 *   0.75s "Hola, {name}" fade-up + "Cargando tu hogar…"
 *   2.60s sub → "Todo listo ✓" · 3.10s overlay fade 0.65s → onDone [éxito]
 *   FAIL: 2.2s vira durazno + shake del pedestal (−6/+6/−4/0 @90ms) + sub
 *   de error · 2.55s Reintentar + "Continuar sin sincronizar".
 *
 * Lógica ajustada al flujo (pedido owner: "al bridge ajustale la lógica
 * necesaria"): `state` mapea a la máquina real (auth-flow-machine) y el
 * contenido corre BAJO el TransitionOverlay del shell, que es dueño de
 * la entrada (fade-in) y de la salida (soar-away):
 *   'loading'  → fase 'bridging': pedestal + saludo + "Cargando tu
 *                hogar…" + partículas esperando el destino. Sin fade propio.
 *   'success'  → fase 'revealing': "Todo listo ✓" en un beat corto. La
 *                salida la hace el wrapper (soar-away) — acá NO hay fade
 *                ni onDone.
 *   'success-standalone' → timeline LITERAL del handoff (preview/demo):
 *                "Todo listo ✓" a los 2.6s, fade propio a los 3.1s →
 *                onDone. Una corrida (sin el loop del demo).
 *   'fail'     → fase 'bridge-error': vira durazno + shake + Reintentar
 *                (+ "Continuar sin sincronizar" SOLO si el caller pasa
 *                onSkip — el flujo real de hoy no tiene esa salida en la
 *                máquina; el preview sí la muestra).
 * Las transiciones en caliente ('loading' → 'success' | 'fail', 'fail' →
 * 'loading' tras un RETRY) no re-ejecutan la entrada: solo mueven el copy
 * y las acciones.
 *
 * Desvíos de plataforma documentados:
 * · Logo = FernLogo (SVG real de la marca, mismo criterio que 3a/4b
 *   aprobados) en vez del PNG 104×83 del paquete — mismo ancho 104.
 * · El drop-shadow con forma del logo oscuro no existe en RN: se
 *   aproxima con un halo radial detrás (radial-gradient → transparente).
 */

// ─── Tokens por tema (literales del handoff: THEMES de authbridge2.js) ─

interface BridgeTheme {
  pedBgCss: string | undefined
  pedBgFallback: string
  pedShadow: string
  bowlInset: string
  failText: string
  /** Glow del tema oscuro (0 = sin glow). */
  glow: boolean
  btnCss: string
  btnFallback: string
  btnText: string
  btnShadow: string
}

const THEMES: Record<AuthMode, BridgeTheme> = {
  light: {
    pedBgCss: undefined,
    pedBgFallback: '#E9EBE0',
    pedShadow: '14px 14px 30px rgba(151,160,136,0.46), -14px -14px 30px rgba(255,255,255,0.95)',
    bowlInset: 'inset 6px 6px 13px rgba(151,160,136,0.4), inset -6px -6px 13px rgba(255,255,255,0.95)',
    failText: '#B05E2F',
    glow: false,
    btnCss: 'radial-gradient(circle at 32% 28%, #489350, #2E7434 85%)',
    btnFallback: '#489A4E',
    btnText: '#F5F2E1',
    btnShadow: '0 10px 20px rgba(46,116,52,0.35), inset 0 2px 3px rgba(255,255,255,0.3)',
  },
  dark: {
    pedBgCss: 'linear-gradient(145deg, #1D3426, #132318)',
    pedBgFallback: '#182A1F',
    pedShadow: '14px 14px 30px rgba(0,0,0,0.6), -14px -14px 30px rgba(101,152,113,0.12)',
    bowlInset: 'inset 6px 6px 13px rgba(0,0,0,0.5), inset -6px -6px 13px rgba(101,152,113,0.1)',
    failText: '#F2A87E',
    glow: true,
    btnCss: 'radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 85%)',
    btnFallback: '#6FAD73',
    btnText: '#0F1E14',
    btnShadow: '0 0 20px rgba(140,225,150,0.3), inset 0 2px 3px rgba(255,255,255,0.35)',
  },
}

// ─── Copy del handoff (authbridge2.js) → i18n ────────────────────────
// loading/done/fail/skip = auth:bridge.* · retry = auth:transitionSplash.retry
// · saludo = auth:login.greetingTitle. Ver el render.

// ─── Timeline literal (README §2 / authbridge2.js _play) ─────────────

/** CSS `ease` (cubic-bezier(0.25, 0.1, 0.25, 1)) — Easing del MISMO
 *  runtime que withTiming (gotcha del repo: mezclar runtimes crashea). */
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1)
/** El overshoot del pop del logo — compartido con el cold start. */
const OVERSHOOT = Easing.bezier(0.3, 1.5, 0.4, 1)

const T_POP_MS = 80
const LOGO_EXTRA_DELAY_MS = 120
const T_GREET_MS = 750
const T_BAR_MS = 950 + 100 // ritmo del handoff: cuándo asienta el estado tras el saludo
const T_DONE_MS = 2600
const T_FADE_MS = 3100
const T_FAIL_MS = 2200
const T_FAIL_ACTIONS_MS = 2550

/** Beat corto de las transiciones de estado (éxito → "Todo listo",
 *  acciones del fail en caliente). Antes también snapeaba la barra. */
const SNAP_MS = 350

export type AuthBridgeState = 'loading' | 'success' | 'success-standalone' | 'fail'

export function AuthBridge({
  mode,
  state,
  name = 'Marcos',
  onDone,
  onRetry,
  onSkip,
}: {
  mode: AuthMode
  // (name?: string | null — null oculta el saludo; ver abajo)
  /** Mapea a la máquina real: 'bridging' → 'loading' · 'revealing' →
   *  'success' · 'bridge-error' → 'fail'. 'success-standalone' = timeline
   *  completa del handoff con fade propio (preview). Ver doc del header. */
  state: AuthBridgeState
  /**
   * Nombre del saludo ("Hola, {name}"). `null` OCULTA el saludo por
   * completo (reserva su alto para no mover el subtítulo) — lo usa el
   * journey de alta: la máquina real puede caer en 'fail' durante el
   * signup y el cache del último perfil sería el de OTRA persona (review
   * r2). Demo = la persona del preview.
   */
  name?: string | null
  /** Solo 'success-standalone': el fade final terminó — el caller revela
   *  el Inicio. En 'success' bajo el wrapper NO se llama (sale el soar). */
  onDone?: () => void
  onRetry?: () => void
  /** "Continuar sin sincronizar": el botón solo se dibuja si viene el
   *  callback (la máquina real de hoy no tiene esa salida). */
  onSkip?: () => void
}) {
  // `t` es el tema (THEMES) en este archivo — el hook de i18n va aliasado.
  const { t: translate } = useTranslation()
  const s = AUTH_SPEC[mode]
  const t = THEMES[mode]
  const fail = state === 'fail'

  // Fases de copy/color (cambios PUNTUALES de estado; las animaciones
  // continuas viven en shared values).
  const [phase, setPhase] = useState<'loading' | 'done' | 'failed'>('loading')

  // Opacidades del pedestal + logo + saludo + subtítulo arrancan en 1
  // (visibles DESDE EL PRIMER FRAME — fix QA owner 2026-07-21). Antes
  // arrancaban en 0 con fade diferido y el logo (anidado en el pedestal,
  // su opacity COMPONE) quedaba doblemente gateado: se veía el pozo pero
  // no el logo/texto hasta cientos de ms después. La coreografía de
  // ESCALA (pop del pozo + del logo) y el slide del saludo se conservan.
  const pedOpacity = useSharedValue(1)
  const pedScale = useSharedValue(0.85)
  const pedShakeX = useSharedValue(0)
  const logoOpacity = useSharedValue(1)
  const logoScale = useSharedValue(0.55)
  const greetOpacity = useSharedValue(1)
  const greetY = useSharedValue(10)
  const subOpacity = useSharedValue(1)
  const actionsOpacity = useSharedValue(0)
  const actionsY = useSharedValue(8)
  const overlayOpacity = useSharedValue(1)

  // Entrada UNA vez por mount; las transiciones de `state` en caliente
  // (loading → success/fail, fail → loading) solo mueven el copy.
  const firstRunRef = useRef(true)

  useEffect(() => {
    const first = firstRunRef.current
    firstRunRef.current = false

    // Timers locales al effect (no un ref): el cleanup captura ESTA
    // corrida, no la lista mutable de otra.
    const timers: ReturnType<typeof setTimeout>[] = []

    if (first) {
      // Entrada literal del handoff (una sola corrida — el loop del
      // demo.html se elimina en producción, como manda el README §Notas).
      // Solo la coreografía de ESCALA/slide: las opacidades ya arrancan en
      // 1 (visibles desde el primer frame — ver los useSharedValue arriba).
      pedScale.value = withDelay(T_POP_MS, withTiming(1, { duration: 600, easing: EASE })) // @motion-allow: timing literal del handoff de arranque (README §timeline)
      const logoDelay = T_POP_MS + LOGO_EXTRA_DELAY_MS
      logoScale.value = withDelay(logoDelay, withTiming(1, { duration: 900, easing: OVERSHOOT })) // @motion-allow: timing literal del handoff de arranque (README §timeline)
      greetY.value = withDelay(T_GREET_MS, withTiming(0, { duration: 600, easing: EASE })) // @motion-allow: timing literal del handoff de arranque (README §timeline)
    }

    // En el mount el estado asienta al ritmo del handoff (tras el
    // saludo, T_BAR_MS); en una transición en caliente ya estamos en
    // escena.
    const stateSettleDelay = first ? T_BAR_MS : 0

    // Shake del pedestal + copy de error en durazno (el copy vira en el
    // acto — el subtítulo pasa a "No pudimos sincronizar…").
    const failNow = () => {
      setPhase('failed')
      void triggerHaptic('error')
      pedShakeX.value = withSequence(
        withTiming(-6, { duration: 90, easing: EASE }), // @motion-allow: timing literal del handoff de arranque (README §timeline)
        withTiming(6, { duration: 90, easing: EASE }), // @motion-allow: timing literal del handoff de arranque (README §timeline)
        withTiming(-4, { duration: 90, easing: EASE }), // @motion-allow: timing literal del handoff de arranque (README §timeline)
        withTiming(0, { duration: 90, easing: EASE }), // @motion-allow: timing literal del handoff de arranque (README §timeline)
      )
    }
    const showActions = () => {
      actionsOpacity.value = withTiming(1, { duration: 500, easing: EASE }) // @motion-allow: timing literal del handoff de arranque (README §timeline)
      actionsY.value = withTiming(0, { duration: 500, easing: EASE }) // @motion-allow: timing literal del handoff de arranque (README §timeline)
    }

    switch (state) {
      case 'loading': {
        // Estado del bridging real: el pedestal + saludo + "Cargando tu
        // hogar…" + partículas son el feedback de carga (sin barra de
        // progreso — retirada por pedido owner 2026-07-18). Sin fade
        // propio: la salida es SIEMPRE del wrapper (soar-away del shell).
        setPhase('loading')
        if (!first) {
          // Vuelta desde 'fail' (RETRY): acciones fuera (se desmontan con
          // el estado).
          actionsOpacity.value = 0
          actionsY.value = 8
        }
        break
      }
      case 'success': {
        // Revealing de la máquina: "Todo listo ✓" mientras el wrapper
        // hace el soar-away. Sin fade ni onDone propios.
        timers.push(setTimeout(() => setPhase('done'), stateSettleDelay + SNAP_MS))
        break
      }
      case 'success-standalone': {
        // Timeline literal del handoff (preview/demo): éxito con fade
        // propio → onDone.
        timers.push(setTimeout(() => setPhase('done'), T_DONE_MS))
        timers.push(
          setTimeout(() => {
            overlayOpacity.value = withTiming(0, { duration: 650, easing: EASE }, (finished) => { // @motion-allow: timing literal del handoff de arranque (README §timeline)
              if (finished && onDone) runOnJS(onDone)()
            })
          }, T_FADE_MS),
        )
        break
      }
      case 'fail': {
        if (first) {
          // Timeline literal del handoff.
          timers.push(setTimeout(failNow, T_FAIL_MS))
          timers.push(setTimeout(showActions, T_FAIL_ACTIONS_MS))
        } else {
          // LOAD_FAILED en caliente (venimos de 'loading'): el error se
          // siente ya (shake + copy), acciones tras un beat.
          failNow()
          timers.push(setTimeout(showActions, SNAP_MS))
        }
        break
      }
    }

    return () => timers.forEach(clearTimeout)
    // Timeline por estado: corre en el mount y en cada cambio de `state`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }))
  const pedStyle = useAnimatedStyle(() => ({
    opacity: pedOpacity.value,
    transform: [{ scale: pedScale.value }, { translateX: pedShakeX.value }],
  }))
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }))
  const greetStyle = useAnimatedStyle(() => ({
    opacity: greetOpacity.value,
    transform: [{ translateY: greetY.value }],
  }))
  const subStyle = useAnimatedStyle(() => ({ opacity: subOpacity.value }))
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: actionsOpacity.value,
    transform: [{ translateY: actionsY.value }],
  }))

  const failed = phase === 'failed'
  const subText = failed
    ? translate('auth:bridge.fail')
    : phase === 'done'
      ? translate('auth:bridge.done')
      : translate('auth:bridge.loading')
  const press = usePressScale({ pressedScale: 0.98 })

  return (
    <Animated.View style={[styles.flex, overlayStyle]}>
      <AuthScreenShell mode={mode}>
        {/* Partículas de arranque (README: 16, compartidas con el cold
            start), detrás de todo. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <BrotParticles colors={s.particleColors} count={16} />
        </View>

        <AuthStatusBar mode={mode} />

        <View style={styles.body}>
          <Animated.View
            style={[
              styles.pedestal,
              pedStyle,
              {
                experimental_backgroundImage: t.pedBgCss,
                backgroundColor: t.pedBgFallback,
                boxShadow: t.pedShadow,
              },
            ]}
          >
            <View style={[styles.bowl, { boxShadow: t.bowlInset }]}>
              {/* Halo verde detrás del logo (solo oscuro): aproximación
                  del drop-shadow con forma del handoff. */}
              {t.glow ? <View pointerEvents="none" style={styles.logoGlow} /> : null}
              <Animated.View style={logoStyle}>
                <FernLogo size={104} palette={s.fernPalette} />
              </Animated.View>
            </View>
          </Animated.View>

          {/* name null → sin saludo (journey de alta): se reserva el
              mismo alto para que el subtítulo no salte. */}
          {name === null ? (
            <View style={styles.greetSpacer} />
          ) : (
            <AnimatedText style={[styles.greet, greetStyle, { color: s.text }]}>
              {translate('auth:login.greetingTitle', { name })}
            </AnimatedText>
          )}

          <AnimatedText
            style={[styles.sub, subStyle, { color: failed ? t.failText : s.helper }]}
          >
            {subText}
          </AnimatedText>

          {fail ? (
            <Animated.View style={[styles.actions, actionsStyle]}>
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => {
                  void triggerHaptic('selection')
                  onRetry?.()
                }}
                onPressIn={press.onPressIn}
                onPressOut={press.onPressOut}
                style={[
                  styles.retryBtn,
                  {
                    experimental_backgroundImage: t.btnCss,
                    backgroundColor: t.btnFallback,
                    boxShadow: t.btnShadow,
                  },
                  press.animatedStyle,
                ]}
              >
                <Text style={[styles.retryLabel, { color: t.btnText }]}>
                  {translate('auth:transitionSplash.retry')}
                </Text>
              </AnimatedPressable>
              {/* Solo con onSkip cableado: la máquina real de hoy no
                  tiene "continuar sin sincronizar" (el preview sí). */}
              {onSkip ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    void triggerHaptic('light')
                    onSkip()
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
                >
                  <Text style={[styles.skip, { color: s.helper }]}>
                    {translate('auth:bridge.skip')}
                  </Text>
                </Pressable>
              ) : null}
            </Animated.View>
          ) : null}
        </View>

        <AuthHomeIndicator mode={mode} />
      </AuthScreenShell>
    </Animated.View>
  )
}

// ─── Estilos (geometría literal de authbridge2.js) ───────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pedestal: {
    width: 190,
    height: 190,
    borderRadius: 95,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bowl: {
    width: 154,
    height: 154,
    borderRadius: 77,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Halo circular suave centrado tras el logo (~130, se desvanece al 70%).
  logoGlow: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    experimental_backgroundImage:
      'radial-gradient(circle, rgba(164,227,166,0.35), rgba(164,227,166,0) 70%)',
  },
  greet: {
    fontSize: 27,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    marginTop: 26,
  },
  // Alto del bloque de saludo (fontSize 27 · lineHeight ~34 + marginTop
  // 26) reservado cuando name es null, para que el subtítulo no salte.
  greetSpacer: {
    height: 34,
    marginTop: 26,
  },
  sub: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    // 22 (antes 10, cuando colgaba de la barra): aire bajo el saludo
    // ahora que el subtítulo va directo después de él.
    marginTop: 22,
    minWidth: 230,
    textAlign: 'center',
  },
  actions: {
    alignItems: 'center',
  },
  retryBtn: {
    borderRadius: 20,
    paddingVertical: 13,
    paddingHorizontal: 34,
    marginTop: 22,
  },
  retryLabel: {
    fontSize: 14.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  skip: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    textDecorationLine: 'underline',
    marginTop: 14,
  },
})
