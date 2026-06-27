import { useMemo, useReducer } from 'react'
import type { AvatarSlug } from '@/assets/avatars'
import { randomAvatarSlug } from '@/assets/avatars'
import type { AccountKind } from '@/features/family/account-kind'
import type { FamilyPeek } from '@/features/family/use-family-actions'

export type OnboardingStepId = 1 | 2 | 3 | 4 | 5
export const ONBOARDING_TOTAL_STEPS = 5

export interface OnboardingDraft {
  step: OnboardingStepId
  displayName: string
  avatarSlug: AvatarSlug
  familyMode: 'none' | 'created' | 'joined'
  /** 'solo' cuando el usuario eligió "Yo solo" en el step 3. Maneja el copy del onboarding; la UI interior deriva de families.kind. */
  accountKind: AccountKind
  familyId: string | null
  monthlyIncomeRaw: string
  salaryPaymentDay: number
  savingsGoalPercent: number
  createFirstGoal: boolean
  firstGoalTitle: string
  /** Emoji de la meta. Mismo set que el wizard de Settings (EMOJI_PALETTE);
   *  default '🎯' = EMOJI_PALETTE[0]. */
  firstGoalEmoji: string
  firstGoalTargetRaw: string
  /** Plazo en meses. Default 12 = DEFAULT_MONTHS del wizard de Settings
   *  (antes era 6 → desfasaba con la creación de meta en Settings). */
  firstGoalMonths: number
  /** Joiner-only flag. `null` until the user makes a choice in step 4
   *  of the joiner flow. `true` → the user contributes income (sums
   *  to the household total via the `monthly_income_contribution`
   *  trigger); `false` → no contribution recorded (e.g. child,
   *  unemployed partner). Ignored on the creator path. */
  contributesIncome: boolean | null
  /** Joiner-only — preview of the family fetched in step 3 via
   *  `peek_family_by_code`. Null until a valid code has been
   *  validated. The actual `family_members` insert happens in step
   *  5 when the user taps "Confirmar y unirme"; until then the user
   *  is NOT a member, so we read all summary data from this snapshot
   *  rather than from the live queries (which RLS would block). */
  pendingFamily: FamilyPeek | null
}

type Action =
  | { type: 'setStep'; step: OnboardingStepId }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'setDisplayName'; value: string }
  | { type: 'setAvatar'; slug: AvatarSlug }
  | { type: 'setFamily'; mode: 'created' | 'joined'; familyId: string }
  | { type: 'setAccountKind'; value: AccountKind }
  | { type: 'setMonthlyIncome'; value: string }
  | { type: 'setSalaryDay'; value: number }
  | { type: 'setSavingsPercent'; value: number }
  | { type: 'setCreateFirstGoal'; value: boolean }
  | { type: 'setFirstGoalTitle'; value: string }
  | { type: 'setFirstGoalEmoji'; value: string }
  | { type: 'setFirstGoalTarget'; value: string }
  | { type: 'setFirstGoalMonths'; value: number }
  | { type: 'setContributesIncome'; value: boolean | null }
  | { type: 'setPendingFamily'; value: FamilyPeek | null }

function createInitialDraft(): OnboardingDraft {
  return {
    step: 1,
    displayName: '',
    avatarSlug: randomAvatarSlug(),
    familyMode: 'none',
    accountKind: 'shared',
    familyId: null,
    monthlyIncomeRaw: '',
    salaryPaymentDay: 1,
    savingsGoalPercent: 20,
    createFirstGoal: false,
    firstGoalTitle: '',
    firstGoalEmoji: 'metas/objetivo',
    firstGoalTargetRaw: '',
    firstGoalMonths: 12,
    contributesIncome: null,
    pendingFamily: null,
  }
}

function clampStep(value: number): OnboardingStepId {
  if (value < 1) return 1
  if (value > ONBOARDING_TOTAL_STEPS) return ONBOARDING_TOTAL_STEPS as OnboardingStepId
  return value as OnboardingStepId
}

