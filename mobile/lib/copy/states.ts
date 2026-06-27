/**
 * Canonical KEY registry for UI states. The actual copy lives in the
 * `states` i18n namespace (`states.json`, es+en) under `empty.<key>`,
 * `loading.<key>` and `error.<key>`. The state components
 * (`<EmptyState>`, `<LoadingBlock>`, `<ErrorState>`) resolve the copy
 * at render time via `t('states:...')` using the KEY the consumer passes.
 *
 * These maps are KEY-ONLY now: they exist purely to keep the set of
 * valid keys in one typed place (for `EmptyStateKey`, autocomplete and
 * the i18n lint). Each value is its own key string, so a consumer that
 * needs the key as data (not a rendered component) can reference it
 * without hardcoding the literal. Hardcoded state copy is banned by CI —
 * resolve through `t('states:...')` instead.
 */

export const emptyStates = {
  expensesThisCycle: 'expensesThisCycle',
  debt: 'debt',
  fixedRecurring: 'fixedRecurring',
  fixedInstallments: 'fixedInstallments',
  cycleInOrder: 'cycleInOrder',
  categories: 'categories',
  notifications: 'notifications',
  noData: 'noData',
} as const

export type EmptyStateKey = keyof typeof emptyStates

export const loadingLabels = {
  expenses: 'expenses',
  fixedExpenses: 'fixedExpenses',
  control: 'control',
  home: 'home',
  categories: 'categories',
  notifications: 'notifications',
  settings: 'settings',
  import: 'import',
} as const

export type LoadingKey = keyof typeof loadingLabels

export const errorMessages = {
  network: 'network',
  server: 'server',
  data: 'data',
  auth: 'auth',
} as const

export type ErrorMessageKey = keyof typeof errorMessages
