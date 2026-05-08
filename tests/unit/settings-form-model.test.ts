import { describe, expect, it } from 'vitest'
import {
  buildFinanceSubmitState,
  sanitizeMoneyInput,
} from '@/features/settings/settings-form.model'

describe('settings-form.model', () => {
  // TODO(phase-1-cleanup): function/export removed during V1 refactor (commits 55840b8/5f0a98b). Re-implement or delete this test.
  it.skip('detecta si el perfil tiene cambios guardables', () => {})

  // TODO(phase-1-cleanup): buildFinanceFieldValues / buildFinanceDraftState shape removed during V1 refactor.
  it.skip('arma drafts financieros y valores de campo visibles', () => {})

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
      lastSalaryConfirmedAt: '2026-04-15T12:00:00.000Z',
    })

    expect(submitState.canSaveFinance).toBe(true)
    // V1 refactor: buildFamilyFinanceInput now also persists currentCycle{StartingBalance,Anchor}.
    expect(submitState.input).toEqual({
      currentCycleAnchor: null,
      currentCycleStartingBalance: null,
      dailyBudgetBufferMode: 'percent',
      dailyBudgetBufferValue: 10,
      dailyBudgetCheckinHour: 8,
      dailyBudgetNudgesEnabled: false,
      lastSalaryConfirmedAt: '2026-04-15T12:00:00.000Z',
      monthlyIncome: 500000,
      salaryPaymentDay: 12,
      savingsGoal: 75000,
      savingsGoalPercent: 15,
      usdExchangeRate: 1150,
    })
  })

  it('sanea entradas numéricas de settings', () => {
    // sanitizeDayInput was removed during V1 refactor.
    expect(sanitizeMoneyInput('$ 12,3a4')).toBe('12,34')
  })
})
