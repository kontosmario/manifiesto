import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui/button'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { Screen } from '@/components/ui/screen'
import { markAppUnlocked } from '@/features/auth/app-lock-state'
import {
  dispatchAuthFlow,
  getAuthFlowState,
} from '@/features/auth-flow/auth-flow-controller'
import { useCompleteAuthCallback } from '@/features/auth/use-auth-actions'
import { BlockingScreen } from '@/screens/shared/blocking-screen'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/utils/error-message'
import { useAppTheme } from '@/theme/theme-provider'

const AUTH_CALLBACK_TIMEOUT_MS = 30_000

export function AuthCallbackScreen() {
  const { t } = useTranslation()
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
  // Guardamos la mutation object en un ref para que el effect que dispara
  // mutateAsync NO la incluya en sus deps — sino, cada render genera un
  // nuevo object y el effect re-corre, disparando el RPC repetidas veces.
  // Code review screens-B1.
  const mutateRef = useRef(completeAuthCallback)
  useEffect(() => {
    mutateRef.current = completeAuthCallback
  })

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
    //
    // Sprint G · G-Auth4: `cancelledRef = true` solo evita que ESTE
    // effect aplique el resultado del exchange tardío en la UI, pero
    // Supabase ya guardó el JWT en SecureStore vía persistSession.
    // Si el exchange completa después del timeout, el user queda
    // logueado de manera fantasma con la sesión del code consumido.
    // Cuando el user vuelve al login y entra con OTRO email, durante
    // unos ms se ven 2 sesiones racing por onAuthStateChange. Llamamos
    // `signOut()` defensivo en el timeout para garantizar que NO queda
    // sesión stale del exchange tardío. Si el exchange ya estableció
    // sesión y signOut se ejecuta primero, el usuario simplemente ve
    // el login; si falla la red, signOut igual limpia el local storage.
    const timeoutId = setTimeout(() => {
      if (cancelledRef.current) return
      cancelledRef.current = true
      setTimedOut(true)
      setProcessing(false)
      void supabase.auth.signOut().catch(() => {
        // Best-effort defensive cleanup. The user will hit the login
        // screen via the timeout UI anyway; if signOut throws (no
        // session yet because exchange hasn't completed) it's a no-op
        // for our purposes.
      })
    }, AUTH_CALLBACK_TIMEOUT_MS)

    const run = async () => {
      try {
        await mutateRef.current.mutateAsync(payload)

        if (!cancelledRef.current) {
          clearTimeout(timeoutId)
          // El exchange OAuth es un evento de auth explícito: la máquina
          // entra al bridge y navega al destino resuelto (LOGIN_SUCCESS
          // marca unlocked vía confirm-session). dispatch es sincrónico:
          // si la máquina NO tomó el evento (fase ready u otra no-login,
          // p.ej. un confirm-link tocado con la app ya abierta), caemos
          // al comportamiento clásico markAppUnlocked + replace('/').
          dispatchAuthFlow({ type: 'LOGIN_SUCCESS' })
          if (getAuthFlowState().phase !== 'bridging') {
            markAppUnlocked()
            router.replace('/')
          }
        }
      } catch (error) {
        if (!cancelledRef.current) {
          clearTimeout(timeoutId)
          setErrorMessage(getErrorMessage(error, t('auth:authCallback.errorGeneric')))
          setProcessing(false)
        }
      }
    }

    void run()

    return () => {
      cancelledRef.current = true
      clearTimeout(timeoutId)
    }
  }, [payload, retryToken, router, t])

  const handleRetry = useCallback(() => {
    setProcessing(true)
    setErrorMessage(null)
    setTimedOut(false)
    setRetryToken((n) => n + 1)
  }, [])

  if (isProcessing) {
    return <BlockingScreen message={t('auth:authCallback.confirming')} />
  }

  if (timedOut) {
    return (
      <Screen
        subtitle={t('auth:authCallback.timeoutSubtitle')}
        title={t('auth:authCallback.timeoutTitle')}
      >
        <BrandedPanel elevated style={styles.card} variant="accent">
          <Text style={[styles.body, { color: theme.colors.textSoft }]}>
            {t('auth:authCallback.timeoutBody')}
          </Text>
          <View style={styles.actions}>
            <AppButton label={t('auth:authCallback.retry')} onPress={handleRetry} />
            <AppButton
              label={t('auth:authCallback.backToLogin')}
              onPress={() => router.replace('/(auth)/login')}
              variant="ghost"
            />
          </View>
        </BrandedPanel>
      </Screen>
    )
  }

  return (
    <Screen subtitle={t('auth:authCallback.errorSubtitle')} title={t('auth:authCallback.errorTitle')}>
      <BrandedPanel elevated style={styles.card} variant="accent">
        <Text style={[styles.error, { color: theme.colors.danger }]}>{errorMessage}</Text>
        <View style={styles.actions}>
          <AppButton label={t('auth:authCallback.backToHome')} onPress={() => router.replace('/')} />
          <AppButton label={t('auth:authCallback.goToLogin')} onPress={() => router.replace('/(auth)/login')} variant="ghost" />
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
