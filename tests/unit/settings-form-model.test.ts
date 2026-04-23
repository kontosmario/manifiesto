import { describe, expect, it } from 'vitest'
import {
  buildFinanceDraftState,
  buildFinanceFieldValues,
  buildFinanceSubmitState,
  canSaveProfileDraft,
  sanitizeDayInput,
  sanitizeMoneyInput,
} from '@/features/settings/settings-form.model'

describe('settings-form.model', () => {
  it('detecta si el perfil tiene cambios guardables', () => {
    expect(canSaveProfileDraft({ displayName: 'Mario', draft: 'Mario' })).toBe(false)
    expect(canSaveProfileDraft({ displayName: 'Mario', draft: 'Mario A.' })).toBe(true)
    expect(canSaveProfileDraft({ displayName: 'Mario', draft: '   ' })).toBe(false)
  })

  it('arma drafts financieros y valores de campo visibles', () => {
    const drafts = buildFinanceDraftState({
      dailyBudgetBufferMode: 'fixed',
      dailyBudgetBufferValue: 12000,
      dailyBudgetCheckinHour: 9,
      dailyBudgetNudgesEnabled: true,
      essentialMonthlyCost: 180000,
      lastSalaryConfirmedAt: null,
      monthlyIncome: 350000,
      salaryPaymentDay: 5,
      savingsGoal: 70000,
      savingsGoalPercent: 20,
      usdExchangeRate: 1200,
    })

    const values = buildFinanceFieldValues({
      bufferDraft: drafts.bufferDraft,
      bufferFocused: false,
      bufferModeDraft: drafts.bufferModeDraft,
      incomeDraft: drafts.incomeDraft,
      incomeFocused: false,
      savingsDraft: drafts.savingsDraft,
      savingsFocused: false,
      usdRateDraft: drafts.usdRateDraft,
      usdRateFocused: false,
    })

    expect(drafts.incomeDraft).toBe('350000')
    expect(drafts.savingsDraft).toBe('20')
    expect(values.income).toContain('$')
    expect(values.buffer).toContain('$')
    expect(values.savings).toBe('20')
  })

  it('convierte drafts válidos a input financiero persistible', () => {
    const submitState = buildFinanceSubmitState({
      drafts: {
        bufferDraft: '10',
        bufferModeDraft: 'percent',
        checkinHourDraft: '8',
        incomeDraft: '500000',
        nudgesEnabledDraft: false,
        salaryDayDraft: '12',
        savingsDraft: '15',
        usdRateDraft: '1150',
      },
      essentialMonthlyCost: 250000,
      lastSalaryConfirmedAt: '2026-04-15T12:00:00.000Z',
    })

    expect(submitState.canSaveFinance).toBe(true)
    expect(submitState.input).toEqual({
      dailyBudgetBufferMode: 'percent',
      dailyBudgetBufferValue: 10,
      dailyBudgetCheckinHour: 8,
      dailyBudgetNudgesEnabled: false,
      essentialMonthlyCost: 250000,
      lastSalaryConfirmedAt: '2026-04-15T12:00:00.000Z',
      monthlyIncome: 500000,
      salaryPaymentDay: 12,
      savingsGoal: 75000,
      savingsGoalPercent: 15,
      usdExchangeRate: 1150,
    })
  })

  it('sanea entradas numéricas de settings', () => {
    expect(sanitizeDayInput('1a2b3')).toBe('12')
    expect(sanitizeMoneyInput('$ 12,3a4')).toBe('12,34')
  })
})
