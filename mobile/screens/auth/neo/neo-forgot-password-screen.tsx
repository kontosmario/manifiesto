import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { CaptchaModal } from '@/components/auth/captcha-modal'
import { RequireGuest } from '@/components/guards'
import {
  AuthForgotPassword,
  type AuthForgotStage,
} from '@/components/redesign/auth/auth-forgot-password'
import { AuthLiveChrome } from '@/components/redesign/auth/auth-kit'
import { normalizeEmail } from '@/features/auth/auth-flow'
import { usePasswordReset } from '@/features/auth/use-auth-actions'
import { useCaptcha } from '@/features/auth/use-captcha'
import { triggerHaptic } from '@/lib/haptics'
import { useThemeMode } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

/**
 * Recuperar contraseña LIVE del rediseño (cableado 2026-07-17): monta la
 * réplica aprobada con el chrome real (AuthLiveChrome) y espeja la
 * lógica de la pantalla anterior
 * (mobile/screens/auth/forgot-password-screen.tsx):
 *
 *   · Submit = captcha gate (mismo patrón que signup: skipea sin site
 *     key) + usePasswordReset (supabase.auth.resetPasswordForEmail).
 *     Anti-enumeración: el server responde éxito genérico aunque el
 *     email no exista — `sent` se muestra siempre que la mutation
 *     resuelva, igual que la real.
 *   · stage lo deriva esta pantalla de `sentTo` (== la real: sentTo
 *     seteado tras el éxito ⇒ estado sent); nunca vuelve a `form`.
 *   · Código completo → reset-password con email+otp (la verificación
 *     verifyOtp + el gate seguro viven allá; esa pantalla NO fue
 *     rediseñada y se navega igual que la real, con replace).
 *   · Reenviar (pedido del rediseño, la pantalla anterior no lo tenía):
 *     re-dispara el MISMO envío al mismo email, con cooldown de 60s —
 *     mismo default que use-resend-confirm-email; la mecánica del
 *     countdown (cooldownUntil + tick de 1s solo mientras corre) está
 *     transcripta de ese hook.
 *
 * Hápticos: el kit pone los de interacción (back/link 'light', CTA
 * 'selection'); esta pantalla pone los de RESULTADO del envío
 * (success/warning/error), como la real. El de "código completo" es del
 * componente (momento del rediseño aprobado).
 */

/** Cooldown del reenvío (mismo default que use-resend-confirm-email). */
const RESEND_COOLDOWN_MS = 60_000

export function NeoForgotPasswordScreen() {
  const { t } = useTranslation()
  const mode = useThemeMode().resolvedMode
  const router = useRouter()
  const passwordReset = usePasswordReset()
  const captcha = useCaptcha()

  // == la real: sentTo != null ⇒ estado sent (acá, derivado a `stage`).
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  // Countdown del reenvío: deadline + tick de 1s SOLO mientras corre
  // (mecánica de use-resend-confirm-email.ts:64-75).
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (cooldownUntil <= now) return
    const id = setInterval(() => setNow(Date.now()), 1000) // @motion-allow: reloj 1s del countdown de reenvío, no es una animación
    return () => clearInterval(id)
  }, [cooldownUntil, now])
  const resendCooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))

  // Envío core (submit y reenvío): espejo de handleSubmit de la real
  // (forgot-password-screen.tsx:67-95) — captcha gate primero, después
  // la mutation. Los hápticos de resultado son de esta pantalla (dueña
  // del efecto, contrato 4b); el serverError solo tiene superficie en
  // `form` (en `sent` el háptico carga con el feedback del fallo del
  // reenvío — no hay visual aprobado para eso).
  const sendResetEmail = useCallback(
    async (email: string): Promise<boolean> => {
      try {
        let captchaToken: string | undefined
        if (captcha.isConfigured) {
          const token = await captcha.request()
          if (!token) {
            await triggerHaptic('warning')
            setServerError(t('auth:forgotPassword.errorCaptcha'))
            return false
          }
          captchaToken = token
        }
        await passwordReset.mutateAsync({ email, captchaToken })
        await triggerHaptic('success')
        return true
      } catch (error) {
        await triggerHaptic('error')
        setServerError(getErrorMessage(error, t('auth:forgotPassword.errorSendFailed')))
        return false
      }
    },
    [captcha, passwordReset, t],
  )

  // El componente ya gatea email válido (CTA disabled con el criterio de
  // la real); acá solo se normaliza (normalizeEmail = trim + lowercase,
  // como el handleSubmit real) y se limpia el error al arrancar
  // (contrato 4b: así el mismo mensaje dos veces retriggerea).
  const handleSubmitEmail = useCallback(
    (email: string) => {
      if (passwordReset.isPending) return
      const normalized = normalizeEmail(email)
      setServerError(null)
      void (async () => {
        const ok = await sendResetEmail(normalized)
        if (ok) setSentTo(normalized)
      })()
    },
    [passwordReset.isPending, sendResetEmail],
  )

  // Reenvío: mismo envío al mismo email; el cooldown arranca solo si
  // salió bien (un fallo deja el link vivo para reintentar).
  const handleResend = useCallback(() => {
    if (!sentTo || resendCooldown > 0 || passwordReset.isPending) return
    void (async () => {
      const ok = await sendResetEmail(sentTo)
      if (ok) {
        setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS)
        setNow(Date.now())
      }
    })()
  }, [passwordReset.isPending, resendCooldown, sendResetEmail, sentTo])

  // Espejo del handleBack real (forgot-password-screen.tsx:61-65); el
  // háptico 'light' lo pone el kit (AuthBackHeader / AuthLink).
  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/(auth)/login')
  }, [router])

  // Espejo del submitCode real (forgot-password-screen.tsx:100-110):
  // navega a reset-password con email+otp — la verificación (verifyOtp)
  // + el gate seguro viven allá. replace, como la real: el back desde
  // reset-password no debe volver a esta pantalla.
  const handleCodeComplete = useCallback(
    (code: string) => {
      if (!sentTo || code.length !== 6) return
      router.replace({
        pathname: '/auth/reset-password',
        params: { email: sentTo, otp: code },
      })
    },
    [router, sentTo],
  )

  const stage: AuthForgotStage = sentTo ? 'sent' : 'form'

  return (
    <RequireGuest allowFamilylessSession>
      <AuthLiveChrome>
        <AuthForgotPassword
          mode={mode}
          stage={stage}
          sentTo={sentTo ?? ''}
          submitting={passwordReset.isPending}
          serverError={serverError}
          resendCooldown={resendCooldown}
          onBack={handleBack}
          onSubmitEmail={handleSubmitEmail}
          onCodeComplete={handleCodeComplete}
          onResend={handleResend}
        />
        {/* El captcha renderiza fuera del componente réplica (que no sabe
            de captcha): modal por encima del árbol, como en la real. */}
        <CaptchaModal visible={captcha.visible} onComplete={captcha.onComplete} />
      </AuthLiveChrome>
    </RequireGuest>
  )
}
