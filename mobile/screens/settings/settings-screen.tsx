import { useCallback, useMemo } from 'react'
import { Alert, StyleSheet, View, useWindowDimensions } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { logoutSession } from '@/features/auth/logout'
import { SettingsAccountCard } from '@/components/settings/settings-account-card'
import { SettingsAppearanceCard } from '@/components/settings/settings-appearance-card'
import { SettingsFinanceEditorCard } from '@/components/settings/settings-finance-editor-card'
import { SettingsProfileCard } from '@/components/settings/settings-profile-card'
import {
  SettingsFamilyCard,
  SettingsHeroSummary,
} from '@/components/settings/settings-sections'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import {
  buildFamilyFinanceInput,
  type FamilyFinanceInputSnapshot,
} from '@/features/finance/family-finance.model'
import { isHouseholdSetupPending } from '@/features/settings/household-setup-wizard.model'
import {
  useEnablePushNotifications,
  supportsRemotePushNotifications,
  useHasPushSubscription,
} from '@/features/push/use-push-notifications'
import { useMyProfile, useUpdateDisplayName } from '@/features/profile/use-profile'
import { useLeaveCurrentFamily } from '@/features/family/use-family-actions'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface SettingsScreenProps {
  userId: string
  familyId: string
  familyCode: string
}

