import { useLocalSearchParams, useRouter } from 'expo-router'
import { NeoPinSetupScreen } from '@/screens/auth/neo/neo-pin-setup-screen'

export default function PinSetupRoute() {
  const router = useRouter()
  const { next } = useLocalSearchParams<{ next?: string }>()
  const done = () => {
    if (next === 'onboarding') {
      router.replace('/(app)/onboarding')
      return
    }
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)/home')
  }
  return <NeoPinSetupScreen onDone={done} onCancel={done} />
}
