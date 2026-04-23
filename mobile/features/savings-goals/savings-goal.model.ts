export interface SavingsGoalRow {
  id: string
  family_id: string
  title: string
  emoji: string
  goal_amount: string | number
  current_amount: string | number
  target_months: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SavingsGoal {
  id: string
  familyId: string
  title: string
  emoji: string
  goalAmount: number
  currentAmount: number
  targetMonths: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface SavingsGoalInput {
  title: string
  emoji: string
  goalAmount: number
  currentAmount: number
  targetMonths: number | null
  isActive: boolean
}

export function mapSavingsGoalRow(row: SavingsGoalRow): SavingsGoal {
  return {
    id: row.id,
    familyId: row.family_id,
    title: row.title,
    emoji: row.emoji,
    goalAmount: Number(row.goal_amount),
    currentAmount: Number(row.current_amount),
    targetMonths: row.target_months,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function validateSavingsGoalInput(input: SavingsGoalInput): SavingsGoalInput {
  const title = input.title.trim()
  if (!title) throw new Error('El título de la meta es obligatorio')
  if (title.length > 40) throw new Error('El título no puede superar 40 caracteres')
  const emoji = input.emoji.trim() || '🎯'
  if (!Number.isFinite(input.goalAmount) || input.goalAmount <= 0) {
    throw new Error('El monto objetivo debe ser mayor a cero')
  }
  if (!Number.isFinite(input.currentAmount) || input.currentAmount < 0) {
    throw new Error('El monto actual no puede ser negativo')
  }
  if (input.targetMonths != null && (!Number.isInteger(input.targetMonths) || input.targetMonths <= 0)) {
    throw new Error('Los meses objetivo deben ser un entero positivo')
  }
  return { title, emoji, goalAmount: input.goalAmount, currentAmount: input.currentAmount, targetMonths: input.targetMonths, isActive: input.isActive }
}
