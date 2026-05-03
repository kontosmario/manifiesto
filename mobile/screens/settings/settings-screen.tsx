import { useCallback, useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { RiseView } from '@/components/home/animated/rise-view'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/settings-grouped-list'
import { DestroyFamilyConfirmSheet } from '@/components/settings/sheets/destroy-family-confirm-sheet'
import { EditAvatarSheet } from '@/components/settings/sheets/edit-avatar-sheet'
import { EditBufferSheet } from '@/components/settings/sheets/edit-buffer-sheet'
import { EditDisplayNameSheet } from '@/components/settings/sheets/edit-display-name-sheet'
import { EditIncomeSheet } from '@/components/settings/sheets/edit-income-sheet'
import { EditPaydaySheet } from '@/components/settings/sheets/edit-payday-sheet'
import { EditSavingsPercentSheet } from '@/components/settings/sheets/edit-savings-percent-sheet'
import { EditUsdRateSheet } from '@/components/settings/sheets/edit-usd-rate-sheet'
import { MaterialIcons } from '@expo/vector-icons'
import { logoutSession } from '@/features/auth/logout'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  useCreateFamilyInvite,
  useLeaveCurrentFamily,
} from '@/features/family/use-family-actions'
import { useFamilyMemberStats } from '@/features/family/use-family-admin'
import { useMyFamilyRole } from '@/features/family/use-my-family-role'
import {
  buildFamilyFinanceInput,
  type FamilyFinanceInputSnapshot,
} from '@/features/finance/family-finance.model'
import { useUpsertFamilyFinance } from '@/features/finance/use-family-finance'
import {
  useMyProfile,
  useUpdateAvatarAnimal,
  useUpdateDisplayName,
} from '@/features/profile/use-profile'
import {
  useEnablePushNotifications,
  supportsRemotePushNotifications,
  useHasPushSubscription,
} from '@/features/push/use-push-notifications'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import {
  hideAuthTransitionSplash,
  markAuthTransitionLoaded,
  reportAuthTransitionError,
  showAuthTransitionSplash,
} from '@/lib/auth-transition-splash'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { typography } from '@/theme/typography'
import { getErrorMessage } from '@/utils/error-message'
import { currencyFormatter, formatMoneyShort } from '@/utils/money'

interface SettingsScreenProps {
  userId: string
  familyId: string
  // Legacy familyCode prop removed — invites generate ephemeral codes now.
}

const DISABLED_HINT = 'Solo el dueño puede editar'

