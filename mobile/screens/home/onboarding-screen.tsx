import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  findNodeHandle,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  type View,
} from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { InAppNumpad } from '@/components/ui/in-app-numpad'
import { Screen } from '@/components/ui/screen'
import { StickyFooter } from '@/components/ui/sticky-footer'
import { usePressScale } from '@/hooks/use-press-scale'
import { useNumpadOffset } from '@/lib/numpad-visibility'
import {
  OnboardingStepDots,
  OnboardingStepHeader,
} from '@/components/home/onboarding/step-chrome'
import { StepAvatar } from '@/components/home/onboarding/step-avatar'
import { StepFamily } from '@/components/home/onboarding/step-family'
import { StepFamilySummary } from '@/components/home/onboarding/step-family-summary'
import { StepIncome } from '@/components/home/onboarding/step-income'
import { StepIncomeContribution } from '@/components/home/onboarding/step-income-contribution'
import { StepSavings } from '@/components/home/onboarding/step-savings'
import { StepWelcome } from '@/components/home/onboarding/step-welcome'
import type { AvatarSlug } from '@/assets/avatars'
import { isAvatarSlug } from '@/assets/avatars'
import { useCompleteOnboarding } from '@/features/onboarding/use-complete-onboarding'
import {
  useOnboardingState,
  type OnboardingStepId,
} from '@/features/onboarding/use-onboarding-state'
import { useFamilyFinance, useUpsertFamilyFinance } from '@/features/finance/use-family-finance'
import { useConsumeFamilyInvite } from '@/features/family/use-family-actions'
import { buildFamilyFinanceInput } from '@/features/finance/use-family-finance'
import { financeToCycleConfig, type FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  profileQueryKey,
  useMyProfile,
  useUpdateAvatarAnimal,
  useUpdateDisplayName,
} from '@/features/profile/use-profile'
import { logoutSession } from '@/features/auth/logout'
import { authQueryKeys } from '@/features/auth/use-auth-session'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'
import { parsePrice } from '@/utils/money'
import { sanitizeDisplayName } from '@/utils/sanitize-name'
import { useAppTheme } from '@/theme/theme-provider'

interface OnboardingScreenProps {
  userId: string
}

/**
 * Mejor display name desde un blob `user_metadata` de Supabase, prefiriendo el
 * nombre real del provider. Cubre Google (`full_name`/`name`) y Apple
 * (`display_name`, parcheado en social-sign-in) + un fallback compuesto.
 */
function readOAuthName(meta: Record<string, unknown> | undefined): string {
  if (!meta) return ''
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const direct = str(meta.display_name) || str(meta.full_name) || str(meta.name)
  if (direct) return direct
  return [str(meta.given_name), str(meta.family_name)].filter(Boolean).join(' ')
}

