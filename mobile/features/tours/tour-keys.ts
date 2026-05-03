/**
 * Identifiers for each guided tour we ship. One per top-level tab —
 * deeper screens can reuse a parent key or add their own here.
 *
 * The string values double as the SecureStore key suffixes (see
 * `persistence.ts`), so renaming a key resets the "seen" flag for
 * every existing user. Don't rename casually.
 */
export const TOUR_KEYS = {
  home: 'home',
  gastos: 'gastos',
  fijos: 'fijos',
  control: 'control',
} as const

export type TourKey = (typeof TOUR_KEYS)[keyof typeof TOUR_KEYS]

export const ALL_TOUR_KEYS: TourKey[] = [
  TOUR_KEYS.home,
  TOUR_KEYS.gastos,
  TOUR_KEYS.fijos,
  TOUR_KEYS.control,
]

export const TOUR_LABELS: Record<TourKey, string> = {
  home: 'Inicio',
  gastos: 'Gastos',
  fijos: 'Fijos',
  control: 'Control',
}
