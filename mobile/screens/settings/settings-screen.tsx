import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  forceResetAuthFlow,
  runDevJourney,
  type DevJourney,
} from '@/features/auth-flow/dev-journeys'
import { useFocusEffect } from '@react-navigation/native'
import { Alert, StyleSheet, Switch, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Constants from 'expo-constants'
import * as Application from 'expo-application'
import { useRouter } from 'expo-router'
import { RiseView, RiseViewGate } from '@/components/home/animated/rise-view'
import { CardParticles } from '@/components/ui/card-particles'
import { FernMark } from '@/components/billing/fern-mark'
import { membershipVariant } from '@/features/billing/membership-state'
import { useIsNavigationSettled } from '@/hooks/use-is-navigation-settled'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { CancelDeletionBanner } from '@/components/common/cancel-deletion-banner'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/settings-grouped-list'
import { SettingsProtectionDismissRow } from '@/components/settings/protection-dismiss-row'
import { DestroyFamilyConfirmSheet } from '@/components/settings/sheets/destroy-family-confirm-sheet'
import { RequireReauthSheet } from '@/components/auth/require-reauth-sheet'
import { ImportReviewSheet } from '@/components/import-review/import-review-sheet'
import {
  buildPreviewReviewState,
  buildRealInsertTestState,
} from '@/features/import-review/preview-mock-state'
import type { ReviewState } from '@/features/import-review/types'
import { ShareInviteSheet } from '@/components/settings/sheets/share-invite-sheet'
import { EditAvatarSheet } from '@/components/settings/sheets/edit-avatar-sheet'
import { EditBufferSheet } from '@/components/settings/sheets/edit-buffer-sheet'
import { EditDisplayNameSheet } from '@/components/settings/sheets/edit-display-name-sheet'
import { EditMyContributionSheet } from '@/components/settings/sheets/edit-my-contribution-sheet'
import { EditCycleConfigSheet } from '@/components/settings/sheets/edit-cycle-config-sheet'
import { EditSavingsPercentSheet } from '@/components/settings/sheets/edit-savings-percent-sheet'
import { ConversionSettingsSheet } from '@/components/settings/sheets/conversion-settings-sheet'
import { MaterialIcons } from '@expo/vector-icons'
import { buildInitialBiometricState } from '@/features/auth/auth-biometric-state'
import { logoutSession } from '@/features/auth/logout'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useIsSuperAdmin } from '@/features/admin/use-super-admin'
import { useProtectionPrompt } from '@/features/auth/use-protection-prompt'
import { useRequireReauth } from '@/features/auth/use-require-reauth'
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
import { useLatestSavingsGoal } from '@/features/savings-goals/use-latest-savings-goal'
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
  authenticateBiometricAccess,
  clearBiometricCredentials,
  getBiometricLoginState,
  saveBiometricCredentials,
  type BiometricLoginState,
} from '@/lib/biometric-auth'
import { triggerHaptic } from '@/lib/haptics'
import { isAnimLogEnabled, setAnimLogEnabled } from '@/lib/dev/anim-log'
import { supabase } from '@/lib/supabase'
import { useAppTheme } from '@/theme/theme-provider'
import { typography } from '@/theme/typography'
import { getErrorMessage } from '@/utils/error-message'
import { currencyFormatter, formatMoneyShort } from '@/utils/money'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { financeToCycleConfig, type FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { formatCycleSummary } from '@/utils/format-cycle-label'

interface SettingsScreenProps {
  userId: string
  familyId: string
  // Legacy familyCode prop removed — invites generate ephemeral codes now.
}

const DISABLED_HINT = 'Solo el dueño puede editar'

export function SettingsScreen({ userId, familyId }: SettingsScreenProps) {
  const router = useRouter()
  const isSuperAdmin = useIsSuperAdmin()
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
  // Entitlement: para advertir al salir de familia si el período libre
  // personal ya venció (al salir caería a bloqueado). Spec §6.6.
  const entitlementQuery = useEntitlement(userId)
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
  // useLatestSavingsGoal (no useSavingsGoal): incluye inactivas. Así
  // el subtitle refleja el estado real ("Desactivada · titulo") cuando
  // la meta existe pero está apagada, en vez de "Sin meta configurada".
  const savingsGoalQuery = useLatestSavingsGoal(familyId)

  const updateDisplayNameMutation = useUpdateDisplayName(userId, familyId)
  const updateAvatarMutation = useUpdateAvatarAnimal(userId, familyId)
  const leaveFamilyMutation = useLeaveCurrentFamily(userId)
  const leaveFamilyReauth = useRequireReauth()
  const convertToSolo = useConvertToSolo(userId)
  const convertToFamily = useConvertToFamily(userId)
  const enablePushMutation = useEnablePushNotifications()
  const hasPushSubscriptionQuery = useHasPushSubscription(familyId, userId)
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId, userId)
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
      localCurrency: dashboard.familyFinanceQuery.data?.local_currency,
      usdRateEnabled: dashboard.familyFinanceQuery.data?.usd_rate_enabled ?? false,
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
      dashboard.familyFinanceQuery.data?.local_currency,
      dashboard.familyFinanceQuery.data?.usd_rate_enabled,
    ],
  )

  // ── Sheet visibility state ────────────────────────────────────
  const [nameSheetOpen, setNameSheetOpen] = useState(false)
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false)
  const [incomeSheetOpen, setIncomeSheetOpen] = useState(false)
  const [cycleConfigSheetOpen, setCycleConfigSheetOpen] = useState(false)
  const [conversionSheetOpen, setConversionSheetOpen] = useState(false)
  const [savingsSheetOpen, setSavingsSheetOpen] = useState(false)
  const [bufferSheetOpen, setBufferSheetOpen] = useState(false)
  const [destroyFamilySheetOpen, setDestroyFamilySheetOpen] = useState(false)
  const [resetAccountSheetOpen, setResetAccountSheetOpen] = useState(false)
  // Preview state lives here so the dates are regenerated relative to
  // "today" each time the user opens the preview, not snapshotted at
  // mount. `null` while closed so the sheet doesn't render with stale
  // rows from a previous open.
  const [importPreviewState, setImportPreviewState] =
    useState<ReviewState | null>(null)
  // Diagnóstico 2026-06-12: mismo wizard pero con inserts REALES
  // (sin previewMode) sobre 5 filas [TEST]. Reproduce el fallo de
  // confirm del import sin necesitar OCR ni build nueva.
  const [importRealTestState, setImportRealTestState] =
    useState<ReviewState | null>(null)

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
    } catch (error) {
      // Dev-only: surface the real error so future Keychain / SecureStore
      // failures are diagnosable. The user-facing alert stays generic.
      if (__DEV__) {
        console.error('[biometric] activation failed:', error)
      }
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

  // Sprint R-3 redesign (2026-06-11): contextual nudge en el group
  // "Acceso rápido" cuando el user no tiene biometric NI PIN. Reemplaza
  // el banner sticky que estaba en el top del home (ver home-screen.tsx).
  // Lock model: con biometric o PIN configurado, Sprints R-1/R-2 cubren
  // background re-lock (5min) e inactivity re-lock (15min). Sin ninguno,
  // el lock layer no existe — esta nudge cubre ese caso edge.
  const protectionPrompt = useProtectionPrompt({
    userId,
    hasSession: Boolean(session),
    hasBiometricCredentials: biometricState.hasSavedCredentials,
    pinIsSet,
    onboardingCompleted: Boolean(profileQuery.data?.onboarding_completed_at),
  })

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

  const handleSaveCurrency = useCallback(
    (value: string) => {
      // No cierra el sheet: el usuario ve el check moverse + la cotización en
      // uso, y cierra cuando quiere (drag / backdrop).
      saveFinanceSnapshot({ ...financeSnapshot, localCurrency: value }, () => {})
    },
    [financeSnapshot, saveFinanceSnapshot],
  )

  const handleToggleUsdRate = useCallback(
    (value: boolean) => {
      saveFinanceSnapshot({ ...financeSnapshot, usdRateEnabled: value }, () => {})
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

  // `runLeaveFamily` ejecuta la mutation. Antes de disparar pedimos un
  // re-auth (PIN o biometría) — salir de un hogar familiar es
  // destructivo y queremos que un dispositivo desbloqueado no pueda
  // hacerlo con un solo tap (Sprint B · B1). El skip-window de 5min
  // del hook evita doble fricción si el user ya re-autenticó hace poco.
  const runLeaveFamily = useCallback(async () => {
    const ok = await leaveFamilyReauth.requireReauth('Salir del hogar')
    if (!ok) return
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
  }, [leaveFamilyMutation, leaveFamilyReauth, router, showError])

  // Reset de cuenta INDIVIDUAL. Una cuenta solo es internamente una `families`
  // kind='solo' con un único miembro, así que el MISMO RPC leave_current_family
  // ya produce el reset deseado: cae en la rama owner-alone → borra la familia
  // (cascade de TODOS los datos financieros) y deja onboarding_completed_at en
  // null → RequireAuth re-entra al onboarding; los tours se re-resetean al
  // completar (useCompleteOnboarding). Reusamos la mutation tal cual; solo cambia
  // el copy del confirm. No hace falta backend nuevo.
  const runResetAccount = useCallback(async () => {
    const ok = await leaveFamilyReauth.requireReauth('Reiniciar mi cuenta')
    if (!ok) return
    leaveFamilyMutation.mutate(undefined, {
      onError: (error: unknown) => {
        void showError(error, 'No se pudo reiniciar la cuenta.')
      },
      onSuccess: () => {
        void triggerHaptic('success')
        setResetAccountSheetOpen(false)
        router.replace('/(app)/onboarding')
      },
    })
  }, [leaveFamilyMutation, leaveFamilyReauth, router, showError])

  const handleConfirmResetAccount = useCallback(() => {
    void triggerHaptic('warning')
    setResetAccountSheetOpen(true)
  }, [])

  const handleConfirmLeave = useCallback(() => {
    if (isOwnerDestroyFlow) {
      void triggerHaptic('warning')
      setDestroyFamilySheetOpen(true)
      return
    }
    // Aviso extra: si su acceso viene del hogar y su período libre
    // personal ya venció, al salir pasa al plan gratuito (bloqueo). Lo
    // comunicamos antes — y de paso implica que re-entrar no reinicia nada.
    const ent = entitlementQuery.data
    const willLoseAccess = ent?.source === 'family' && ent.trialDaysLeft === 0
    const baseMsg =
      'Vas a salir del grupo familiar actual. Tus gastos y configuración compartida quedan con el hogar — sólo se desvincula tu cuenta.'
    const message = willLoseAccess
      ? `${baseMsg}\n\nAdemás, tu período de prueba ya finalizó: al salir pasás al plan gratuito y deberás suscribirte para seguir usando la app.`
      : baseMsg
    Alert.alert(
      'Salir del hogar',
      message,
      [
        { style: 'cancel', text: 'Cancelar' },
        {
          style: 'destructive',
          text: 'Salir',
          onPress: () => void runLeaveFamily(),
        },
      ],
    )
  }, [isOwnerDestroyFlow, runLeaveFamily, entitlementQuery.data])

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
          // Logout va directo a welcome sin pasar por el WarmFernLogo
          // splash. El splash (auth-transition-splash) tiene piso de
          // 3s para la animación de entrada — apropiado para sign-in
          // (esperás el cold-start de queries) pero overkill para sign-out
          // (no hay que esperar nada al final, solo el redirect).
          //
          // El flow ahora: tap Salir → logoutSession corre los clears en
          // paralelo (~200-400ms) → signOut → SIGNED_OUT event →
          // AppEntryGate ve session=null + Keychain limpio →
          // Redirect a /(auth)/welcome direct.
          void logoutSession({
            onError: (error) => void showError(error, 'No se pudo cerrar sesión.'),
            onSuccess: () => router.replace('/'),
          })
        },
      },
    ])
  }, [router, showError])

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

  // Viajes sintéticos de la máquina auth-flow (spec 2026-06-11): corren
  // la máquina REAL con adapters fake (FaceID 2.2s, red 0.9s simuladas)
  // así el bridge/error se validan in-app sin repetir login/kill-app.
  const handleDevJourney = useCallback((journey: DevJourney) => {
    void triggerHaptic('selection')
    runDevJourney(journey)
  }, [])

  // Force-reset: escape hatch para recuperar de un viaje simulado
  // colgado — resetea la máquina y re-instala los adapters reales.
  const handleForceResetAuthFlow = useCallback(() => {
    void triggerHaptic('selection')
    forceResetAuthFlow()
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
  // Logs dev de animaciones/navegación (focus/blur, gate, CountUpText,
  // frame-drops). Default ON en dev; el toggle silencia la consola sin
  // rebuild. In-memory (se resetea al recargar).
  const [animLogsOn, setAnimLogsOn] = useState(isAnimLogEnabled())
  const handleToggleAnimLogs = useCallback((next: boolean) => {
    void triggerHaptic('selection')
    setAnimLogEnabled(next)
    setAnimLogsOn(next)
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
  // Conversión a dólares (toggle + moneda). Sin asumir ARS: la moneda puede ser
  // null (cuenta que todavía no eligió). El rate en uso vive dentro del sheet.
  const usdRateEnabled = financeSnapshot.usdRateEnabled ?? false
  const currencyValue = financeSnapshot.localCurrency ?? null
  const conversionRowValue = !usdRateEnabled
    ? 'Desactivada'
    : (currencyValue ?? 'Elegí tu moneda')
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
    ? savingsGoalQuery.data.isActive
      ? `${savingsGoalQuery.data.emoji} ${savingsGoalQuery.data.title} · ${formatMoneyShort(savingsGoalQuery.data.currentAmount)} / ${formatMoneyShort(savingsGoalQuery.data.goalAmount)}`
      : `Inactiva · ${savingsGoalQuery.data.emoji} ${savingsGoalQuery.data.title}`
    : 'Sin meta configurada'
  const pushValue = !supportsPushActivation
    ? 'Dev build'
    : hasPushSubscriptionQuery.data
      ? 'Activo'
      : 'Activar'
  const themeValue =
    preference === 'system' ? 'Sistema' : preference === 'light' ? 'Claro' : 'Oscuro'

  // Chip de plan/estado para la hero de marca (forest). Derivado del
  // entitlement resuelto server-side. Compliance billing: el copy del
  // trial dice "Acceso completo · N días" — NUNCA "prueba/gratis".
  // Colores forest-safe (claros sobre el verde oscuro en ambos temas);
  // `getStateTokens` en claro usa un verde oscuro que se perdería sobre
  // el forest, así que mapeamos a la paleta clara de los chips del Home.
  const planChip = useMemo<{
    label: string
    fg: string
    bg: string
    border: string
  } | null>(() => {
    const ent = entitlementQuery.data
    if (ent == null) return null
    // Tono → trío de colores forest-safe. positive=mint, neutral=cream
    // tenue, caution=peach (alineado con los chips de la hero del Home).
    const TONES = {
      positive: {
        fg: '#A6EF8F',
        bg: 'rgba(166,239,143,0.16)',
        border: 'rgba(166,239,143,0.42)',
      },
      neutral: {
        fg: 'rgba(242,234,211,0.85)',
        bg: 'rgba(246,251,239,0.10)',
        border: 'rgba(255,255,255,0.18)',
      },
      caution: {
        fg: '#FADFC8',
        bg: 'rgba(242,167,140,0.18)',
        border: 'rgba(242,167,140,0.50)',
      },
    } as const
    // 1) Trial → "Acceso completo · N días" (copy compliant).
    if (ent.source === 'trial') {
      const days = ent.daysLeft ?? 0
      return {
        label: `Acceso completo · ${days} ${days === 1 ? 'día' : 'días'}`,
        ...TONES.positive,
      }
    }
    // 2) Sin acceso o plan gratuito → "Sin plan".
    if (!ent.hasAccess || ent.source === 'free') {
      return { label: 'Sin plan', ...TONES.neutral }
    }
    // 3) Resto (mvp/comped/family/grace/no-renew/active) → variante.
    const variant = membershipVariant(ent)
    const LABELS: Record<string, string> = {
      MVP: 'MVP',
      'CORTESÍA': 'Cortesía',
      'MIEMBRO DEL HOGAR': 'Miembro del hogar',
      'PROBLEMA DE PAGO': 'Problema de pago',
      'NO SE RENOVARÁ': 'No se renueva',
      ACTIVA: 'Activa',
    }
    const label = LABELS[variant.statusLabel] ?? variant.statusLabel
    const tone =
      variant.tone === 'warn'
        ? TONES.caution
        : variant.tone === 'comped'
          ? TONES.neutral
          : TONES.positive
    return { label, ...tone }
  }, [entitlementQuery.data])

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
            {/* J-Auth2: forceful, non-dismissible banner for a pending
                account deletion. Sits ABOVE the hero so it's the first
                thing the user sees on Ajustes. */}
            {profileQuery.data?.deletion_scheduled_at ? (
              <RiseView>
                <CancelDeletionBanner
                  userId={userId}
                  scheduledAt={profileQuery.data.deletion_scheduled_at}
                />
              </RiseView>
            ) : null}
            {/* HERO — card de marca (forest). Mismo lenguaje visual que la
                hero del Home: gradiente forest + campo de partículas detrás
                del contenido. Logo (helecho) arriba-izq + chip de plan/estado
                arriba-der. Texto en tokens claros (heroText/heroMuted). */}
            <RiseView>
              <LinearGradient
                colors={
                  [...theme.colors.heroGradient] as unknown as readonly [
                    string,
                    string,
                    ...string[],
                  ]
                }
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={[styles.heroCard, { borderColor: 'rgba(166,239,143,0.12)' }]}
              >
                {/* Campo de partículas: primer hijo absoluto, detrás del
                    contenido. accent peach (legible sobre el forest). */}
                <CardParticles count={10} accentColor="#F2A78C" />
                {/* Contenido textual envuelto para que el `gap` del card no
                    descoloque el absoluteFill de las partículas. */}
                <View style={styles.heroContent}>
                  {/* Fila superior: logo a la izquierda, chip a la derecha. */}
                  <View style={styles.heroTopRow}>
                    <FernMark variant="cream" size={20} />
                    {planChip ? (
                      <View
                        style={[
                          styles.heroChip,
                          {
                            backgroundColor: planChip.bg,
                            borderColor: planChip.border,
                          },
                        ]}
                      >
                        <View
                          style={[styles.heroChipDot, { backgroundColor: planChip.fg }]}
                        />
                        <Text
                          style={[styles.heroChipText, { color: planChip.fg }]}
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.3}
                        >
                          {planChip.label}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.heroEyebrow, { color: theme.colors.heroAccent }]}>
                    {isSolo ? 'TU CUENTA' : 'TU HOGAR'}
                  </Text>
                  <Text style={[styles.heroTitle, { color: theme.colors.heroText }]}>
                    {displayName.trim() || 'Perfil sin nombre'}
                  </Text>
                  <Text style={[styles.heroSub, { color: theme.colors.heroMuted }]}>
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
                          backgroundColor: 'rgba(166,239,143,0.16)',
                          borderColor: 'rgba(166,239,143,0.35)',
                        },
                      ]}
                    >
                      <MaterialIcons
                        color={theme.colors.heroAccent}
                        name="verified"
                        size={14}
                      />
                      <Text
                        style={[styles.ownerText, { color: theme.colors.heroAccent }]}
                      >
                        Sos el dueño de la familia
                      </Text>
                    </View>
                  ) : role === 'member' ? (
                    <Text style={[styles.memberHint, { color: theme.colors.heroMuted2 }]}>
                      Sos miembro. Solo el dueño puede editar el hogar.
                    </Text>
                  ) : null}
                </View>
              </LinearGradient>
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
            <RiseView delay={140}>
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
                  helper="Mostrá tu saldo convertido a dólares según tu moneda."
                  icon="currency-exchange"
                  label="Cotización en dólares"
                  onPress={() => setConversionSheetOpen(true)}
                  value={conversionRowValue}
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
              <RiseView delay={200}>
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
            <RiseView delay={260}>
              <SettingsGroup title="Metas de ahorro">
                <SettingsRow
                  disabled={!isOwner}
                  disabledHint={DISABLED_HINT}
                  helper={savingsGoalSubtitle}
                  icon="flag"
                  isLast
                  label="Meta"
                  onPress={() => router.push('/(app)/savings-goal')}
                />
              </SettingsGroup>
            </RiseView>

            {/* 4. PLAN DEL HOGAR */}
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

            {/* 5. TU PROGRESO — LOGROS + EDICIONES */}
            <RiseView delay={380}>
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

            {/* 6. ASISTENTE — del acá en adelante todos comparten delay 420
                (aparecen juntos, están below-the-fold). */}
            <RiseView delay={420}>
              <SettingsGroup title="Asistente">
                <SettingsRow
                  icon="auto-awesome"
                  isLast
                  label="Preferencias del asistente"
                  onPress={() => router.push('/settings/asistente' as never)}
                />
              </SettingsGroup>
            </RiseView>

            {/* 7. NOTIFICACIONES */}
            <RiseView delay={420}>
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

            {/* 8. ACCESO RÁPIDO — toggle de biometría sin necesidad de
                cerrar sesión. Permite activar Face ID / huella desde
                acá si el usuario lo declinó en el post-login, o
                desactivarlo (limpia el refresh token guardado). El
                row queda disabled si el dispositivo no tiene
                biometría enrolada.

                Sprint R-3 redesign (2026-06-11): cuando ni biometric ni
                PIN están configurados, el footer del group cambia a un
                tono más claro de recomendación (no de info neutral) +
                link "Recordame mañana" para dismissear 24h. Reemplaza al
                banner sticky que estaba en el top del home. La señal
                ambient en home (gear icon dot) trae al user acá; el
                texto contextual le explica qué hacer. */}
            <RiseView delay={420}>
              <SettingsGroup
                footer={
                  protectionPrompt.visible
                    ? 'Tu cuenta no está protegida. Activá Face ID o creá un PIN para que solo vos puedas entrar.'
                    : biometricState.isAvailable
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
              {protectionPrompt.visible ? (
                <SettingsProtectionDismissRow
                  onPress={() => void protectionPrompt.dismiss()}
                />
              ) : null}
            </RiseView>

            {/* 9. APARIENCIA */}
            <RiseView delay={420}>
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

            {/* 10. ANIMACIONES — user-facing override del flag de
                reduced-motion. 'Auto' (default) respeta accessibility
                + auto-detecta hardware viejo via deviceYearClass<2020;
                'Reducir' fuerza desactivar todos los loops decorativos;
                'Todas' fuerza el motion completo aunque el hardware no
                sea ideal. */}
            <RiseView delay={420}>
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

            {/* 11. AYUDA · TUTORIALES */}
            <RiseView delay={420}>
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

            {/* 12. INFORMACIÓN / ACERCA DE — versión, info legal y soporte.
                La pantalla dedicada centraliza el footer "Hecho con ♥",
                la versión y el contacto que antes estaban dispersos. */}
            <RiseView delay={420}>
              <SettingsGroup title="Información">
                <SettingsRow
                  helper="Versión, política de privacidad, términos y soporte."
                  icon="info-outline"
                  isLast
                  label="Acerca de"
                  onPress={() => router.push('/(app)/settings/about')}
                />
              </SettingsGroup>
            </RiseView>

            {/* 13. FAMILIA + TIPO DE CUENTA + REINICIAR — acciones del
                hogar (incluyendo las destructivas). El ternario isSolo
                queda ATÓMICO. Delays internos relativos: bloque base 420,
                bloques secundarios 440 (mantienen el +20 de stagger). */}
            {!isSolo ? (
            <>
            <RiseView delay={420}>
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
              <RiseView delay={440}>
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
              <>
                <RiseView delay={420}>
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
                <RiseView delay={440}>
                  <SettingsGroup
                    footer="Borra tus gastos, fijos, metas y configuración, y reinicia el onboarding desde cero. No se puede deshacer."
                    title="Reiniciar"
                  >
                    <SettingsRow
                      destructive
                      icon="restart-alt"
                      isLast
                      label="Reiniciar mi cuenta"
                      onPress={handleConfirmResetAccount}
                    />
                  </SettingsGroup>
                </RiseView>
              </>
            )}

            {/* 14. SUPER ADMIN — solo kontosmario@gmail.com. */}
            {isSuperAdmin ? (
              <RiseView delay={420}>
                <SettingsGroup title="Super admin">
                  <SettingsRow
                    helper="Activá acceso MVP (completo, de por vida) por email."
                    icon="admin-panel-settings"
                    isLast
                    label="Cuentas MVP"
                    onPress={() => router.push('/(app)/settings/admin' as never)}
                  />
                </SettingsGroup>
              </RiseView>
            ) : null}

            {/* 15. CUENTA */}
            <RiseView delay={420}>
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
                  // La pantalla dedicada `delete-account` contiene el
                  // disclaimer extendido + el step de re-auth (PIN /
                  // biometría) que antes vivían en el sheet. El sheet
                  // legacy queda como fallback para callers internos.
                  onPress={() => router.push('/(app)/settings/delete-account')}
                />
              </SettingsGroup>
            </RiseView>

            {/* DEV — "sacados de lado": DESARROLLO + FILTRO DEMO al final,
                justo antes del footer, intactos (delays como estaban).
                Solo en builds de desarrollo. */}
            {__DEV__ ? (
              <RiseView delay={320}>
                <SettingsGroup
                  footer="Solo visibles en desarrollo. Útil para iterar animaciones."
                  title="Desarrollo"
                >
                  <SettingsRow
                    helper="Loguea en consola las transiciones entre vistas (focus/blur, gate, CountUpText) + frames caídos por transición. Para diagnosticar saltos/flicker."
                    icon="speed"
                    label="Logs de animaciones"
                    trailing={
                      <Switch
                        accessibilityLabel="Activar logs de animaciones"
                        onValueChange={handleToggleAnimLogs}
                        value={animLogsOn}
                      />
                    }
                  />
                  <SettingsRow
                    helper="Viaje completo de la máquina: probes → Face ID (2.2s) → bridge → soar-away."
                    icon="play-circle-outline"
                    label="Probar viaje · Face ID success"
                    onPress={() => handleDevJourney('faceid-success')}
                  />
                  <SettingsRow
                    helper="Simula cancel del prompt → fallback a login (ver logs [auth-flow])."
                    icon="do-not-disturb"
                    label="Probar viaje · Face ID cancel"
                    onPress={() => handleDevJourney('faceid-cancel')}
                  />
                  <SettingsRow
                    helper="Simula snapshot fallido → bridge-error con Reintentar."
                    icon="wifi-off"
                    label="Probar viaje · error de red"
                    onPress={() => handleDevJourney('network-error')}
                  />
                  <SettingsRow
                    helper="Resetea la máquina auth-flow y re-instala adapters reales (recuperar de un viaje colgado)."
                    icon="cancel"
                    label="Forzar reset del flujo auth"
                    onPress={handleForceResetAuthFlow}
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
                    label="Preview · Cierre de ciclo"
                    onPress={() => router.push('/(app)/settings/dev/cycle-wrapped' as never)}
                  />
                  <SettingsRow
                    helper="Abrí el wizard de revisión con 5 movimientos de muestra para iterar la UI sin esperar un build. Nada se guarda."
                    icon="preview"
                    label="Vista previa: wizard de importación"
                    onPress={() => {
                      setImportPreviewState(buildPreviewReviewState())
                    }}
                  />
                  <SettingsRow
                    helper="Diagnóstico: mismo wizard pero el confirm INSERTA de verdad (5 filas [TEST], montos 111-555). Borralas después desde Gastos."
                    icon="bug-report"
                    isLast
                    label="Test import: carga REAL con mocks"
                    onPress={() => {
                      setImportRealTestState(buildRealInsertTestState())
                    }}
                  />
                </SettingsGroup>
              </RiseView>
            ) : null}

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

            {/* Footer de versión — queda último. */}
            <RiseView delay={420}>
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
      <ConversionSettingsSheet
        currency={currencyValue}
        enabled={usdRateEnabled}
        isSaving={upsertFamilyFinanceMutation.isPending}
        onClose={() => setConversionSheetOpen(false)}
        onSelectCurrency={handleSaveCurrency}
        onToggle={handleToggleUsdRate}
        visible={conversionSheetOpen}
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
        onConfirm={() => void runLeaveFamily()}
        otherActiveMembers={otherActiveMembers}
        visible={destroyFamilySheetOpen}
      />
      <DestroyFamilyConfirmSheet
        isSubmitting={leaveFamilyMutation.isPending}
        mode="account"
        onCancel={() => {
          if (leaveFamilyMutation.isPending) return
          setResetAccountSheetOpen(false)
        }}
        onConfirm={() => void runResetAccount()}
        otherActiveMembers={0}
        visible={resetAccountSheetOpen}
      />
      <RequireReauthSheet
        visible={leaveFamilyReauth.isVisible}
        actionLabel={leaveFamilyReauth.actionLabel}
        onConfirmed={leaveFamilyReauth.onConfirmed}
        onCancel={leaveFamilyReauth.onCancel}
      />
<ImportReviewSheet
        visible={importPreviewState !== null}
        initialState={importPreviewState}
        familyId={familyId}
        userId={userId}
        onClose={() => setImportPreviewState(null)}
        previewMode
      />
      <ImportReviewSheet
        visible={importRealTestState !== null}
        initialState={importRealTestState}
        familyId={familyId}
        userId={userId}
        onClose={() => setImportRealTestState(null)}
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
    // Clipea el campo de partículas al bounding box del card.
    overflow: 'hidden',
  },
  // Envuelve el contenido textual: como el card aloja también el
  // absoluteFill de las partículas, el `gap` vive acá (no en el card)
  // para no descolocar el fondo de partículas.
  heroContent: {
    gap: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    flexShrink: 1,
  },
  heroChipDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  heroChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
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
