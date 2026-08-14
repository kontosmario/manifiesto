import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { BrotMascot } from '@/components/brot'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import { AuthCta, AuthHomeIndicator, AuthScreenShell, AuthStatusBar } from './auth-kit'
import { AUTH_SPEC, type AuthMode } from './auth-spec'

/**
 * Sin conexión (takeover global) — NO existe mockup: diseño nuevo en el
 * lenguaje neumórfico del rediseño (patrón 5g/5h). Espeja el takeover
 * offline REAL de la app: mobile/features/auth-flow/offline-takeover.ts
 * (estado global, lo muestra el GlobalConnectivityWatcher con debounce
 * 2.5s y lo renderiza el TransitionOverlay vía el fallback de error de
 * auth-transition-splash.tsx). No es un paso del viaje de auth: es un
 * estado del DEVICE que puede tapar cualquier pantalla.
 *
 * BROT `wilted` PROTAGONISTA (pedido owner 2026-07-17): el brote
 * marchito —paleta apagada, hojas caídas— dentro del pozo del pedestal
 * del empty state 7b/7bo (la receta ya aprobada en los cierres de 5c).
 * Sin internet, el jardín se marchita. Al recuperar conexión REVIVE:
 * vuelve a la pose `idle` con un fade — el momento premium del demo.
 *
 * Copy literal de auth:transitionSplash.* (los strings que el fallback
 * real usa para 'network'): errorNetworkTitle, errorNetworkBody,
 * retry/retrying.
 *
 * CONTRATO LIVE (cableado arranque 2026-07-17): el round-trip vive en el
 * CALLER — `onRetry` devuelve una promesa con el resultado de la
 * verificación ACTIVA de internet (verifyInternetReachable en la app;
 * simulación en el preview, que reproduce el demo aprobado: 1er intento
 * falla, 2º recupera). El componente solo ANIMA el resultado:
 *   false → sigue offline: shake del pedestal + háptico de error, sin
 *           copy extra (la real tampoco agrega texto).
 *   true  → Brot revive (pose idle con fade) + háptico de éxito + beat
 *           → onRestored (el caller cierra el takeover recién ahí, para
 *           que el revive se vea — el momento premium).
 */

// Copy: auth:transitionSplash.* (los strings que el fallback real usa
// para 'network': errorNetworkTitle, errorNetworkBody, retry, retrying).

/** Beat del revive (ver a Brot volver en sí) antes de cerrar el takeover. */
const RESTORED_BEAT_MS = 1100

/**
 * Pedestal del empty state 7b/7bo — MISMOS valores literales que
 * BrotSuccess (onb-5c-hogar.tsx): círculo elevado 170 + pozo hundido
 * 136 con Brot apoyado al fondo. Transcripto local (criterio
 * anti-acople entre turnos).
 */
interface PedestalSpec {
  outerGradientCss: string | undefined
  outerBackground: string
  outerShadow: string
  wellBackground: string | undefined
  wellShadow: string
}

const PEDESTAL: Record<AuthMode, PedestalSpec> = {
  light: {
    outerGradientCss: undefined,
    outerBackground: '#E9EBE0',
    outerShadow:
      '12px 12px 26px rgba(151,160,136,0.45), -12px -12px 26px rgba(255,255,255,0.95)',
    wellBackground: undefined,
    wellShadow:
      'inset 6px 6px 13px rgba(151,160,136,0.4), inset -6px -6px 13px rgba(255,255,255,0.95)',
  },
  dark: {
    outerGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    outerBackground: '#182A1F',
    outerShadow: '12px 12px 26px rgba(0,0,0,0.6), -12px -12px 26px rgba(101,152,113,0.12)',
    wellBackground: '#142519',
    wellShadow: 'inset 6px 6px 13px rgba(0,0,0,0.5), inset -6px -6px 13px rgba(101,152,113,0.08)',
  },
}

type Phase = 'offline' | 'checking' | 'restored'

