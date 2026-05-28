import { useRouter } from 'expo-router'
import { PinSetupScreen } from '@/screens/auth/pin-setup-screen'

export default function PinSetupRoute() {
  const router = useRouter()
  const back = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)/home')
  }
  return <PinSetupScreen onDone={back} onCancel={back} />
}
