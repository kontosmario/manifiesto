import { useLocalSearchParams, useRouter } from 'expo-router'
import { PinSetupScreen } from '@/screens/auth/pin-setup-screen'

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
  return <PinSetupScreen onDone={done} onCancel={done} />
}
