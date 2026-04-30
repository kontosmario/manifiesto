/**
 * Minimal stub for `@react-navigation/native` used in vitest (Node
 * environment). Vitest can't transform the package's source (it
 * includes RN-specific syntax), so any module that transitively
 * imports it would fail to load.
 *
 * We expose only what the codebase consumes from inside files that
 * end up in the test import chain (currently `useIsFocused`, used
 * by `useLoopAnimation`, which is in turn imported by skeleton
 * components covered by `skeleton-layouts.test.ts`).
 *
 * Tests that exercise navigation behavior should use a different
 * approach (component-level mocks); this stub is for syntactic
 * pass-through only.
 */

export function useIsFocused(): boolean {
  return true
}

export function useNavigation(): unknown {
  return {
    navigate: () => undefined,
    goBack: () => undefined,
    setOptions: () => undefined,
  }
}

export function useRoute(): unknown {
  return { params: {} }
}

export function useFocusEffect(_effect: () => void | (() => void)): void {
  return
}
