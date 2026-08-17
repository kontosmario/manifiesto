import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  forceResetAuthFlow,
  runDevJourney,
  type DevJourney,
} from '@/features/auth-flow/dev-journeys'
import { resetIntroSeen } from '@/features/onboarding-intro/intro-seen'
import { useFocusEffect } from '@react-navigation/native'
import { Alert, Linking, Platform, StyleSheet, Switch, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import * as StoreReview from 'expo-store-review'
import Constants from 'expo-constants'
import * as Application from 'expo-application'
import { useRouter } from 'expo-router'
import { RiseView, RiseViewGate } from '@/components/home/animated/rise-view'
import { FernMark } from '@/components/billing/fern-mark'
import { membershipVariant } from '@/features/billing/membership-state'
import { useIsNavigationSettled } from '@/hooks/use-is-navigation-settled'
import { NeoStateBlock } from '@/components/ui/neo-state-block'
import { Screen } from '@/components/ui/screen'
import { CancelDeletionBanner } from '@/components/common/cancel-deletion-banner'
import { neoTokens } from '@/theme/neo-tokens'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/settings-grouped-list'
import {
  SettingsHeroCard,
  settingsHeroInk,
} from '@/components/settings/settings-hero-card'
import { SettingsProtectionDismissRow } from '@/components/settings/protection-dismiss-row'
import { DestroyFamilyConfirmSheet } from '@/components/settings/sheets/destroy-family-confirm-sheet'
import { RequireReauthSheet } from '@/components/auth/require-reauth-sheet'
import { ImportReviewSheet } from '@/components/import-review/import-review-sheet'
import {
  buildPreviewReviewState,
  buildReceiptPreviewState,
  buildRealInsertTestState,
} from '@/features/import-review/preview-mock-state'
import type { ReviewState } from '@/features/import-review/types'
import { EditAvatarSheet } from '@/components/settings/sheets/edit-avatar-sheet'
import { EditDisplayNameSheet } from '@/components/settings/sheets/edit-display-name-sheet'
import { MaterialIcons } from '@expo/vector-icons'
import { buildInitialBiometricState } from '@/features/auth/auth-biometric-state'
import { logoutSession } from '@/features/auth/logout'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useIsSuperAdmin } from '@/features/admin/use-super-admin'
import { useProtectionPrompt } from '@/features/auth/use-protection-prompt'
import { useRequireReauth } from '@/features/auth/use-require-reauth'
import { useMotionPreferenceControls } from '@/features/preferences/motion-preference-provider'
import { useLeaveCurrentFamily } from '@/features/family/use-family-actions'
import { useFamilyMemberStats } from '@/features/family/use-family-admin'
import { useIsSolo } from '@/features/family/use-is-solo'
import { useMyFamilyRole } from '@/features/family/use-my-family-role'
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
import { goalEmojiText } from '@/features/savings-goals/goal-icon'
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
import { neoConfirm } from '@/lib/confirm-bus'
import { toast } from '@/lib/toast-bus'
import { triggerHaptic } from '@/lib/haptics'
import { isAnimLogEnabled, setAnimLogEnabled } from '@/lib/dev/anim-log'
import { supabase } from '@/lib/supabase'
import { useAppTheme } from '@/theme/theme-provider'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '@/features/preferences/language-provider'
import { useFontScale } from '@/features/preferences/font-scale-provider'
import { nunitoFamily, typography } from '@/theme/typography'
import { getErrorMessage } from '@/utils/error-message'
import { currencyFormatter, formatMoneyShort } from '@/utils/money'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { requestAppRating } from '@/features/settings/rate-app'
import { APP_STORE_REVIEW_URL } from '@/lib/legal-urls'

interface SettingsScreenProps {
  userId: string
  familyId: string
  // Legacy familyCode prop removed — invites generate ephemeral codes now.
}


