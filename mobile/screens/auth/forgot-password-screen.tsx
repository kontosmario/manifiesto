import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AppButton } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import { Screen } from '@/components/ui/screen'
import { FeedbackPill } from '@/components/auth/auth-feedback-pill'
import { RequireGuest } from '@/components/guards'
import { normalizeEmail } from '@/features/auth/auth-flow'
import { usePasswordReset } from '@/features/auth/use-auth-actions'
import { useCaptcha } from '@/features/auth/use-captcha'
import { CaptchaModal } from '@/components/auth/captcha-modal'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

export function ForgotPasswordScreen() {
  const router = useRouter()
  const { theme } = useAppTheme()
  const passwordReset = usePasswordReset()
  const captcha = useCaptcha()
  const [email, setEmail] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const handleSubmit = useCallback(async () => {
    const normalized = normalizeEmail(email)
    if (!normalized.includes('@')) {
      setErrorMessage('Ingresá un email válido.')
      await triggerHaptic('warning')
      return
    }
    setErrorMessage(null)
    try {
      // Captcha gate (sprint B · B3). Mismo patrón que signup —
      // skipea si no hay site key configurada.
      let captchaToken: string | undefined
      if (captcha.isConfigured) {
        const token = await captcha.request()
        if (!token) {
          await triggerHaptic('warning')
          setErrorMessage('No pudimos verificar el captcha. Probá de nuevo.')
          return
        }
        captchaToken = token
      }
      await passwordReset.mutateAsync({ email: normalized, captchaToken })
      await triggerHaptic('success')
      setSentTo(normalized)
    } catch (error) {
      await triggerHaptic('error')
      setErrorMessage(getErrorMessage(error, 'No pudimos enviar el email.'))
    }
  }, [captcha, email, passwordReset])

  if (sentTo) {
    return (
      <RequireGuest allowFamilylessSession>
        <Screen
          title="Revisá tu mail"
          subtitle={`Te mandamos un link a ${sentTo} para reiniciar tu contraseña.`}
        >
          <View style={styles.stack}>
            <Text style={[styles.body, { color: theme.colors.textSoft }]}>
              Si no lo ves en unos minutos, revisá spam. El link es válido por
              una hora.
            </Text>
            <AppButton
              label="Volver a login"
              onPress={() => router.replace('/(auth)/login')}
            />
          </View>
        </Screen>
      </RequireGuest>
    )
  }

  return (
    <RequireGuest allowFamilylessSession>
      <Screen
        title="Recuperar acceso"
        subtitle="Te enviamos un mail con un link para crear una contraseña nueva."
      >
        <View style={styles.stack}>
          <TextField
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            label="Email de tu cuenta"
            onChangeText={setEmail}
            placeholder="nombre@correo.com"
            returnKeyType="go"
            textContentType="emailAddress"
            value={email}
            onSubmitEditing={() => void handleSubmit()}
          />
          {errorMessage ? (
            <FeedbackPill intent="error" message={errorMessage} />
          ) : null}
          <AppButton
            label={passwordReset.isPending ? 'Enviando…' : 'Enviar link'}
            loading={passwordReset.isPending}
            onPress={() => void handleSubmit()}
          />
          <AppButton
            label="Volver"
            onPress={() => router.back()}
            variant="ghost"
          />
        </View>
      </Screen>
      <CaptchaModal visible={captcha.visible} onComplete={captcha.onComplete} />
    </RequireGuest>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: 14,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
})
