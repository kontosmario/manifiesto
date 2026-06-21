import { useMemo } from 'react'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { buildPayDate } from '@/utils/pay-cycle'
import { DAY_MS } from '@/utils/time'

export interface CobroPendingState {
  /** El cobro de este ciclo ya llegó (today >= payday) pero el user
   *  todavía no lo confirmó. Solo monthly. */
  pending: boolean
  /** Días transcurridos desde el día de cobro. 0 = "Cobrá hoy",
   *  N = "+N días sin cobrar". Solo significativo si `pending`. */
  daysOverdue: number
}

const IDLE: CobroPendingState = { pending: false, daysOverdue: 0 }

/**
 * Fuente única para el chip de "cobro pendiente" que vive en el hero del
 * Home y en el header de las demás secciones. Reusa la condición canónica
 * de `usePayCycle` (`isSalaryPendingConfirmation`) — el freeze de la
 * ventana no importa acá, solo la condición — y deriva los días desde el
 * día de cobro del mes en curso.
 */
export function useCobroPending(familyId?: string): CobroPendingState {
  const { today, salaryPaymentDay, isSalaryPendingConfirmation } =
    usePayCycle(familyId)
  return useMemo(() => {
    if (!isSalaryPendingConfirmation) return IDLE
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
  }, [today, salaryPaymentDay, isSalaryPendingConfirmation])
}
