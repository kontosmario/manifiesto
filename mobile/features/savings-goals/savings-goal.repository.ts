import { supabase } from '@/lib/supabase'
import {
  mapSavingsGoalRow,
  validateSavingsGoalInput,
  type SavingsGoal,
  type SavingsGoalInput,
  type SavingsGoalRow,
} from '@/features/savings-goals/savings-goal.model'

export async function fetchActiveSavingsGoal(familyId: string): Promise<SavingsGoal | null> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('*')
    .eq('family_id', familyId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return mapSavingsGoalRow(data as SavingsGoalRow)
}

/**
 * Fetch del último goal de la familia, ACTIVO O INACTIVO. Usado por
 * Settings (necesita ver el goal aunque esté desactivado para que el
 * toggle no parezca borrarlo). Home / Control siguen usando
 * `fetchActiveSavingsGoal` que filtra por is_active=true.
 */
export async function fetchLatestSavingsGoal(familyId: string): Promise<SavingsGoal | null> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('*')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return mapSavingsGoalRow(data as SavingsGoalRow)
}

export async function upsertSavingsGoal(
  familyId: string,
  input: SavingsGoalInput,
  existingId: string | null,
): Promise<SavingsGoal> {
  const payload = validateSavingsGoalInput(input)
  const body = {
    family_id: familyId,
    title: payload.title,
    emoji: payload.emoji,
    goal_amount: payload.goalAmount,
    current_amount: payload.currentAmount,
    target_months: payload.targetMonths,
    is_active: payload.isActive,
  }
  const request = existingId
    ? supabase.from('savings_goals').update(body).eq('id', existingId).select('*').single()
    : supabase.from('savings_goals').insert(body).select('*').single()
  const { data, error } = await request
  if (error) throw error
  return mapSavingsGoalRow(data as SavingsGoalRow)
}

export async function deleteSavingsGoal(goalId: string): Promise<void> {
  const { error } = await supabase
    .from('savings_goals')
    .delete()
    .eq('id', goalId)
  if (error) throw error
}
