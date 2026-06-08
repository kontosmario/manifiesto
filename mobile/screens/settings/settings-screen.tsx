import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { Alert, Linking, Platform, StyleSheet, Switch, Text, View } from 'react-native'
import Constants from 'expo-constants'
import * as Application from 'expo-application'
import { useRouter } from 'expo-router'
import { RiseView, RiseViewGate } from '@/components/home/animated/rise-view'
import { useIsNavigationSettled } from '@/hooks/use-is-navigation-settled'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/settings-grouped-list'
import { DestroyFamilyConfirmSheet } from '@/components/settings/sheets/destroy-family-confirm-sheet'
import { DeleteAccountConfirmSheet } from '@/components/settings/sheets/delete-account-confirm-sheet'
import { ImportReviewSheet } from '@/components/import-review/import-review-sheet'
import { buildPreviewReviewState } from '@/features/import-review/preview-mock-state'
import type { ReviewState } from '@/features/import-review/types'
import { ShareInviteSheet } from '@/components/settings/sheets/share-invite-sheet'
import { EditAvatarSheet } from '@/components/settings/sheets/edit-avatar-sheet'
import { EditBufferSheet } from '@/components/settings/sheets/edit-buffer-sheet'
import { EditDisplayNameSheet } from '@/components/settings/sheets/edit-display-name-sheet'
import { EditMyContributionSheet } from '@/components/settings/sheets/edit-my-contribution-sheet'
import { EditCycleConfigSheet } from '@/components/settings/sheets/edit-cycle-config-sheet'
import { EditSavingsPercentSheet } from '@/components/settings/sheets/edit-savings-percent-sheet'
import { EditUsdRateSheet } from '@/components/settings/sheets/edit-usd-rate-sheet'
import { MaterialIcons } from '@expo/vector-icons'
import { buildInitialBiometricState } from '@/features/auth/auth-biometric-state'
import { logoutSession } from '@/features/auth/logout'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useRequestAccountDeletion } from '@/features/auth/use-delete-account'
import { useMotionPreferenceControls } from '@/features/preferences/motion-preference-provider'
import {
  useConvertToFamily,
  useConvertToSolo,
  useLeaveCurrentFamily,
  useUpdateMyIncomeContribution,
} from '@/features/family/use-family-actions'
import { useFamilyMemberStats } from '@/features/family/use-family-admin'
import { useFamilyMembersDetail } from '@/features/family/use-family-members-detail'
import { useIsSolo } from '@/features/family/use-is-solo'
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
import { ALL_TOUR_KEYS, resetAllTours, TOUR_KEYS } from '@/features/tours'
import { useResetTourSeen } from '@/features/tours/use-reset-tour-seen'
import {
  setAssistantDemoMode,
  useAssistantDemoMode,
} from '@/features/insights/assistant-demo-store'
import {
  setAssistantDemoFilter,
  useAssistantDemoFilter,
  type AssistantDemoFilter,
} from '@/features/insights/assistant-demo-filter-store'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import {
  hideAuthTransitionSplash,
  markAuthTransitionLoaded,
  reportAuthTransitionError,
  showAuthTransitionSplash,
} from '@/lib/auth-transition-splash'
import {
  authenticateBiometricAccess,
  clearBiometricCredentials,
  getBiometricLoginState,
  saveBiometricCredentials,
  type BiometricLoginState,
} from '@/lib/biometric-auth'
import { triggerHaptic } from '@/lib/haptics'
import { supabase } from '@/lib/supabase'
import { useAppTheme } from '@/theme/theme-provider'
import { typography } from '@/theme/typography'
import { getErrorMessage } from '@/utils/error-message'
import { currencyFormatter, formatMoneyShort } from '@/utils/money'
import { financeToCycleConfig, type FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { formatCycleSummary } from '@/utils/format-cycle-label'
import {
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
  buildSupportMailto,
} from '@/lib/legal-urls'

interface SettingsScreenProps {
  userId: string
  familyId: string
  // Legacy familyCode prop removed — invites generate ephemeral codes now.
}

const DISABLED_HINT = 'Solo el dueño puede editar'

export function SettingsScreen({ userId, familyId }: SettingsScreenProps) {
  const router = useRouter()
  const isNavSettled = useIsNavigationSettled()
  const { preference, setPreference, theme } = useAppTheme()
  const { data: session } = useAuthSession()
  const profileQuery = useMyProfile(userId)
  const displayName = profileQuery.data?.display_name ?? ''
  const dashboard = useFamilyDashboard(familyId)
  const roleQuery = useMyFamilyRole(userId, familyId)
  const role = roleQuery.data
  const isOwner = role === 'owner'
  const isSolo = useIsSolo(userId)
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
  const convertToSolo = useConvertToSolo(userId)
  const convertToFamily = useConvertToFamily(userId)
  const enablePushMutation = useEnablePushNotifications()
  const hasPushSubscriptionQuery = useHasPushSubscription(familyId, userId)
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId)
  const familyMembersDetailQuery = useFamilyMembersDetail(familyId)
  const updateMyContributionMutation = useUpdateMyIncomeContribution(userId, familyId)
  const tourResets = useResetTourSeen()
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
      savingsGoalPercent: dashboard.familyFinanceQuery.data?.savings_goal_percent ?? 20,
      usdExchangeRate: dashboard.usdExchangeRate,
      currentCycleStartingBalance:
        dashboard.familyFinanceQuery.data?.current_cycle_starting_balance ?? null,
      currentCycleAnchor:
        dashboard.familyFinanceQuery.data?.current_cycle_anchor ?? null,
      // Cycle config: leer del query — NO hardcodear monthly. Cualquier
      // save vía `saveFinanceSnapshot` (USD rate, ahorro, etc.) hubiera
      // reseteado la config del ciclo si quedaban estos hardcodeados.
      cycleType: dashboard.familyFinanceQuery.data?.cycle_type ?? 'monthly',
      cycleAnchorDate: dashboard.familyFinanceQuery.data?.cycle_anchor_date ?? null,
      cycleLengthDays: dashboard.familyFinanceQuery.data?.cycle_length_days ?? null,
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
      dashboard.familyFinanceQuery.data?.cycle_type,
      dashboard.familyFinanceQuery.data?.cycle_anchor_date,
      dashboard.familyFinanceQuery.data?.cycle_length_days,
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
  const [cycleConfigSheetOpen, setCycleConfigSheetOpen] = useState(false)
  const [usdSheetOpen, setUsdSheetOpen] = useState(false)
  const [savingsSheetOpen, setSavingsSheetOpen] = useState(false)
  const [bufferSheetOpen, setBufferSheetOpen] = useState(false)
  const [destroyFamilySheetOpen, setDestroyFamilySheetOpen] = useState(false)
  const [deleteAccountSheetOpen, setDeleteAccountSheetOpen] = useState(false)
  // Preview state lives here so the dates are regenerated relative to
  // "today" each time the user opens the preview, not snapshotted at
  // mount. `null` while closed so the sheet doesn't render with stale
  // rows from a previous open.
  const [importPreviewState, setImportPreviewState] =
    useState<ReviewState | null>(null)
  const requestAccountDeletion = useRequestAccountDeletion()

  // Motion preference — drives `useReducedMotion()` for every consumer
  // of `useLoopAnimation` / `useUnboundedLoopAnimation`. Users can
  // override the device-class heuristic from here (auto/always/never).
  const { preference: motionPreference, setPreference: setMotionPreference } =
    useMotionPreferenceControls()

  // Biometric "fast access" state — controls whether the login screen
  // offers the Face ID / fingerprint shortcut on next cold start.
  // Refreshed asynchronously from SecureStore + LocalAuth so the row
  // shows the real state even after a reinstall or OS-level enrollment
  // change. `userEmail` is needed to save credentials when the user
  // activates the toggle (Supabase refresh token is paired with email
  // for the auto-login flow).
  const userEmail = session?.user?.email ?? null
  const [biometricState, setBiometricState] = useState<BiometricLoginState>(
    buildInitialBiometricState,
  )
  const [isBiometricBusy, setBiometricBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getBiometricLoginState().then((next) => {
      if (cancelled) return
      setBiometricState(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleBiometricToggle = useCallback(async () => {
    if (isBiometricBusy) return
    if (!biometricState.isAvailable) {
      Alert.alert(
        'Acceso rápido no disponible',
        `Configurá ${biometricState.label.toLowerCase()} en los ajustes del sistema y volvé a intentarlo.`,
      )
      return
    }
    if (!userEmail) {
      Alert.alert(
        'Sesión inválida',
        'Iniciá sesión nuevamente para activar el acceso rápido.',
      )
      return
    }

    setBiometricBusy(true)
    void triggerHaptic('selection')

    try {
      if (biometricState.hasSavedCredentials) {
        // Disable: clear the stored refresh token + metadata. The next
        // cold start will route the user to email/password again.
        await clearBiometricCredentials()
        const next = await getBiometricLoginState()
        setBiometricState(next)
        return
      }

      // Enable: prompt the native biometric handshake. On success,
      // grab the live Supabase refresh token (no password handling)
      // and save it paired with the user's email.
      const biometricResult = await authenticateBiometricAccess({
        promptMessage: `Activá ${biometricState.label} para entrar más rápido la próxima vez.`,
      })
      if (!biometricResult.success) {
        return
      }
      const sessionResponse = await supabase.auth.getSession()
      const refreshToken = sessionResponse.data.session?.refresh_token
      if (!refreshToken) {
        Alert.alert(
          'No pudimos completar',
          'No encontramos una sesión activa. Volvé a entrar manualmente y probá de nuevo.',
        )
        return
      }
      await saveBiometricCredentials({
        email: userEmail,
        refreshToken,
      })
      const next = await getBiometricLoginState()
      setBiometricState(next)
    } catch {
      Alert.alert(
        'No pudimos guardar',
        'Hubo un problema activando el acceso rápido. Probá nuevamente.',
      )
    } finally {
      setBiometricBusy(false)
    }
  }, [biometricState, isBiometricBusy, userEmail])

  const biometricRowValue = !biometricState.isAvailable
    ? 'No disponible'
    : biometricState.hasSavedCredentials
      ? 'Activado'
      : 'Desactivado'

  const [pinIsSet, setPinIsSet] = useState(false)
  const refreshPinState = useCallback(async () => {
    const { getPinLockState } = await import('@/lib/pin-lock')
    const s = await getPinLockState()
    setPinIsSet(s.isSet)
  }, [])
  useFocusEffect(
    useCallback(() => {
      void refreshPinState()
    }, [refreshPinState]),
  )

  const handlePinPress = useCallback(() => {
    if (!pinIsSet) {
      router.push('/(app)/pin-setup')
      return
    }
    Alert.alert('PIN de acceso', '¿Qué querés hacer?', [
      { text: 'Cambiar PIN', onPress: () => router.push('/(app)/pin-setup') },
      {
        text: 'Quitar PIN',
        style: 'destructive',
        onPress: async () => {
          const { clearPin } = await import('@/lib/pin-lock')
          await clearPin()
          await refreshPinState()
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ])
  }, [pinIsSet, router, refreshPinState])

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

  const handleSaveMyContribution = useCallback(
    (value: number) => {
      updateMyContributionMutation.mutate(value, {
        onSuccess: () => {
          void triggerHaptic('success')
          setIncomeSheetOpen(false)
        },
        onError: (error: unknown) => {
          void showError(error, 'No se pudo actualizar tu aporte.')
        },
      })
    },
    [showError, updateMyContributionMutation],
  )

  const handleSaveCycleConfig = useCallback(
    (next: FinanceCycleConfig) => {
      saveFinanceSnapshot(
        {
          ...financeSnapshot,
          // Persistimos el día de cobro en `salaryPaymentDay` solo cuando
          // el ciclo es mensual (mantiene compat con el resto de la app).
          // Para rolling types, el día de cobro lo derivan los consumidores
          // de `cycle_anchor_date` cuando lo necesitan.
          salaryPaymentDay:
            next.cycle_type === 'monthly' ? next.salary_payment_day : financeSnapshot.salaryPaymentDay,
          cycleType: next.cycle_type,
          cycleAnchorDate: next.cycle_type === 'monthly' ? null : next.cycle_anchor_date,
          cycleLengthDays: next.cycle_type === 'monthly' ? null : next.cycle_length_days,
        },
        () => setCycleConfigSheetOpen(false),
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
        'Expo Go ya no soporta notificaciones push remotas desde SDK 53. Abre la app en un development build para activarlas.',
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

  // Invite sheet — generates a single-use 8-char code on open
  // (server-side, with 10/min rate limit) and shows it big with
  // copy + native share + regenerate actions.
  const [shareInviteSheetVisible, setShareInviteSheetVisible] = useState(false)
  const handleOpenShareInvite = useCallback(() => {
    void triggerHaptic('selection')
    setShareInviteSheetVisible(true)
  }, [])

  // Re-arm the per-screen guided tours so they auto-start the next
  // time the user lands on Home / Gastos / Fijos / Control. Useful
  // after a long break or for users who want a refresher.
  const handleResetTours = useCallback(async () => {
    void triggerHaptic('selection')
    await tourResets.resetAll()
    await resetAllTours()
    void triggerHaptic('success')
    Alert.alert(
      'Listo',
      'La próxima vez que abras Inicio, Gastos, Fijos y Control vas a ver el tutorial guiado.',
    )
  }, [tourResets])

  // Ayuda · Tutoriales — re-watch a single tour or all four.
  // Resets the "seen" flag then navigates to the relevant tab so
  // `useScreenTour` fires the auto-start on next focus.
  const handleRewatchTour = useCallback(
    async (tourKey: (typeof ALL_TOUR_KEYS)[number]) => {
      await tourResets.resetOne(tourKey)
      const target =
        tourKey === TOUR_KEYS.home
          ? '/(app)/(tabs)/home'
          : tourKey === TOUR_KEYS.gastos
            ? '/(app)/(tabs)/expenses'
            : tourKey === TOUR_KEYS.fijos
              ? '/(app)/(tabs)/fixed-expenses'
              : '/(app)/(tabs)/insights'
      router.push(target)
    },
    [router, tourResets],
  )

  const handleResetAllTours = useCallback(async () => {
    await tourResets.resetAll()
    await resetAllTours()
    // No navigation: the user stays where they are. Next visit to each
    // screen will auto-fire its tour.
  }, [tourResets])

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

  const handleConfirmConvertToSolo = useCallback(() => {
    Alert.alert(
      'Pasar a cuenta individual',
      'Se quitará a los demás miembros y tendrán que volver a configurar su cuenta. Los gastos y la configuración compartida quedan con vos. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Pasar a individual',
          style: 'destructive',
          onPress: () =>
            convertToSolo.mutate(undefined, {
              onError: (error) => void showError(error, 'No pudimos cambiar el tipo de cuenta.'),
            }),
        },
      ],
    )
  }, [convertToSolo, showError])

  const handleConfirmConvertToFamily = useCallback(() => {
    Alert.alert(
      'Compartir con tu familia',
      'Tu cuenta pasa a modo familiar. Vas a poder invitar a otras personas y compartir los gastos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Activar',
          onPress: () =>
            convertToFamily.mutate(undefined, {
              onError: (error) => void showError(error, 'No pudimos cambiar el tipo de cuenta.'),
            }),
        },
      ],
    )
  }, [convertToFamily, showError])

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

  const handleConfirmDeleteAccount = useCallback(() => {
    requestAccountDeletion.mutate(undefined, {
      onSuccess: () => {
        void triggerHaptic('success')
        // El RPC ya marcó la cuenta; sacamos al usuario inmediatamente
        // para que la sesión no tenga acceso post-confirmación.
        void logoutSession({
          onError: (error) => void showError(error, 'No se pudo cerrar sesión.'),
          onSuccess: () => {
            setDeleteAccountSheetOpen(false)
            router.replace('/')
          },
        })
      },
      onError: (error) => {
        void showError(error, 'No pudimos programar la baja de tu cuenta.')
      },
    })
  }, [requestAccountDeletion, router, showError])

  const handleOpenSupport = useCallback(() => {
    const url = buildSupportMailto({
      appVersion: Constants.expoConfig?.version ?? null,
      buildNumber: Application.nativeBuildVersion,
      platform: Platform.OS,
      userId,
    })
    void Linking.openURL(url).catch(() => {
      Alert.alert(
        'No pudimos abrir tu mail',
        'Escribinos a soporte@manifiesto.app desde la app de correo que prefieras.',
      )
    })
  }, [userId])

  const handleOpenPrivacy = useCallback(() => {
    void Linking.openURL(PRIVACY_POLICY_URL)
  }, [])

  const handleOpenTerms = useCallback(() => {
    void Linking.openURL(TERMS_OF_SERVICE_URL)
  }, [])

  // Footer "Manifiesto X.Y.Z (build N)" — Apple Review usa el build
  // number para identificar la versión que está revisando.
  const appVersionLabel = useMemo(() => {
    const version = Constants.expoConfig?.version ?? Application.nativeApplicationVersion ?? '—'
    const build = Application.nativeBuildVersion
    return build ? `Manifiesto ${version} (build ${build})` : `Manifiesto ${version}`
  }, [])

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

  // TESTING flag: when ON, the Asistente returns a curated fixture
  // covering every signal scenario + every CTA action kind, so we
  // can step through every coach card and quick action without
  // having to reproduce the data preconditions.
  const assistantDemoMode = useAssistantDemoMode()
  const handleToggleAssistantDemo = useCallback((next: boolean) => {
    void triggerHaptic('selection')
    void setAssistantDemoMode(next)
  }, [])
  // Companion filter: narrows the demo fixture to a single behavior
  // class so each bucket (read-only / routing / mutation / sin
  // acción) can be tested in isolation. Only meaningful while
  // `assistantDemoMode` is on.
  const assistantDemoFilter = useAssistantDemoFilter()
  const handleAssistantDemoFilter = useCallback(
    (next: AssistantDemoFilter) => {
      void triggerHaptic('selection')
      void setAssistantDemoFilter(next)
    },
    [],
  )

  // ── Values shown on rows ──────────────────────────────────────
  const myContributionValue =
    myContribution > 0
      ? currencyFormatter.format(myContribution)
      : familyMembersDetailQuery.isLoading
        ? '…'
        : 'Definir'
  const householdTotalSubtitle =
    financeSnapshot.monthlyIncome > 0
      ? `Total del hogar: ${currencyFormatter.format(financeSnapshot.monthlyIncome)}`
      : undefined
  const usdValue = currencyFormatter.format(financeSnapshot.usdExchangeRate)
  const currentCycleConfig = useMemo<FinanceCycleConfig>(
    () => financeToCycleConfig(dashboard.familyFinanceQuery.data),
    [dashboard.familyFinanceQuery.data],
  )
  const cycleConfigValue = formatCycleSummary(currentCycleConfig)
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
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      canGoBack
      contentContainerStyle={styles.screenContent}
      subtitle={
        isSolo
          ? 'Tu perfil y la configuración base de tu cuenta.'
          : 'Preferencias del hogar, tu perfil y la configuración base de la familia.'
      }
      title="Ajustes"
    >
      {/* Mute the 19 descendant RiseViews during the ~340ms native
          stack push. Without this gate the screen entry overlays 19
          concurrent Keyframe worklets on top of the slide animation,
          which is the perceived "lentitud" on cold-entry. The gate
          flips off after the transition settles; further mounts (none
          in this screen — RiseViews mount once with the screen) would
          animate normally. */}
      <RiseViewGate skip={!isNavSettled}>
      <View style={styles.sectionStack}>
        {!theme.isDark ? <AmbientBackdrop variant="home" /> : null}
        <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />

        {shouldShowErrorState ? (
          <ErrorState
            description={getErrorMessage(
              settingsLoadError,
              isSolo
                ? 'No pudimos cargar ajustes, métricas y preferencias de tu cuenta.'
                : 'No pudimos cargar ajustes, métricas y preferencias del hogar.',
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
                    backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
                    borderColor: theme.colors.line,
                  },
                ]}
              >
                <Text style={[styles.heroEyebrow, { color: theme.colors.textMuted }]}>
                  {isSolo ? 'TU CUENTA' : 'TU HOGAR'}
                </Text>
                <Text style={[styles.heroTitle, { color: theme.colors.text }]}>
                  {displayName.trim() || 'Perfil sin nombre'}
                </Text>
                <Text style={[styles.heroSub, { color: theme.colors.textMuted }]}>
                  {isSolo
                    ? 'Tu cuenta personal'
                    : totalMembers === 1
                      ? 'Hogar individual'
                      : `Hogar de ${totalMembers} ${totalMembers === 1 ? 'persona' : 'personas'}`}
                </Text>
                {isOwner && !isSolo ? (
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
                title={isSolo ? 'Tu cuenta' : 'Hogar'}
              >
                <SettingsRow
                  helper={isSolo ? undefined : householdTotalSubtitle}
                  icon="attach-money"
                  label={isSolo ? 'Ingreso mensual' : 'Mi aporte mensual'}
                  onPress={() => setIncomeSheetOpen(true)}
                  value={myContributionValue}
                />
                <SettingsRow
                  disabled={!isOwner}
                  disabledHint={DISABLED_HINT}
                  icon="autorenew"
                  label="Ciclo de cobro"
                  onPress={() => setCycleConfigSheetOpen(true)}
                  value={cycleConfigValue}
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

            {/* 2b. RESERVA ACUMULADA — solo visible si hay reserva > 0.
                Read-only: la única forma de tocar este monto es vía la
                decisión "Guardar como reserva" del wrapped de cierre
                de mes (Spec B). Surface acá para que la plata no
                desaparezca visualmente del Settings. */}
            {Number(dashboard.familyFinanceQuery.data?.monthly_reserve_amount ?? 0) > 0 ? (
              <RiseView delay={220}>
                <SettingsGroup title="Reserva acumulada">
                  <View style={styles.reserveInner}>
                    <Text
                      style={[styles.reserveAmount, { color: theme.colors.text }]}
                      maxFontSizeMultiplier={1.4}
                    >
                      {currencyFormatter.format(
                        Number(
                          dashboard.familyFinanceQuery.data?.monthly_reserve_amount ?? 0,
                        ),
                      )}
                    </Text>
                    <Text
                      style={[styles.reserveSub, { color: theme.colors.textMuted }]}
                    >
                      Plata guardada del cierre de meses anteriores.
                    </Text>
                  </View>
                </SettingsGroup>
              </RiseView>
            ) : null}

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
            {!isSolo ? (
            <>
            <RiseView delay={320}>
              <SettingsGroup title="Familia">
                <SettingsRow
                  icon="person-add"
                  label="Invitar a alguien"
                  helper="Genera un código de un solo uso, válido por 7 días."
                  onPress={handleOpenShareInvite}
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
                  read-only "Tienes miembros en tu hogar" placeholder
                  left owners with no path forward — they had to
                  guess that "Gestionar miembros" → transfer was the
                  only escape. We now show one destructive row whose
                  copy + helper adapts to ownership, and the actual
                  destructive 2-step confirmation lives in the sheet.
                */}
              </SettingsGroup>
            </RiseView>
            {isOwner ? (
              <RiseView delay={340}>
                <SettingsGroup title="Tipo de cuenta">
                  <SettingsRow
                    destructive
                    icon="person-remove"
                    isLast
                    label="Pasar a cuenta individual"
                    helper="Quita a los demás miembros y deja la cuenta solo para vos."
                    onPress={handleConfirmConvertToSolo}
                  />
                </SettingsGroup>
              </RiseView>
            ) : null}
            </>
            ) : (
              <RiseView delay={320}>
                <SettingsGroup title="Tipo de cuenta">
                  <SettingsRow
                    icon="group-add"
                    isLast
                    label="Compartir con mi familia o pareja"
                    helper="Activá el modo familiar para invitar y compartir gastos."
                    onPress={handleConfirmConvertToFamily}
                  />
                </SettingsGroup>
              </RiseView>
            )}

            {/* 4b. ASISTENTE */}
            <RiseView delay={300}>
              <SettingsGroup title="Asistente">
                <SettingsRow
                  icon="auto-awesome"
                  label="Preferencias del asistente"
                  onPress={() => router.push('/settings/asistente' as never)}
                />
                <SettingsRow
                  helper="Vuelve a disparar los tutoriales guiados de Inicio, Gastos, Fijos y Control la próxima vez que entres a cada pantalla."
                  icon="school"
                  label="Reactivar visitas guiadas"
                  onPress={() => {
                    void handleResetTours()
                  }}
                />
                <SettingsRow
                  helper="Abrí el wizard de revisión con 5 movimientos de muestra para iterar la UI sin esperar un build. Nada se guarda."
                  icon="preview"
                  isLast
                  label="Vista previa: wizard de importación"
                  onPress={() => {
                    setImportPreviewState(buildPreviewReviewState())
                  }}
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

            {/* 6. AYUDA · TUTORIALES */}
            <RiseView delay={320}>
              <SettingsGroup
                title="Ayuda"
                footer="Volvé a ver cualquier tutorial cuando quieras."
              >
                <SettingsRow
                  icon="home"
                  label="Ver tutorial de Inicio"
                  onPress={() => void handleRewatchTour(TOUR_KEYS.home)}
                />
                <SettingsRow
                  icon="receipt-long"
                  label="Ver tutorial de Gastos"
                  onPress={() => void handleRewatchTour(TOUR_KEYS.gastos)}
                />
                <SettingsRow
                  icon="event-repeat"
                  label="Ver tutorial de Fijos"
                  onPress={() => void handleRewatchTour(TOUR_KEYS.fijos)}
                />
                <SettingsRow
                  icon="insights"
                  label="Ver tutorial de Control"
                  onPress={() => void handleRewatchTour(TOUR_KEYS.control)}
                />
                <SettingsRow
                  icon="restart-alt"
                  label="Volver a ver todos los tutoriales"
                  helper="Resetea los 4 tutoriales — el próximo ingreso a cada pantalla los vuelve a mostrar."
                  onPress={() => void handleResetAllTours()}
                  isLast
                />
              </SettingsGroup>
            </RiseView>

            {/* 7. APARIENCIA */}
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

            {/* 6b. ANIMACIONES — user-facing override del flag de
                reduced-motion. 'Auto' (default) respeta accessibility
                + auto-detecta hardware viejo via deviceYearClass<2020;
                'Reducir' fuerza desactivar todos los loops decorativos;
                'Todas' fuerza el motion completo aunque el hardware no
                sea ideal. */}
            <RiseView delay={320}>
              <SettingsGroup
                footer={
                  motionPreference === 'always'
                    ? 'Las animaciones decorativas están desactivadas siempre.'
                    : motionPreference === 'never'
                      ? 'Las animaciones decorativas se ejecutan aunque el dispositivo sea más lento.'
                      : 'Se desactivan automáticamente en dispositivos antiguos para mantener la fluidez.'
                }
                title="Animaciones"
              >
                <View style={styles.appearanceInner}>
                  <SegmentedControl
                    onChange={setMotionPreference}
                    options={[
                      { label: 'Reducir', value: 'always' },
                      { label: 'Auto', value: 'auto' },
                      { label: 'Todas', value: 'never' },
                    ]}
                    value={motionPreference}
                  />
                </View>
              </SettingsGroup>
            </RiseView>

            {/* 6c. ACCESO RÁPIDO — toggle de biometría sin necesidad de
                cerrar sesión. Permite activar Face ID / huella desde
                acá si el usuario lo declinó en el post-login, o
                desactivarlo (limpia el refresh token guardado). El
                row queda disabled si el dispositivo no tiene
                biometría enrolada. */}
            <RiseView delay={320}>
              <SettingsGroup
                footer={
                  biometricState.isAvailable
                    ? `Usá ${biometricState.label} para entrar más rápido la próxima vez.`
                    : `Configurá ${biometricState.label.toLowerCase()} en los ajustes del sistema para activarlo.`
                }
                title="Acceso rápido"
              >
                <SettingsRow
                  disabled={!biometricState.isAvailable}
                  icon="fingerprint"
                  isLoading={isBiometricBusy}
                  label={`Entrar con ${biometricState.label}`}
                  onPress={handleBiometricToggle}
                  value={biometricRowValue}
                />
                <SettingsRow
                  icon="dialpad"
                  isLast
                  label="PIN de acceso"
                  onPress={handlePinPress}
                  value={pinIsSet ? 'Activado' : 'Desactivado'}
                />
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
                    label="Forzar cierre del splash"
                    onPress={handleForceHideTransitionSplash}
                  />
                  <SettingsRow
                    helper="Reemplaza las señales del Asistente Financiero por una lista demo con un ejemplo de cada escenario y de cada acción rápida disponible."
                    icon="auto-fix-high"
                    label="Modo demo del asistente"
                    trailing={
                      <Switch
                        accessibilityLabel="Activar modo demo del asistente"
                        onValueChange={handleToggleAssistantDemo}
                        value={assistantDemoMode}
                      />
                    }
                  />
                  <SettingsRow
                    helper="Metricas de la base de datos: tamano, growth, tablas y slow queries."
                    icon="monitor-heart"
                    label="DB Health"
                    onPress={() => router.push('/(app)/settings/dev-health' as never)}
                  />
                  <SettingsRow
                    helper="Dispara el modal de unlock de cualquier logro y previsualiza la racha en cada estado (activa por nivel, en riesgo, rota)."
                    icon="emoji-events"
                    label="Preview · Logros & Racha"
                    onPress={() => router.push('/(app)/settings/dev/preview' as never)}
                  />
                  <SettingsRow
                    helper="Dispara el Manifiesto Wrapped (recap del mes cerrado) con datos sintéticos: cerraste con margen / empatado / excedido."
                    icon="auto-stories"
                    isLast
                    label="Preview · Cierre de ciclo"
                    onPress={() => router.push('/(app)/settings/dev/cycle-wrapped' as never)}
                  />
                </SettingsGroup>
              </RiseView>
            ) : null}

            {/* TEMPORAL — Phase B sideload build (2026-06-02). Mostramos
                el preview del OCR aún en release para poder ejercitar
                el pipeline en device via IPA sideloaded. Revertir cuando
                Phase D entregue la UI productiva: borrar este RiseView
                y volver a poner la SettingsRow dentro del grupo
                __DEV__ "Desarrollo" arriba con su isLast original. */}
            <RiseView delay={325}>
              <SettingsGroup
                footer="Activa solo durante el desarrollo de la feature. Se va a sacar cuando la UI productiva esté lista."
                title="Beta · Activity OCR"
              >
                <SettingsRow
                  helper="Selecciona una captura de actividad bancaria/wallet. Corre OCR on-device + parser. Muestra el ParseResult en JSON."
                  icon="text-fields"
                  isLast
                  label="Activity OCR · preview"
                  onPress={() => router.push('/(app)/settings/dev/activity-ocr' as never)}
                />
              </SettingsGroup>
            </RiseView>

            {/* 7b. Filtro del modo demo. Solo aparece cuando el modo
                demo está encendido — en la lista normal de señales no
                tiene sentido filtrar. */}
            {__DEV__ && assistantDemoMode ? (
              <RiseView delay={320}>
                <SettingsGroup
                  footer="Filtra las tarjetas demo por tipo de acción para probar cada bucket por separado."
                  title="Filtro demo"
                >
                  <View style={styles.appearanceInner}>
                    <SegmentedControl<AssistantDemoFilter>
                      onChange={handleAssistantDemoFilter}
                      options={[
                        { label: 'Todas', value: 'all' },
                        { label: 'Read-only', value: 'read-only' },
                        { label: 'Routing', value: 'routing' },
                        { label: 'Acción', value: 'action' },
                      ]}
                      value={assistantDemoFilter}
                    />
                  </View>
                </SettingsGroup>
              </RiseView>
            ) : null}

            {/* 8a. LOGROS + EDICIONES */}
            <RiseView delay={310}>
              <SettingsGroup title="Tu progreso">
                <SettingsRow
                  helper="Hitos que vas desbloqueando con cada acción dentro de Manifiesto."
                  icon="emoji-events"
                  label="Logros"
                  onPress={() => router.push('/settings/achievements' as never)}
                  value="Ver galería"
                />
                <SettingsRow
                  helper="Tu archivo de Manifiestos. Cada ciclo cerrado queda como una edición que podés revivir."
                  icon="auto-stories"
                  isLast
                  label="Ediciones"
                  onPress={() => router.push('/settings/editions' as never)}
                  value="Ver archivo"
                />
              </SettingsGroup>
            </RiseView>

            {/* 8. PLAN DEL HOGAR */}
            <RiseView delay={320}>
              <SettingsGroup title="Tu plan">
                <SettingsRow
                  helper="Tu suscripción, las personas incluidas y la facturación."
                  icon="workspace-premium"
                  isLast
                  label="Plan del hogar"
                  onPress={() => router.push('/settings/plan' as never)}
                  value="Ver planes"
                />
              </SettingsGroup>
            </RiseView>

            {/* 9. AYUDA Y LEGAL */}
            <RiseView delay={320}>
              <SettingsGroup title="Ayuda y legal">
                <SettingsRow
                  helper="Te respondemos por mail."
                  icon="mail-outline"
                  label="Contactar soporte"
                  onPress={handleOpenSupport}
                />
                <SettingsRow
                  icon="policy"
                  label="Política de privacidad"
                  onPress={handleOpenPrivacy}
                />
                <SettingsRow
                  icon="description"
                  isLast
                  label="Términos de uso"
                  onPress={handleOpenTerms}
                />
              </SettingsGroup>
            </RiseView>

            {/* 10. CUENTA */}
            <RiseView delay={320}>
              <SettingsGroup title="Cuenta">
                <SettingsRow
                  icon="power-settings-new"
                  label="Cerrar sesión"
                  onPress={handleConfirmLogout}
                />
                <SettingsRow
                  destructive
                  helper="Borra tus datos en 30 días. Podés cancelar antes."
                  icon="delete-forever"
                  isLast
                  label="Eliminar cuenta"
                  onPress={() => setDeleteAccountSheetOpen(true)}
                />
              </SettingsGroup>
            </RiseView>

            <RiseView delay={320}>
              <Text style={[styles.versionFooter, { color: theme.colors.textMuted }]}>
                {appVersionLabel}
              </Text>
            </RiseView>
          </>
        )}
      </View>
      </RiseViewGate>

      {/* ── Sheets ────────────────────────────────────────────── */}
      <ShareInviteSheet
        visible={shareInviteSheetVisible}
        onClose={() => setShareInviteSheetVisible(false)}
      />
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
      <EditMyContributionSheet
        currentValue={myContribution}
        householdTotal={financeSnapshot.monthlyIncome}
        isSaving={updateMyContributionMutation.isPending}
        isSolo={isSolo}
        onClose={() => setIncomeSheetOpen(false)}
        onSave={handleSaveMyContribution}
        visible={incomeSheetOpen}
      />
      <EditCycleConfigSheet
        currentConfig={currentCycleConfig}
        isSaving={upsertFamilyFinanceMutation.isPending}
        onClose={() => setCycleConfigSheetOpen(false)}
        onSave={handleSaveCycleConfig}
        visible={cycleConfigSheetOpen}
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
      <DeleteAccountConfirmSheet
        isOwnerWithMembers={isOwner && otherActiveMembers > 0}
        isSubmitting={requestAccountDeletion.isPending}
        onCancel={() => {
          if (requestAccountDeletion.isPending) return
          setDeleteAccountSheetOpen(false)
        }}
        onConfirm={handleConfirmDeleteAccount}
        visible={deleteAccountSheetOpen}
      />
      <ImportReviewSheet
        visible={importPreviewState !== null}
        initialState={importPreviewState}
        familyId={familyId}
        userId={userId}
        onClose={() => setImportPreviewState(null)}
        previewMode
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
  // Read-only section that surfaces `family_finance.monthly_reserve_amount`.
  // Big monto + sublabel; no trailing chevron porque el row no es
  // tappable (la única forma de modificarlo es el wrapped de cierre).
  reserveInner: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  reserveAmount: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  reserveSub: {
    fontSize: 12,
  },
  versionFooter: {
    textAlign: 'center',
    fontSize: 12,
    paddingTop: 6,
    paddingBottom: 24,
  },
})
