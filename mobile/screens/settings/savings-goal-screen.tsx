import { useRouter } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { SavingsGoalForm } from '@/components/settings/savings-goal-form'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'

interface SavingsGoalScreenProps {
  familyId: string
}

export function SavingsGoalScreen({ familyId }: SavingsGoalScreenProps) {
  const router = useRouter()
  const goal = useSavingsGoal(familyId)
  return (
    <Screen title="Meta de ahorro">
      {goal.isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : (
        <SavingsGoalForm familyId={familyId} existing={goal.data ?? null} onSaved={() => router.back()} />
      )}
    </Screen>
  )
}
