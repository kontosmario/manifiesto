// Cycle-balance prompts extracted from `home-dashboard.tsx`.
//
// The two sheet variants (`OnboardingAvailableSheet` and
// `SalaryConfirmationSheet`) are mutually exclusive — the parent
// chooses which to show via `isOnboardingFlow`. Together they're
// ~357 LOC of gesture worklets and animation setup, so we lazy-mount
// only the active variant only while the sheet is open. Pulling them
// out of HomeDashboard also keeps the dashboard file focused on its
// own concern (data layout) instead of nested modal logic.

import {
  OnboardingAvailableSheet,
  SalaryConfirmationSheet,
} from '@/components/home/cycle-balance-prompt-sheet'

interface HomeDashboardSheetsProps {
  /** Whether the prompt is currently open. Drives lazy mount. */
  isOpen: boolean
  /** Onboarding (one-shot, post-signup) vs salary-confirmation
   *  (recurring, post-payday). The parent decides based on whether
   *  the user has ever resolved a cycle anchor before. */
  isOnboardingFlow: boolean
  monthlyIncome: number
  remainingDaysInCycle: number
  isSaving: boolean
  errorMessage: string | null
  onClose: () => void
  onSaveBalance: (amount: number) => void
  onKeepDefault: () => void
}

export function HomeDashboardSheets({
  isOpen,
  isOnboardingFlow,
  monthlyIncome,
  remainingDaysInCycle,
  isSaving,
  errorMessage,
  onClose,
  onSaveBalance,
  onKeepDefault,
}: HomeDashboardSheetsProps) {
  // The sheet is only rendered when open AND when its variant is the
  // active one — the previous "always-mounted, behind visible={false}"
  // pattern wasted ~357 LOC of gesture/animation setup on every Home
  // render. The render gate here matches the render gate in the
  // dashboard so closing one sheet doesn't briefly mount the other.
  if (!isOpen) return null

  if (isOnboardingFlow) {
    return (
      <OnboardingAvailableSheet
        visible={isOpen}
        monthlyIncome={monthlyIncome}
        remainingDaysInCycle={remainingDaysInCycle}
        isSaving={isSaving}
        errorMessage={errorMessage}
        onClose={onClose}
        onSaveBalance={onSaveBalance}
        onKeepDefault={onKeepDefault}
      />
    )
  }

  return (
    <SalaryConfirmationSheet
      visible={isOpen}
      monthlyIncome={monthlyIncome}
      remainingDaysInCycle={remainingDaysInCycle}
      isSaving={isSaving}
      errorMessage={errorMessage}
      onClose={onClose}
      onSaveBalance={onSaveBalance}
      onKeepDefault={onKeepDefault}
    />
  )
}
