import { describe, it, expect } from 'vitest'
import {
  validateSavingsGoalInput,
  mapSavingsGoalRow,
  type SavingsGoalRow,
} from '@/features/savings-goals/savings-goal.model'

describe('savings goal model', () => {
  it('maps a supabase row to a SavingsGoal', () => {
    const row: SavingsGoalRow = {
      id: 'g-1',
      family_id: 'f-1',
      title: 'Viaje',
      emoji: '🏔️',
      goal_amount: '3000000',
      current_amount: '1920000',
      target_months: 3,
      is_active: true,
      created_at: '2026-04-20T00:00:00Z',
      updated_at: '2026-04-22T00:00:00Z',
    }
    expect(mapSavingsGoalRow(row)).toEqual({
      id: 'g-1',
      familyId: 'f-1',
      title: 'Viaje',
      emoji: '🏔️',
      goalAmount: 3000000,
      currentAmount: 1920000,
      targetMonths: 3,
      isActive: true,
      createdAt: '2026-04-20T00:00:00Z',
      updatedAt: '2026-04-22T00:00:00Z',
    })
  })

  it('validates required fields', () => {
    expect(() => validateSavingsGoalInput({ title: '', emoji: '🎯', goalAmount: 1, currentAmount: 0, targetMonths: null, isActive: true }))
      .toThrow(/título|title/i)
    expect(() => validateSavingsGoalInput({ title: 'X', emoji: '🎯', goalAmount: 0, currentAmount: 0, targetMonths: null, isActive: true }))
      .toThrow(/monto objetivo|goal/i)
    expect(() => validateSavingsGoalInput({ title: 'X', emoji: '🎯', goalAmount: 100, currentAmount: -1, targetMonths: null, isActive: true }))
      .toThrow(/monto actual|current/i)
  })

  it('accepts a valid input', () => {
    const v = validateSavingsGoalInput({ title: 'Bariloche', emoji: '🏔️', goalAmount: 3000000, currentAmount: 1920000, targetMonths: 3, isActive: true })
    expect(v).toEqual({ title: 'Bariloche', emoji: '🏔️', goalAmount: 3000000, currentAmount: 1920000, targetMonths: 3, isActive: true })
  })
})
