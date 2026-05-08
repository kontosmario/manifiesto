import { describe, expect, it, vi } from 'vitest'
import {
  applyHouseholdSavingsPreset,
  buildHouseholdSavingsPresets,
  buildHouseholdSetupSubmitState,
  resolveEmergencyFundTarget,
} from '@/features/settings/household-setup-wizard.model'

describe('household-setup-wizard.model', () => {
  it('deriva presets de ahorro usando ingreso y benchmark de tres meses', () => {
    const presets = buildHouseholdSavingsPresets({
      monthlyIncome: 1000000,
    })

    expect(presets.map((preset) => preset.id)).toEqual(['steady', 'balanced', 'resilient'])
    expect(presets[0].monthlyGoal).toBe(200000)
    expect(presets[1].monthlyGoal).toBe(250000)
    expect(presets[2].monthlyGoal).toBe(300000)
    expect(presets[0].savingsPercent).toBe(20)
    expect(presets[2].flexiblePercent).toBe(20)
    expect(presets[2].suggestedBufferMode).toBe('percent')
    expect(resolveEmergencyFundTarget({ monthlyIncome: 1000000 })).toBe(1500000)
  })

  it('aplica un preset sobre los drafts del wizard', () => {
    const preset = buildHouseholdSavingsPresets({
      monthlyIncome: 1000000,
    })[1]

    const nextDrafts = applyHouseholdSavingsPreset({
      drafts: {
        bufferDraft: '0',
        bufferModeDraft: 'none',
        checkinHourDraft: '9',
        currentIncomeConfirmed: false,
        incomeDraft: '1000000',
        nudgesEnabledDraft: true,
        salaryDayDraft: '5',
        savingsDraft: '0',
        selectedPresetId: 'custom',
        usdRateDraft: '1200',
      },
      preset,
    })

    expect(nextDrafts.savingsDraft).toBe('25')
    expect(nextDrafts.bufferModeDraft).toBe('percent')
    expect(nextDrafts.selectedPresetId).toBe('balanced')
  })

  it('resuelve el submit stamp de cobro cuando el wizard confirma ingreso actual', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T12:00:00.000Z'))

    const submitState = buildHouseholdSetupSubmitState({
      drafts: {
        bufferDraft: '10',
        bufferModeDraft: 'percent',
        checkinHourDraft: '8',
        currentIncomeConfirmed: true,
        incomeDraft: '500000',
        nudgesEnabledDraft: true,
        salaryDayDraft: '10',
        savingsDraft: '15',
        selectedPresetId: 'balanced',
        usdRateDraft: '1150',
      },
      initialSnapshot: {
        dailyBudgetBufferMode: 'none',
        dailyBudgetBufferValue: 0,
        dailyBudgetCheckinHour: 9,
        dailyBudgetNudgesEnabled: true,
        lastSalaryConfirmedAt: null,
        monthlyIncome: 0,
        salaryPaymentDay: 1,
        savingsGoal: 0,
        savingsGoalPercent: 20,
        usdExchangeRate: 1000,
      },
    })

    expect(submitState.canSaveFinance).toBe(true)
    expect(submitState.input?.lastSalaryConfirmedAt).toBe('2026-04-21T12:00:00.000Z')

    vi.useRealTimers()
  })
})
