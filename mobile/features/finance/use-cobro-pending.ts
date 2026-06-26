import { useMemo } from 'react'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { buildPayDate } from '@/utils/pay-cycle'
import { DAY_MS } from '@/utils/time'

export interface CobroPendingState {
  /** El cobro de este ciclo ya llegó (today >= payday) pero el user
   *  todavía no lo confirmó. Solo monthly. */
  pending: boolean
  /** Días transcurridos desde el día de cobro. 0 = "Cobra hoy",
   *  N = "+N días sin cobrar". Solo significativo si `pending`. */
  daysOverdue: number
}

const IDLE: CobroPendingState = { pending: false, daysOverdue: 0 }

/**
 * Fuente única para el chip de "cobro pendiente" que vive en el hero del
 * Home y en el header de las demás secciones. Reusa la condición canónica
 * de `usePayCycle` (`isSalaryPendingConfirmation`) — el freeze de la
 * ventana no importa aquí, solo la condición — y deriva los días desde el
 * día de cobro del mes en curso.
 */
export function useCobroPending(familyId?: string): CobroPendingState {
  const finance = useFamilyFinance(familyId)
  const { today, salaryPaymentDay, isSalaryPendingConfirmation } =
    usePayCycle(familyId)
  return useMemo(() => {
    // Gate en finance.data REAL. Sin finance cargado,
    // financeToCycleConfig cae al default (día de pago = 1) y la
    // condición de "pending" da true → el chip mostraría "+20 días sin
    // cobrar" basura (hoy 21 − día 1) hasta que cargue. Con el gate, el
    // chip no aparece hasta tener el día de cobro real → consistente en
    // todas las secciones (era el bug de Gastos mostrando +20).
    if (!finance.data || !isSalaryPendingConfirmation) return IDLE
    const payDate = buildPayDate(
      today.getFullYear(),
      today.getMonth(),
      salaryPaymentDay,
    )
    const daysOverdue = Math.max(
      0,
      Math.floor((today.getTime() - payDate.getTime()) / DAY_MS),
    )
    return { pending: true, daysOverdue }
  }, [finance.data, today, salaryPaymentDay, isSalaryPendingConfirmation])
}