function reducer(state: OnboardingDraft, action: Action): OnboardingDraft {
  switch (action.type) {
    case 'setStep':
      return { ...state, step: clampStep(action.step) }
    case 'next':
      return { ...state, step: clampStep(state.step + 1) }
    case 'back':
      return { ...state, step: clampStep(state.step - 1) }
    case 'setDisplayName':
      return { ...state, displayName: action.value }
    case 'setAvatar':
      return { ...state, avatarSlug: action.slug }
    case 'setFamily':
      return {
        ...state,
        familyMode: action.mode,
        familyId: action.familyId,
      }
    case 'setAccountKind':
      return { ...state, accountKind: action.value }
    case 'setMonthlyIncome':
      return { ...state, monthlyIncomeRaw: action.value }
    case 'setSalaryDay':
      return { ...state, salaryPaymentDay: action.value }
    case 'setSavingsPercent':
      return { ...state, savingsGoalPercent: action.value }
    case 'setCreateFirstGoal':
      return { ...state, createFirstGoal: action.value }
    case 'setFirstGoalTitle':
      return { ...state, firstGoalTitle: action.value }
    case 'setFirstGoalEmoji':
      return { ...state, firstGoalEmoji: action.value }
    case 'setFirstGoalTarget':
      return { ...state, firstGoalTargetRaw: action.value }
    case 'setFirstGoalMonths':
      return { ...state, firstGoalMonths: action.value }
    case 'setContributesIncome':
      // When the joiner toggles off "aporta", clear the income they
      // may have typed earlier so a stale value doesn't get written
      // on submit. Toggling on doesn't reset because they may want
      // to re-enter what they had.
      return action.value === false
        ? { ...state, contributesIncome: false, monthlyIncomeRaw: '' }
        : { ...state, contributesIncome: action.value }
    case 'setPendingFamily':
      // When the user picks a family in step 3 the previously-typed
      // contribution amount might not apply (the new family could
      // have a different income context). Clear `contributesIncome`
      // so step 4 forces a fresh choice. Setting to `null` (e.g. on
      // back-navigation) also clears.
      return {
        ...state,
        pendingFamily: action.value,
        familyMode: action.value ? 'joined' : state.familyMode,
        familyId: action.value ? action.value.family_id : null,
        contributesIncome: null,
        monthlyIncomeRaw: '',
      }
    default:
      return state
  }
}

export function useOnboardingState(seed?: Partial<OnboardingDraft>) {
  const [state, dispatch] = useReducer(reducer, null, () => ({
    ...createInitialDraft(),
    ...seed,
  }))

  const actions = useMemo(
    () => ({
      goToStep: (step: OnboardingStepId) => dispatch({ type: 'setStep', step }),
      next: () => dispatch({ type: 'next' }),
      back: () => dispatch({ type: 'back' }),
      setDisplayName: (value: string) => dispatch({ type: 'setDisplayName', value }),
      setAvatar: (slug: AvatarSlug) => dispatch({ type: 'setAvatar', slug }),
      setFamily: (mode: 'created' | 'joined', familyId: string) =>
        dispatch({ type: 'setFamily', mode, familyId }),
      setAccountKind: (value: AccountKind) => dispatch({ type: 'setAccountKind', value }),
      setMonthlyIncome: (value: string) => dispatch({ type: 'setMonthlyIncome', value }),
      setSalaryDay: (value: number) => dispatch({ type: 'setSalaryDay', value }),
      setSavingsPercent: (value: number) => dispatch({ type: 'setSavingsPercent', value }),
      setCreateFirstGoal: (value: boolean) => dispatch({ type: 'setCreateFirstGoal', value }),
      setFirstGoalTitle: (value: string) => dispatch({ type: 'setFirstGoalTitle', value }),
      setFirstGoalEmoji: (value: string) => dispatch({ type: 'setFirstGoalEmoji', value }),
      setFirstGoalTarget: (value: string) => dispatch({ type: 'setFirstGoalTarget', value }),
      setFirstGoalMonths: (value: number) => dispatch({ type: 'setFirstGoalMonths', value }),
      setContributesIncome: (value: boolean | null) =>
        dispatch({ type: 'setContributesIncome', value }),
      setPendingFamily: (value: FamilyPeek | null) =>
        dispatch({ type: 'setPendingFamily', value }),
    }),
    [],
  )

  return { state, actions }
}
