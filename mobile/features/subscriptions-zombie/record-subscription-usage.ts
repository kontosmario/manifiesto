import { supabase } from '@/lib/supabase'
import type { UsageLevel } from './types'

// Repo fire-and-forget para el dispatcher del asistente (que NO es un
// componente y no puede usar useMutation). Espeja el patrón de los demás
// coordinators del dispatcher: funciones async sueltas que lanzan el RPC.

/** Fecha local YYYY-MM-DD para el `period` del check-in (append-only por día). */
export function todayCheckinPeriod(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function recordSubscriptionUsage(input: {
  fixedExpenseId: string
  level: UsageLevel
  period: string
}): Promise<void> {
  const { error } = await supabase.rpc('record_subscription_usage', {
    p_fixed_expense_id: input.fixedExpenseId,
    p_level: input.level,
    p_period: input.period,
  })
  if (error) throw error
}

export async function declareSubscriptionCancelIntent(
  fixedExpenseId: string,
): Promise<void> {
  const { error } = await supabase.rpc('declare_subscription_intent', {
    p_fixed_expense_id: fixedExpenseId,
    p_intent: 'cancel',
    p_notes: null,
  })
  if (error) throw error
}