export function SettingsScreen({ userId, familyId }: SettingsScreenProps) {
  const router = useRouter()
  const { preference, setPreference, theme } = useAppTheme()
  const { data: session } = useAuthSession()
  const profileQuery = useMyProfile(userId)
  const displayName = profileQuery.data?.display_name ?? ''
  const dashboard = useFamilyDashboard(familyId)
  const roleQuery = useMyFamilyRole(userId, familyId)
  const role = roleQuery.data
  const isOwner = role === 'owner'
  const memberStatsQuery = useFamilyMemberStats()
  // Active members = role !== 'blocked'. We use the RPC which gives
  // blocked_at status; fall back to 0 while loading. We only need this
  // count to decide whether the owner sees the informative row in
  // place of "Salir de la familia".
  const otherActiveMembers = useMemo(() => {
    const rows = memberStatsQuery.data ?? []
    return rows.filter(
      (m) => m.userId !== userId && m.role !== 'blocked' && m.blockedAt === null,
    ).length
  }, [memberStatsQuery.data, userId])
  const totalMembers = (memberStatsQuery.data ?? []).length
  const savingsGoalQuery = useSavingsGoal(familyId)

  const updateDisplayNameMutation = useUpdateDisplayName(userId)
  const updateAvatarMutation = useUpdateAvatarAnimal(userId)
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
      lastSalaryConfirmedAt:
        dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null,
      monthlyIncome: dashboard.monthlyIncome,
      salaryPaymentDay: dashboard.salaryPaymentDay,
      savingsGoal: dashboard.savingsGoal,
      savingsGoalPercent: dashboard.familyFinanceQuery.data?.savings_goal_percent ?? 20,
      usdExchangeRate: dashboard.usdExchangeRate,
      currentCycleStartingBalance:
        dashboard.familyFinanceQuery.data?.current_cycle_starting_balance ?? null,
      currentCycleAnchor:
        dashboard.familyFinanceQuery.data?.current_cycle_anchor ?? null,
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

  // ── Sheet visibility state ────────────────────────────────────
  const [nameSheetOpen, setNameSheetOpen] = useState(false)
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false)
  const [incomeSheetOpen, setIncomeSheetOpen] = useState(false)
  const [paydaySheetOpen, setPaydaySheetOpen] = useState(false)
  const [usdSheetOpen, setUsdSheetOpen] = useState(false)
  const [savingsSheetOpen, setSavingsSheetOpen] = useState(false)
  const [bufferSheetOpen, setBufferSheetOpen] = useState(false)
  const [destroyFamilySheetOpen, setDestroyFamilySheetOpen] = useState(false)

  const supportsPushActivation = supportsRemotePushNotifications
  const shouldShowErrorState = Boolean(
    (profileQuery.error && !profileQuery.data) ||
      (dashboard.familyFinanceQuery.error && !dashboard.familyFinanceQuery.data) ||
      (dashboard.fixedExpensesQuery.error && !dashboard.fixedExpensesQuery.data) ||
      (dashboard.expensesQuery.error && !dashboard.expensesQuery.data) ||
      (supportsPushActivation &&
        hasPushSubscriptionQuery.error &&
        hasPushSubscriptionQuery.data === undefined),
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
          setNameSheetOpen(false)
        },
        onError: (error: unknown) => {
          void showError(error, 'No se pudo actualizar el nombre.')
        },
      })
    },
    [showError, updateDisplayNameMutation],
  )

  const saveAvatar = useCallback(
    (slug: string) => {
      updateAvatarMutation.mutate(slug, {
        onSuccess: () => {
          void triggerHaptic('success')
          setAvatarSheetOpen(false)
        },
        onError: (error: unknown) => {
          void showError(error, 'No se pudo actualizar el avatar.')
        },
      })
    },
    [showError, updateAvatarMutation],
  )

  const saveFinanceSnapshot = useCallback(
    (next: FamilyFinanceInputSnapshot, onDone: () => void) => {
      const input = buildFamilyFinanceInput(next)
      upsertFamilyFinanceMutation.mutate(input, {
        onSuccess: () => {
          void triggerHaptic('success')
          onDone()
        },
        onError: (error: unknown) => {
          void showError(error, 'No se pudieron guardar las métricas del hogar.')
        },
      })
    },
    [showError, upsertFamilyFinanceMutation],
  )

  const handleSaveIncome = useCallback(
    (value: number) => {
      saveFinanceSnapshot(
        { ...financeSnapshot, monthlyIncome: value },
        () => setIncomeSheetOpen(false),
      )
    },
    [financeSnapshot, saveFinanceSnapshot],
  )

  const handleSavePayday = useCallback(
    (value: number) => {
      saveFinanceSnapshot(
        { ...financeSnapshot, salaryPaymentDay: value },
        () => setPaydaySheetOpen(false),
      )
    },
    [financeSnapshot, saveFinanceSnapshot],
  )

  const handleSaveUsd = useCallback(
    (value: number) => {
      saveFinanceSnapshot(
        { ...financeSnapshot, usdExchangeRate: value },
        () => setUsdSheetOpen(false),
      )
    },
    [financeSnapshot, saveFinanceSnapshot],
  )

  const handleSaveSavingsPercent = useCallback(
    (value: number) => {
      saveFinanceSnapshot(
        { ...financeSnapshot, savingsGoalPercent: value },
        () => setSavingsSheetOpen(false),
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
        () => setBufferSheetOpen(false),
      )
    },
    [financeSnapshot, saveFinanceSnapshot],
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
      { familyId, userId },
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

  // Single-use family invite codes. Each tap generates a fresh
  // ephemeral code (7-day TTL on the server). The code is shown
  // once via Alert + copied to the clipboard; once the joiner uses
  // it, it's marked consumed and can't be reused. No permanent
  // `families.code` exists anymore — this is the only path to add
  // someone to the household.
  const createInvite = useCreateFamilyInvite()
  const handleGenerateFamilyInvite = useCallback(async () => {
    try {
      const result = await createInvite.mutateAsync()
      await Clipboard.setStringAsync(result.code)
      await triggerHaptic('success')
      Alert.alert(
        'Código de invitación copiado',
        `Compartí "${result.code}" con la persona que querés que se sume.\n\n` +
          'El código sirve para una sola persona y vence en 7 días. ' +
          'Si necesitás invitar a otra persona, generá uno nuevo.',
      )
    } catch (error) {
      void triggerHaptic('error')
      Alert.alert(
        'No pudimos generar el código',
        getErrorMessage(error, 'Reintentá en un momento.'),
      )
    }
  }, [createInvite])

  // Owner-with-members destructive flow lives in a dedicated sheet so
  // we can collect a typed-confirmation phrase. Anyone else (member,
  // or owner-alone) gets a single-tap Alert — there's no shared
  // family data to destroy beyond their own membership.
  const isOwnerDestroyFlow = isOwner && otherActiveMembers > 0

  const runLeaveFamily = useCallback(() => {
    leaveFamilyMutation.mutate(undefined, {
      onError: (error: unknown) => {
        void showError(error, 'No se pudo desvincular la cuenta del grupo.')
      },
      onSuccess: () => {
        void triggerHaptic('success')
        setDestroyFamilySheetOpen(false)
        router.replace('/(app)/onboarding')
      },
    })
  }, [leaveFamilyMutation, router, showError])

  const handleConfirmLeave = useCallback(() => {
    if (isOwnerDestroyFlow) {
      void triggerHaptic('warning')
      setDestroyFamilySheetOpen(true)
      return
    }
    Alert.alert(
      'Salir del hogar',
      'Vas a salir del grupo familiar actual. Tus gastos y configuración compartida quedan con el hogar — sólo se desvincula tu cuenta.',
      [
        { style: 'cancel', text: 'Cancelar' },
        {
          style: 'destructive',
          text: 'Salir',
          onPress: runLeaveFamily,
        },
      ],
    )
  }, [isOwnerDestroyFlow, runLeaveFamily])

  const handleConfirmLogout = useCallback(() => {
    Alert.alert('Cerrar sesión', 'Vas a salir de la app en este dispositivo.', [
      { style: 'cancel', text: 'Cancelar' },
      {
        style: 'destructive',
        text: 'Salir',
        onPress: () => {
          void logoutSession({
            onError: (error) => void showError(error, 'No se pudo cerrar sesión.'),
            onSuccess: () => router.replace('/'),
          })
        },
      },
    ])
  }, [router, showError])

  // Dev-only triggers for the warm post-login splash (mounted as the
  // transition overlay in root-layout-shell). Lets us iterate on
  // animations + error UIs without going through a full
  // logout/login + airplane-mode round-trip.

  // Success preview: opens the splash, simulates a 5s slow request,
  // then marks loaded. The state machine enforces the 3000ms minimum
  // anyway, so even if you bumped this lower, the entrance would
  // still play through.
  const handlePreviewTransitionSplash = useCallback(() => {
    void triggerHaptic('selection')
    showAuthTransitionSplash()
    setTimeout(() => {
      markAuthTransitionLoaded()
    }, 5000)
  }, [])

  // Error preview: opens the splash, simulates a 1.5s request, then
  // reports a network failure so the fallback UI surfaces. Tap the
  // "Reintentar" button on the fallback to dismiss + re-show the
  // animation (in real flow this would also kick the underlying
  // refetch).
  const handlePreviewTransitionError = useCallback(() => {
    void triggerHaptic('warning')
    showAuthTransitionSplash()
    setTimeout(() => {
      reportAuthTransitionError('network')
    }, 1500)
  }, [])

  // Force-hide preview: exposes the legacy `hideAuthTransitionSplash`
  // as a dev escape hatch in case a state gets stuck (shouldn't happen
  // in normal flow, but useful to recover from a misfired test).
  const handleForceHideTransitionSplash = useCallback(() => {
    void triggerHaptic('selection')
    hideAuthTransitionSplash()
  }, [])

  // ── Values shown on rows ──────────────────────────────────────
  const incomeValue =
    financeSnapshot.monthlyIncome > 0
      ? currencyFormatter.format(financeSnapshot.monthlyIncome)
      : 'Definir'
  const usdValue = currencyFormatter.format(financeSnapshot.usdExchangeRate)
  const savingsPercentValue = `${financeSnapshot.savingsGoalPercent}%`
  const bufferValueLabel =
    financeSnapshot.dailyBudgetBufferMode === 'none'
      ? 'Sin colchón'
      : financeSnapshot.dailyBudgetBufferMode === 'percent'
        ? `${financeSnapshot.dailyBudgetBufferValue}% diario`
        : `${currencyFormatter.format(financeSnapshot.dailyBudgetBufferValue)}/día`
  const savingsGoalSubtitle = savingsGoalQuery.data
    ? `${savingsGoalQuery.data.emoji} ${savingsGoalQuery.data.title} · ${formatMoneyShort(savingsGoalQuery.data.currentAmount)} / ${formatMoneyShort(savingsGoalQuery.data.goalAmount)}`
    : 'Sin meta configurada'
  const pushValue = !supportsPushActivation
    ? 'Dev build'
    : hasPushSubscriptionQuery.data
      ? 'Activo'
      : 'Activar'
  const themeValue =
    preference === 'system' ? 'Sistema' : preference === 'light' ? 'Claro' : 'Oscuro'

  return (
    <Screen
      canGoBack
      contentContainerStyle={styles.screenContent}
      subtitle="Preferencias del hogar, tu perfil y la configuración base de la familia."
      title="Ajustes"
    >
      <View style={styles.sectionStack}>
        {!theme.isDark ? <AmbientBackdrop variant="home" /> : null}
        <AmbientBlobs />

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
            {/* HERO */}
            <RiseView>
              <View
                style={[
                  styles.heroCard,
                  {
                    backgroundColor: theme.colors.creamCard,
                    borderColor: theme.colors.line,
                  },
                ]}
              >
                <Text style={[styles.heroEyebrow, { color: theme.colors.textMuted }]}>
                  TU HOGAR
                </Text>
                <Text style={[styles.heroTitle, { color: theme.colors.text }]}>
                  {displayName.trim() || 'Perfil sin nombre'}
                </Text>
                <Text style={[styles.heroSub, { color: theme.colors.textMuted }]}>
                  {totalMembers === 1
                    ? 'Hogar individual'
                    : `Hogar de ${totalMembers} ${totalMembers === 1 ? 'persona' : 'personas'}`}
                </Text>
                {isOwner ? (
                  <View
                    style={[
                      styles.ownerPill,
                      {
                        backgroundColor: theme.colors.primarySurface,
                        borderColor: theme.colors.primary,
                      },
                    ]}
                  >
                    <MaterialIcons
                      color={theme.colors.primaryStrong}
                      name="verified"
                      size={14}
                    />
                    <Text
                      style={[styles.ownerText, { color: theme.colors.primaryStrong }]}
                    >
                      Sos el dueño de la familia
                    </Text>
                  </View>
                ) : role === 'member' ? (
                  <Text style={[styles.memberHint, { color: theme.colors.textSoft }]}>
                    Sos miembro. Solo el dueño puede editar el hogar.
                  </Text>
                ) : null}
              </View>
            </RiseView>

            {/* 1. PERFIL */}
            <RiseView delay={80}>
              <SettingsGroup title="Perfil">
                <SettingsRow
                  icon="person"
                  label="Nombre visible"
                  onPress={() => setNameSheetOpen(true)}
                  value={displayName.trim() || 'Definir'}
                />
                <SettingsRow
                  icon="face"
                  label="Avatar"
                  onPress={() => setAvatarSheetOpen(true)}
                  value={profileQuery.data?.avatar_animal ?? 'Elegir'}
                />
                <SettingsRow
                  icon="mail-outline"
                  isLast
                  label="Email"
                  value={session?.user.email ?? 'Sin email'}
                />
              </SettingsGroup>
            </RiseView>

            {/* 2. HOGAR */}
            <RiseView delay={160}>
              <SettingsGroup
                footer={
                  isOwner
                    ? undefined
                    : 'Estos valores los configura el dueño de la familia.'
                }
                title="Hogar"
              >
                <SettingsRow
                  disabled={!isOwner}
                  disabledHint={DISABLED_HINT}
                  icon="attach-money"
                  label="Ingreso mensual"
                  onPress={() => setIncomeSheetOpen(true)}
                  value={incomeValue}
                />
                <SettingsRow
                  disabled={!isOwner}
                  disabledHint={DISABLED_HINT}
                  icon="event"
                  label="Día de cobro"
                  onPress={() => setPaydaySheetOpen(true)}
                  value={`Día ${financeSnapshot.salaryPaymentDay}`}
                />
                <SettingsRow
                  disabled={!isOwner}
                  disabledHint={DISABLED_HINT}
                  icon="currency-exchange"
                  label="Cotización USD"
                  onPress={() => setUsdSheetOpen(true)}
                  value={usdValue}
                />
                <SettingsRow
                  disabled={!isOwner}
                  disabledHint={DISABLED_HINT}
                  icon="savings"
                  label="Meta de ahorro %"
                  onPress={() => setSavingsSheetOpen(true)}
                  value={savingsPercentValue}
                />
                <SettingsRow
                  disabled={!isOwner}
                  disabledHint={DISABLED_HINT}
                  icon="shield"
                  isLast
                  label="Buffer diario"
                  onPress={() => setBufferSheetOpen(true)}
                  value={bufferValueLabel}
                />
              </SettingsGroup>
            </RiseView>

            {/* 3. META DE AHORRO */}
            <RiseView delay={240}>
              <SettingsGroup title="Metas de ahorro">
                <SettingsRow
                  disabled={!isOwner}
                  disabledHint={DISABLED_HINT}
                  helper={savingsGoalSubtitle}
                  icon="flag"
                  isLast
                  label="Meta activa"
                  onPress={() => router.push('/(app)/savings-goal')}
                />
              </SettingsGroup>
            </RiseView>

            {/* 4. FAMILIA */}
            <RiseView delay={320}>
              <SettingsGroup title="Familia">
                <SettingsRow
                  icon="person-add"
                  label="Invitar a alguien"
                  helper="Genera un código de un solo uso, válido por 7 días."
                  onPress={handleGenerateFamilyInvite}
                />
                {isOwner ? (
                  <SettingsRow
                    icon="group"
                    label="Gestionar miembros"
                    onPress={() => router.push('/settings/family-admin' as never)}
                  />
                ) : null}
                <SettingsRow
                  destructive
                  helper={
                    isOwnerDestroyFlow
                      ? 'Como sos el dueño, salirte cierra el hogar para todos.'
                      : undefined
                  }
                  icon={isOwnerDestroyFlow ? 'delete-forever' : 'logout'}
                  isLast
                  label={isOwnerDestroyFlow ? 'Eliminar el hogar' : 'Salir del hogar'}
                  onPress={handleConfirmLeave}
                />
                {/*
                  Why a single row for both flows: the previous
                  read-only "Tenés miembros en tu hogar" placeholder
                  left owners with no path forward — they had to
                  guess that "Gestionar miembros" → transfer was the
                  only escape. We now show one destructive row whose
                  copy + helper adapts to ownership, and the actual
                  destructive 2-step confirmation lives in the sheet.
                */}
              </SettingsGroup>
            </RiseView>

            {/* 4b. ASISTENTE */}
            <RiseView delay={300}>
              <SettingsGroup title="Asistente">
                <SettingsRow
                  icon="auto-awesome"
                  isLast
                  label="Preferencias del asistente"
                  onPress={() => router.push('/settings/asistente' as never)}
                />
              </SettingsGroup>
            </RiseView>

            {/* 5. NOTIFICACIONES */}
            <RiseView delay={320}>
              <SettingsGroup title="Notificaciones">
                <SettingsRow
                  icon="tune"
                  label="Gestionar notificaciones"
                  onPress={() => router.push('/settings/notifications' as never)}
                />
                <SettingsRow
                  icon="notifications-active"
                  isLast
                  isLoading={supportsPushActivation && enablePushMutation.isPending}
                  label="Habilitar push"
                  onPress={handlePushActivation}
                  value={pushValue}
                />
              </SettingsGroup>
            </RiseView>

            {/* 6. APARIENCIA */}
            <RiseView delay={320}>
              <SettingsGroup footer={`Tema actual: ${themeValue}.`} title="Apariencia">
                <View style={styles.appearanceInner}>
                  <SegmentedControl
                    onChange={setPreference}
                    options={[
                      { label: 'Sistema', value: 'system' },
                      { label: 'Claro', value: 'light' },
                      { label: 'Oscuro', value: 'dark' },
                    ]}
                    value={preference}
                  />
                </View>
              </SettingsGroup>
            </RiseView>

            {/* 7. DESARROLLO — solo en builds de desarrollo. Permite
                disparar animaciones específicas sin tener que repetir
                el flow completo (login/logout, etc). */}
            {__DEV__ ? (
              <RiseView delay={320}>
                <SettingsGroup
                  footer="Solo visibles en desarrollo. Útil para iterar animaciones."
                  title="Desarrollo"
                >
                  <SettingsRow
                    helper="Muestra el splash, simula carga 5s, transiciona a la home cuando la animación termina."
                    icon="auto-awesome"
                    label="Probar splash · success"
                    onPress={handlePreviewTransitionSplash}
                  />
                  <SettingsRow
                    helper="Muestra el splash 1.5s, después dispara el fallback de error de red con botón de reintento."
                    icon="cloud-off"
                    label="Probar splash · error de red"
                    onPress={handlePreviewTransitionError}
                  />
                  <SettingsRow
                    helper="Force-hide para recuperar de un estado pegado."
                    icon="cancel"
                    isLast
                    label="Forzar cierre del splash"
                    onPress={handleForceHideTransitionSplash}
                  />
                </SettingsGroup>
              </RiseView>
            ) : null}

            {/* 8. CUENTA */}
            <RiseView delay={320}>
              <SettingsGroup title="Cuenta">
                <SettingsRow
                  destructive
                  icon="power-settings-new"
                  isLast
                  label="Cerrar sesión"
                  onPress={handleConfirmLogout}
                />
              </SettingsGroup>
            </RiseView>
          </>
        )}
      </View>

      {/* ── Sheets ────────────────────────────────────────────── */}
      <EditDisplayNameSheet
        currentName={displayName}
        isSaving={updateDisplayNameMutation.isPending}
        onClose={() => setNameSheetOpen(false)}
        onSave={saveProfile}
        visible={nameSheetOpen}
      />
      <EditAvatarSheet
        currentSlug={profileQuery.data?.avatar_animal ?? null}
        isSaving={updateAvatarMutation.isPending}
        onClose={() => setAvatarSheetOpen(false)}
        onSave={saveAvatar}
        visible={avatarSheetOpen}
      />
      <EditIncomeSheet
        currentValue={financeSnapshot.monthlyIncome}
        isSaving={upsertFamilyFinanceMutation.isPending}
        onClose={() => setIncomeSheetOpen(false)}
        onSave={handleSaveIncome}
        visible={incomeSheetOpen}
      />
      <EditPaydaySheet
        currentValue={financeSnapshot.salaryPaymentDay}
        isSaving={upsertFamilyFinanceMutation.isPending}
        onClose={() => setPaydaySheetOpen(false)}
        onSave={handleSavePayday}
        visible={paydaySheetOpen}
      />
      <EditUsdRateSheet
        currentValue={financeSnapshot.usdExchangeRate}
        isSaving={upsertFamilyFinanceMutation.isPending}
        onClose={() => setUsdSheetOpen(false)}
        onSave={handleSaveUsd}
        visible={usdSheetOpen}
      />
      <EditSavingsPercentSheet
        currentValue={financeSnapshot.savingsGoalPercent}
        isSaving={upsertFamilyFinanceMutation.isPending}
        monthlyIncome={financeSnapshot.monthlyIncome}
        onClose={() => setSavingsSheetOpen(false)}
        onSave={handleSaveSavingsPercent}
        visible={savingsSheetOpen}
      />
      <EditBufferSheet
        currentMode={financeSnapshot.dailyBudgetBufferMode}
        currentValue={financeSnapshot.dailyBudgetBufferValue}
        isSaving={upsertFamilyFinanceMutation.isPending}
        onClose={() => setBufferSheetOpen(false)}
        onSave={handleSaveBuffer}
        visible={bufferSheetOpen}
      />
      <DestroyFamilyConfirmSheet
        isSubmitting={leaveFamilyMutation.isPending}
        onCancel={() => {
          if (leaveFamilyMutation.isPending) return
          setDestroyFamilySheetOpen(false)
        }}
        onConfirm={runLeaveFamily}
        otherActiveMembers={otherActiveMembers}
        visible={destroyFamilySheetOpen}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  sectionStack: {
    gap: 22,
    position: 'relative',
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  heroTitle: {
    ...typography.screenTitle,
  },
  heroSub: {
    fontSize: 13,
  },
  ownerPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 6,
  },
  ownerText: {
    fontSize: 12,
    fontWeight: '800',
  },
  memberHint: {
    fontSize: 12,
    marginTop: 4,
  },
  appearanceInner: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
})
