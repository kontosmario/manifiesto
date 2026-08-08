import { RequireAuth } from '@/components/guards'
import { ApplePayScreen } from '@/screens/settings/apple-pay-screen'

export default function ApplePayRoute() {
  return (
    <RequireAuth>
      {() => <ApplePayScreen />}
    </RequireAuth>
  )
}
