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

export async function fetchSavingsGoalById(id: string): Promise<SavingsGoal | null> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('*')
    .eq('id', id)
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

export async function deactivateOtherGoals(familyId: string, keepId: string): Promise<void> {
  const { error } = await supabase
    .from('savings_goals')
    .update({ is_active: false })
    .eq('family_id', familyId)
    .neq('id', keepId)
    .eq('is_active', true)
  if (error) throw error
}
