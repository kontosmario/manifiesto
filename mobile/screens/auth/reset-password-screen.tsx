import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AppButton } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import { BlockingScreen } from '@/screens/shared/blocking-screen'
import { AuthShell } from '@/components/auth/auth-scaffold'
import { FeedbackPill } from '@/components/auth/auth-feedback-pill'
import { FreshInstallResetFriction } from '@/components/auth/fresh-install-reset-friction'
import { RequireReauthSheet } from '@/components/auth/require-reauth-sheet'
import { markAppUnlocked } from '@/features/auth/app-lock-state'
import {
  useCompleteAuthCallback,
  useUpdatePassword,
  useVerifyRecoveryOtp,
} from '@/features/auth/use-auth-actions'
import { getBiometricLoginState } from '@/lib/biometric-auth'
import { getPinLockState } from '@/lib/pin-lock'
import { triggerHaptic } from '@/lib/haptics'
import { useScreenCaptureProtection } from '@/lib/use-screen-capture-protection'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'
import {
  checkPasswordPolicy,
  PASSWORD_POLICY,
} from '@/features/auth/password-policy'

const RESET_TIMEOUT_MS = 30_000

/**
 * Landing del link de recovery. Supabase manda el email con un `code` y
 * abre `manifiesto://auth/reset-password?code=...`. El screen:
 *  1) Intercambia el code por una sesión temporal vía PKCE.
 *  2) Muestra un form para setear contraseña nueva.
 *  3) Al éxito, ruteamos al home — Supabase ya dejó al user logueado.
 *
 * Si el intercambio falla (link vencido / ya consumido) damos al user un
 * CTA para volver a pedir reset.
 */
