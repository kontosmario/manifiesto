import { useRouter, type Href } from 'expo-router'
import { WelcomeScreen } from '@/screens/auth/welcome-screen'

// The signup route is being added by another agent; until it lands the
// router types don't know about it. We cast the href to keep this route
// shippable now without a brittle string-literal coupling.
const SIGNUP_HREF = '/(auth)/signup' as unknown as Href

export default function WelcomeRoute() {
  const router = useRouter()
  return (
    <WelcomeScreen
      onCreate={() => router.push(SIGNUP_HREF)}
      onLogin={() => router.push('/(auth)/login')}
    />
  )
}
