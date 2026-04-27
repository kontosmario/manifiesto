import { useMemo, useReducer } from 'react'
import type { AvatarSlug } from '@/assets/avatars'
import { randomAvatarSlug } from '@/assets/avatars'

export type OnboardingStepId = 1 | 2 | 3 | 4 | 5
export const ONBOARDING_TOTAL_STEPS = 5

export interface OnboardingDraft {
  step: OnboardingStepId
  displayName: string
  avatarSlug: AvatarSlug
  familyMode: 'none' | 'created' | 'joined'
  familyId: string | null
  familyCode: string | null
  monthlyIncomeRaw: string
  salaryPaymentDay: number
  savingsGoalPercent: number
  createFirstGoal: boolean
  firstGoalTitle: string
  firstGoalTargetRaw: string
  firstGoalMonths: number
}

type Action =
  | { type: 'setStep'; step: OnboardingStepId }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'setDisplayName'; value: string }
  | { type: 'setAvatar'; slug: AvatarSlug }
  | { type: 'setFamily'; mode: 'created' | 'joined'; familyId: string; familyCode: string }
  | { type: 'setMonthlyIncome'; value: string }
  | { type: 'setSalaryDay'; value: number }
  | { type: 'setSavingsPercent'; value: number }
  | { type: 'setCreateFirstGoal'; value: boolean }
  | { type: 'setFirstGoalTitle'; value: string }
  | { type: 'setFirstGoalTarget'; value: string }
  | { type: 'setFirstGoalMonths'; value: number }

function createInitialDraft(): OnboardingDraft {
  return {
    step: 1,
    displayName: '',
    avatarSlug: randomAvatarSlug(),
    familyMode: 'none',
    familyId: null,
    familyCode: null,
    monthlyIncomeRaw: '',
    salaryPaymentDay: 1,
    savingsGoalPercent: 20,
    createFirstGoal: false,
    firstGoalTitle: '',
    firstGoalTargetRaw: '',
    firstGoalMonths: 6,
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
        familyCode: action.familyCode,
      }
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
    case 'setFirstGoalTarget':
      return { ...state, firstGoalTargetRaw: action.value }
    case 'setFirstGoalMonths':
      return { ...state, firstGoalMonths: action.value }
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
      setFamily: (mode: 'created' | 'joined', familyId: string, familyCode: string) =>
        dispatch({ type: 'setFamily', mode, familyId, familyCode }),
      setMonthlyIncome: (value: string) => dispatch({ type: 'setMonthlyIncome', value }),
      setSalaryDay: (value: number) => dispatch({ type: 'setSalaryDay', value }),
      setSavingsPercent: (value: number) => dispatch({ type: 'setSavingsPercent', value }),
      setCreateFirstGoal: (value: boolean) => dispatch({ type: 'setCreateFirstGoal', value }),
      setFirstGoalTitle: (value: string) => dispatch({ type: 'setFirstGoalTitle', value }),
      setFirstGoalTarget: (value: string) => dispatch({ type: 'setFirstGoalTarget', value }),
      setFirstGoalMonths: (value: number) => dispatch({ type: 'setFirstGoalMonths', value }),
    }),
    [],
  )

  return { state, actions }
}
