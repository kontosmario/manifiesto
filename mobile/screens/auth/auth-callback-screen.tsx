import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AppButton } from '@/components/ui/button'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { Screen } from '@/components/ui/screen'
import { useCompleteAuthCallback } from '@/features/auth/use-auth-actions'
import { BlockingScreen } from '@/screens/shared/blocking-screen'
import { getErrorMessage } from '@/utils/error-message'
import { useAppTheme } from '@/theme/theme-provider'

export function AuthCallbackScreen() {
  const router = useRouter()
  const { theme } = useAppTheme()
  const params = useLocalSearchParams<{
    code?: string
  }>()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isProcessing, setProcessing] = useState(true)
  const completeAuthCallback = useCompleteAuthCallback()

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
    let cancelled = false

    const run = async () => {
      try {
        await completeAuthCallback.mutateAsync(payload)

        if (!cancelled) {
          router.replace('/')
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getErrorMessage(error, 'No se pudo completar la autenticación.'))
          setProcessing(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [completeAuthCallback, payload, router])

  if (isProcessing) {
    return <BlockingScreen message="Confirmando acceso..." />
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
  error: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  actions: {
    gap: 12,
  },
})
