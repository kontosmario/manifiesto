/**
 * Pure decision function for the no-spend petal in the FAB.
 *
 * Lives in its own file (instead of the `.tsx` component) so the
 * unit test can import it under vitest's Node environment without
 * pulling the component's transitive native-only dependencies
 * (`expo-router`, `expo-linear-gradient`, `@expo/vector-icons` …)
 * through the import chain — each of those throws at module load
 * because vitest's loader can't parse their JSX/native bindings.
 *
 * The component re-imports + re-exports this helper, so consumers
 * of `add-expense-tab-button.tsx` keep their existing API surface.
 */
export type NoSpendPetalDecision =
  | { kind: 'noop'; reason: 'pending' | 'no-family' }
  | { kind: 'unmark' }
  | { kind: 'mark-confirm' }
  | { kind: 'mark-direct' }

export function decideNoSpendPetal(input: {
  isMutationPending: boolean
  familyId: string | undefined
  hasMarkedToday: boolean
  hasExpensesTodayOwn: boolean
}): NoSpendPetalDecision {
  if (input.isMutationPending) return { kind: 'noop', reason: 'pending' }
  if (!input.familyId) return { kind: 'noop', reason: 'no-family' }
  if (input.hasMarkedToday) return { kind: 'unmark' }
  if (input.hasExpensesTodayOwn) return { kind: 'mark-confirm' }
  return { kind: 'mark-direct' }
}
