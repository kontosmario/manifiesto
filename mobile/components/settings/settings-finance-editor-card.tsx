import { useMemo, useState } from 'react'
import { SettingsFinanceCard } from '@/components/settings/settings-sections'
import {
  buildFamilyFinanceInput,
  deriveSavingsGoalAmount,
  type FamilyFinanceInputSnapshot,
} from '@/features/finance/family-finance.model'
import {
  buildFinanceDraftState,
  buildFinanceFieldValues,
  buildFinanceSubmitState,
  sanitizeDayInput,
  sanitizeMoneyInput,
  sanitizePercentageInput,
  type BufferMode,
} from '@/features/settings/settings-form.model'
import { currencyFormatter, parsePrice } from '@/utils/money'

interface SettingsFinanceEditorCardProps {
  initialSnapshot: FamilyFinanceInputSnapshot
  isSaving: boolean
  onSave: (input: ReturnType<typeof buildFamilyFinanceInput>) => void
}

export function SettingsFinanceEditorCard({
  initialSnapshot,
  isSaving,
  onSave,
}: SettingsFinanceEditorCardProps) {
  const initialDrafts = useMemo(
    () => buildFinanceDraftState(initialSnapshot),
    [initialSnapshot],
  )
  const [bufferDraft, setBufferDraft] = useState(initialDrafts.bufferDraft)
  const [bufferModeDraft, setBufferModeDraft] = useState<BufferMode>(initialDrafts.bufferModeDraft)
  const [checkinHourDraft, setCheckinHourDraft] = useState(initialDrafts.checkinHourDraft)
  const [incomeDraft, setIncomeDraft] = useState(initialDrafts.incomeDraft)
  const [nudgesEnabledDraft, setNudgesEnabledDraft] = useState(initialDrafts.nudgesEnabledDraft)
  const [salaryDayDraft, setSalaryDayDraft] = useState(initialDrafts.salaryDayDraft)
  const [savingsDraft, setSavingsDraft] = useState(initialDrafts.savingsDraft)
  const [usdRateDraft, setUsdRateDraft] = useState(initialDrafts.usdRateDraft)
  const [incomeFocused, setIncomeFocused] = useState(false)
  const [savingsFocused, setSavingsFocused] = useState(false)
  const [usdRateFocused, setUsdRateFocused] = useState(false)
  const [bufferFocused, setBufferFocused] = useState(false)

  const submitState = useMemo(
    () =>
      buildFinanceSubmitState({
        drafts: {
          bufferDraft,
          bufferModeDraft,
          checkinHourDraft,
          incomeDraft,
          nudgesEnabledDraft,
          salaryDayDraft,
          savingsDraft,
          usdRateDraft,
        },
        essentialMonthlyCost: initialSnapshot.essentialMonthlyCost,
        lastSalaryConfirmedAt: initialSnapshot.lastSalaryConfirmedAt,
      }),
    [
      bufferDraft,
      bufferModeDraft,
      checkinHourDraft,
      incomeDraft,
      initialSnapshot.essentialMonthlyCost,
      initialSnapshot.lastSalaryConfirmedAt,
      nudgesEnabledDraft,
      salaryDayDraft,
      savingsDraft,
      usdRateDraft,
    ],
  )

  const financeFieldValues = useMemo(
    () =>
      buildFinanceFieldValues({
        bufferDraft,
        bufferFocused,
        bufferModeDraft,
        incomeDraft,
        incomeFocused,
        savingsDraft,
        savingsFocused,
        usdRateDraft,
        usdRateFocused,
      }),
    [
      bufferDraft,
      bufferFocused,
      bufferModeDraft,
      incomeDraft,
      incomeFocused,
      savingsDraft,
      savingsFocused,
      usdRateDraft,
      usdRateFocused,
    ],
  )
  const savingsHelper = useMemo(() => {
    const income = parsePrice(incomeDraft)
    const savingsPercent = Number(savingsDraft)
    const targetAmount = deriveSavingsGoalAmount(income, savingsPercent)

    return `Equivale a ${currencyFormatter.format(targetAmount)} por mes.`
  }, [incomeDraft, savingsDraft])

  return (
    <SettingsFinanceCard
      bufferDraft={financeFieldValues.buffer}
      bufferModeDraft={bufferModeDraft}
      canSaveFinance={submitState.canSaveFinance}
      checkinHourDraft={checkinHourDraft}
      incomeValue={financeFieldValues.income}
      isSaving={isSaving}
      nudgesEnabledDraft={nudgesEnabledDraft}
      onBufferBlur={() => setBufferFocused(false)}
      onBufferChange={(value) => setBufferDraft(sanitizeMoneyInput(value))}
      onBufferFocus={() => setBufferFocused(true)}
      onBufferModeChange={setBufferModeDraft}
      onCheckinHourChange={(value) => setCheckinHourDraft(sanitizeDayInput(value))}
      onIncomeBlur={() => setIncomeFocused(false)}
      onIncomeChange={(value) => setIncomeDraft(sanitizeMoneyInput(value))}
      onIncomeFocus={() => setIncomeFocused(true)}
      onNudgesToggle={setNudgesEnabledDraft}
      onSalaryDayChange={(value) => setSalaryDayDraft(sanitizeDayInput(value))}
      onSave={() => {
        if (submitState.input) {
          onSave(submitState.input)
        }
      }}
      onSavingsBlur={() => setSavingsFocused(false)}
      onSavingsChange={(value) => setSavingsDraft(sanitizePercentageInput(value))}
      onSavingsFocus={() => setSavingsFocused(true)}
      onUsdRateBlur={() => setUsdRateFocused(false)}
      onUsdRateChange={(value) => setUsdRateDraft(sanitizeMoneyInput(value))}
      onUsdRateFocus={() => setUsdRateFocused(true)}
      salaryDayDraft={salaryDayDraft}
      savingsHelper={savingsHelper}
      savingsValue={financeFieldValues.savings}
      usdRateValue={financeFieldValues.usdRate}
    />
  )
}
