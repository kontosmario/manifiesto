import { ExpensesHistoryScreen } from '@/screens/home/expenses-history-screen'

interface ExpensesScreenProps {
  familyId: string
}

export function ExpensesScreen({ familyId }: ExpensesScreenProps) {
  return (
    <ExpensesHistoryScreen
      familyId={familyId}
      subtitle="Historial, filtros y edición rápida de movimientos."
      title="Gastos"
    />
  )
}
