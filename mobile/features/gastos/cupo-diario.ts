// Cupo diario canónico — la porción "libre" del ingreso por día del ciclo.
//
// CRÍTICO: este valor entra como componente de varios queryKeys (el
// gastos_snapshot del screen, el gastos_calendar_summary del controller, y
// el warm-prefetch del tabs layout). Si cada call-site lo calcula con un
// float sin redondear, el drift sub-peso entre esos sitios (o entre dos
// visitas mientras la cache de gastos se asienta por realtime/mutaciones)
// genera una queryKey NUEVA → cache miss → `snapshot.data` undefined → el
// gate cae al skeleton → swap contenido↔skeleton = el "flicker/salto"
// aleatorio que se veía al navegar a Gastos.
//
// Redondear al peso más cercano elimina ese drift fraccional. El server
// usa el cupo sólo para anclar "moods" del calendario, insensible a
// cambios sub-peso. TODOS los sitios DEBEN computar vía este helper para
// que las keys coincidan siempre.
export interface CupoDiarioInput {
  monthlyIncome: number
  fixedExpensesMonthlyTotal: number
  savingsGoal: number
  cycleDays: number
}

export function computeCupoDiario({
  monthlyIncome,
  fixedExpensesMonthlyTotal,
  savingsGoal,
  cycleDays,
}: CupoDiarioInput): number {
  const libre = Math.max(0, monthlyIncome - fixedExpensesMonthlyTotal - savingsGoal)
  return cycleDays > 0 ? Math.round(libre / cycleDays) : 0
}
