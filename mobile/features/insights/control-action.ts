// Declarative CTA actions for the Asistente Financiero.
//
// Each advisor rule declares a `ControlAction` describing what should
// happen when the user taps its CTA. A single dispatcher
// (`use-control-action-dispatcher.ts`) resolves the action into a
// router call, modal open, filter apply, or side-effect — so the
// rules stay pure and the routing/side-effect lives in one place.

export type ControlSectionAnchor =
  | 'hoy'
  | 'alcanza'
  | 'alcancia'
  | 'semana'
  | 'vsmes'
  | 'patron'
  | 'cobertura'

export interface ExpensesFilterParams {
  categoryId?: string
  /** Only show expenses under this price (in ARS). */
  priceMax?: number
  /** Only show expenses over this price. */
  priceMin?: number
  /** Semantic range — the screen resolves to concrete start/end dates. */
  dateRange?:
    | 'today'
    | 'last-7'
    | 'first-3-days'
    | 'last-3-days'
    | 'nights'
  /** Focus a single expense id (scroll to it + highlight). */
  focusExpenseId?: string
}

export type ControlAction =
  /** Plain navigation to a route. */
  | { kind: 'navigate'; route: string; params?: Record<string, string> }
  /** Open the fixed-expense editor for a specific item. */
  | { kind: 'open-fixed-expense'; fixedExpenseId: string }
  /** Jump to `/expenses` with a filter preset. */
  | { kind: 'open-expenses-filtered'; filter: ExpensesFilterParams }
  /** Open add-fixed-expense with amount / description pre-filled. */
  | { kind: 'open-add-fixed-prefilled'; amount?: number; description?: string }
  /** Open the savings-goal editor. */
  | { kind: 'open-savings-goal' }
  /** Open the streak bottom sheet on Home. */
  | { kind: 'open-streak-sheet' }
  /** Smooth-scroll to a section of the Control screen + pulse. */
  | { kind: 'scroll-to-section'; section: ControlSectionAnchor }
  /**
   * Send a "heads up" push notification to the family member that
   * carries the imbalance burden. Used by `member-imbalance`.
   */
  | {
      kind: 'send-member-warning'
      targetUserId: string
      message: string
    }
  /**
   * 1-tap savings contribution: dispatch the existing
   * `add_savings_contribution` RPC with a fixed amount derived
   * from the signal (e.g. positive-forecast's expected leftover).
   * The dispatcher confirms with the user, fires the mutation, and
   * shows success/error feedback. After success the card is
   * dismissed so it doesn't keep prompting in the same cycle.
   */
  | {
      kind: 'quick-savings-contribution'
      amount: number
      dismissId: string
    }
  /**
   * Celebratory / informational cards that need no navigation.
   * The dispatcher marks the card as dismissed for the day so it
   * doesn't reappear, and the UI collapses it with a check.
   */
  | { kind: 'dismiss'; dismissId: string }

/** Helper to keep the action field compact at the rule definition. */
export function a(action: ControlAction): ControlAction {
  return action
}
