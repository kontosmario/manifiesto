import i18n from '@/lib/i18n'

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

/**
 * True when a contribution pushed the goal from below its target to met/over
 * — the single 0→1 completion crossing. Used to celebrate ONCE, not on every
 * further contribution to an already-complete goal.
 */
export function contributionCompletedGoal(
  previousAmount: number,
  goal: Pick<SavingsGoal, 'currentAmount' | 'goalAmount'>,
): boolean {
  return (
    goal.goalAmount > 0 &&
    previousAmount < goal.goalAmount &&
    goal.currentAmount >= goal.goalAmount
  )
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
  if (!title) throw new Error(i18n.t('settings:savingsGoalValidation.titleRequired'))
  if (title.length > 40) throw new Error(i18n.t('settings:savingsGoalValidation.titleTooLong'))
  const emoji = input.emoji.trim() || 'metas/objetivo'
  if (!Number.isFinite(input.goalAmount) || input.goalAmount <= 0) {
    throw new Error(i18n.t('settings:savingsGoalValidation.goalAmountPositive'))
  }
  if (!Number.isFinite(input.currentAmount) || input.currentAmount < 0) {
    throw new Error(i18n.t('settings:savingsGoalValidation.currentAmountNonNegative'))
  }
  if (input.targetMonths != null && (!Number.isInteger(input.targetMonths) || input.targetMonths <= 0)) {
    throw new Error(i18n.t('settings:savingsGoalValidation.monthsPositiveInteger'))
  }
  return { title, emoji, goalAmount: input.goalAmount, currentAmount: input.currentAmount, targetMonths: input.targetMonths, isActive: input.isActive }
}
