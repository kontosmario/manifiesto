import { useLocalSearchParams } from 'expo-router'
import { RequireAuth } from '@/components/guards'
import { AddFixedExpenseScreen } from '@/screens/home/add-fixed-expense-screen'

export default function AddFixedExpenseRoute() {
  const { section } = useLocalSearchParams<{ section?: string }>()

  return (
    <RequireAuth>
      {({ familyId }) => (
        <AddFixedExpenseScreen familyId={familyId} initialSection={section} />
      )}
    </RequireAuth>
  )
}
