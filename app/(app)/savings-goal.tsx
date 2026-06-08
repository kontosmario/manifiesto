import { RequireAuth } from '@/components/guards'
import { SavingsGoalScreen } from '@/screens/settings/savings-goal-screen'

export default function SavingsGoalRoute() {
  return (
    <RequireAuth>
      {({ familyId, userId }) => (
        <SavingsGoalScreen familyId={familyId} userId={userId} />
      )}
    </RequireAuth>
  )
}
