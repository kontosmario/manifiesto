import { useCallback, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { WelcomeScreen } from '@/screens/auth/welcome-screen'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { logoutSession } from '@/features/auth/logout'

// The signup route is being added by another agent; until it lands the
// router types don't know about it. We cast the href to keep this route
// shippable now without a brittle string-literal coupling.
const SIGNUP_HREF = '/(auth)/signup' as unknown as Href

export default function WelcomeRoute() {
  const router = useRouter()
  const sessionQuery = useAuthSession()
  // Guard against double-tap while logout is in flight.
  const inFlightRef = useRef(false)
  // Local "busy" state so the screen can disable interactions while
  // the logout chain runs (showing the warm transition splash on top
  // covers the transition visually).
  const [isBusy, setIsBusy] = useState(false)

  const handleEmpezar = useCallback(async () => {
    if (inFlightRef.current) return
    const session = sessionQuery.data ?? null

    if (!session) {
      router.push(SIGNUP_HREF)
      return
    }

    // Force fresh signup: any lingering session (testing artifact,
    // a partially-set-up account the user wants to discard, etc.)
    // gets cleared so RequireGuest on /(auth)/signup doesn't bounce
    // us through AppEntryGate to login. logoutSession also clears
    // biometric credentials, lastUserProfile, and re-arms app-lock.
    inFlightRef.current = true
    setIsBusy(true)
    let didError = false
    await logoutSession({
      onError: () => {
        didError = true
      },
      onSuccess: () => {},
    })
    inFlightRef.current = false
    setIsBusy(false)

    if (didError) {
      Alert.alert(
        'No pudimos preparar tu nueva cuenta',
        'Probá de nuevo en unos segundos.',
      )
      return
    }
    router.push(SIGNUP_HREF)
  }, [router, sessionQuery.data])

  const handleLogin = useCallback(() => {
    if (inFlightRef.current) return
    router.push('/(auth)/login')
  }, [router])

  return (
    <WelcomeScreen
      isBusy={isBusy}
      onCreate={handleEmpezar}
      onLogin={handleLogin}
    />
  )
}