export function OnboardingScreen({ userId }: OnboardingScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const profileQuery = useMyProfile(userId)
  // The home_snapshot RPC seeds the profile cache with the original
  // 5 columns, missing `previously_onboarded`. Invalidate once when
  // the wizard mounts so `useMyProfile` re-fetches with all columns
  // and `isRejoin` resolves correctly on first paint.
  useEffect(() => {
    if (!userId) return
    queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
  }, [userId, queryClient])

  const seedAvatar: AvatarSlug | undefined =
    profileQuery.data?.avatar_animal && isAvatarSlug(profileQuery.data.avatar_animal)
      ? profileQuery.data.avatar_animal
      : undefined

  const { state, actions } = useOnboardingState(
    seedAvatar ? { avatarSlug: seedAvatar } : undefined,
  )

  // Step 3 always asks the user explicitly to create a new family or
  // join an existing one — we don't auto-advance based on an existing
  // `family_members` row. Removing the previous auto-hydrate + skip:
  // when onboarding is re-run (e.g. after a DB cleanup that kept the
  // membership row), skipping meant the user got silently bound to
  // the old family with no chance to choose.
  // El provider (Google `full_name`/`name`, Apple `display_name` parcheado en
  // social-sign-in) trae el nombre real en el user_metadata. Leemos la sesión
  // de la cache (la query root ya la popula; mismo key → no duplica el
  // listener) para preferirlo sobre el prefijo del email que el trigger de
  // signup deja por defecto.
  const { data: session } = useQuery<Session | null>({
    queryKey: authQueryKeys.session,
    queryFn: async () => (await supabase.auth.getSession()).data.session,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  const oauthName = readOAuthName(
    session?.user?.user_metadata as Record<string, unknown> | undefined,
  )

  // Hydrate displayName once (only if user has not typed yet). Cuenta nueva →
  // preferimos el nombre del provider; re-ingreso (previously_onboarded) →
  // respetamos el que el usuario ya guardó en su profile.
  const [hydratedName, setHydratedName] = useState(false)
  useEffect(() => {
    if (hydratedName) return
    const profileName = profileQuery.data?.display_name ?? ''
    const isRejoinName = profileQuery.data?.previously_onboarded === true
    const best = isRejoinName ? profileName || oauthName : oauthName || profileName
    if (best) {
      actions.setDisplayName(sanitizeDisplayName(best))
      setHydratedName(true)
    }
  }, [
    profileQuery.data?.display_name,
    profileQuery.data?.previously_onboarded,
    oauthName,
    hydratedName,
    actions,
  ])

  // Re-entry detection: `profile.previously_onboarded` is set by a
  // SQL trigger the first time the user completes onboarding and is
  // never reset, so it cleanly distinguishes brand-new accounts
  // (false) from users re-entering onboarding after leaving their
  // family (true). The earlier heuristic (display_name >= 2 chars)
  // misfired because the `handle_new_user_profile` trigger always
  // populates display_name on signup.
  const isRejoin = profileQuery.data?.previously_onboarded === true
  // The previous family was torn down by its owner — the SQL RPC
  // sets `family_closed_by_owner_at` for every surviving member and
  // clears it on the next bootstrap/join. When set, the onboarding
  // wizard surfaces a softer "your home was closed" copy instead of
  // the generic rejoin message.
  const closedByOwner = Boolean(profileQuery.data?.family_closed_by_owner_at)

  const familyQuery = useFamilyFinance(state.familyId ?? undefined)
  const existingFinance = familyQuery.data

  // Mutations
  const updateDisplayName = useUpdateDisplayName(userId, state.familyId ?? undefined)
  const updateAvatar = useUpdateAvatarAnimal(userId, state.familyId ?? undefined)
  const upsertFinance = useUpsertFamilyFinance(state.familyId ?? undefined, userId)
  const upsertSavingsGoal = useUpsertSavingsGoal(state.familyId ?? '', userId)
  // Joiner finish: consume the single-use invite (creates the
  // membership + marks the code used). Replaces the legacy
  // `useJoinFamily` which used the persistent `families.code`.
  const consumeInvite = useConsumeFamilyInvite(userId)
  const completeOnboarding = useCompleteOnboarding(userId)

  const [numpadTarget, setNumpadTarget] = useState<'income' | 'goal' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Local cycle config state for step 4 (creator income step).
  // Default: monthly cycle with day 15. When the screen is re-entered
  // (rejoin) and `family_finance` already has a cycle, we hydrate from
  // it via the effect below so the user sees their current config.
  const [cycleConfig, setCycleConfig] = useState<FinanceCycleConfig>({
    cycle_type: 'monthly',
    salary_payment_day: 15,
  })
  // Hydration race fix (2026-06-05): si el user cambia el config ANTES
  // de que `existingFinance` resuelva (caso típico en onboarding nuevo
  // — la query tarda y el user toca el picker), el effect previo
  // pisaba la elección con el default de la DB. Trackeamos "userTouched"
  // separado de "hydrated" para que la primera interacción del user
  // bloquee cualquier hidratación posterior.
  const cycleConfigUserTouchedRef = useRef(false)
  const [hydratedCycleConfig, setHydratedCycleConfig] = useState(false)
  useEffect(() => {
    if (hydratedCycleConfig) return
    if (cycleConfigUserTouchedRef.current) {
      // El user ya pickeó antes de que arrancara la hidratación.
      // Saltamos y marcamos como hidratado para que no vuelva a correr.
      setHydratedCycleConfig(true)
      return
    }
    if (!existingFinance) return
    setCycleConfig(financeToCycleConfig(existingFinance))
    setHydratedCycleConfig(true)
  }, [existingFinance, hydratedCycleConfig])
  const handleCycleConfigChange = useCallback((next: FinanceCycleConfig) => {
    cycleConfigUserTouchedRef.current = true
    setCycleConfig(next)
  }, [])
  const scrollRef = useRef<ScrollView>(null)
  const scrollY = useRef(0)
  // Snapshot of the scroll position taken at the moment the user
  // opens a numpad. When the numpad closes we animate the
  // ScrollView back to this y so the form returns to where the
  // user left off — no abrupt jump.
  const scrollRestoreY = useRef<number | null>(null)
  // Refs to each AmountCard wrapper. When the user taps a card we
  // measure it against the scroll view via window coords so it gets
  // scrolled to the top of the visible area. Specially needed for
  // step 5 where the goal card lives mid-form and would otherwise
  // be hidden by the numpad sheet.
  const amountCardRefs = useRef<{ income: View | null; goal: View | null }>({
    income: null,
    goal: null,
  })

  const step = state.step
  const trimmedName = state.displayName.trim()
  const monthlyIncome = (() => {
    const parsed = parsePrice(state.monthlyIncomeRaw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  })()

  const isJoiner = state.familyMode === 'joined'

  const canContinue = (() => {
    switch (step) {
      case 1:
        return trimmedName.length >= 2
      case 2:
        return true
      case 3:
        // Creator: needs a real familyId (bootstrap inserts the row).
        // Joiner: needs a valid pendingFamily snapshot from peek.
        if (state.familyMode === 'joined') return !!state.pendingFamily
        return state.familyMode === 'created' && !!state.familyId
      case 4:
        if (isJoiner) {
          // Joiner: needs to make an explicit choice. If they
          // contribute, the amount must be > 0; if not, no amount
          // needed.
          if (state.contributesIncome === null) return false
          if (state.contributesIncome === true) return monthlyIncome > 0
          return true
        }
        // For rolling cycles (biweekly/weekly/custom), the anchor +
        // length are picked from constrained controls in
        // `CycleConfigSection`, so the only thing that can be invalid
        // here is the monthly day. For monthly, we still bound 1..31.
        if (monthlyIncome <= 0) return false
        if (cycleConfig.cycle_type === 'monthly') {
          return (
            cycleConfig.salary_payment_day >= 1 &&
            cycleConfig.salary_payment_day <= 31
          )
        }
        return true
      case 5: {
        // Joiner step 5 is the family summary — always ready to
        // confirm.
        if (isJoiner) return true
        if (!state.createFirstGoal) return true
        const parsedGoal = parsePrice(state.firstGoalTargetRaw)
        return (
          state.firstGoalTitle.trim().length > 0 &&
          Number.isFinite(parsedGoal) &&
          parsedGoal > 0 &&
          state.firstGoalMonths >= 1
        )
      }
      default:
        return false
    }
  })()

  const handleLogout = useCallback(() => {
    void logoutSession({
      onError: (error) => {
        void triggerHaptic('error')
        Alert.alert(
          t('onboarding:errors.logoutTitle'),
          getErrorMessage(error, t('states:error.server')),
        )
      },
      onSuccess: () => {
        // logoutSession ya despachó LOGOUT (máquina → guest, overlay
        // escondido); el fade del auth stack cubre la transición.
        router.replace('/(auth)/welcome')
      },
    })
  }, [router, t])

  const handleBack = useCallback(() => {
    // On step 1 there's no previous step inside the wizard, so the
    // back chevron becomes "exit the flow". Offer two paths:
    // ─ stay (cancel) — most common intent
    // ─ logout — for users who chose the wrong account / want to
    //   start over from the welcome screen
    if (step === 1) {
      Alert.alert(
        t('onboarding:exitDialog.title'),
        t('onboarding:exitDialog.message'),
        [
          { text: t('onboarding:exitDialog.stay'), style: 'cancel' },
          {
            text: t('onboarding:exitDialog.logout'),
            style: 'destructive',
            onPress: handleLogout,
          },
        ],
      )
      return
    }
    actions.back()
  }, [step, actions, handleLogout, t])

  const handleFinish = useCallback(async () => {
    if (!state.familyId) {
      Alert.alert(t('onboarding:errors.missingFamilyTitle'), t('onboarding:errors.missingFamilyMessage'))
      return
    }
    setSubmitting(true)
    try {
      // Joiner path. The user previewed the family in step 3 via
      // `peek_family_invite` (no membership inserted, the invite
      // is still active) and is now confirming. Two-step finish:
      //   1. consume_family_invite(code, contribution) → INSERTS
      //      the membership, records the contribution AND marks
      //      the invite as used in one transactional step.
      //   2. completeOnboarding → flips profiles.onboarding_completed_at.
      // family_finance / savings_goal upserts are skipped — those
      // already exist for the family.
      if (state.familyMode === 'joined' && state.pendingFamily) {
        const contribution =
          state.contributesIncome === true ? monthlyIncome : 0
        await consumeInvite.mutateAsync({
          code: state.pendingFamily.family_code,
          monthlyIncomeContribution: contribution,
        })
        await completeOnboarding.mutateAsync()
        void triggerHaptic('success')
        // Navegación: la maneja el gate de la ruta (OnboardingRoute), que
        // redirige a onboarding-success en cuanto completeOnboarding flipea
        // onboarding_completed_at en el cache (setQueryData SINCRÓNICO en
        // onSuccess, antes de que este await resuelva). Un router.replace
        // imperativo aquí apuntaba al MISMO destino → doble navegación + doble
        // transición (el parpadeo). Single source = el Redirect del gate.
        return
      }

      const baseSnapshot = {
        dailyBudgetBufferMode: existingFinance?.daily_budget_buffer_mode ?? 'none',
        dailyBudgetBufferValue: existingFinance?.daily_budget_buffer_value ?? 0,
        dailyBudgetCheckinHour: existingFinance?.daily_budget_checkin_hour ?? 9,
        dailyBudgetNudgesEnabled: existingFinance?.daily_budget_nudges_enabled ?? true,
        monthlyIncome,
        savingsGoal: 0, // derived by the model from percent × income.
        savingsGoalPercent: state.savingsGoalPercent,
        usdExchangeRate: existingFinance?.usd_exchange_rate ?? 1000,
        salaryPaymentDay:
          cycleConfig.cycle_type === 'monthly'
            ? cycleConfig.salary_payment_day
            : 1,
        // Stampeamos la confirmación de sueldo al terminar onboarding.
        // El modelo del pay-cycle tiene un "freeze" que mantiene al
        // usuario en el ciclo anterior si hoy >= payday y no hay
        // confirmación — útil cuando el sueldo demora unos días tras
        // el payday. Pero para una cuenta recién creada, ese freeze
        // empuja el ciclo activo a uno del pasado donde la cuenta ni
        // existía, y los gastos recién cargados quedan fuera del
        // rango y no aparecen en Gastos. Al stampear `now()` aquí
        // dejamos claro que el usuario arranca ya dentro del ciclo
        // actual. Los renewals posteriores usan la sheet "Confirmar
        // sueldo" en Home.
        lastSalaryConfirmedAt:
          existingFinance?.last_salary_confirmed_at ?? new Date().toISOString(),
        // Don't pre-fill the cycle override — leaving these null on
        // first save lets the dashboard prompt the user to confirm
        // their actual available balance for the current cycle.
        currentCycleStartingBalance:
          existingFinance?.current_cycle_starting_balance ?? null,
        currentCycleAnchor: existingFinance?.current_cycle_anchor ?? null,
        cycleType: cycleConfig.cycle_type,
        cycleAnchorDate:
          cycleConfig.cycle_type === 'monthly'
            ? null
            : cycleConfig.cycle_anchor_date,
        cycleLengthDays:
          cycleConfig.cycle_type === 'monthly'
            ? null
            : cycleConfig.cycle_length_days,
      } as const
      const financePayload = buildFamilyFinanceInput(baseSnapshot)
      await upsertFinance.mutateAsync(financePayload)

      // El ingreso del dueño debe vivir como su monthly_income_contribution: el
      // total del hogar (family_finance.monthly_income) es DERIVADO = Σ de las
      // contribuciones (trigger recompute_family_income). Si el ingreso del dueño
      // quedara solo en family_finance, el primer miembro que se una lo borraría
      // (recompute pisa monthly_income con la suma, que excluía al dueño). Con esto
      // el dueño entra en la suma y los que se unan se agregan encima.
      const { error: ownerIncomeError } = await supabase.rpc(
        'update_my_income_contribution',
        { p_amount: monthlyIncome },
      )
      // supabase.rpc NO tira: si no chequeamos el error, un fallo dejaría al dueño
      // con contribución 0 (ingreso del hogar 0) — justo lo que este fix evita.
      if (ownerIncomeError) throw ownerIncomeError

      if (state.createFirstGoal) {
        const parsedGoal = parsePrice(state.firstGoalTargetRaw)
        const goalAmount = Number.isFinite(parsedGoal) && parsedGoal > 0 ? parsedGoal : 0
        await upsertSavingsGoal.mutateAsync({
          existingId: null,
          input: {
            title: state.firstGoalTitle.trim(),
            emoji: state.firstGoalEmoji,
            goalAmount,
            currentAmount: 0,
            targetMonths: state.firstGoalMonths,
            isActive: true,
          },
        })
      }

      await completeOnboarding.mutateAsync()
      void triggerHaptic('success')
      // Navegación: la maneja el Redirect del gate (ver nota en el branch
      // joiner). Sin replace imperativo redundante → una sola transición.
    } catch (error) {
      void triggerHaptic('error')
      Alert.alert(t('onboarding:errors.finishTitle'), getErrorMessage(error, t('states:error.server')))
    } finally {
      setSubmitting(false)
    }
  }, [
    state.familyId,
    state.familyMode,
    state.pendingFamily,
    state.contributesIncome,
    state.savingsGoalPercent,
    cycleConfig,
    state.createFirstGoal,
    state.firstGoalTargetRaw,
    state.firstGoalTitle,
    state.firstGoalEmoji,
    state.firstGoalMonths,
    monthlyIncome,
    existingFinance,
    upsertFinance,
    upsertSavingsGoal,
    consumeInvite,
    completeOnboarding,
    t,
  ])

  const handlePrimary = useCallback(async () => {
    if (!canContinue) return
    // Step 5 writes the full finance snapshot and can't be skipped.
    if (step === 5) {
      try {
        await handleFinish()
      } catch (error) {
        void triggerHaptic('error')
        Alert.alert(t('onboarding:errors.saveTitle'), getErrorMessage(error, t('states:error.server')))
      }
      return
    }

    // Advance optimistically — the per-step save (display name / avatar)
    // runs in the background. Previously we `await`ed the mutation
    // before advancing, so if it hung (stale session, network blip) the
    // user tapped "Siguiente" and saw nothing happen. Now the step
    // changes immediately; failures surface via Alert and the step can
    // be re-attempted without getting stuck.
    void triggerHaptic('selection')
    actions.next()

    if (step === 1) {
      updateDisplayName.mutate(trimmedName, {
        onError: (error: unknown) => {
          void triggerHaptic('error')
          Alert.alert(
            t('onboarding:errors.saveNameTitle'),
            getErrorMessage(error, t('states:error.server')),
          )
        },
      })
    } else if (step === 2) {
      updateAvatar.mutate(state.avatarSlug, {
        onError: (error: unknown) => {
          void triggerHaptic('error')
          Alert.alert(
            t('onboarding:errors.saveAvatarTitle'),
            getErrorMessage(error, t('states:error.server')),
          )
        },
      })
    }
  }, [
    canContinue,
    step,
    trimmedName,
    state.avatarSlug,
    updateDisplayName,
    updateAvatar,
    handleFinish,
    actions,
    t,
  ])

  const ctaPress = usePressScale({ pressedScale: 0.97 })

  // Título por paso, centrado en el chrome (reemplaza "PASO X/N").
  const stepTitle = (() => {
    switch (step) {
      case 1:
        return t('onboarding:chrome.title.name')
      case 2:
        return t('onboarding:chrome.title.avatar')
      case 3:
        return t('onboarding:chrome.title.household')
      case 4:
        return t('onboarding:chrome.title.income')
      case 5:
        return isJoiner ? t('onboarding:chrome.title.almostDone') : t('onboarding:chrome.title.savings')
      default:
        return ''
    }
  })()

  const primaryLabel = (() => {
    if (submitting) return isJoiner ? t('onboarding:cta.confirming') : t('onboarding:cta.finishing')
    if (step === 5) return isJoiner ? t('onboarding:cta.confirmAndJoin') : t('onboarding:cta.finishAndStart')
    return t('onboarding:cta.next')
  })()

  // Use `UIManager.measure` with native handles — most reliable
  // measure API across RN versions. The component-method versions
  // (`node.measureInWindow`, `measureLayout`) silently fail or warn
  // about ref types in some setups. With node handles this just
  // works.  We diff the wrapper's window y vs the ScrollView's
  // window y, then add the live scroll offset to land on the
  // absolute content y. Wrapped in `requestAnimationFrame` so the
  // measure runs AFTER the numpad's setState has flushed and the
  // layout has settled.
  const scrollAmountIntoView = useCallback((target: 'income' | 'goal') => {
    requestAnimationFrame(() => {
      const node = amountCardRefs.current[target]
      const scroll = scrollRef.current
      if (!node || !scroll) return
      const cardHandle = findNodeHandle(node)
      const scrollHandle = findNodeHandle(scroll)
      if (cardHandle == null || scrollHandle == null) return
      UIManager.measure(cardHandle, (_x, _y, _w, _h, _px, cardPageY) => {
        UIManager.measure(scrollHandle, (_sx, _sy, _sw, _sh, _spx, scrollPageY) => {
          if (
            typeof cardPageY !== 'number' ||
            typeof scrollPageY !== 'number'
          ) {
            return
          }
          const yInVisibleArea = cardPageY - scrollPageY
          const contentY = yInVisibleArea + scrollY.current
          // Step 5's goal card is far down in the form, but we don't
          // need to push it all the way to the top — leaving a
          // bigger top margin keeps surrounding context visible
          // (the toggle, the percent slider) and feels less abrupt.
          // Step 4's income card sits near the top so a tiny margin
          // is enough.
          const topMargin = target === 'goal' ? 90 : 12
          scrollRef.current?.scrollTo({
            y: Math.max(0, contentY - topMargin),
            animated: true,
          })
        })
      })
    })
  }, [])
  const openIncomeNumpad = useCallback(() => {
    // Drop any system-keyboard focus before opening the numpad —
    // mirrors AddExpense / AddFijo: any tap on a non-text control
    // releases the focused TextField so its border deactivates and
    // the keyboard hides.
    Keyboard.dismiss()
    // Snapshot the scroll position so we can animate back to it
    // when the numpad closes.
    scrollRestoreY.current = scrollY.current
    setNumpadTarget('income')
    // Defer the scroll so the InAppNumpad has time to mount and
    // publish its offset, which grows the ScrollView's content
    // (paddingBottom += ~320). Otherwise scrollTo can be clamped
    // to the smaller content height.
    setTimeout(() => scrollAmountIntoView('income'), 50)
  }, [scrollAmountIntoView])
  const openGoalNumpad = useCallback(() => {
    Keyboard.dismiss()
    scrollRestoreY.current = scrollY.current
    setNumpadTarget('goal')
    setTimeout(() => scrollAmountIntoView('goal'), 50)
  }, [scrollAmountIntoView])
  // When the numpad closes (numpadTarget → null) animate the scroll
  // back to where the user was before they tapped the AmountCard.
  // Mirrors the same smooth motion the auto-scroll uses on open.
  useEffect(() => {
    if (numpadTarget !== null) return
    const restore = scrollRestoreY.current
    if (restore == null) return
    scrollRef.current?.scrollTo({ y: restore, animated: true })
    scrollRestoreY.current = null
  }, [numpadTarget])
  const setIncomeAmountCardRef = useCallback((node: View | null) => {
    amountCardRefs.current.income = node
  }, [])
  const setGoalAmountCardRef = useCallback((node: View | null) => {
    amountCardRefs.current.goal = node
  }, [])

  // Anular el `baseBottomPadding` del Screen — el StickyFooter ya
  // aporta su propio `insets.bottom` como clearance final. Dejar
  // ambos sumaba ~68pt de hueco muerto entre el botón y el teclado
  // cuando el KAV empujaba todo hacia arriba.
  //
  // Sobreescribimos `paddingBottom: 0` en el outer container para
  // anular la base que el Screen aplica por default — el
  // StickyFooter maneja su propio safe-area inset y no la necesita.
  // Sin este override, el footer se elevaba ~52pt en TODOS los
  // steps, incluso con el numpad cerrado.
  //
  // El `numpadOffset` se aplica abajo en el `contentContainerStyle`
  // de la ScrollView interna (NO al container externo). Si lo
  // metemos en el outer, todo el viewport se achica de golpe y el
  // AmountCard queda tapado por el numpad. Aplicándolo al
  // contentContainer, la ScrollView mantiene su altura pero gana
  // padding inferior extra — el usuario puede deslizar el monto por
  // encima del numpad, igual que en agregar gasto / agregar fijo.
  const numpadOffset = useNumpadOffset()
  const screenStyle = useMemo(
    () => [styles.screen, { paddingBottom: 0 }],
    [],
  )
  const scrollContentStyle = useMemo(
    () => [styles.scrollContent, { paddingBottom: 32 + numpadOffset }],
    [numpadOffset],
  )

  return (
    <Screen
      scrollable={false}
      // KAV apagado: cuando estaba activo (default), el teclado del
      // sistema empujaba todo el container hacia arriba y elevaba el
      // StickyFooter en step 1 (NOMBRE) y step 5 (TÍTULO). Apagándolo,
      // el teclado aparece encima sin mover la layout — la
      // ScrollView interna se encarga vía automaticallyAdjustKeyboardInsets.
      keyboardAware={false}
      contentContainerStyle={screenStyle}
    >
      <Animated.View layout={LinearTransition.duration(260)}>
        <OnboardingStepHeader title={stepTitle} canGoBack onBack={handleBack} />
        <OnboardingStepDots step={step} />
      </Animated.View>

      {/*
        Internal ScrollView for the step body. Keyboard/numpad push the
        whole Screen container up (via KAV on iOS non-scrollable / OS
        resize on Android), which shrinks the available area; without
        a ScrollView, long steps (step 5 savings) overflow and render
        on top of the StickyFooter. `automaticallyAdjustKeyboardInsets`
        is intentionally OFF: the outer KAV already handles keyboard
        avoidance — enabling it here would stack two pushes and break
        layout. `keyboardShouldPersistTaps` lets the user tap the
        sticky Siguiente without dismissing the keyboard first.
      */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={scrollContentStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        // Ahora SÍ encendido: con el KAV del Screen apagado, este
        // adjustment es el único que mantiene el input enfocado
        // visible sobre el teclado, sin tocar la layout del footer.
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y
        }}
        scrollEventThrottle={16}
      >
        <Pressable onPress={Keyboard.dismiss}>
          <Animated.View
            key={`step-${step}`}
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(140)}
            layout={LinearTransition.duration(260)}
          >
            {renderStep(step, state, actions, {
              userId,
              monthlyIncome,
              openIncomeNumpad,
              openGoalNumpad,
              numpadTarget,
              setIncomeAmountCardRef,
              setGoalAmountCardRef,
              isRejoin,
              closedByOwner,
              cycleConfig,
              onChangeCycleConfig: handleCycleConfigChange,
            })}
          </Animated.View>
        </Pressable>
      </ScrollView>

      <StickyFooter divider={false}>
        <Animated.View style={ctaPress.animatedStyle}>
          <Pressable
            onPress={() => void handlePrimary()}
            onPressIn={ctaPress.onPressIn}
            onPressOut={ctaPress.onPressOut}
            disabled={!canContinue || submitting}
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            style={[
              styles.primaryCta,
              {
                // fill=text siempre; el disabled lo da el opacity (NO bajar el
                // contraste del texto, que daba textMuted sobre line ilegible).
                // Patrón del CTA de add-fijo.
                backgroundColor: theme.colors.text,
                opacity: !canContinue ? 0.45 : submitting ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[styles.primaryCtaText, { color: theme.colors.creamCard }]}
            >
              {primaryLabel}
            </Text>
          </Pressable>
        </Animated.View>
      </StickyFooter>

      <InAppNumpad
        visible={numpadTarget === 'income'}
        rawValue={state.monthlyIncomeRaw}
        onChangeRawValue={actions.setMonthlyIncome}
        onDismiss={() => setNumpadTarget(null)}
      />
      <InAppNumpad
        visible={numpadTarget === 'goal'}
        rawValue={state.firstGoalTargetRaw}
        onChangeRawValue={actions.setFirstGoalTarget}
        onDismiss={() => setNumpadTarget(null)}
      />
    </Screen>
  )
}

interface RenderStepContext {
  userId: string
  monthlyIncome: number
  openIncomeNumpad: () => void
  openGoalNumpad: () => void
  numpadTarget: 'income' | 'goal' | null
  setIncomeAmountCardRef: (node: View | null) => void
  setGoalAmountCardRef: (node: View | null) => void
  isRejoin: boolean
  closedByOwner: boolean
  cycleConfig: FinanceCycleConfig
  onChangeCycleConfig: (next: FinanceCycleConfig) => void
}

function renderStep(
  step: OnboardingStepId,
  state: ReturnType<typeof useOnboardingState>['state'],
  actions: ReturnType<typeof useOnboardingState>['actions'],
  ctx: RenderStepContext,
) {
  switch (step) {
    case 1:
      return (
        <StepWelcome
          displayName={state.displayName}
          onChangeDisplayName={(v) => actions.setDisplayName(sanitizeDisplayName(v))}
          isRejoin={ctx.isRejoin}
          closedByOwner={ctx.closedByOwner}
        />
      )
    case 2:
      return <StepAvatar selected={state.avatarSlug} onSelect={actions.setAvatar} />
    case 3:
      return (
        <StepFamily
          userId={ctx.userId}
          familyMode={state.familyMode}
          familyId={state.familyId}
          onFamilyReady={actions.setFamily}
          onJoinPeek={actions.setPendingFamily}
          onAccountKind={actions.setAccountKind}
          accountKind={state.accountKind}
          isRejoin={ctx.isRejoin}
          closedByOwner={ctx.closedByOwner}
        />
      )
    case 4:
      // Branch: joiners get the contribution toggle, creators see the
      // standard household-level income + salary day.
      if (state.familyMode === 'joined') {
        return (
          <StepIncomeContribution
            contributesIncome={state.contributesIncome}
            monthlyIncomeRaw={state.monthlyIncomeRaw}
            onChangeContributesIncome={actions.setContributesIncome}
            onRequestNumpad={ctx.openIncomeNumpad}
            isNumpadActive={ctx.numpadTarget === 'income'}
            amountCardRef={ctx.setIncomeAmountCardRef}
          />
        )
      }
      return (
        <StepIncome
          monthlyIncomeRaw={state.monthlyIncomeRaw}
          cycleConfig={ctx.cycleConfig}
          onRequestNumpad={ctx.openIncomeNumpad}
          onChangeCycleConfig={ctx.onChangeCycleConfig}
          isNumpadActive={ctx.numpadTarget === 'income'}
          amountCardRef={ctx.setIncomeAmountCardRef}
        />
      )
    case 5:
      // Joiner step 5 = family summary + Confirmar y unirme. Reads
      // from the pendingFamily snapshot fetched in step 3 — the
      // user is NOT a member yet.
      if (state.familyMode === 'joined' && state.pendingFamily) {
        return (
          <StepFamilySummary
            pendingFamily={state.pendingFamily}
            contributesIncome={state.contributesIncome}
            monthlyIncomeRaw={state.monthlyIncomeRaw}
            pendingDisplayName={state.displayName}
            pendingAvatarSlug={state.avatarSlug}
          />
        )
      }
      return (
        <StepSavings
          monthlyIncome={ctx.monthlyIncome}
          savingsGoalPercent={state.savingsGoalPercent}
          createFirstGoal={state.createFirstGoal}
          firstGoalTitle={state.firstGoalTitle}
          firstGoalEmoji={state.firstGoalEmoji}
          firstGoalTargetRaw={state.firstGoalTargetRaw}
          firstGoalMonths={state.firstGoalMonths}
          onChangeSavingsPercent={actions.setSavingsPercent}
          onToggleCreateFirstGoal={actions.setCreateFirstGoal}
          onChangeFirstGoalTitle={actions.setFirstGoalTitle}
          onChangeFirstGoalEmoji={actions.setFirstGoalEmoji}
          onRequestFirstGoalNumpad={ctx.openGoalNumpad}
          onChangeFirstGoalMonths={actions.setFirstGoalMonths}
          isGoalNumpadActive={ctx.numpadTarget === 'goal'}
          amountCardRef={ctx.setGoalAmountCardRef}
        />
      )
    default:
      return null
  }
}

const styles = StyleSheet.create({
  screen: { paddingTop: 14 },
  scroll: { flex: 1, marginTop: 16 },
  scrollContent: { paddingBottom: 32 },
  primaryCta: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
  },
  primaryCtaText: { fontSize: 15, fontWeight: '800' },
})