export function SettingsScreen({ userId, familyId }: SettingsScreenProps) {
  const router = useRouter()
  const isSuperAdmin = useIsSuperAdmin()
  const isNavSettled = useIsNavigationSettled()
  const { preference, setPreference, theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const { t } = useTranslation()
  const DISABLED_HINT = t('settings:settingsScreen.disabledHint')
  const {
    preference: langPreference,
    setPreference: setLangPreference,
    language,
  } = useLanguage()
  const {
    preference: fontScalePreference,
    setPreference: setFontScalePreference,
  } = useFontScale()
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
  const totalMembers = (memberStatsQuery.data ?? []).length
  // useLatestSavingsGoal (no useSavingsGoal): incluye inactivas. Así
  // el subtitle refleja el estado real ("Desactivada · titulo") cuando
  // la meta existe pero está apagada, en vez de "Sin meta configurada".
  const savingsGoalQuery = useLatestSavingsGoal(familyId)

  const updateDisplayNameMutation = useUpdateDisplayName(userId, familyId)
  const updateAvatarMutation = useUpdateAvatarAnimal(userId, familyId)
  const leaveFamilyMutation = useLeaveCurrentFamily(userId)
  const leaveFamilyReauth = useRequireReauth()
  const enablePushMutation = useEnablePushNotifications()
  const hasPushSubscriptionQuery = useHasPushSubscription(familyId, userId)
  const tourResets = useResetTourSeen()

  // ── Sheet visibility state ────────────────────────────────────
  const [nameSheetOpen, setNameSheetOpen] = useState(false)
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false)
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
      toast.error(t('settings:biometric.unavailableMessage', {
          method: biometricState.label.toLowerCase(),
        }))
      return
    }
    if (!userEmail) {
      toast.info(t('settings:biometric.invalidSessionMessage'))
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
        promptMessage: t('settings:biometric.activatePrompt', {
          method: biometricState.label,
        }),
      })
      if (!biometricResult.success) {
        return
      }
      const sessionResponse = await supabase.auth.getSession()
      const refreshToken = sessionResponse.data.session?.refresh_token
      if (!refreshToken) {
        toast.info(t('settings:biometric.noSessionMessage'))
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
      toast.error(t('settings:biometric.saveFailedMessage'))
    } finally {
      setBiometricBusy(false)
    }
  }, [biometricState, isBiometricBusy, userEmail, t])

  const biometricRowValue = !biometricState.isAvailable
    ? t('settings:rowValue.unavailable')
    : biometricState.hasSavedCredentials
      ? t('settings:rowValue.enabled')
      : t('settings:rowValue.disabled')

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
    // ÚNICO Alert.alert que sobrevive en Ajustes tras el pase a neumorfismo
    // (2026-08-05). No es una confirmación: es un MENÚ de tres opciones
    // (cambiar / quitar / cancelar), y `neoConfirm` es binario por diseño.
    // Convertirlo pide un action sheet propio en material neo, del estilo de
    // `member-action-sheet`. Hasta entonces queda el diálogo del sistema —
    // feo pero funcional, y preferible a inventar un flujo binario que
    // esconda una de las dos acciones.
    Alert.alert(t('settings:pin.title'), t('settings:pin.prompt'), [
      { text: t('settings:pin.change'), onPress: () => router.push('/(app)/pin-setup') },
      {
        text: t('settings:pin.remove'),
        style: 'destructive',
        onPress: async () => {
          const { clearPin } = await import('@/lib/pin-lock')
          await clearPin()
          await refreshPinState()
        },
      },
      { text: t('common:actions.cancel'), style: 'cancel' },
    ])
  }, [pinIsSet, router, refreshPinState, t])

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

  // Sin deps: el toast recibe el mensaje ya resuelto por el caller, así que
  // `t` dejó de usarse acá cuando el Alert nativo (que armaba su propio título
  // traducido) pasó a ser un toast.
  const showError = useCallback(async (error: unknown, fallbackMessage: string) => {
    await triggerHaptic('error')
    toast.error(getErrorMessage(error, fallbackMessage))
  }, [])

  const saveProfile = useCallback(
    (nextDisplayName: string) => {
      updateDisplayNameMutation.mutate(nextDisplayName, {
        onSuccess: () => {
          void triggerHaptic('success')
          setNameSheetOpen(false)
        },
        onError: (error: unknown) => {
          void showError(error, t('settings:errors.updateName'))
        },
      })
    },
    [showError, updateDisplayNameMutation, t],
  )

  const saveAvatar = useCallback(
    (slug: string) => {
      updateAvatarMutation.mutate(slug, {
        onSuccess: () => {
          void triggerHaptic('success')
          setAvatarSheetOpen(false)
        },
        onError: (error: unknown) => {
          void showError(error, t('settings:errors.updateAvatar'))
        },
      })
    },
    [showError, updateAvatarMutation, t],
  )

  // "Calificar Manifiesto" — modal nativo de rating cuando el sistema
  // lo permite (iOS lo racionea ~3/año), deep link al compositor de
  // reseña como fallback garantizado. Política pura en rate-app.ts.
  const handleRateApp = useCallback(() => {
    void (async () => {
      try {
        await requestAppRating({
          isAvailable: () => StoreReview.isAvailableAsync(),
          requestReview: () => StoreReview.requestReview(),
          openReviewUrl: () => Linking.openURL(APP_STORE_REVIEW_URL),
        })
      } catch {
        toast.error(t('settings:rate.errorBody'))
      }
    })()
  }, [t])

  const handlePushActivation = useCallback(() => {
    if (!supportsRemotePushNotifications) {
      toast.info(t('settings:push.devBuildMessage'))
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
          void showError(error, t('settings:errors.enablePush'))
        },
      },
    )
  }, [enablePushMutation, familyId, hasPushSubscriptionQuery, showError, userId, t])

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

  // Reset de cuenta INDIVIDUAL. Una cuenta solo es internamente una `families`
  // kind='solo' con un único miembro, así que el MISMO RPC leave_current_family
  // ya produce el reset deseado: cae en la rama owner-alone → borra la familia
  // (cascade de TODOS los datos financieros) y deja onboarding_completed_at en
  // null → RequireAuth re-entra al onboarding; los tours se re-resetean al
  // completar (useCompleteOnboarding). Reusamos la mutation tal cual; solo cambia
  // el copy del confirm. No hace falta backend nuevo.
  const runResetAccount = useCallback(async () => {
    const ok = await leaveFamilyReauth.requireReauth(t('settings:resetAccount.title'))
    if (!ok) return
    leaveFamilyMutation.mutate(undefined, {
      onError: (error: unknown) => {
        void showError(error, t('settings:errors.resetAccount'))
      },
      onSuccess: () => {
        void triggerHaptic('success')
        setResetAccountSheetOpen(false)
        router.replace('/(app)/onboarding')
      },
    })
  }, [leaveFamilyMutation, leaveFamilyReauth, router, showError, t])

  const handleConfirmResetAccount = useCallback(() => {
    void triggerHaptic('warning')
    setResetAccountSheetOpen(true)
  }, [])

  const handleConfirmLogout = useCallback(() => {
    void (async () => {
      const confirmed = await neoConfirm(t('settings:logout.title'), {
        confirmLabel: t('settings:leaveHousehold.leave'),
        message: t('settings:logout.message'),
        tone: 'destructive',
      })
      if (confirmed) {
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
          onError: (error) => void showError(error, t('settings:errors.logout')),
          onSuccess: () => router.replace('/'),
        })
      }
    })()
  }, [router, showError, t])

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

  // Reinicia el flag device-local del intro pre-auth → el showcase de 5
  // slides vuelve a mostrarse en el próximo arranque SIN sesión (cerrar
  // sesión y volver como guest lo dispara). No cierra sesión por sí solo.
  const handleResetIntroSeen = useCallback(() => {
    void triggerHaptic('selection')
    void resetIntroSeen().then(() => {
      // @i18n-ignore: aviso dev-only (botón gateado por __DEV__, no user-facing)
      toast.success('Intro pre-auth reiniciado. Cerrá sesión para ver el showcase.')
    })
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
  const savingsGoalSubtitle = savingsGoalQuery.data
    ? savingsGoalQuery.data.isActive
      ? `${goalEmojiText(savingsGoalQuery.data.emoji)} ${savingsGoalQuery.data.title} · ${formatMoneyShort(savingsGoalQuery.data.currentAmount)} / ${formatMoneyShort(savingsGoalQuery.data.goalAmount)}`.replace(/\s{2,}/g, ' ').trim()
      : t('settings:savingsGoal.inactiveSubtitle', {
          emoji: goalEmojiText(savingsGoalQuery.data.emoji),
          title: savingsGoalQuery.data.title,
        }).replace(/\s{2,}/g, ' ').trim()
    : t('settings:savingsGoal.noGoal')
  const pushValue = !supportsPushActivation
    ? t('settings:push.devBuildValue')
    : hasPushSubscriptionQuery.data
      ? t('settings:push.active')
      : t('settings:push.activate')
  const themeValue =
    preference === 'system'
      ? t('settings:theme.system')
      : preference === 'light'
        ? t('settings:theme.light')
        : t('settings:theme.dark')

  // Chip de plan/estado para la hero de marca (forest). Derivado del
  // entitlement resuelto server-side. Compliance billing: el copy del
  // trial dice "Acceso completo · N días" — NUNCA "prueba/gratis".
  // Colores forest-safe (claros sobre el verde oscuro en ambos temas);
  // `getStateTokens` en claro usa un verde oscuro que se perdería sobre
  // el forest, así que mapeamos a la paleta clara de los chips del Home.
  const planChip = useMemo<{
    label: string
    fg: string
  } | null>(() => {
    const ent = entitlementQuery.data
    if (ent == null) return null
    // El chip se apoya SIEMPRE en el pozo oscuro del hero (`chipBackground`),
    // no en un tinte del propio tono: sobre un tinte claro la tinta crema cae
    // a 3.78:1 contra el stop más claro del forest, y el label son 10px.
    // Sobre el pozo, la tinta más floja del trío queda en 6.15:1.
    const TONES = {
      positive: { fg: settingsHeroInk.chipAccentInk },
      neutral: { fg: settingsHeroInk.chipInk },
      caution: { fg: settingsHeroInk.chipCautionInk },
    } as const
    // 1) Trial → "Acceso completo · N días" (copy compliant).
    if (ent.source === 'trial') {
      const days = ent.daysLeft ?? 0
      return {
        label: t('settings:planChip.trial', { count: days }),
        ...TONES.positive,
      }
    }
    // 2) Sin acceso o plan gratuito → "Sin plan".
    if (!ent.hasAccess || ent.source === 'free') {
      return { label: t('settings:planChip.noPlan'), ...TONES.neutral }
    }
    // 3) Resto (mvp/comped/family/grace/no-renew/active) → variante.
    const variant = membershipVariant(ent)
    const LABELS: Record<string, string> = {
      MVP: t('settings:planChip.mvp'),
      'CORTESÍA': t('settings:planChip.comped'),
      'MIEMBRO DEL HOGAR': t('settings:planChip.member'),
      'PROBLEMA DE PAGO': t('settings:planChip.paymentIssue'),
      'NO SE RENOVARÁ': t('settings:planChip.noRenew'),
      ACTIVA: t('settings:planChip.active'),
    }
    const label = LABELS[variant.statusLabel] ?? variant.statusLabel
    const tone =
      variant.tone === 'warn'
        ? TONES.caution
        : variant.tone === 'comped'
          ? TONES.neutral
          : TONES.positive
    return { label, ...tone }
  }, [entitlementQuery.data, t])

  return (
    <Screen
      backgroundColor={neo.bg}
      canGoBack
      contentContainerStyle={styles.screenContent}
      titleColor={neo.text}
      subtitle={
        isSolo
          ? t('settings:screen.subtitleSolo')
          : t('settings:screen.subtitleFamily')
      }
      title={t('settings:screen.title')}
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
        {shouldShowErrorState ? (
          <NeoStateBlock
            actionLabel={t('states:errorState.action')}
            description={getErrorMessage(
              settingsLoadError,
              isSolo
                ? t('settings:loadError.descriptionSolo')
                : t('settings:loadError.descriptionFamily'),
            )}
            icon="error-outline"
            title={t('settings:loadError.title')}
            tone="error"
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
            {/* HERO — card de marca (forest). Mismo material que los heros de
                Inicio/Gastos/Fijos/Control. Logo (helecho) arriba-izq + chip
                de plan/estado arriba-der. */}
            <RiseView>
              <SettingsHeroCard style={styles.heroCard}>
                {/* Fila superior: logo a la izquierda, chip a la derecha. */}
                <View style={styles.heroTopRow}>
                  <FernMark variant="cream" size={20} />
                  {planChip ? (
                    <View
                      style={[
                        styles.heroChip,
                        { backgroundColor: settingsHeroInk.chipBackground },
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
                <Text style={[styles.heroEyebrow, { color: settingsHeroInk.accent }]}>
                  {isSolo ? t('settings:hero.eyebrowSolo') : t('settings:hero.eyebrowFamily')}
                </Text>
                <Text style={[styles.heroTitle, { color: settingsHeroInk.title }]}>
                  {displayName.trim() || t('settings:hero.unnamedProfile')}
                </Text>
                <Text style={[styles.heroSub, { color: settingsHeroInk.soft }]}>
                  {isSolo
                    ? t('settings:hero.personalAccount')
                    : totalMembers === 1
                      ? t('settings:hero.soloHousehold')
                      : t('settings:hero.householdOfN', { count: totalMembers })}
                </Text>
                {isOwner && !isSolo ? (
                  <View
                    style={[
                      styles.ownerPill,
                      { backgroundColor: settingsHeroInk.chipBackground },
                    ]}
                  >
                    <MaterialIcons
                      color={settingsHeroInk.chipAccentInk}
                      name="verified"
                      size={14}
                    />
                    <Text style={[styles.ownerText, { color: settingsHeroInk.chipAccentInk }]}>
                      {t('settings:hero.ownerPill')}
                    </Text>
                  </View>
                ) : role === 'member' ? (
                  <Text style={[styles.memberHint, { color: settingsHeroInk.soft }]}>
                    {t('settings:hero.memberHint')}
                  </Text>
                ) : null}
              </SettingsHeroCard>
            </RiseView>

            {/* 1. PERFIL */}
            <RiseView delay={80}>
              <SettingsGroup title={t('settings:profile.title')}>
                <SettingsRow
                  icon="person"
                  label={t('settings:profile.displayName')}
                  onPress={() => setNameSheetOpen(true)}
                  value={displayName.trim() || t('settings:rowValue.define')}
                />
                <SettingsRow
                  icon="face"
                  label={t('settings:profile.avatar')}
                  onPress={() => setAvatarSheetOpen(true)}
                  value={profileQuery.data?.avatar_animal ?? t('settings:rowValue.choose')}
                />
                <SettingsRow
                  icon="mail-outline"
                  isLast
                  label={t('settings:profile.email')}
                  value={session?.user.email ?? t('settings:profile.noEmail')}
                />
              </SettingsGroup>
            </RiseView>

            {/* 2. MI HOGAR — fila PUENTE. El dinero del hogar (aporte, ciclo,
                % de ahorro, colchón diario, cotización), el roster de
                integrantes y las acciones destructivas del hogar viven desde
                el 2026-08-17 en la sección "Mi hogar" (`/(app)/household`).
                Acá queda sólo la puerta de entrada. */}
            <RiseView delay={140}>
              <SettingsGroup title={t('settings:myHome.bridgeGroupTitle')}>
                <SettingsRow
                  helper={
                    isSolo
                      ? t('settings:myHome.bridgeHelperSolo')
                      : t('settings:myHome.bridgeHelper')
                  }
                  icon="home"
                  isLast
                  label={t('settings:myHome.bridgeLabel')}
                  onPress={() => router.push('/(app)/household')}
                />
              </SettingsGroup>
            </RiseView>

            {/* 2b. RESERVA ACUMULADA — solo visible si hay reserva > 0.
                Read-only: la única forma de tocar este monto es vía la
                decisión "Guardar como reserva" del wrapped de cierre
                de mes (Spec B). Surface aquí para que la plata no
                desaparezca visualmente del Settings. */}
            {Number(dashboard.familyFinanceQuery.data?.monthly_reserve_amount ?? 0) > 0 ? (
              <RiseView delay={200}>
                <SettingsGroup title={t('settings:reserve.title')}>
                  <View style={styles.reserveInner}>
                    {/* La reserva no tiene techo: a 28px un monto de ocho
                        cifras ya no entra en el ancho de la card. Encoge
                        antes de partirse en dos renglones. */}
                    <Text
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      numberOfLines={1}
                      style={[styles.reserveAmount, { color: neo.text }]}
                      maxFontSizeMultiplier={1.4}
                    >
                      {currencyFormatter.format(
                        Number(
                          dashboard.familyFinanceQuery.data?.monthly_reserve_amount ?? 0,
                        ),
                      )}
                    </Text>
                    <Text
                      style={[styles.reserveSub, { color: neo.textMuted }]}
                    >
                      {t('settings:reserve.subtitle')}
                    </Text>
                  </View>
                </SettingsGroup>
              </RiseView>
            ) : null}

            {/* 3. META DE AHORRO */}
            <RiseView delay={260}>
              <SettingsGroup title={t('settings:savingsGoal.groupTitle')}>
                <SettingsRow
                  disabled={!isOwner}
                  disabledHint={DISABLED_HINT}
                  helper={savingsGoalSubtitle}
                  icon="flag"
                  isLast
                  label={t('settings:savingsGoal.rowLabel')}
                  onPress={() => router.push('/(app)/savings-goal')}
                />
              </SettingsGroup>
            </RiseView>

            {/* 4. PLAN DEL HOGAR */}
            <RiseView delay={320}>
              <SettingsGroup title={t('settings:plan.groupTitle')}>
                <SettingsRow
                  helper={t('settings:plan.helper')}
                  icon="workspace-premium"
                  isLast
                  label={t('settings:plan.rowLabel')}
                  onPress={() => router.push('/settings/plan' as never)}
                  value={t('settings:plan.rowValue')}
                />
              </SettingsGroup>
            </RiseView>

            {/* 5. TU PROGRESO — LOGROS + EDICIONES */}
            <RiseView delay={380}>
              <SettingsGroup title={t('settings:progress.groupTitle')}>
                <SettingsRow
                  helper={t('settings:progress.achievementsHelper')}
                  icon="emoji-events"
                  label={t('settings:progress.achievements')}
                  onPress={() => router.push('/settings/achievements' as never)}
                  value={t('settings:progress.achievementsValue')}
                />
                <SettingsRow
                  helper={t('settings:progress.editionsHelper')}
                  icon="auto-stories"
                  isLast
                  label={t('settings:progress.editions')}
                  onPress={() => router.push('/settings/editions' as never)}
                  value={t('settings:progress.editionsValue')}
                />
              </SettingsGroup>
            </RiseView>

            {/* 6. ASISTENTE — del aquí en adelante todos comparten delay 420
                (aparecen juntos, están below-the-fold). */}
            <RiseView delay={420}>
              <SettingsGroup title={t('settings:assistant.groupTitle')}>
                <SettingsRow
                  icon="auto-awesome"
                  isLast
                  label={t('settings:assistant.preferences')}
                  onPress={() => router.push('/settings/asistente' as never)}
                />
              </SettingsGroup>
            </RiseView>

            {/* 6b. GASTOS CON APPLE PAY — sólo iOS. La automatización la
                arma el usuario en Atajos de Apple y Android no tiene
                equivalente, así que en Android la fila no existe (no se
                deshabilita: no hay nada que habilitar). */}
            {Platform.OS === 'ios' ? (
              <RiseView delay={420}>
                <SettingsGroup title={t('settings:applePay.groupTitle')}>
                  <SettingsRow
                    helper={t('settings:applePay.rowHelper')}
                    icon="contactless"
                    isLast
                    label={t('settings:applePay.rowLabel')}
                    onPress={() => router.push('/(app)/settings/apple-pay' as never)}
                  />
                </SettingsGroup>
              </RiseView>
            ) : null}

            {/* 7. NOTIFICACIONES */}
            <RiseView delay={420}>
              <SettingsGroup title={t('settings:notifications.groupTitle')}>
                <SettingsRow
                  icon="tune"
                  label={t('settings:notifications.manage')}
                  onPress={() => router.push('/settings/notifications' as never)}
                />
                <SettingsRow
                  icon="notifications-active"
                  isLast
                  isLoading={supportsPushActivation && enablePushMutation.isPending}
                  label={t('settings:notifications.enablePush')}
                  onPress={handlePushActivation}
                  value={pushValue}
                />
              </SettingsGroup>
            </RiseView>

            {/* 8. ACCESO RÁPIDO — toggle de biometría sin necesidad de
                cerrar sesión. Permite activar Face ID / huella desde
                aquí si el usuario lo declinó en el post-login, o
                desactivarlo (limpia el refresh token guardado). El
                row queda disabled si el dispositivo no tiene
                biometría enrolada.

                Sprint R-3 redesign (2026-06-11): cuando ni biometric ni
                PIN están configurados, el footer del group cambia a un
                tono más claro de recomendación (no de info neutral) +
                link "Recordame mañana" para dismissear 24h. Reemplaza al
                banner sticky que estaba en el top del home. La señal
                ambient en home (gear icon dot) trae al user aquí; el
                texto contextual le explica qué hacer. */}
            <RiseView delay={420}>
              <SettingsGroup
                footer={
                  protectionPrompt.visible
                    ? t('settings:fastAccess.unprotectedFooter')
                    : biometricState.isAvailable
                      ? t('settings:fastAccess.availableFooter', { method: biometricState.label })
                      : t('settings:fastAccess.unavailableFooter', {
                          method: biometricState.label.toLowerCase(),
                        })
                }
                title={t('settings:fastAccess.groupTitle')}
              >
                <SettingsRow
                  disabled={!biometricState.isAvailable}
                  icon="fingerprint"
                  isLoading={isBiometricBusy}
                  label={t('settings:fastAccess.enterWith', { method: biometricState.label })}
                  onPress={handleBiometricToggle}
                  value={biometricRowValue}
                />
                <SettingsRow
                  icon="dialpad"
                  isLast
                  label={t('settings:fastAccess.pinLabel')}
                  onPress={handlePinPress}
                  value={pinIsSet ? t('settings:rowValue.enabled') : t('settings:rowValue.disabled')}
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
              <SettingsGroup footer={t('settings:theme.footer', { theme: themeValue })} title={t('settings:theme.groupTitle')}>
                <View style={styles.appearanceInner}>
                  <SegmentedControl
                    onChange={setPreference}
                    options={[
                      { label: t('settings:theme.system'), value: 'system' },
                      { label: t('settings:theme.light'), value: 'light' },
                      { label: t('settings:theme.dark'), value: 'dark' },
                    ]}
                    skin="neo"
                    value={preference}
                  />
                </View>
              </SettingsGroup>
            </RiseView>

            {/* 9b. IDIOMA — ES/EN con default al sistema. 'Español'/'English'
                son endónimos (no se traducen); 'Sistema' sí. Es la primera
                superficie dogfoodeando i18n. */}
            <RiseView delay={420}>
              <SettingsGroup
                footer={t('settings:language.footer', {
                  lang: language === 'en' ? 'English' : 'Español',
                })}
                title={t('settings:language.title')}
              >
                <View style={styles.appearanceInner}>
                  <SegmentedControl
                    onChange={setLangPreference}
                    options={[
                      { label: t('settings:language.system'), value: 'system' },
                      { label: 'Español', value: 'es' },
                      { label: 'English', value: 'en' },
                    ]}
                    skin="neo"
                    value={langPreference}
                  />
                </View>
              </SettingsGroup>
            </RiseView>

            {/* 9c. TAMAÑO DEL TEXTO — escala propia de la app, desacoplada del
                fontScale del OS (el escalado nativo rompía la UI). Sin opción
                «Sistema» a propósito: el texto responde SOLO a esta
                preferencia. El cambio es en vivo y esta misma pantalla es el
                preview (la etiqueta del control también escala).
                Ver docs/superpowers/specs/2026-08-14-font-scale-app-design.md. */}
            <RiseView delay={420}>
              <SettingsGroup
                footer={t('settings:fontSize.footer')}
                title={t('settings:fontSize.groupTitle')}
              >
                <View style={styles.appearanceInner}>
                  <SegmentedControl
                    onChange={setFontScalePreference}
                    options={[
                      { label: t('settings:fontSize.sm'), value: 'sm' },
                      { label: t('settings:fontSize.md'), value: 'md' },
                      { label: t('settings:fontSize.lg'), value: 'lg' },
                      { label: t('settings:fontSize.xl'), value: 'xl' },
                    ]}
                    skin="neo"
                    value={fontScalePreference}
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
                    ? t('settings:motion.footerAlways')
                    : motionPreference === 'never'
                      ? t('settings:motion.footerNever')
                      : t('settings:motion.footerAuto')
                }
                title={t('settings:motion.groupTitle')}
              >
                <View style={styles.appearanceInner}>
                  <SegmentedControl
                    onChange={setMotionPreference}
                    options={[
                      { label: t('settings:motion.reduce'), value: 'always' },
                      { label: t('settings:motion.auto'), value: 'auto' },
                      { label: t('settings:motion.all'), value: 'never' },
                    ]}
                    skin="neo"
                    value={motionPreference}
                  />
                </View>
              </SettingsGroup>
            </RiseView>

            {/* 11. AYUDA · TUTORIALES */}
            <RiseView delay={420}>
              <SettingsGroup
                title={t('settings:help.groupTitle')}
                footer={t('settings:help.footer')}
              >
                <SettingsRow
                  icon="home"
                  label={t('settings:help.tutorialHome')}
                  onPress={() => void handleRewatchTour(TOUR_KEYS.home)}
                />
                <SettingsRow
                  icon="receipt-long"
                  label={t('settings:help.tutorialExpenses')}
                  onPress={() => void handleRewatchTour(TOUR_KEYS.gastos)}
                />
                <SettingsRow
                  icon="event-repeat"
                  label={t('settings:help.tutorialFixed')}
                  onPress={() => void handleRewatchTour(TOUR_KEYS.fijos)}
                />
                <SettingsRow
                  icon="insights"
                  label={t('settings:help.tutorialControl')}
                  onPress={() => void handleRewatchTour(TOUR_KEYS.control)}
                />
                <SettingsRow
                  icon="restart-alt"
                  label={t('settings:help.rewatchAll')}
                  helper={t('settings:help.rewatchAllHelper')}
                  onPress={() => void handleResetAllTours()}
                  isLast
                />
              </SettingsGroup>
            </RiseView>

            {/* 12. INFORMACIÓN / ACERCA DE — versión, info legal y soporte.
                La pantalla dedicada centraliza el footer "Hecho con ♥",
                la versión y el contacto que antes estaban dispersos. */}
            <RiseView delay={420}>
              <SettingsGroup title={t('settings:info.groupTitle')}>
                <SettingsRow
                  helper={t('settings:info.aboutHelper')}
                  icon="info-outline"
                  label={t('settings:info.about')}
                  onPress={() => router.push('/(app)/settings/about')}
                />
                <SettingsRow
                  helper={t('settings:rate.helper')}
                  icon="star-outline"
                  isLast
                  label={t('settings:rate.rowLabel')}
                  onPress={handleRateApp}
                />
              </SettingsGroup>
            </RiseView>

            {/* 13. REINICIAR MI CUENTA — sólo en modo solo. Es una acción de
                CUENTA (borra todo y vuelve al onboarding), no del hogar, así
                que se queda acá. Todo lo que era del hogar —invitar, gestionar
                integrantes, salir/eliminar, pasar a individual o a compartido—
                se mudó a "Mi hogar". */}
            {isSolo ? (
              <RiseView delay={440}>
                <SettingsGroup
                  footer={t('settings:resetAccount.footer')}
                  title={t('settings:resetAccount.groupTitle')}
                >
                  <SettingsRow
                    destructive
                    icon="restart-alt"
                    isLast
                    label={t('settings:resetAccount.rowLabel')}
                    onPress={handleConfirmResetAccount}
                  />
                </SettingsGroup>
              </RiseView>
            ) : null}

            {/* 14. SUPER ADMIN — solo kontosmario@gmail.com. */}
            {isSuperAdmin ? (
              <RiseView delay={420}>
                <SettingsGroup title={t('settings:superAdmin.groupTitle')}>
                  <SettingsRow
                    helper={t('settings:superAdmin.helper')}
                    icon="admin-panel-settings"
                    isLast
                    label={t('settings:superAdmin.rowLabel')}
                    onPress={() => router.push('/(app)/settings/admin' as never)}
                  />
                </SettingsGroup>
              </RiseView>
            ) : null}

            {/* 15. CUENTA */}
            <RiseView delay={420}>
              <SettingsGroup title={t('settings:account.groupTitle')}>
                <SettingsRow
                  icon="power-settings-new"
                  label={t('settings:account.logout')}
                  onPress={handleConfirmLogout}
                />
                <SettingsRow
                  destructive
                  helper={t('settings:account.deleteHelper')}
                  icon="delete-forever"
                  isLast
                  label={t('settings:account.delete')}
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
            {/* @i18n-ignore — bloque solo-dev (__DEV__), copy interno de tooling */}
            {__DEV__ ? (
              <RiseView delay={320}>
                <SettingsGroup
                  footer={t('settings:dev.animationsFooter')}
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
                    helper="Réplicas pixel-perfect del rediseño neumórfico (design/rediseno-2026-07). Nada se cablea a la app real hasta aprobar cada vista acá."
                    icon="palette"
                    // @i18n-ignore: fila dev-only (gateada por __DEV__), copy interno de tooling
                    label="Preview · Rediseño 2026-07"
                    onPress={() => router.push('/(app)/settings/dev/redesign' as never)}
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
                    helper="Previsualiza el intro pre-auth (5 slides) estando logueado, sin pasar por el gate de guest. Los CTA y Cerrar vuelven acá; no toca el flag."
                    icon="slideshow"
                    label="Preview · Onboarding intro"
                    onPress={() => router.push('/(app)/settings/dev/intro-preview' as never)}
                  />
                  <SettingsRow
                    helper="Reinicia 'intro visto' → el showcase de 5 slides se muestra de nuevo en el próximo arranque sin sesión (cerrá sesión para verlo)."
                    icon="restart-alt"
                    label="Reiniciar intro pre-auth"
                    onPress={handleResetIntroSeen}
                  />
                  <SettingsRow
                    helper="Abre la BANDEJA con 10 movimientos de muestra para iterar la UI sin esperar un build. Nada se guarda."
                    icon="preview"
                    label={t('settings:dev.importPreviewLabel')}
                    onPress={() => {
                      setImportPreviewState(buildPreviewReviewState())
                    }}
                  />
                  <SettingsRow
                    helper="Abre el RECIBO: una sola captura de Apple Pay con categoría sugerida, que se registra de un tap. La otra raíz del flujo. Nada se guarda."
                    icon="contactless"
                    label="Vista previa: recibo de Apple Pay"
                    onPress={() => {
                      setImportPreviewState(buildReceiptPreviewState())
                    }}
                  />
                  <SettingsRow
                    helper="Diagnóstico: mismo flujo pero el confirm INSERTA de verdad (5 filas [TEST], montos 111-555). Bórralas después desde Gastos."
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
            {/* @i18n-ignore — bloque solo-dev (__DEV__), copy interno de tooling */}
            {__DEV__ && assistantDemoMode ? (
              <RiseView delay={320}>
                <SettingsGroup
                  footer={t('settings:dev.demoFilterFooter')}
                  title="Filtro demo"
                >
                  <View style={styles.appearanceInner}>
                    <SegmentedControl<AssistantDemoFilter>
                      onChange={handleAssistantDemoFilter}
                      options={[
                        { label: 'Todas', value: 'all' },
                        { label: 'Read-only', value: 'read-only' },
                        { label: 'Routing', value: 'routing' },
                        { label: t('settings:dev.filterAction'), value: 'action' },
                      ]}
                      skin="neo"
                      value={assistantDemoFilter}
                    />
                  </View>
                </SettingsGroup>
              </RiseView>
            ) : null}

            {/* Footer de versión — queda último. */}
            <RiseView delay={420}>
              <Text style={[styles.versionFooter, { color: neo.textMuted }]}>
                {appVersionLabel}
              </Text>
            </RiseView>
          </>
        )}
      </View>
      </RiseViewGate>

      {/* ── Sheets ──────────────────────────────────────────────
          Los del hogar (invitación, aporte, ciclo, régimen de ingreso,
          conversión, % de ahorro, colchón, eliminar hogar) se mudaron con sus
          filas a `screens/household/household-screen`. */}
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
    padding: 18,
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.3,
    // La píldora encoge (`heroChip.flexShrink`); sin esto el label se sale
    // por debajo de su propio padding en vez de acompañarla.
    flexShrink: 1,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.6,
  },
  heroTitle: {
    ...typography.screenTitle,
  },
  heroSub: {
    fontSize: 13,
    fontFamily: nunitoFamily('600'),
  },
  ownerPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 6,
  },
  ownerText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  memberHint: {
    fontSize: 12,
    fontFamily: nunitoFamily('600'),
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  reserveSub: {
    fontSize: 12,
    fontFamily: nunitoFamily('600'),
  },
  versionFooter: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: nunitoFamily('600'),
    paddingTop: 6,
    paddingBottom: 24,
  },
})
