// Bottom sheet that re-authenticates the user before a destructive
// action (eliminar cuenta, salir del hogar, eliminar meta con monto).
// Sprint B · B1.
//
// Why one reusable sheet (vs. inline-coded prompts per caller):
//   Antes cada flow tenía su propia UI custom (delete-account-screen
//   tiene la suya bien hecha, pero leave-family y delete-savings-goal
//   no tenían NINGUNA verificación adicional más allá del Alert).
//   Centralizamos para que CADA destructive action quede gateada con
//   la misma UX y, si en el futuro endurecemos el flow (e.g. password
//   re-prompt), lo cambiamos en un solo lugar.
//
// Auth-method precedence:
//   biometric > PIN > none
//   · Biometric: si el user tiene Face ID/Touch ID + saved credentials
//     o flag enabled, el sheet dispara el prompt nativo on mount y, si
//     éxito, llama `onConfirmed` inmediatamente.
//   · PIN: si no hay biometric o si la biometría falló, mostramos
//     PinPad. `verifyPin()` maneja el lockout exponencial; el sheet
//     refleja el countdown visualmente.
//   · None: si el user no tiene ninguno de los dos, mostramos un mensaje
//     pidiendo configurar PIN/biometric desde Settings con CTA directo.
//     Si igualmente el user quiere proseguir (override), CTA "Continuar
//     sin verificación" — esto es solo opt-in en runtime de DEV/dev-
//     client; en producción nunca se ofrece (consideramos el reauth
//     mandatorio si hay algún signal de PIN/biometric configurable).

import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import * as LocalAuthentication from 'expo-local-authentication'
import { useRouter } from 'expo-router'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { PinPad } from '@/components/auth/pin-pad'
import { isPinComplete } from '@/components/auth/pin-pad-model'
import {
  authenticateBiometricAccess,
  getBiometricLoginState,
  type BiometricLoginState,
} from '@/lib/biometric-auth'
import { getPinLength, getPinLockState, verifyPin } from '@/lib/pin-lock'
import { triggerHaptic } from '@/lib/haptics'
import { useScreenCaptureProtection } from '@/lib/use-screen-capture-protection'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Sprint H · H7 — Threat model + fallback policy.
 *
 * Default precedence (biometric > PIN > none) maximizes UX coverage but
 * may DOWNGRADE the auth factor for users who set up both: a destructive
 * action gated by biometric WILL fall through to a 4-digit PIN if the
 * biometric prompt fails or is cancelled. A 4-digit PIN is weaker than
 * a successful Face ID match in two ways:
 *
 *   1. Entropy: ~13 bits (with PIN lockout helping after N attempts).
 *   2. Shoulder-surfing: visible from a glance over the user's shoulder.
 *
 * For most actions this trade is fine — falling back to PIN beats
 * locking the user out entirely. For the highest-impact destructive
 * action (account deletion) the owner may want to require biometric
 * with NO PIN fallback. We expose `allowPinFallback` (defaults to
 * `true` to preserve existing behavior). Callers that want the strict
 * gate pass `allowPinFallback={false}` — currently only the
 * delete-account flow opts in.
 *
 * If we later expose this as a Settings toggle, that's the right place
 * for it; for now it's compile-time per callsite to avoid silent
 * behavior shifts for existing users.
 */
interface RequireReauthSheetProps {
  visible: boolean
  actionLabel: string
  onConfirmed: () => void
  onCancel: () => void
  /**
   * When `false`, a failed biometric attempt does NOT degrade to PIN —
   * the user must retry biometric or cancel. Defaults to `true` (legacy
   * behavior).
   */
  allowPinFallback?: boolean
}

type AuthMethod = 'biometric' | 'pin' | 'none' | 'loading'

