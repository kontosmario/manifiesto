import { StyleSheet, View } from 'react-native'
import { AuthColdStart } from '@/components/redesign/auth/auth-cold-start'
import { AuthLiveChrome } from '@/components/redesign/auth/auth-kit'
import { useThemeMode } from '@/theme/theme-provider'

/**
 * Launch splash LIVE del rediseño (cableado arranque 2026-07-17).
 *
 * Reemplaza al `AuthLaunchSplash` en el RootLayoutShell conservando su
 * CONTRATO con el shell y con launch-splash-state (misma API pública:
 * onComplete / persistent / exitMode) pero dibujando el visual aprobado
 * del handoff de arranque: `AuthColdStart` (logo pop + wordmark sobre
 * partículas, esqueleto pixel-alineado con la Bienvenida 3a — que es
 * exactamente lo que la NeoWelcomeScreen live renderiza debajo).
 *
 * Reparto de responsabilidades:
 *  · La COORDINACIÓN (auto-hide cancelable cuando no es persistente,
 *    salida latched 'soar'/'fade', reporte onComplete) vive en
 *    AuthColdStart vía su contrato live (autoHide / exitMode) — ver el
 *    header de auth-cold-start.tsx.
 *  · El shell sigue marcando shown/gone (launch-splash-state) y el
 *    min-hold del bridge se gatea con LAUNCH_ENTRANCE_MS, actualizado a
 *    la duración del entrance de ESTE visual (logo pop + wordmark).
 *
 * A diferencia del overlay del preview (pointerEvents="none" para que la
 * Bienvenida de abajo quede interactiva), el splash real BLOQUEA los
 * toques mientras vive — igual que AuthLaunchSplash: debajo puede haber
 * un login/gate a medio montar que no debe recibir taps a ciegas.
 *
 * Tema: el rediseño tiene par claro/oscuro — se resuelve del tema real
 * (el AuthLaunchSplash viejo era siempre oscuro).
 */
export function NeoLaunchSplash({
  onComplete,
  persistent = false,
  exitMode,
}: {
  onComplete?: () => void
  /** When true the splash never auto-hides; the parent controls visibility. */
  persistent?: boolean
  /** Salida controlada por el parent (spec auth-flow 2026-06-11):
   *  'soar' = success del unlock · 'fade' = fade clásico 220ms. */
  exitMode?: 'fade' | 'soar'
}) {
  const mode = useThemeMode().resolvedMode
  return (
    <View style={styles.overlay} pointerEvents="auto">
      <AuthLiveChrome>
        <AuthColdStart
          mode={mode}
          autoHide={!persistent}
          exitMode={exitMode}
          onDone={onComplete}
        />
      </AuthLiveChrome>
    </View>
  )
}

const styles = StyleSheet.create({
  // Mismo plano que el AuthLaunchSplash que reemplaza (z20 — debajo del
  // TransitionOverlay z50, que se SUPRIME mientras este splash vive).
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
})
