import { RequireAuth } from '@/components/guards'
import { SavingsGoalScreen } from '@/screens/settings/savings-goal-screen'

export default function SavingsGoalRoute() {
  return (
    <RequireAuth>
      {({ familyId }) => <SavingsGoalScreen familyId={familyId} />}
    </RequireAuth>
  )
}