export function RequireReauthSheet({
  visible,
  actionLabel,
  onConfirmed,
  onCancel,
  allowPinFallback = true,
}: RequireReauthSheetProps) {
  // Sprint P · Audit #9 P-3 (2026-06-10): block screen capture while
  // the reauth PIN-pad is visible. Gated on `visible` so the protection
  // is only active when the sheet is actually on screen — preserves
  // capture for the rest of the app.
  useScreenCaptureProtection(visible)
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const router = useRouter()

  const [method, setMethod] = useState<AuthMethod>('loading')
  const [biometricState, setBiometricState] =
    useState<BiometricLoginState | null>(null)
  const [pinValue, setPinValue] = useState('')
  const [pinErrorToken, setPinErrorToken] = useState(0)
  const [pinLockoutMessage, setPinLockoutMessage] = useState<string | null>(null)
  const [isChecking, setChecking] = useState(false)
  const [biometricFailed, setBiometricFailed] = useState(false)
  // Sprint J · P0: read the persisted PIN length so this sheet submits
  // the right number of digits (4–8) instead of hardcoding 4. Defaults
  // to 4 for back-compat installs.
  const [pinLength, setPinLength] = useState<number>(4)

  // Reset internal state every time the sheet becomes visible. The
  // sheet may be reused across multiple destructive actions in the same
  // mount tree (delete savings → later eliminar cuenta) and we don't
  // want a previous error/state leaking over.
  useEffect(() => {
    if (!visible) {
      setPinValue('')
      setPinErrorToken(0)
      setPinLockoutMessage(null)
      setChecking(false)
      setBiometricFailed(false)
      setMethod('loading')
      return
    }
    let cancelled = false
    void (async () => {
      const [pinState, bioState, len] = await Promise.all([
        getPinLockState(),
        getBiometricLoginState(),
        getPinLength(),
      ])
      if (cancelled) return
      setBiometricState(bioState)
      setPinLength(len)
      // Biometric tiene precedencia: es la UX más fluida y respaldada
      // por OS. PIN es el fallback determinista. Si NINGUNO está
      // configurado, mostramos el placeholder "configura primero".
      // H7: when `allowPinFallback` is false and biometric is available,
      // we go biometric-only. If biometric isn't available we still let
      // PIN serve as the primary factor (no fallback because there's
      // nothing to fall back from) — the intent of the flag is to
      // prevent biometric→PIN DOWNGRADES, not to remove PIN as a
      // standalone option.
      if (bioState.isAvailable) {
        setMethod('biometric')
        void runBiometric(bioState)
      } else if (pinState.isSet) {
        setMethod('pin')
        if (pinState.lockedForMs > 0) {
          setPinLockoutMessage(
            t('auth:reauthSheet.lockout', { seconds: Math.ceil(pinState.lockedForMs / 1000) }),
          )
        }
      } else {
        setMethod('none')
      }
    })()
    return () => {
      cancelled = true
    }
    // runBiometric depende de onConfirmed pero queremos correr ESTE
    // effect solo cuando `visible` cambia. La función está definida más
    // abajo con su propia clausura estable a través de `useCallback`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const runBiometric = useCallback(
    async (_state: BiometricLoginState) => {
      if (isChecking) return
      setChecking(true)
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync()
        const isEnrolled = await LocalAuthentication.isEnrolledAsync()
        if (!hasHardware || !isEnrolled) {
          setChecking(false)
          setBiometricFailed(true)
          // H7: solo bajar a PIN si el caller lo permite. En modo
          // biometric-only, este es un dead-end y el user debe cancelar
          // o ir a Ajustes a habilitar biometría — mantenemos el botón
          // de Reintentar visible para no quedar atrapado.
          if (allowPinFallback) {
            const pinState = await getPinLockState()
            setMethod(pinState.isSet ? 'pin' : 'none')
          }
          return
        }
        const result = await authenticateBiometricAccess({
          promptMessage: t('auth:reauthSheet.biometricPrompt', { action: actionLabel.toLowerCase() }),
        })
        if (result.success) {
          void triggerHaptic('success')
          setChecking(false)
          onConfirmed()
          return
        }
        // User canceló o falló — ofrecemos retry o fallback a PIN.
        setChecking(false)
        setBiometricFailed(true)
        // H7: solo degradamos a PIN si el caller lo permite.
        if (allowPinFallback) {
          const pinState = await getPinLockState()
          if (pinState.isSet) setMethod('pin')
        }
      } catch {
        setChecking(false)
        setBiometricFailed(true)
      }
    },
    [actionLabel, allowPinFallback, isChecking, onConfirmed, t],
  )

  const handlePinChange = useCallback(
    (next: string) => {
      if (isChecking) return
      setPinValue(next)
      if (!isPinComplete(next, pinLength)) return
      setChecking(true)
      void verifyPin(next)
        .then((result) => {
          if (result.ok) {
            void triggerHaptic('success')
            setChecking(false)
            setPinValue('')
            onConfirmed()
            return
          }
          if (result.lockedForMs > 0) {
            const seconds = Math.ceil(result.lockedForMs / 1000)
            setPinLockoutMessage(t('auth:reauthSheet.lockout', { seconds }))
          } else {
            setPinLockoutMessage(null)
          }
          setPinErrorToken((prev) => prev + 1)
          setPinValue('')
          setChecking(false)
        })
        .catch(() => {
          setPinErrorToken((prev) => prev + 1)
          setPinValue('')
          setChecking(false)
        })
    },
    [isChecking, onConfirmed, pinLength, t],
  )

  const handleGoToSettings = useCallback(() => {
    onCancel()
    // Settings root (desde ahí el user encuentra PIN setup / biometric).
    router.push('/(app)/settings')
  }, [onCancel, router])

  const handleRetryBiometric = useCallback(() => {
    if (!biometricState) return
    setBiometricFailed(false)
    void runBiometric(biometricState)
  }, [biometricState, runBiometric])

  return (
    <ModalCard
      visible={visible}
      title={t('auth:reauthSheet.title')}
      subtitle={t('auth:reauthSheet.subtitle', { action: actionLabel.toLowerCase() })}
      onClose={onCancel}
    >
      {method === 'loading' ? (
        <View style={styles.placeholder}>
          <Text style={[styles.placeholderText, { color: theme.colors.textMuted }]}>
            {t('auth:reauthSheet.loading')}
          </Text>
        </View>
      ) : null}

      {method === 'biometric' ? (
        <View style={styles.biometricBlock}>
          <MaterialIcons
            color={theme.colors.primaryStrong}
            name="fingerprint"
            size={48}
            style={{ alignSelf: 'center' }}
          />
          <Text style={[styles.biometricTitle, { color: theme.colors.text }]}>
            {t('auth:reauthSheet.biometricTitle', {
              label: biometricState?.label ?? t('auth:reauthSheet.biometricLabelFallback'),
            })}
          </Text>
          <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
            {biometricFailed
              ? t('auth:reauthSheet.biometricRetryHintFailed')
              : t('auth:reauthSheet.biometricRetryHint')}
          </Text>
          <View style={styles.actionsRow}>
            <AppButton label={t('auth:reauthSheet.cancel')} onPress={onCancel} variant="ghost" />
            <AppButton
              disabled={isChecking}
              label={t('auth:reauthSheet.retry')}
              loading={isChecking}
              onPress={handleRetryBiometric}
              variant="primary"
            />
          </View>
        </View>
      ) : null}

      {method === 'pin' ? (
        <View style={styles.pinBlock}>
          <Text style={[styles.biometricTitle, { color: theme.colors.text }]}>
            {t('auth:reauthSheet.pinTitle')}
          </Text>
          <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
            {t('auth:reauthSheet.pinHelper')}
          </Text>
          <View style={styles.pinPadWrap}>
            <PinPad
              errorToken={pinErrorToken}
              onChange={handlePinChange}
              pinLength={pinLength}
              value={pinValue}
            />
            {pinLockoutMessage ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.lockoutText, { color: theme.colors.danger }]}
              >
                {pinLockoutMessage}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={({ pressed }) => [
              styles.cancelLink,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.cancelLinkText, { color: theme.colors.textMuted }]}>
              {t('auth:reauthSheet.cancel')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {method === 'none' ? (
        <View style={styles.placeholder}>
          <MaterialIcons
            color={theme.colors.warning}
            name="lock-outline"
            size={36}
            style={{ alignSelf: 'center' }}
          />
          <Text style={[styles.biometricTitle, { color: theme.colors.text }]}>
            {t('auth:reauthSheet.noneTitle')}
          </Text>
          <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
            {t('auth:reauthSheet.noneBody')}
          </Text>
          <View style={styles.actionsRow}>
            <AppButton label={t('auth:reauthSheet.cancel')} onPress={onCancel} variant="ghost" />
            <AppButton
              label={t('auth:reauthSheet.goToSettings')}
              onPress={handleGoToSettings}
              variant="primary"
            />
          </View>
        </View>
      ) : null}
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  placeholder: {
    gap: 12,
    paddingVertical: 8,
  },
  placeholderText: {
    fontSize: 13,
    textAlign: 'center',
  },
  biometricBlock: {
    gap: 12,
    paddingVertical: 8,
  },
  biometricTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  pinBlock: {
    gap: 12,
    paddingVertical: 8,
  },
  pinPadWrap: {
    alignItems: 'center',
    gap: 12,
  },
  lockoutText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  cancelLink: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
})
