import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View, type TextInput } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Svg, { Path, Rect } from 'react-native-svg'
import { FreshInstallResetFriction } from '@/components/auth/fresh-install-reset-friction'
import { RequireReauthSheet } from '@/components/auth/require-reauth-sheet'
import {
  AuthCta,
  AuthLink,
  AuthLiveChrome,
  AuthPasswordField,
  AuthStrengthMeter,
} from '@/components/redesign/auth/auth-kit'
import { AUTH_SPEC, type AuthMode } from '@/components/redesign/auth/auth-spec'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { markAppUnlocked } from '@/features/auth/app-lock-state'
import { checkPasswordPolicy, PASSWORD_POLICY } from '@/features/auth/password-policy'
import {
  useCompleteAuthCallback,
  useUpdatePassword,
  useVerifyRecoveryOtp,
} from '@/features/auth/use-auth-actions'
import { getBiometricLoginState } from '@/lib/biometric-auth'
import { triggerHaptic } from '@/lib/haptics'
import { getPinLockState } from '@/lib/pin-lock'
import { useScreenCaptureProtection } from '@/lib/use-screen-capture-protection'
import { BlockingScreen } from '@/screens/shared/blocking-screen'
import { useThemeMode } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'
import { getErrorMessage } from '@/utils/error-message'
import { NeoAuthErrorRow, NeoAuthPanel } from './neo-auth-panels'

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
 *
 * La máquina de stages, el gate de re-auth y la fricción de fresh
 * install son los MISMOS del flujo auditado — acá solo cambia la piel:
 * el esqueleto compartido del funnel (NeoAuthPanel), pozos hundidos con
 * el campo de contraseña del kit + medidor de fuerza, y los estados de
 * resultado con Brot en pedestal. El estado de validación del link se
 * apoya en la superficie de arranque (BlockingScreen), que ya es la del
 * rediseño, para que el seam mail → app sea invisible.
 */
