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
import { InAppNumpad } from '@/components/ui/in-app-numpad'
import { Screen } from '@/components/ui/screen'
import { StickyFooter } from '@/components/ui/sticky-footer'
import { useNumpadOffset } from '@/lib/numpad-visibility'
import {
  OnboardingStepDots,
  OnboardingStepHeader,
} from '@/components/home/onboarding/step-chrome'
import { StepAvatar } from '@/components/home/onboarding/step-avatar'
import { StepFamily } from '@/components/home/onboarding/step-family'
import { StepIncome } from '@/components/home/onboarding/step-income'
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
import { buildFamilyFinanceInput } from '@/features/finance/use-family-finance'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import { useQueryClient } from '@tanstack/react-query'
import {
  profileQueryKey,
  useMyProfile,
  useUpdateAvatarAnimal,
  useUpdateDisplayName,
} from '@/features/profile/use-profile'
import { logoutSession } from '@/features/auth/logout'
import { showAuthTransitionSplash } from '@/lib/auth-transition-splash'
import { errorMessages } from '@/lib/copy/states'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'
import { parsePrice } from '@/utils/money'
import { sanitizeDisplayName } from '@/utils/sanitize-name'
import { useAppTheme } from '@/theme/theme-provider'

interface OnboardingScreenProps {
  userId: string
}