export function AuthOffline({
  mode,
  onRetry,
  onRestored,
}: {
  mode: AuthMode
  /** Round-trip REAL de conectividad (lo hace el caller — la app usa
   *  verifyInternetReachable; el preview simula). El resultado decide la
   *  animación: false = shake (sigue offline) · true = revive + beat. */
  onRetry: () => Promise<boolean>
  /** Conexión recuperada (tras el beat del revive) — el caller cierra el
   *  takeover recién acá. */
  onRestored?: () => void
}) {
  const s = AUTH_SPEC[mode]
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('offline')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // Desmontaje: nunca dejar timers vivos ni setState tras unmount (el
  // round-trip del caller puede resolver con el takeover ya cerrado).
  useEffect(
    () => () => {
      mountedRef.current = false
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  // Shake del pedestal en el reintento fallido — misma receta y timings
  // que las celdas del PIN (useCellShake, auth-pin.tsx): ±8/−6/0 en el
  // UI thread, cero re-renders por frame. transform SIEMPRE como array
  // presente (gotcha iOS).
  const shakeX = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }))

  const handleRetry = () => {
    if (phase !== 'offline') return
    setPhase('checking')
    void (async () => {
      let online = false
      try {
        online = await onRetry()
      } catch {
        // Verificación falló — se trata como "sigue offline".
        online = false
      }
      if (!mountedRef.current) return
      if (!online) {
        // Round-trip sin respuesta: sigue offline. La real no agrega
        // copy (el botón solo vuelve a "Reintentar") — acá el pedestal
        // sacude para que el fallo se SIENTA, no solo se lea.
        setPhase('offline')
        void triggerHaptic('error')
        shakeX.value = withSequence(
          withTiming(-8, { duration: motionDurations.shakeStep }),
          withTiming(8, { duration: motionDurations.shakeStep }),
          withTiming(-6, { duration: motionDurations.shakeStep }),
          withTiming(0, { duration: motionDurations.shakeStep }),
        )
        return
      }
      // Round-trip OK: Brot revive y el takeover se despide tras un beat.
      setPhase('restored')
      void triggerHaptic('success')
      timer.current = setTimeout(() => {
        timer.current = null
        onRestored?.()
      }, RESTORED_BEAT_MS)
    })()
  }

  const restored = phase === 'restored'

  return (
    <AuthScreenShell mode={mode}>
      <AuthStatusBar mode={mode} />

      {/* Norma de distribución: grupo cohesivo centrado (pedestal +
          textos + CTA), el aire vive afuera del grupo. */}
      <View style={styles.body}>
        <Animated.View
          style={[
            styles.pedestal,
            shakeStyle,
            {
              experimental_backgroundImage: PEDESTAL[mode].outerGradientCss,
              backgroundColor: PEDESTAL[mode].outerBackground,
              boxShadow: PEDESTAL[mode].outerShadow,
            },
          ]}
        >
          <View
            style={[
              styles.pedestalWell,
              {
                backgroundColor: PEDESTAL[mode].wellBackground,
                boxShadow: PEDESTAL[mode].wellShadow,
              },
            ]}
          >
            {/* key por pose: el revive entra con un fade one-shot (el
                marchito no "salta" a vivo — vuelve en sí). */}
            <Animated.View key={restored ? 'revived' : 'wilted'} entering={FadeIn.duration(motionDurations.standard)}>
              <BrotMascot pose={restored ? 'idle' : 'wilted'} size={96} shadow={false} />
            </Animated.View>
          </View>
        </Animated.View>

        <Text style={[styles.title, { color: s.text }]}>
          {t('auth:transitionSplash.errorNetworkTitle')}
        </Text>
        <Text style={[styles.bodyText, { color: s.helper }]}>
          {t('auth:transitionSplash.errorNetworkBody')}
        </Text>

        <View style={styles.ctaWrap}>
          {/* busy durante la verificación: press ignorado en silencio,
              visual activo (mismo tratamiento que el escaneo de Face ID).
              Durante el beat del revive queda busy también — el takeover
              se está por cerrar solo. */}
          <AuthCta
            mode={mode}
            variant="neutral"
            label={
              phase === 'offline'
                ? t('auth:transitionSplash.retry')
                : t('auth:transitionSplash.retrying')
            }
            busy={phase !== 'offline'}
            onPress={handleRetry}
          />
        </View>
      </View>

      <AuthHomeIndicator mode={mode} />
    </AuthScreenShell>
  )
}

// ─── Estilos (pedestal 7b + tipografía del empty state) ──────────────

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  pedestal: {
    width: 170,
    height: 170,
    borderRadius: 85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pedestalWell: {
    width: 136,
    height: 136,
    borderRadius: 68,
    // Brot apoya en el fondo del pozo (7b: flex-end + 12 de aire).
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
  },
  // Título 22/900 + copy 13.5/700 lh21 — métricas del empty state 7b
  // (las mismas de BrotSuccess en 5c).
  title: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    textAlign: 'center',
    marginTop: 24,
  },
  bodyText: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 300,
  },
  ctaWrap: { alignSelf: 'stretch', marginTop: 30 },
})
