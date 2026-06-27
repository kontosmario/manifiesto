import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui/button'
import { PasswordField } from '@/components/ui/password-field'
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
  const { t } = useTranslation()
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
  // aquí con ?email=&otp= cuando el deep-link no abre la app. verifyOtp deja la
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
    code || hasOtp ? null : t('auth:resetPassword.linkInvalid'),
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
              ? t('auth:resetPassword.errorExchangeFailed')
              : t('auth:resetPassword.errorOtpInvalid'),
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
  }, [code, otp, email, hasOtp, t])

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

  // Indicador en vivo de coincidencia: success si coinciden, warning si no.
  // null cuando el campo de confirmación está vacío (todavía no hay nada que
  // comparar).
  const matchState: 'match' | 'mismatch' | null =
    confirm.length === 0 ? null : confirm === password ? 'match' : 'mismatch'

  const handleSubmit = useCallback(async () => {
    if (!passwordValid || updatePassword.isPending) return
    const policy = checkPasswordPolicy(password)
    if (!policy.ok) {
      setFormError(policy.error ?? t('auth:resetPassword.errorPasswordPolicy'))
      await triggerHaptic('warning')
      return
    }
    if (password !== confirm) {
      setFormError(t('auth:resetPassword.errorPasswordsMismatch'))
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
      setFormError(getErrorMessage(error, t('auth:resetPassword.errorUpdateFailed')))
    }
  }, [confirm, password, passwordValid, updatePassword, t])

  const handleReauthConfirmed = useCallback(() => {
    setReauthVisible(false)
    setStage('form')
  }, [])

  const handleReauthCancel = useCallback(() => {
    setReauthVisible(false)
    setStage('error')
    setExchangeError(t('auth:resetPassword.reauthCancelled'))
  }, [t])

  // J-Auth3 — fresh-install friction handlers.
  const handleFrictionContinue = useCallback(() => {
    setStage('form')
  }, [])

  const handleFrictionCancel = useCallback(() => {
    setStage('error')
    setExchangeError(t('auth:resetPassword.frictionCancelled'))
  }, [t])

  const goToLogin = () => router.replace('/(auth)/login')

  if (stage === 'exchanging') {
    return <BlockingScreen message={t('auth:resetPassword.validatingLink')} />
  }

  if (stage === 'reauth') {
    return (
      <AuthShell
        eyebrow={t('auth:resetPassword.reauthEyebrow')}
        onBack={goToLogin}
        subtitle={t('auth:resetPassword.reauthSubtitle')}
        title={t('auth:resetPassword.reauthTitle')}
      >
        <Text style={[styles.body, { color: theme.colors.textSoft }]}>
          {t('auth:resetPassword.reauthBody')}
        </Text>
        <RequireReauthSheet
          actionLabel={t('auth:resetPassword.reauthActionLabel')}
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
        eyebrow={t('auth:resetPassword.frictionEyebrow')}
        onBack={goToLogin}
        subtitle={t('auth:resetPassword.frictionSubtitle')}
        title={t('auth:resetPassword.frictionTitle')}
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
        eyebrow={t('auth:resetPassword.timeoutEyebrow')}
        onBack={goToLogin}
        subtitle={t('auth:resetPassword.timeoutSubtitle')}
        title={t('auth:resetPassword.timeoutTitle')}
      >
        <Text style={[styles.body, { color: theme.colors.textSoft }]}>
          {t('auth:resetPassword.timeoutBody')}
        </Text>
        <AppButton
          label={t('auth:common.requestNewLink')}
          onPress={() => router.replace('/(auth)/forgot-password')}
        />
        <AppButton label={t('auth:common.backToLogin')} onPress={goToLogin} variant="ghost" />
      </AuthShell>
    )
  }

  if (stage === 'error') {
    return (
      <AuthShell
        eyebrow={t('auth:resetPassword.errorEyebrow')}
        onBack={goToLogin}
        subtitle={exchangeError ?? undefined}
        title={t('auth:resetPassword.errorTitle')}
      >
        <AppButton
          label={t('auth:common.requestNewLink')}
          onPress={() => router.replace('/(auth)/forgot-password')}
        />
        <AppButton label={t('auth:common.backToLogin')} onPress={goToLogin} variant="ghost" />
      </AuthShell>
    )
  }

  if (stage === 'success') {
    return (
      <AuthShell
        eyebrow={t('auth:resetPassword.successEyebrow')}
        onBack={() => router.replace('/')}
        subtitle={t('auth:resetPassword.successSubtitle')}
        title={t('auth:resetPassword.successTitle')}
      >
        <AppButton label={t('auth:resetPassword.goHome')} onPress={() => router.replace('/')} />
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow={t('auth:resetPassword.formEyebrow')}
      onBack={goToLogin}
      subtitle={t('auth:resetPassword.formSubtitle', { count: PASSWORD_POLICY.MIN_LENGTH })}
      title={t('auth:resetPassword.formTitle')}
    >
      <View
        style={[
          styles.disclaimer,
          { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.line },
        ]}
      >
        <MaterialIcons name="lock" size={18} color={theme.colors.primary} />
        <Text style={[styles.disclaimerText, { color: theme.colors.textSoft }]}>
          {t('auth:resetPassword.disclaimer')}
        </Text>
      </View>
      <PasswordField
        accessibilityLabel={t('auth:resetPassword.newPasswordLabel')}
        label={t('auth:resetPassword.newPasswordLabel')}
        onChangeText={setPassword}
        placeholder={t('auth:common.passwordPlaceholder')}
        returnKeyType="next"
        textContentType="newPassword"
        value={password}
      />
      <PasswordField
        accessibilityLabel={t('auth:resetPassword.confirmPasswordLabel')}
        label={t('auth:resetPassword.confirmPasswordLabel')}
        onChangeText={setConfirm}
        onSubmitEditing={() => void handleSubmit()}
        placeholder={t('auth:common.passwordPlaceholder')}
        returnKeyType="go"
        textContentType="password"
        value={confirm}
      />
      {matchState ? (
        <View style={styles.matchRow}>
          <MaterialIcons
            color={matchState === 'match' ? theme.colors.primary : theme.colors.warning}
            name={matchState === 'match' ? 'check-circle' : 'error-outline'}
            size={16}
          />
          <Text
            style={[
              styles.matchText,
              {
                color:
                  matchState === 'match' ? theme.colors.primary : theme.colors.warning,
              },
            ]}
          >
            {matchState === 'match'
              ? t('auth:resetPassword.passwordsMatch')
              : t('auth:resetPassword.passwordsMismatch')}
          </Text>
        </View>
      ) : null}
      {formError ? <FeedbackPill intent="error" message={formError} /> : null}
      <AppButton
        disabled={!passwordValid}
        label={updatePassword.isPending ? t('auth:resetPassword.saving') : t('auth:resetPassword.save')}
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
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  matchText: {
    fontSize: 13,
    fontWeight: '600',
  },
})