export function OnboardingScreen({ userId }: OnboardingScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
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
  // Hydrate displayName from profile once (only if user has not typed yet).
  const [hydratedName, setHydratedName] = useState(false)
  useEffect(() => {
    if (hydratedName) return
    const fromProfile = profileQuery.data?.display_name
    if (fromProfile) {
      actions.setDisplayName(sanitizeDisplayName(fromProfile))
      setHydratedName(true)
    }
  }, [profileQuery.data?.display_name, hydratedName, actions])

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
  const updateDisplayName = useUpdateDisplayName(userId)
  const updateAvatar = useUpdateAvatarAnimal(userId)
  const upsertFinance = useUpsertFamilyFinance(state.familyId ?? undefined)
  const upsertSavingsGoal = useUpsertSavingsGoal(state.familyId ?? '')
  const completeOnboarding = useCompleteOnboarding(userId)

  const [numpadTarget, setNumpadTarget] = useState<'income' | 'goal' | null>(null)
  const [submitting, setSubmitting] = useState(false)
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

  const canContinue = (() => {
    switch (step) {
      case 1:
        return trimmedName.length >= 2
      case 2:
        return true
      case 3:
        return state.familyMode !== 'none' && !!state.familyId
      case 4:
        return monthlyIncome > 0 && state.salaryPaymentDay >= 1 && state.salaryPaymentDay <= 31
      case 5: {
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
          'No pudimos cerrar la sesión',
          getErrorMessage(error, errorMessages.server),
        )
      },
      onSuccess: () => {
        // Same surface the rest of the auth chain hands off to.
        // RootLayoutShell's overlay covers the transition.
        showAuthTransitionSplash()
        router.replace('/(auth)/welcome')
      },
    })
  }, [router])

  const handleBack = useCallback(() => {
    // On step 1 there's no previous step inside the wizard, so the
    // back chevron becomes "exit the flow". Offer two paths:
    // ─ stay (cancel) — most common intent
    // ─ logout — for users who chose the wrong account / want to
    //   start over from the welcome screen
    if (step === 1) {
      Alert.alert(
        '¿Salir del setup?',
        'Tu progreso queda guardado. Podés cerrar la sesión y volver al inicio cuando quieras.',
        [
          { text: 'Seguir acá', style: 'cancel' },
          {
            text: 'Cerrar sesión',
            style: 'destructive',
            onPress: handleLogout,
          },
        ],
      )
      return
    }
    actions.back()
  }, [step, actions, handleLogout])

  const handleFinish = useCallback(async () => {
    if (!state.familyId) {
      Alert.alert('Falta la familia', 'Creá o uníte a una familia antes de terminar.')
      return
    }
    setSubmitting(true)
    try {
      const baseSnapshot = {
        dailyBudgetBufferMode: existingFinance?.daily_budget_buffer_mode ?? 'none',
        dailyBudgetBufferValue: existingFinance?.daily_budget_buffer_value ?? 0,
        dailyBudgetCheckinHour: existingFinance?.daily_budget_checkin_hour ?? 9,
        dailyBudgetNudgesEnabled: existingFinance?.daily_budget_nudges_enabled ?? true,
        monthlyIncome,
        savingsGoal: 0, // derived by the model from percent × income.
        savingsGoalPercent: state.savingsGoalPercent,
        usdExchangeRate: existingFinance?.usd_exchange_rate ?? 1000,
        salaryPaymentDay: state.salaryPaymentDay,
        // Stampeamos la confirmación de sueldo al terminar onboarding.
        // El modelo del pay-cycle tiene un "freeze" que mantiene al
        // usuario en el ciclo anterior si hoy >= payday y no hay
        // confirmación — útil cuando el sueldo demora unos días tras
        // el payday. Pero para una cuenta recién creada, ese freeze
        // empuja el ciclo activo a uno del pasado donde la cuenta ni
        // existía, y los gastos recién cargados quedan fuera del
        // rango y no aparecen en Gastos. Al stampear `now()` acá
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
      } as const
      const financePayload = buildFamilyFinanceInput(baseSnapshot)
      await upsertFinance.mutateAsync(financePayload)

      if (state.createFirstGoal) {
        const parsedGoal = parsePrice(state.firstGoalTargetRaw)
        const goalAmount = Number.isFinite(parsedGoal) && parsedGoal > 0 ? parsedGoal : 0
        await upsertSavingsGoal.mutateAsync({
          existingId: null,
          input: {
            title: state.firstGoalTitle.trim(),
            emoji: '🎯',
            goalAmount,
            currentAmount: 0,
            targetMonths: state.firstGoalMonths,
            isActive: true,
          },
        })
      }

      await completeOnboarding.mutateAsync()
      void triggerHaptic('success')
      // Cover the onboarding → home transition with the brand splash
      // so the user sees one fluid hand-off into the app, not a
      // skeleton flash while the home queries warm up.
      showAuthTransitionSplash()
      router.replace('/(app)/(tabs)/home')
    } catch (error) {
      void triggerHaptic('error')
      Alert.alert('No pudimos terminar el setup', getErrorMessage(error, errorMessages.server))
    } finally {
      setSubmitting(false)
    }
  }, [
    state.familyId,
    state.savingsGoalPercent,
    state.salaryPaymentDay,
    state.createFirstGoal,
    state.firstGoalTargetRaw,
    state.firstGoalTitle,
    state.firstGoalMonths,
    monthlyIncome,
    existingFinance,
    upsertFinance,
    upsertSavingsGoal,
    completeOnboarding,
    router,
  ])

  const handlePrimary = useCallback(async () => {
    if (!canContinue) return
    // Step 5 writes the full finance snapshot and can't be skipped.
    if (step === 5) {
      try {
        await handleFinish()
      } catch (error) {
        void triggerHaptic('error')
        Alert.alert('No pudimos guardar', getErrorMessage(error, errorMessages.server))
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
            'No pudimos guardar tu nombre',
            getErrorMessage(error, errorMessages.server),
          )
        },
      })
    } else if (step === 2) {
      updateAvatar.mutate(state.avatarSlug, {
        onError: (error: unknown) => {
          void triggerHaptic('error')
          Alert.alert(
            'No pudimos guardar el avatar',
            getErrorMessage(error, errorMessages.server),
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
  ])

  const primaryLabel = (() => {
    if (submitting) return 'Terminando…'
    if (step === 5) return 'Terminar y empezar'
    return 'Siguiente'
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
        <OnboardingStepHeader step={step} canGoBack onBack={handleBack} />
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
            })}
          </Animated.View>
        </Pressable>
      </ScrollView>

      <StickyFooter divider={false}>
        <Pressable
          onPress={() => void handlePrimary()}
          disabled={!canContinue || submitting}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          style={[
            styles.primaryCta,
            {
              backgroundColor: canContinue ? theme.colors.text : theme.colors.line,
              opacity: submitting ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.primaryCtaText,
              {
                color: canContinue ? theme.colors.creamCard : theme.colors.textMuted,
              },
            ]}
          >
            {primaryLabel}
          </Text>
        </Pressable>
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
          familyCode={state.familyCode}
          onFamilyReady={actions.setFamily}
          isRejoin={ctx.isRejoin}
          closedByOwner={ctx.closedByOwner}
        />
      )
    case 4:
      return (
        <StepIncome
          monthlyIncomeRaw={state.monthlyIncomeRaw}
          salaryPaymentDay={state.salaryPaymentDay}
          onRequestNumpad={ctx.openIncomeNumpad}
          onChangeSalaryDay={actions.setSalaryDay}
          isNumpadActive={ctx.numpadTarget === 'income'}
          amountCardRef={ctx.setIncomeAmountCardRef}
        />
      )
    case 5:
      return (
        <StepSavings
          monthlyIncome={ctx.monthlyIncome}
          savingsGoalPercent={state.savingsGoalPercent}
          createFirstGoal={state.createFirstGoal}
          firstGoalTitle={state.firstGoalTitle}
          firstGoalTargetRaw={state.firstGoalTargetRaw}
          firstGoalMonths={state.firstGoalMonths}
          onChangeSavingsPercent={actions.setSavingsPercent}
          onToggleCreateFirstGoal={actions.setCreateFirstGoal}
          onChangeFirstGoalTitle={actions.setFirstGoalTitle}
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