export function SettingsScreen({ userId, familyId, familyCode }: SettingsScreenProps) {
  const router = useRouter()
  const { preference, setPreference, theme } = useAppTheme()
  const { width } = useWindowDimensions()
  const isCompactWidth = width < 410
  const { data: session } = useAuthSession()
  const profileQuery = useMyProfile(userId)
  const displayName = profileQuery.data?.display_name ?? ''
  const dashboard = useFamilyDashboard(familyId)

  const updateDisplayNameMutation = useUpdateDisplayName(userId)
  const leaveFamilyMutation = useLeaveCurrentFamily(userId)
  const enablePushMutation = useEnablePushNotifications()
  const hasPushSubscriptionQuery = useHasPushSubscription(familyId, userId)
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId)
  const financeSnapshot = useMemo<FamilyFinanceInputSnapshot>(
    () => ({
      dailyBudgetBufferMode: dashboard.dailyBudgetBufferMode,
      dailyBudgetBufferValue: dashboard.dailyBudgetBufferValue,
      dailyBudgetCheckinHour: dashboard.dailyBudgetCheckinHour,
      dailyBudgetNudgesEnabled: dashboard.dailyBudgetNudgesEnabled,
      essentialMonthlyCost:
        dashboard.familyFinanceQuery.data?.essential_monthly_cost ?? 0,
      lastSalaryConfirmedAt: dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null,
      monthlyIncome: dashboard.monthlyIncome,
      salaryPaymentDay: dashboard.salaryPaymentDay,
      savingsGoal: dashboard.savingsGoal,
      savingsGoalPercent:
        dashboard.familyFinanceQuery.data?.savings_goal_percent ?? 20,
      usdExchangeRate: dashboard.usdExchangeRate,
    }),
    [
      dashboard.dailyBudgetBufferMode,
      dashboard.dailyBudgetBufferValue,
      dashboard.dailyBudgetCheckinHour,
      dashboard.dailyBudgetNudgesEnabled,
      dashboard.familyFinanceQuery.data?.essential_monthly_cost,
      dashboard.familyFinanceQuery.data?.last_salary_confirmed_at,
      dashboard.monthlyIncome,
      dashboard.salaryPaymentDay,
      dashboard.savingsGoal,
      dashboard.familyFinanceQuery.data?.savings_goal_percent,
      dashboard.usdExchangeRate,
    ],
  )
  const profileSectionKey = `${userId}:${displayName}`
  const financeSectionKey = JSON.stringify(financeSnapshot)
  const householdSetupStatus = isHouseholdSetupPending(financeSnapshot)
    ? 'Completar'
    : 'Revisar'
  const supportsPushActivation = supportsRemotePushNotifications
  const shouldShowErrorState = Boolean(
    (profileQuery.error && !profileQuery.data) ||
      (dashboard.familyFinanceQuery.error && !dashboard.familyFinanceQuery.data) ||
      (dashboard.fixedExpensesQuery.error && !dashboard.fixedExpensesQuery.data) ||
      (dashboard.expensesQuery.error && !dashboard.expensesQuery.data) ||
      (supportsPushActivation && hasPushSubscriptionQuery.error && hasPushSubscriptionQuery.data === undefined),
  )
  const settingsLoadError =
    profileQuery.error ??
    dashboard.dashboardError ??
    (supportsPushActivation ? hasPushSubscriptionQuery.error : null)

  const showError = useCallback(async (error: unknown, fallbackMessage: string) => {
    await triggerHaptic('error')
    Alert.alert('Algo salió mal', getErrorMessage(error, fallbackMessage))
  }, [])

  const saveProfile = useCallback(
    (nextDisplayName: string) => {
      updateDisplayNameMutation.mutate(nextDisplayName, {
        onSuccess: () => {
          void triggerHaptic('success')
        },
        onError: (error: unknown) => {
          void showError(error, 'No se pudo actualizar el nombre.')
        },
      })
    },
    [showError, updateDisplayNameMutation],
  )

  const saveFinance = useCallback(
    (input: ReturnType<typeof buildFamilyFinanceInput>) => {
      upsertFamilyFinanceMutation.mutate(input, {
        onSuccess: () => {
          void triggerHaptic('success')
        },
        onError: (error: unknown) => {
          void showError(error, 'No se pudieron guardar las métricas financieras.')
        },
      })
    },
    [showError, upsertFamilyFinanceMutation],
  )

  const handlePushActivation = useCallback(() => {
    if (!supportsRemotePushNotifications) {
      Alert.alert(
        'Requiere development build',
        'Expo Go ya no soporta notificaciones push remotas desde SDK 53. Abrí la app en un development build para activarlas.',
      )
      return
    }

    enablePushMutation.mutate(
      {
        familyId,
        userId,
      },
      {
        onSuccess: () => {
          void triggerHaptic('success')
          void hasPushSubscriptionQuery.refetch()
        },
        onError: (error: unknown) => {
          void showError(error, 'No se pudo activar push.')
        },
      },
    )
  }, [enablePushMutation, familyId, hasPushSubscriptionQuery, showError, userId])

  return (
    <Screen
      canGoBack
      contentContainerStyle={styles.screenContent}
      subtitle="Preferencias del hogar, visuales y configuración base con una estructura más parecida a Ajustes en iPhone."
      title="Ajustes"
    >
      <View style={styles.sectionStack}>
        {!theme.isDark ? <AmbientBackdrop variant="home" /> : null}

        {shouldShowErrorState ? (
          <ErrorState
            description={getErrorMessage(
              settingsLoadError,
              'No pudimos cargar ajustes, métricas y preferencias del hogar.',
            )}
            title="No pudimos abrir ajustes"
            onAction={() => {
              void Promise.all([
                profileQuery.refetch(),
                dashboard.refetchAll(),
                supportsPushActivation ? hasPushSubscriptionQuery.refetch() : Promise.resolve(),
              ])
            }}
          />
        ) : (
          <>
            <SettingsHeroSummary
              displayName={displayName}
              familyCode={familyCode}
              income={dashboard.monthlyIncome}
              isCompactWidth={isCompactWidth}
              salaryPaymentDay={dashboard.salaryPaymentDay}
              savingsGoal={dashboard.savingsGoal}
              sessionEmail={session?.user.email ?? 'Sin email disponible'}
            />

            <SettingsProfileCard
              key={profileSectionKey}
              displayName={displayName}
              isSaving={updateDisplayNameMutation.isPending}
              onSave={saveProfile}
            />

            <SettingsAppearanceCard onChange={setPreference} preference={preference} />

            <SettingsFinanceEditorCard
              key={financeSectionKey}
              initialSnapshot={financeSnapshot}
              isSaving={upsertFamilyFinanceMutation.isPending}
              onSave={saveFinance}
            />

            <SettingsFamilyCard
              familyCode={familyCode}
              hasPushSubscription={Boolean(hasPushSubscriptionQuery.data)}
              householdSetupStatus={householdSetupStatus}
              isPushLoading={enablePushMutation.isPending}
              onCopyFamilyCode={async () => {
                await Clipboard.setStringAsync(familyCode)
                await triggerHaptic('success')
              }}
              onOpenControl={() => router.push('/(app)/(tabs)/insights')}
              onOpenFilamentSpike={() => router.push('/(auth)/filament-spike')}
              onOpenHouseholdSetup={() => router.push('/(app)/household-setup')}
              onPushActivation={handlePushActivation}
              supportsPushActivation={supportsPushActivation}
            />

            <SettingsAccountCard
              email={session?.user.email ?? 'Sin email disponible'}
              isLeavingFamily={leaveFamilyMutation.isPending}
              onConfirmLeaveFamily={() => {
                leaveFamilyMutation.mutate(undefined, {
                  onError: (error: unknown) => {
                    void showError(error, 'No se pudo desvincular la cuenta del grupo.')
                  },
                  onSuccess: () => {
                    void triggerHaptic('success')
                    router.replace('/(auth)/join')
                  },
                })
              }}
              onConfirmLogout={() => {
                void logoutSession({
                  onError: (error) => {
                    void showError(error, 'No se pudo cerrar sesión.')
                  },
                  onSuccess: () => router.replace('/'),
                })
              }}
            />
          </>
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  sectionStack: {
    gap: 18,
    position: 'relative',
  },
})