export function NeoResetPasswordScreen() {
  // Sprint P · Audit #9 P-3 (2026-06-10): block screen capture so the
  // half-typed new password never lands in a screenshot/recording.
  useScreenCaptureProtection()
  const { t } = useTranslation()
  const router = useRouter()
  const mode = useThemeMode().resolvedMode
  const s = AUTH_SPEC[mode]
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

  // Piel: revelado de cada campo, campo culpable del intento bloqueado
  // (anillo durazno del kit) y descarte del error por tipeo.
  const [revealPassword, setRevealPassword] = useState(false)
  const [revealConfirm, setRevealConfirm] = useState(false)
  const [errorField, setErrorField] = useState<'password' | 'confirm' | null>(null)
  const [lastFormError, setLastFormError] = useState(formError)
  const [errorDismissed, setErrorDismissed] = useState(false)
  if (formError !== lastFormError) {
    setLastFormError(formError)
    setErrorDismissed(false)
  }
  const formErrorVisible = Boolean(formError) && !errorDismissed
  const confirmRef = useRef<TextInput>(null)

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
  const policy = useMemo(() => checkPasswordPolicy(password), [password])
  const passwordValid = useMemo(
    () =>
      password.length >= PASSWORD_POLICY.MIN_LENGTH && password === confirm && policy.ok,
    [password, confirm, policy],
  )

  // Indicador en vivo de coincidencia: success si coinciden, warning si no.
  // null cuando el campo de confirmación está vacío (todavía no hay nada que
  // comparar).
  const matchState: 'match' | 'mismatch' | null =
    confirm.length === 0 ? null : confirm === password ? 'match' : 'mismatch'

  // Medidor de fuerza: mismos tramos que el alta (0 vacía · 1 corta ·
  // 2 media · 3 larga), con los labels reales de auth:signup.
  const strength =
    password.length === 0
      ? 0
      : password.length < PASSWORD_POLICY.MIN_LENGTH
        ? 1
        : password.length < 14
          ? 2
          : 3
  const strengthLabel =
    strength === 3
      ? t('auth:signup.strengthStrong')
      : strength === 2
        ? t('auth:signup.strengthGood')
        : t('auth:signup.strengthWeak')

  const handleSubmit = useCallback(async () => {
    if (!passwordValid || updatePassword.isPending) return
    const policyCheck = checkPasswordPolicy(password)
    if (!policyCheck.ok) {
      setFormError(policyCheck.error ?? t('auth:resetPassword.errorPasswordPolicy'))
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

  const goToLogin = useCallback(() => router.replace('/(auth)/login'), [router])
  const requestNewLink = useCallback(
    () => router.replace('/(auth)/forgot-password'),
    [router],
  )

  // Tap sobre el CTA bloqueado: el kit muestra su hint y acá se marca el
  // campo culpable (política primero, coincidencia después).
  const handleBlockedSave = useCallback(() => {
    setErrorField(policy.ok ? 'confirm' : 'password')
    void triggerHaptic('error')
  }, [policy])

  const handlePasswordChange = useCallback((text: string) => {
    setPassword(text)
    setErrorField(null)
    setErrorDismissed(true)
  }, [])

  const handleConfirmChange = useCallback((text: string) => {
    setConfirm(text)
    setErrorField(null)
    setErrorDismissed(true)
  }, [])

  if (stage === 'exchanging') {
    return <BlockingScreen message={t('auth:resetPassword.validatingLink')} />
  }

  if (stage === 'reauth') {
    return (
      <AuthLiveChrome>
        <NeoAuthPanel
          mode={mode}
          brotPose="coach"
          centered
          eyebrow={t('auth:resetPassword.reauthEyebrow')}
          title={t('auth:resetPassword.reauthTitle')}
          lead={t('auth:resetPassword.reauthSubtitle')}
          body={t('auth:resetPassword.reauthBody')}
          onBack={goToLogin}
        />
        <RequireReauthSheet
          actionLabel={t('auth:resetPassword.reauthActionLabel')}
          onCancel={handleReauthCancel}
          onConfirmed={handleReauthConfirmed}
          visible={reauthVisible}
        />
      </AuthLiveChrome>
    )
  }

  if (stage === 'fresh-install-friction') {
    // J-Auth3 — fresh-install friction interstitial. Not perfect (it's
    // a UX speed bump, not a hard gate) but it raises the bar for the
    // takeover chain described in `fresh-install-reset-friction.tsx`
    // while we work on a proper backend out-of-band confirmation flow.
    return (
      <AuthLiveChrome>
        <NeoAuthPanel
          mode={mode}
          eyebrow={t('auth:resetPassword.frictionEyebrow')}
          title={t('auth:resetPassword.frictionTitle')}
          lead={t('auth:resetPassword.frictionSubtitle')}
          onBack={goToLogin}
        >
          <View style={styles.frictionSlot}>
            <FreshInstallResetFriction
              // Sprint L · Audit #5 L-Med3: el `code` (o el `otp`) es único por
              // flujo de reset, así que keyea el anchor de SecureStore para que el
              // countdown sobreviva remounts dentro del mismo flujo sin filtrarse
              // entre resets distintos.
              frictionKey={code ?? otp}
              onCancel={handleFrictionCancel}
              onContinue={handleFrictionContinue}
            />
          </View>
        </NeoAuthPanel>
      </AuthLiveChrome>
    )
  }

  if (stage === 'timeout') {
    return (
      <AuthLiveChrome>
        <NeoAuthPanel
          mode={mode}
          brotPose="think"
          centered
          eyebrow={t('auth:resetPassword.timeoutEyebrow')}
          title={t('auth:resetPassword.timeoutTitle')}
          lead={t('auth:resetPassword.timeoutSubtitle')}
          body={t('auth:resetPassword.timeoutBody')}
          footer={
            <>
              <AuthCta
                mode={mode}
                variant="neutral"
                label={t('auth:common.requestNewLink')}
                onPress={requestNewLink}
              />
              <AuthLink mode={mode} tone="muted" onPress={goToLogin} style={styles.secondaryLink}>
                {t('auth:common.backToLogin')}
              </AuthLink>
            </>
          }
        />
      </AuthLiveChrome>
    )
  }

  if (stage === 'error') {
    return (
      <AuthLiveChrome>
        <NeoAuthPanel
          mode={mode}
          brotPose="worried"
          centered
          eyebrow={t('auth:resetPassword.errorEyebrow')}
          title={t('auth:resetPassword.errorTitle')}
          lead={exchangeError ?? undefined}
          footer={
            <>
              <AuthCta
                mode={mode}
                variant="neutral"
                label={t('auth:common.requestNewLink')}
                onPress={requestNewLink}
              />
              <AuthLink mode={mode} tone="muted" onPress={goToLogin} style={styles.secondaryLink}>
                {t('auth:common.backToLogin')}
              </AuthLink>
            </>
          }
        />
      </AuthLiveChrome>
    )
  }

  if (stage === 'success') {
    return (
      <AuthLiveChrome>
        <NeoAuthPanel
          mode={mode}
          brotPose="cheer"
          centered
          eyebrow={t('auth:resetPassword.successEyebrow')}
          title={t('auth:resetPassword.successTitle')}
          lead={t('auth:resetPassword.successSubtitle')}
          footer={
            <AuthCta
              mode={mode}
              variant="green"
              label={t('auth:resetPassword.goHome')}
              onPress={() => router.replace('/')}
            />
          }
        />
      </AuthLiveChrome>
    )
  }

  return (
    <AuthLiveChrome>
      <NeoAuthPanel
        mode={mode}
        eyebrow={t('auth:resetPassword.formEyebrow')}
        title={t('auth:resetPassword.formTitle')}
        lead={t('auth:resetPassword.formSubtitle', { count: PASSWORD_POLICY.MIN_LENGTH })}
        onBack={goToLogin}
        footer={
          <>
            {formErrorVisible ? (
              <NeoAuthErrorRow mode={mode} text={formError ?? ''} />
            ) : null}
            <View style={styles.ctaWrap}>
              <AuthCta
                mode={mode}
                variant="neutral"
                label={
                  updatePassword.isPending
                    ? t('auth:resetPassword.saving')
                    : t('auth:resetPassword.save')
                }
                disabled={!passwordValid}
                disabledHint={
                  policy.ok
                    ? t('auth:resetPassword.errorPasswordsMismatch')
                    : (policy.error ?? t('auth:resetPassword.errorPasswordPolicy'))
                }
                onPress={() => void handleSubmit()}
                onDisabledPress={handleBlockedSave}
                busy={updatePassword.isPending}
              />
            </View>
          </>
        }
      >
        <View
          style={[
            styles.disclaimer,
            {
              backgroundColor: s.wellBackground,
              boxShadow: s.wellShadow,
              // Android < API 29 descarta el inset EN SILENCIO: sin el
              // hairline el aviso pierde su caja.
              borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1.5,
              borderColor: DISCLAIMER_BORDER[mode],
            },
          ]}
        >
          <LockIcon color={s.linkAccent} />
          <Text style={[styles.disclaimerText, { color: s.textSoft }]}>
            {t('auth:resetPassword.disclaimer')}
          </Text>
        </View>

        <AuthPasswordField
          mode={mode}
          label={t('auth:resetPassword.newPasswordLabel').toUpperCase()}
          value={password}
          onChangeText={handlePasswordChange}
          placeholder={t('auth:common.passwordPlaceholder')}
          revealed={revealPassword}
          onToggleReveal={() => setRevealPassword((prev) => !prev)}
          error={errorField === 'password'}
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          topGap={22}
        />
        {password.length > 0 ? (
          <AuthStrengthMeter mode={mode} filled={strength} label={strengthLabel} />
        ) : null}

        <AuthPasswordField
          mode={mode}
          label={t('auth:resetPassword.confirmPasswordLabel').toUpperCase()}
          value={confirm}
          onChangeText={handleConfirmChange}
          placeholder={t('auth:common.passwordPlaceholder')}
          revealed={revealConfirm}
          onToggleReveal={() => setRevealConfirm((prev) => !prev)}
          error={errorField === 'confirm'}
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void handleSubmit()}
          inputRef={confirmRef}
          topGap={18}
        />

        {matchState ? (
          <View style={styles.matchRow}>
            <View
              style={[
                styles.matchDot,
                {
                  backgroundColor:
                    matchState === 'match' ? s.linkAccent : s.strengthLabel,
                },
              ]}
            >
              {matchState === 'match' ? (
                <CheckGlyph color={mode === 'dark' ? '#0F1E14' : '#F5F2E1'} />
              ) : (
                <CrossGlyph color={mode === 'dark' ? '#0F1E14' : '#F5F2E1'} />
              )}
            </View>
            {/* El texto va en el color primario (los tonos de estado no
                llegan a AA sobre el fondo claro); el disco de al lado es
                el que tiñe el estado. */}
            <Text style={[styles.matchText, { color: s.text }]}>
              {matchState === 'match'
                ? t('auth:resetPassword.passwordsMatch')
                : t('auth:resetPassword.passwordsMismatch')}
            </Text>
          </View>
        ) : null}
      </NeoAuthPanel>
    </AuthLiveChrome>
  )
}

/** Anillo del pozo del aviso cuando el inset no se dibuja. */
const DISCLAIMER_BORDER: Record<AuthMode, string> = {
  light: 'rgba(151,160,136,0.5)',
  dark: 'rgba(101,152,113,0.35)',
}

// ─── Glifos locales (el set del flujo no trae candado ni check) ──────

function LockIcon({ color, size = 17 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={4.5}
        y={10.5}
        width={15}
        height={10}
        rx={3}
        stroke={color}
        strokeWidth={2}
      />
      <Path
        d="M8 10.5V8a4 4 0 018 0v2.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  )
}

function CheckGlyph({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Path
        d="M2.5 7.5l3 3 6-7"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function CrossGlyph({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Path
        d="M3.6 3.6l6.8 6.8M10.4 3.6l-6.8 6.8"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Svg>
  )
}

const styles = StyleSheet.create({
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 22,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 18,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  matchDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchText: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  ctaWrap: { marginTop: 12 },
  secondaryLink: { marginTop: 16 },
  frictionSlot: { marginTop: 20 },
})
