import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { EditAvatarSheet } from '@/components/settings/sheets/edit-avatar-sheet'
import { EditBufferSheet } from '@/components/settings/sheets/edit-buffer-sheet'
import { EditDisplayNameSheet } from '@/components/settings/sheets/edit-display-name-sheet'
import { EditMyContributionSheet } from '@/components/settings/sheets/edit-my-contribution-sheet'
import { EditPaydaySheet } from '@/components/settings/sheets/edit-payday-sheet'
import { EditSavingsPercentSheet } from '@/components/settings/sheets/edit-savings-percent-sheet'
import { EditUsdRateSheet } from '@/components/settings/sheets/edit-usd-rate-sheet'
import { useFamilyMembersDetail } from '@/features/family/use-family-members-detail'
import {
  useUpdateMyIncomeContribution,
} from '@/features/family/use-family-actions'
import {
  buildFamilyFinanceInput,
  type FamilyFinanceInputSnapshot,
} from '@/features/finance/family-finance.model'
import { useUpsertFamilyFinance } from '@/features/finance/use-family-finance'
import {
  closeSettingsModal,
  useActiveSettingsModal,
} from '@/features/insights/settings-modal-coordinator'
import {
  useMyProfile,
  useUpdateAvatarAnimal,
  useUpdateDisplayName,
} from '@/features/profile/use-profile'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { triggerHaptic } from '@/lib/haptics'
import { toast } from '@/lib/toast-bus'
import { getErrorMessage } from '@/utils/error-message'

interface Props {
  familyId: string
  userId: string
}

/**
 * Global host for the Settings sheets so the Asistente Financiero
 * (and any other surface) can open a specific editor without having
 * to navigate through the Settings tab. Mounted once per session at
 * the AppStackShell level; subscribes to
 * `useActiveSettingsModal()` and renders the matching sheet on top
 * of whatever screen is currently on.
 *
 * Each sheet hydrates from the same hooks the Settings screen uses,
 * so opening from here is functionally identical to opening from
 * the Settings list — same defaults, same mutations, same haptics.
 */
