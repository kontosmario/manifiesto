import { useCallback, useEffect, useState } from 'react'
import { AuthLiveChrome, AuthScreenShell } from '@/components/redesign/auth/auth-kit'
import { AuthPin } from '@/components/redesign/auth/auth-pin'
import { dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'
import { getPinLength, verifyPin } from '@/lib/pin-lock'
import { triggerHaptic } from '@/lib/haptics'
import { useScreenCaptureProtection } from '@/lib/use-screen-capture-protection'
import { useThemeMode } from '@/theme/theme-provider'

/**
 * Panel de desbloqueo por PIN LIVE del rediseño (Turno 4 · cableado
 * 2026-07-17) — reemplazo 1:1 del PinLockPanel embebido en BootScreen
 * cuando la máquina auth-flow está en `locked:pin`. MISMA semántica de
 * dispatch que el panel anterior (mobile/components/auth/pin-lock-panel.tsx):
 *
 *  - PIN correcto → PIN_OK (la máquina entra al bridge premium)
 *  - "Olvidé mi PIN" → USE_PASSWORD_FALLBACK (login con password, SIN
 *    logout destructivo — G4 2026-06-11)
 *
 * La sesión ya fue verificada en `probing`: acá solo verificación local
 * del PIN (verifyPin, async: PBKDF2 + lockout local+server). Takeover
 * full-screen sobre la superficie del boot: AuthLiveChrome + el shell
 * del rediseño (la réplica AuthPin trae el suyo; el canvas de carga usa
 * AuthScreenShell directo).
 */
export function NeoPinLockPanel() {
  // Sprint P · Audit #9 P-3: block screen recording / screenshots while
  // the PIN-pad is on screen (paridad con el panel anterior).
  useScreenCaptureProtection()
  const mode = useThemeMode().resolvedMode

  // Sprint K · Audit #4 K-4: largo REAL antes de montar el pad — con un
  // PIN de 6, defaultear a 4 auto-submitteaba a los 4 dígitos y quemaba
  // presupuesto de lockout.
  const [pinLength, setPinLength] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    void getPinLength().then((len) => {
      if (!cancelled) setPinLength(len)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const [checking, setChecking] = useState(false)
  const [errorToken, setErrorToken] = useState(0)
  const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(null)

  const handleSubmit = useCallback(
    (pin: string) => {
      if (checking) return
      setChecking(true)
      void verifyPin(pin)
        .then((result) => {
          if (result.ok) {
            void triggerHaptic('success')
            dispatchAuthFlow({ type: 'PIN_OK' })
            // checking queda en true a propósito: la máquina desmonta el
            // panel (bridge) — no hay más input que aceptar acá.
            return
          }
          // Fallo: el engine devuelve max(lockout local, server) en ms
          // relativos → deadline epoch para el countdown de la réplica.
          setLockedUntilMs(result.lockedForMs > 0 ? Date.now() + result.lockedForMs : null)
          // Shake + háptico de error + celdas vacías los pone la réplica.
          setErrorToken((prev) => prev + 1)
          setChecking(false)
        })
        .catch(() => {
          // verifyPin lee SecureStore + PBKDF2; en error (storage
          // corrupto / hash inválido) NO dejar checking=true para
          // siempre: tratar como intento fallido y dejar reintentar
          // (code review screens-B4, heredado del panel anterior).
          setErrorToken((prev) => prev + 1)
          setChecking(false)
        })
    },
    [checking],
  )

  // G4 fix (2026-06-11): NO logout destructivo — fallback a login con
  // password. Si el user realmente quiere cerrar sesión, lo hace desde
  // Settings → Cerrar sesión.
  const handleForgot = useCallback(() => {
    dispatchAuthFlow({ type: 'USE_PASSWORD_FALLBACK' })
  }, [])

  return (
    <AuthLiveChrome>
      {pinLength === null ? (
        // Canvas temado vacío mientras se lee el largo (SecureStore es
        // rápido; un spinner acá flashearía — mismo criterio que
        // neo-biometric-setup-screen).
        <AuthScreenShell mode={mode} />
      ) : (
        <AuthPin
          mode={mode}
          variant="lock"
          pinLength={pinLength}
          onSubmit={handleSubmit}
          checking={checking}
          errorToken={errorToken}
          lockedUntilMs={lockedUntilMs}
          onForgot={handleForgot}
        />
      )}
    </AuthLiveChrome>
  )
}
