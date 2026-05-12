import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AppButton } from '@/components/ui/button'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { Screen } from '@/components/ui/screen'
import { useCompleteAuthCallback } from '@/features/auth/use-auth-actions'
import { BlockingScreen } from '@/screens/shared/blocking-screen'
import { getErrorMessage } from '@/utils/error-message'
import { useAppTheme } from '@/theme/theme-provider'

const AUTH_CALLBACK_TIMEOUT_MS = 30_000

export function AuthCallbackScreen() {
  const router = useRouter()
  const { theme } = useAppTheme()
  const params = useLocalSearchParams<{
    code?: string
  }>()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isProcessing, setProcessing] = useState(true)
  const [timedOut, setTimedOut] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const completeAuthCallback = useCompleteAuthCallback()
  const cancelledRef = useRef(false)

  // PKCE flow: only the `code` is honored. Implicit-flow tokens
  // (access_token / refresh_token in the URL) are no longer accepted
  // — they were exploitable for session fixation via a phishing
  // deep link.
  const payload = useMemo(() => {
    return {
      code: typeof params.code === 'string' ? params.code : null,
    }
  }, [params.code])

  useEffect(() => {
    cancelledRef.current = false

    // Si Supabase no respondió en 30s probablemente está caído o la red
    // está rota. En vez de dejar al usuario colgado en el blocking
    // splash, le damos retry + fallback a login.
    const timeoutId = setTimeout(() => {
      if (cancelledRef.current) return
      setTimedOut(true)
      setProcessing(false)
    }, AUTH_CALLBACK_TIMEOUT_MS)

    const run = async () => {
      try {
        await completeAuthCallback.mutateAsync(payload)

        if (!cancelledRef.current) {
          clearTimeout(timeoutId)
          router.replace('/')
        }
      } catch (error) {
        if (!cancelledRef.current) {
          clearTimeout(timeoutId)
          setErrorMessage(getErrorMessage(error, 'No se pudo completar la autenticación.'))
          setProcessing(false)
        }
      }
    }

    void run()

    return () => {
      cancelledRef.current = true
      clearTimeout(timeoutId)
    }
  }, [completeAuthCallback, payload, retryToken, router])

  const handleRetry = useCallback(() => {
    setProcessing(true)
    setErrorMessage(null)
    setTimedOut(false)
    setRetryToken((n) => n + 1)
  }, [])

  if (isProcessing) {
    return <BlockingScreen message="Confirmando acceso..." />
  }

  if (timedOut) {
    return (
      <Screen
        subtitle="No recibimos respuesta del servidor en 30 segundos."
        title="Está tardando más de lo normal"
      >
        <BrandedPanel elevated style={styles.card} variant="accent">
          <Text style={[styles.body, { color: theme.colors.textSoft }]}>
            Puede ser tu conexión o un problema temporal. Probá de nuevo o
            volvé al login.
          </Text>
          <View style={styles.actions}>
            <AppButton label="Reintentar" onPress={handleRetry} />
            <AppButton
              label="Volver a login"
              onPress={() => router.replace('/(auth)/login')}
              variant="ghost"
            />
          </View>
        </BrandedPanel>
      </Screen>
    )
  }

  return (
    <Screen subtitle="La confirmación abrió la app, pero no pudimos cerrar la sesión correctamente." title="Error de acceso">
      <BrandedPanel elevated style={styles.card} variant="accent">
        <Text style={[styles.error, { color: theme.colors.danger }]}>{errorMessage}</Text>
        <View style={styles.actions}>
          <AppButton label="Volver al inicio" onPress={() => router.replace('/')} />
          <AppButton label="Ir a login" onPress={() => router.replace('/(auth)/login')} variant="ghost" />
        </View>
      </BrandedPanel>
    </Screen>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 18,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  actions: {
    gap: 12,
  },
})
