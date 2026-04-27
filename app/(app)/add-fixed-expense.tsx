import { useLocalSearchParams } from 'expo-router'
import { RequireAuth } from '@/components/guards'
import { AddFijoV2Screen } from '@/screens/home/add-fijo-v2-screen'

export default function AddFixedExpenseRoute() {
  const params = useLocalSearchParams<{
    id?: string
    amount?: string
    description?: string
  }>()
  const fixedExpenseId =
    typeof params.id === 'string' && params.id.trim().length > 0
      ? params.id
      : undefined
  const prefillAmountRaw =
    typeof params.amount === 'string' ? Number(params.amount) : NaN
  const prefillAmount =
    Number.isFinite(prefillAmountRaw) && prefillAmountRaw > 0
      ? prefillAmountRaw
      : undefined
  const prefillDescription =
    typeof params.description === 'string' && params.description.length > 0
      ? params.description
      : undefined
  return (
    <RequireAuth>
      {({ familyId }) => (
        <AddFijoV2Screen
          familyId={familyId}
          fixedExpenseId={fixedExpenseId}
          prefillAmount={prefillAmount}
          prefillDescription={prefillDescription}
        />
      )}
    </RequireAuth>
  )
}
