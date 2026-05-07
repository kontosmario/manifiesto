import { RequireAuth } from '@/components/guards'
import { BillingScreen } from '@/screens/settings/billing-screen'

export default function PlanRoute() {
  return (
    <RequireAuth>
      {() => <BillingScreen />}
    </RequireAuth>
  )
}
