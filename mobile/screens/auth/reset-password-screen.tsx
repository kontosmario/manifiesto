import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AppButton } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import { Screen } from '@/components/ui/screen'
import { BlockingScreen } from '@/screens/shared/blocking-screen'
import { FeedbackPill } from '@/components/auth/auth-feedback-pill'
import {
  useCompleteAuthCallback,
  useUpdatePassword,
} from '@/features/auth/use-auth-actions'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

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
  const router = useRouter()
  const { theme } = useAppTheme()
  const params = useLocalSearchParams<{ code?: string }>()
  const completeAuthCallback = useCompleteAuthCallback()
  const updatePassword = useUpdatePassword()
  const cancelledRef = useRef(false)
  // El effect de exchange depende sólo del code; meter
  // `completeAuthCallback` en deps re-disparaba el RPC en cada render
  // porque la mutation object cambia de identidad. Code review screens-B1.
  const mutateRef = useRef(completeAuthCallback)
  useEffect(() => {
    mutateRef.current = completeAuthCallback
  })

  const code = typeof params.code === 'string' ? params.code : null
  const [stage, setStage] = useState<'exchanging' | 'form' | 'success' | 'error' | 'timeout'>(
    code ? 'exchanging' : 'error',
  )
  const [exchangeError, setExchangeError] = useState<string | null>(
    code ? null : 'El link es inválido o ya expiró. Pedinos uno nuevo.',
  )
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) return
    cancelledRef.current = false
    const timeoutId = setTimeout(() => {
      if (cancelledRef.current) return
      setStage('timeout')
    }, RESET_TIMEOUT_MS)

    const run = async () => {
      try {
        await mutateRef.current.mutateAsync({ code })
        if (cancelledRef.current) return
        clearTimeout(timeoutId)
        setStage('form')
      } catch (error) {
        if (cancelledRef.current) return
        clearTimeout(timeoutId)
        setExchangeError(getErrorMessage(error, 'No pudimos validar el link.'))
        setStage('error')
      }
    }
    void run()

    return () => {
      cancelledRef.current = true
      clearTimeout(timeoutId)
    }
  }, [code])

  const passwordValid = useMemo(
    () => password.length >= 8 && password === confirm,
    [password, confirm],
  )

  const handleSubmit = useCallback(async () => {
    if (!passwordValid || updatePassword.isPending) return
    if (password.length < 8) {
      setFormError('Mínimo 8 caracteres.')
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
      setStage('success')
    } catch (error) {
      await triggerHaptic('error')
      setFormError(getErrorMessage(error, 'No pudimos actualizar tu contraseña.'))
    }
  }, [confirm, password, passwordValid, updatePassword])

  if (stage === 'exchanging') {
    return <BlockingScreen message="Validando tu link..." />
  }

  if (stage === 'timeout') {
    return (
      <Screen
        title="Está tardando más de lo normal"
        subtitle="No pudimos validar el link en 30 segundos."
      >
        <View style={styles.stack}>
          <Text style={[styles.body, { color: theme.colors.textSoft }]}>
            Probá pedir otro link de recuperación o volver al login.
          </Text>
          <AppButton
            label="Pedir nuevo link"
            onPress={() => router.replace('/(auth)/forgot-password')}
          />
          <AppButton
            label="Volver a login"
            onPress={() => router.replace('/(auth)/login')}
            variant="ghost"
          />
        </View>
      </Screen>
    )
  }

  if (stage === 'error') {
    return (
      <Screen title="Link inválido" subtitle={exchangeError ?? undefined}>
        <View style={styles.stack}>
          <AppButton
            label="Pedir nuevo link"
            onPress={() => router.replace('/(auth)/forgot-password')}
          />
          <AppButton
            label="Volver a login"
            onPress={() => router.replace('/(auth)/login')}
            variant="ghost"
          />
        </View>
      </Screen>
    )
  }

  if (stage === 'success') {
    return (
      <Screen
        title="Contraseña actualizada"
        subtitle="Ya podés entrar con tu nueva contraseña."
      >
        <View style={styles.stack}>
          <AppButton label="Ir al inicio" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen
      title="Nueva contraseña"
      subtitle="Elegí una contraseña de al menos 8 caracteres."
    >
      <View style={styles.stack}>
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
          placeholder="••••••••"
          returnKeyType="go"
          secureTextEntry
          textContentType="newPassword"
          value={confirm}
          onSubmitEditing={() => void handleSubmit()}
        />
        {formError ? (
          <FeedbackPill intent="error" message={formError} />
        ) : null}
        <AppButton
          disabled={!passwordValid}
          label={updatePassword.isPending ? 'Guardando…' : 'Guardar contraseña'}
          loading={updatePassword.isPending}
          onPress={() => void handleSubmit()}
        />
      </View>
    </Screen>
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