export function ResetPasswordScreen() {
  // Sprint P · Audit #9 P-3 (2026-06-10): block screen capture so the
  // half-typed new password never lands in a screenshot/recording.
  useScreenCaptureProtection()
  const router = useRouter()
  const { theme } = useAppTheme()
  const params = useLocalSearchParams<{
    code?: string
    email?: string
    otp?: string
  }>()
  const completeAuthCallback = useCompleteAuthCallback()
  const verifyRecoveryOtp = useVerifyRecoveryOtp()
  const updatePassword = useUpdatePassword()
  const cancelledRef = useRef(false)
  // El effect de exchange depende sólo del code; meter
  // `completeAuthCallback` en deps re-disparaba el RPC en cada render
  // porque la mutation object cambia de identidad. Code review screens-B1.
  const mutateRef = useRef(completeAuthCallback)
  const verifyRef = useRef(verifyRecoveryOtp)
  useEffect(() => {
    mutateRef.current = completeAuthCallback
    verifyRef.current = verifyRecoveryOtp
  })

  const code = typeof params.code === 'string' ? params.code : null
  // Fallback OTP: el mail trae un código de 6 dígitos; forgot-password navega
  // acá con ?email=&otp= cuando el deep-link no abre la app. verifyOtp deja la
  // misma sesión de recovery que el exchange del PKCE → el resto es idéntico.
  const otp = typeof params.otp === 'string' ? params.otp : null
  const email = typeof params.email === 'string' ? params.email : null
  const hasOtp = Boolean(otp && email)
  // Sprint G · G-Auth1: si el user tiene PIN o biometric configurado en
  // este device, gateamos el form detrás de un re-auth ANTES de permitir
  // updateUser({password}). El email link es ONE factor; si su inbox
  // está comprometido (o el laptop quedó desbloqueado un rato), el
  // atacante no debería poder lockear al user sin además conocer PIN o
  // pasar Face ID en este device. Si el user no tiene ninguno de los
  // dos (`hasLocalAuth=false`), seguimos el flujo previo — el link es
  // el único factor posible.
  const [stage, setStage] = useState<
    | 'exchanging'
    | 'reauth'
    | 'fresh-install-friction'
    | 'form'
    | 'success'
    | 'error'
    | 'timeout'
  >(code || hasOtp ? 'exchanging' : 'error')
  const [exchangeError, setExchangeError] = useState<string | null>(
    code || hasOtp ? null : 'El link es inválido o ya expiró. Pedinos uno nuevo.',
  )
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  // Bound to RequireReauthSheet visibility — only shown when we
  // detect local auth and the user hasn't confirmed yet.
  const [reauthVisible, setReauthVisible] = useState(false)

  useEffect(() => {
    if (!code && !hasOtp) return
    cancelledRef.current = false
    const timeoutId = setTimeout(() => {
      if (cancelledRef.current) return
      setStage('timeout')
    }, RESET_TIMEOUT_MS)

    const run = async () => {
      try {
        if (code) {
          await mutateRef.current.mutateAsync({ code })
        } else if (otp && email) {
          await verifyRef.current.mutateAsync({ email, token: otp })
        }
        if (cancelledRef.current) return
        clearTimeout(timeoutId)
        // Sprint G · G-Auth1: chequeo si el device tiene local auth
        // (PIN o biometric). Si tiene, paso a 'reauth' y abro el sheet.
        // Si no, mantengo el comportamiento previo y voy directo al
        // form — el email link sigue siendo el único factor disponible.
        //
        // Sprint I · I-4 — anclar a `hasSavedCredentials` en vez de
        // `isAvailable`. `isAvailable` es true por el simple hecho de
        // que el HARDWARE tiene Face ID, lo cual no prueba nada en un
        // fresh install: el usuario pasa un Face ID prompt y vuelve al
        // form sin que esto agregue ningún factor extra a la cuenta.
        // Solo gateamos cuando el APP ya tiene credenciales locales
        // guardadas para este user.
        const [pinState, bioState] = await Promise.all([
          getPinLockState(),
          getBiometricLoginState(),
        ])
        if (cancelledRef.current) return
        const hasLocalAuth = pinState.isSet || bioState.hasSavedCredentials
        if (hasLocalAuth) {
          setStage('reauth')
          setReauthVisible(true)
        } else {
          // Sprint J · J-Auth3 — fresh-install path. We have no second
          // factor we can challenge against, so the email link becomes
          // single-factor and the attack chain is:
          //   1. Attacker briefly accesses victim's inbox
          //   2. Requests reset link
          //   3. Installs the app, completes reset on attacker's device
          //   4. Enrolls a PIN → victim locked out
          // The ideal mitigation is a backend out-of-band confirmation
          // (e.g. SMS or a second email link from a known device); until
          // we ship that, the friction interstitial forces a 10-second
          // pause + a strongly-worded warning to drop the casual case
          // and give the legitimate user time to bail out.
          setStage('fresh-install-friction')
        }
      } catch (error) {
        if (cancelledRef.current) return
        clearTimeout(timeoutId)
        setExchangeError(
          getErrorMessage(
            error,
            code
              ? 'No pudimos validar el link.'
              : 'Código inválido o vencido. Pedí uno nuevo.',
          ),
        )
        setStage('error')
      }
    }
    void run()

    return () => {
      cancelledRef.current = true
      clearTimeout(timeoutId)
    }
  }, [code, otp, email, hasOtp])

  // Sprint H · H1: enforce full policy on password reset (new password
  // is treated as if the user were signing up — we don't want a recovery
  // flow to weaken the policy that signup just hardened).
  const passwordValid = useMemo(
    () =>
      password.length >= PASSWORD_POLICY.MIN_LENGTH &&
      password === confirm &&
      checkPasswordPolicy(password).ok,
    [password, confirm],
  )

  const handleSubmit = useCallback(async () => {
    if (!passwordValid || updatePassword.isPending) return
    const policy = checkPasswordPolicy(password)
    if (!policy.ok) {
      setFormError(policy.error ?? 'La contraseña no cumple los requisitos.')
      await triggerHaptic('warning')
      return
    }
    if (password !== confirm) {
      setFormError('Las contraseñas no coinciden.')
      await triggerHaptic('warning')
      return
    }
    setFormError(null)
    try {
      await updatePassword.mutateAsync({ password })
      await triggerHaptic('success')
      // J-Auth1: a successful password reset leaves the user with a
      // valid Supabase session; mark the app-lock unlocked so the
      // protected stack mounts when the user taps "Ir al inicio".
      markAppUnlocked()
      setStage('success')
    } catch (error) {
      await triggerHaptic('error')
      setFormError(getErrorMessage(error, 'No pudimos actualizar tu contraseña.'))
    }
  }, [confirm, password, passwordValid, updatePassword])

  const handleReauthConfirmed = useCallback(() => {
    setReauthVisible(false)
    setStage('form')
  }, [])

  const handleReauthCancel = useCallback(() => {
    setReauthVisible(false)
    setStage('error')
    setExchangeError(
      'Cancelaste la verificación. Por seguridad, no podemos actualizar tu contraseña sin confirmar tu identidad en este dispositivo.',
    )
  }, [])

  // J-Auth3 — fresh-install friction handlers.
  const handleFrictionContinue = useCallback(() => {
    setStage('form')
  }, [])

  const handleFrictionCancel = useCallback(() => {
    setStage('error')
    setExchangeError(
      'Saliste sin cambiar la contraseña. Si vos no pediste este cambio, escribinos a soporte@manifiestoapp.com.',
    )
  }, [])

  const goToLogin = () => router.replace('/(auth)/login')

  if (stage === 'exchanging') {
    return <BlockingScreen message="Validando tu link..." />
  }

  if (stage === 'reauth') {
    return (
      <AuthShell
        eyebrow="Un paso más"
        onBack={goToLogin}
        subtitle="Antes de cambiar la contraseña pedimos tu PIN o biometría en este dispositivo."
        title="Confirmá tu identidad"
      >
        <Text style={[styles.body, { color: theme.colors.textSoft }]}>
          Esto evita que alguien con acceso temporal a tu email pueda bloquearte
          la cuenta.
        </Text>
        <RequireReauthSheet
          actionLabel="cambiar tu contraseña"
          onCancel={handleReauthCancel}
          onConfirmed={handleReauthConfirmed}
          visible={reauthVisible}
        />
      </AuthShell>
    )
  }

  if (stage === 'fresh-install-friction') {
    // J-Auth3 — fresh-install friction interstitial. Not perfect (it's
    // a UX speed bump, not a hard gate) but it raises the bar for the
    // takeover chain described in `fresh-install-reset-friction.tsx`
    // while we work on a proper backend out-of-band confirmation flow.
    return (
      <AuthShell
        eyebrow="Importante"
        onBack={goToLogin}
        subtitle="Leé esto con atención. Sin PIN ni biometría guardada en este dispositivo, este es el único momento en el que podemos avisarte."
        title="Antes de continuar"
      >
        <FreshInstallResetFriction
          // Sprint L · Audit #5 L-Med3: el `code` (o el `otp`) es único por
          // flujo de reset, así que keyea el anchor de SecureStore para que el
          // countdown sobreviva remounts dentro del mismo flujo sin filtrarse
          // entre resets distintos.
          frictionKey={code ?? otp}
          onCancel={handleFrictionCancel}
          onContinue={handleFrictionContinue}
        />
      </AuthShell>
    )
  }

  if (stage === 'timeout') {
    return (
      <AuthShell
        eyebrow="Un momento"
        onBack={goToLogin}
        subtitle="No pudimos validar el link en 30 segundos."
        title="Está tardando más de lo normal"
      >
        <Text style={[styles.body, { color: theme.colors.textSoft }]}>
          Probá pedir otro link de recuperación o volver al login.
        </Text>
        <AppButton
          label="Pedir nuevo link"
          onPress={() => router.replace('/(auth)/forgot-password')}
        />
        <AppButton label="Volver a login" onPress={goToLogin} variant="ghost" />
      </AuthShell>
    )
  }

  if (stage === 'error') {
    return (
      <AuthShell
        eyebrow="Algo pasó"
        onBack={goToLogin}
        subtitle={exchangeError ?? undefined}
        title="Link inválido"
      >
        <AppButton
          label="Pedir nuevo link"
          onPress={() => router.replace('/(auth)/forgot-password')}
        />
        <AppButton label="Volver a login" onPress={goToLogin} variant="ghost" />
      </AuthShell>
    )
  }

  if (stage === 'success') {
    return (
      <AuthShell
        eyebrow="Listo"
        onBack={() => router.replace('/')}
        subtitle="Ya podés entrar con tu nueva contraseña."
        title="Contraseña actualizada"
      >
        <AppButton label="Ir al inicio" onPress={() => router.replace('/')} />
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="Casi listo"
      onBack={goToLogin}
      subtitle={`Elegí una contraseña de al menos ${PASSWORD_POLICY.MIN_LENGTH} caracteres, con letras y números.`}
      title="Nueva contraseña"
    >
      <TextField
        accessibilityLabel="Nueva contraseña"
        autoCapitalize="none"
        autoCorrect={false}
        label="Nueva contraseña"
        onChangeText={setPassword}
        placeholder="••••••••"
        returnKeyType="next"
        secureTextEntry
        textContentType="newPassword"
        value={password}
      />
      <TextField
        accessibilityLabel="Confirmar contraseña"
        autoCapitalize="none"
        autoCorrect={false}
        label="Confirmar contraseña"
        onChangeText={setConfirm}
        onSubmitEditing={() => void handleSubmit()}
        placeholder="••••••••"
        returnKeyType="go"
        secureTextEntry
        textContentType="newPassword"
        value={confirm}
      />
      {formError ? <FeedbackPill intent="error" message={formError} /> : null}
      <AppButton
        disabled={!passwordValid}
        label={updatePassword.isPending ? 'Guardando…' : 'Guardar contraseña'}
        loading={updatePassword.isPending}
        onPress={() => void handleSubmit()}
      />
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
})
