import { GastosV2Screen } from '@/screens/home/gastos-v2-screen'

interface ExpensesScreenProps {
  familyId: string
  userId: string
}

/**
 * The Expenses tab now renders the V1 Cuaderno redesign (GastosV2Screen).
 * The legacy ExpensesHistoryScreen is still accessible via the
 * `/expenses-history` route for reference while the redesign lands.
 */
export function ExpensesScreen({ familyId, userId }: ExpensesScreenProps) {
  return <GastosV2Screen familyId={familyId} userId={userId} />
}
