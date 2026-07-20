import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthLiveChrome } from '@/components/redesign/auth/auth-kit'
import { AuthPin } from '@/components/redesign/auth/auth-pin'
import { isWeakPin, setPin } from '@/lib/pin-lock'
import { triggerHaptic } from '@/lib/haptics'
import { useScreenCaptureProtection } from '@/lib/use-screen-capture-protection'
import { useThemeMode } from '@/theme/theme-provider'

/**
 * Setup de PIN LIVE del rediseño (Turno 4 · cableado 2026-07-17): monta
 * la réplica AuthPin variant 'setup' con el chrome real (AuthLiveChrome)
 * y la MISMA lógica que la PinSetupScreen anterior
 * (mobile/screens/auth/pin-setup-screen.tsx):
 *
 *  - validateEntry = isWeakPin REAL + copy real: el PIN débil se rechaza
 *    ANTES de pedir confirmación (fases y mismatch viven en la réplica).
 *  - Confirmación OK → setPin (async, PBKDF2 600k) → háptico de éxito +
 *    onDone. Mientras guarda, la réplica deja el input inerte (saving).
 *  - setPin rechaza (WeakPinError defense-in-depth / storage) →
 *    serverError con el mensaje del engine cuando existe (la réplica
 *    resetea a enter y muestra el copy); háptico de error del caller.
 *  - Screen-capture protection intacta (hoy detrás del flag global OFF).
 *
 * MISMO contrato que la PinSetupScreen anterior — la ruta
 * app/(app)/pin-setup.tsx conserva TODA su lógica (?next=onboarding).
 */
export function NeoPinSetupScreen({
  onDone,
  onCancel,
}: {
  /** Llamado tras guardar el PIN con éxito. */
  onDone: () => void
  /** Llamado al cancelar (link inferior). */
  onCancel: () => void
}) {
  // Sprint P · Audit #9 P-3: block screen capture while the user is
  // typing / confirming their PIN (paridad con la pantalla anterior).
  useScreenCaptureProtection()
  const { t } = useTranslation()
  const mode = useThemeMode().resolvedMode
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const validateEntry = useCallback(
    (pin: string) => (isWeakPin(pin) ? t('auth:pinSetup.weakPin') : null),
    [t],
  )

  const handleDone = useCallback(
    (pin: string) => {
      if (saving) return
      setSaving(true)
      // Dueños del ciclo (patrón 4b): limpiar el error al arrancar cada
      // intento — así el MISMO mensaje dos veces también retriggerea el
      // render-adjust de la réplica.
      setServerError(null)
      void setPin(pin)
        .then(() => {
          void triggerHaptic('success')
          onDone()
        })
        .catch((err: unknown) => {
          // Defensa en profundidad: el gate weak-PIN propio de setPin (o
          // un fallo de SecureStore). Copy del engine cuando viene, para
          // que el user sepa por qué — espejo del catch del setup real.
          const message =
            err instanceof Error && err.message
              ? err.message
              : t('auth:pinSetup.saveFailed')
          setSaving(false)
          setServerError(message)
          void triggerHaptic('error')
        })
    },
    [saving, onDone, t],
  )

  return (
    <AuthLiveChrome>
      <AuthPin
        mode={mode}
        variant="setup"
        onBack={onCancel}
        validateEntry={validateEntry}
        onDone={handleDone}
        saving={saving}
        serverError={serverError}
      />
    </AuthLiveChrome>
  )
}