export function GlobalSettingsModalsHost({ familyId, userId }: Props) {
  const { t } = useTranslation()
  const active = useActiveSettingsModal()

  // Data hooks (mirror settings-screen.tsx). All cached by React Query
  // so mounting them here doesn't fire extra requests when settings
  // is also open.
  const dashboard = useFamilyDashboard(familyId)
  const profileQuery = useMyProfile(userId)
  const familyMembersDetailQuery = useFamilyMembersDetail(familyId)

  // Mutations.
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId, userId)
  const updateMyContributionMutation = useUpdateMyIncomeContribution(
    userId,
    familyId,
  )
  const updateDisplayNameMutation = useUpdateDisplayName(userId, familyId)
  const updateAvatarMutation = useUpdateAvatarAnimal(userId, familyId)

  const myContribution = useMemo(() => {
    const me = (familyMembersDetailQuery.data ?? []).find(
      (m) => m.userId === userId,
    )
    return me?.monthlyIncomeContribution ?? 0
  }, [familyMembersDetailQuery.data, userId])

  const financeSnapshot = useMemo<FamilyFinanceInputSnapshot>(
    () => ({
      dailyBudgetBufferMode: dashboard.dailyBudgetBufferMode,
      dailyBudgetBufferValue: dashboard.dailyBudgetBufferValue,
      dailyBudgetCheckinHour: dashboard.dailyBudgetCheckinHour,
      dailyBudgetNudgesEnabled: dashboard.dailyBudgetNudgesEnabled,
      lastSalaryConfirmedAt:
        dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null,
      monthlyIncome: dashboard.monthlyIncome,
      salaryPaymentDay: dashboard.salaryPaymentDay,
      savingsGoal: dashboard.savingsGoal,
      savingsGoalPercent:
        dashboard.familyFinanceQuery.data?.savings_goal_percent ?? 20,
      usdExchangeRate: dashboard.usdExchangeRate,
      currentCycleStartingBalance:
        dashboard.familyFinanceQuery.data?.current_cycle_starting_balance ?? null,
      currentCycleAnchor:
        dashboard.familyFinanceQuery.data?.current_cycle_anchor ?? null,
      cycleType: 'monthly',
      cycleAnchorDate: null,
      cycleLengthDays: null,
    }),
    [
      dashboard.dailyBudgetBufferMode,
      dashboard.dailyBudgetBufferValue,
      dashboard.dailyBudgetCheckinHour,
      dashboard.dailyBudgetNudgesEnabled,
      dashboard.familyFinanceQuery.data?.last_salary_confirmed_at,
      dashboard.familyFinanceQuery.data?.savings_goal_percent,
      dashboard.familyFinanceQuery.data?.current_cycle_starting_balance,
      dashboard.familyFinanceQuery.data?.current_cycle_anchor,
      dashboard.monthlyIncome,
      dashboard.salaryPaymentDay,
      dashboard.savingsGoal,
      dashboard.usdExchangeRate,
    ],
  )

  /**
   * Aviso de fallo de guardado. Un solo botón, sin decisión → toast del
   * host global, no un diálogo del SO.
   *
   * El sheet que falló queda ABIERTO (ninguna mutación cierra en
   * `onError`), así que el usuario conserva lo que había cargado y puede
   * reintentar sin volver a tipear.
   */
  const showError = useCallback((error: unknown, fallback: string) => {
    void triggerHaptic('error')
    toast.error(
      `${t('settings:notif.saveErrorTitle')} · ${getErrorMessage(error, fallback)}`,
    )
  }, [t])

  const saveFinanceSnapshot = useCallback(
    (next: FamilyFinanceInputSnapshot, onDone: () => void) => {
      upsertFamilyFinanceMutation.mutate(buildFamilyFinanceInput(next), {
        onSuccess: () => {
          void triggerHaptic('success')
          onDone()
        },
        onError: (error: unknown) => {
          showError(error, t('settings:errors.saveHouseholdMetrics'))
        },
      })
    },
    [showError, upsertFamilyFinanceMutation, t],
  )

  const handleSaveMyContribution = useCallback(
    (value: number) => {
      updateMyContributionMutation.mutate(value, {
        onSuccess: () => {
          void triggerHaptic('success')
          closeSettingsModal()
        },
        onError: (error: unknown) => showError(error, t('settings:errors.updateContribution')),
      })
    },
    [showError, updateMyContributionMutation, t],
  )

  const handleSavePayday = useCallback(
    (value: number) => {
      saveFinanceSnapshot(
        { ...financeSnapshot, salaryPaymentDay: value },
        closeSettingsModal,
      )
    },
    [financeSnapshot, saveFinanceSnapshot],
  )

  const handleSaveUsd = useCallback(
    (value: number) => {
      saveFinanceSnapshot(
        { ...financeSnapshot, usdExchangeRate: value },
        closeSettingsModal,
      )
    },
    [financeSnapshot, saveFinanceSnapshot],
  )

  const handleSaveSavingsPercent = useCallback(
    (value: number) => {
      saveFinanceSnapshot(
        { ...financeSnapshot, savingsGoalPercent: value },
        closeSettingsModal,
      )
    },
    [financeSnapshot, saveFinanceSnapshot],
  )

  const handleSaveBuffer = useCallback(
    (mode: 'none' | 'fixed' | 'percent', value: number) => {
      saveFinanceSnapshot(
        {
          ...financeSnapshot,
          dailyBudgetBufferMode: mode,
          dailyBudgetBufferValue: value,
        },
        closeSettingsModal,
      )
    },
    [financeSnapshot, saveFinanceSnapshot],
  )

  const handleSaveDisplayName = useCallback(
    (next: string) => {
      updateDisplayNameMutation.mutate(next, {
        onSuccess: () => {
          void triggerHaptic('success')
          closeSettingsModal()
        },
        onError: (error: unknown) => showError(error, t('settings:errors.updateNameAlt')),
      })
    },
    [showError, updateDisplayNameMutation, t],
  )

  const handleSaveAvatar = useCallback(
    (slug: string) => {
      updateAvatarMutation.mutate(slug, {
        onSuccess: () => {
          void triggerHaptic('success')
          closeSettingsModal()
        },
        onError: (error: unknown) => showError(error, t('settings:errors.updateAvatar')),
      })
    },
    [showError, updateAvatarMutation, t],
  )

  return (
    <>
      <EditMyContributionSheet
        currentValue={myContribution}
        householdTotal={financeSnapshot.monthlyIncome}
        isSaving={updateMyContributionMutation.isPending}
        onClose={closeSettingsModal}
        onSave={handleSaveMyContribution}
        visible={active === 'income'}
      />
      <EditPaydaySheet
        currentValue={financeSnapshot.salaryPaymentDay}
        isSaving={upsertFamilyFinanceMutation.isPending}
        onClose={closeSettingsModal}
        onSave={handleSavePayday}
        visible={active === 'payday'}
      />
      <EditUsdRateSheet
        currentValue={financeSnapshot.usdExchangeRate}
        isSaving={upsertFamilyFinanceMutation.isPending}
        onClose={closeSettingsModal}
        onSave={handleSaveUsd}
        visible={active === 'usd-rate'}
      />
      <EditSavingsPercentSheet
        currentValue={financeSnapshot.savingsGoalPercent}
        isSaving={upsertFamilyFinanceMutation.isPending}
        monthlyIncome={financeSnapshot.monthlyIncome}
        onClose={closeSettingsModal}
        onSave={handleSaveSavingsPercent}
        visible={active === 'savings-percent'}
      />
      <EditBufferSheet
        currentMode={financeSnapshot.dailyBudgetBufferMode}
        currentValue={financeSnapshot.dailyBudgetBufferValue}
        isSaving={upsertFamilyFinanceMutation.isPending}
        onClose={closeSettingsModal}
        onSave={handleSaveBuffer}
        visible={active === 'buffer'}
      />
      <EditDisplayNameSheet
        currentName={profileQuery.data?.display_name ?? ''}
        isSaving={updateDisplayNameMutation.isPending}
        onClose={closeSettingsModal}
        onSave={handleSaveDisplayName}
        visible={active === 'display-name'}
      />
      <EditAvatarSheet
        currentSlug={profileQuery.data?.avatar_animal ?? null}
        isSaving={updateAvatarMutation.isPending}
        onClose={closeSettingsModal}
        onSave={handleSaveAvatar}
        visible={active === 'avatar'}
      />
    </>
  )
}
