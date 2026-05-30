// Response shapes for the 5 split RPCs (audit §2 / migration
// 20260505000000_gastos_split_endpoints.sql).
//
// Each shape mirrors exactly what the corresponding `gastos_*` RPC
// returns. The hooks consume `supabase.rpc(name).returns<Shape>()`
// and the controller composes them into the screen-facing API.

export type GastosDayMood = 'green' | 'amber' | 'red' | 'empty'

export interface GastosTopCategoryRow {
  id: string
  name: string
  color: string
  amount: number
  percent: number
}

export interface GastosHeroSummary {
  total: number
  count: number
  cycle_days_elapsed: number
  average_daily: number
  top_categories: GastosTopCategoryRow[]
  /** 7 entries, oldest day first → today last. Normalized to [0, 1]. */
  recent_daily_bars: number[]
}

export interface GastosCalendarDay {
  /** Local-day ISO `YYYY-MM-DD`. Unique key across the cycle. */
  iso_date: string
  /** Day-of-month 1..31. May collide across cycles that span the same
   *  date in two months — callers using day as a key in the calendar
   *  grid should be aware (typical cycles don't trigger this). */
  day: number
  total: number
  count: number
  mood: GastosDayMood
}

export interface GastosCalendarSummary {
  days: GastosCalendarDay[]
}

export interface GastosCategoryWithCount {
  id: string
  name: string
  color: string
  count_in_cycle: number
}

export interface GastosCategoriesResponse {
  categories: GastosCategoryWithCount[]
}

export interface GastosExpenseRow {
  id: string
  family_id: string
  category_id: string
  /** Embedded from `categories.name` server-side. Null only if the
   *  category was deleted while the expense survives. */
  category_name: string | null
  category_color: string | null
  commitment_id: string | null
  description: string
  /** Optional free-form context attached to the expense. `null` when
   *  the user did not add a note. Projected from `expenses.notes`
   *  since the gastos_expenses_* RPCs were updated to include it
   *  (migration 20260519000000). */
  notes: string | null
  /** Stored as numeric in DB; Supabase's PostgREST returns string for
   *  high-precision numerics. The hook normalizes to number. */
  price: number
  created_at: string
  created_by: string
  /** Embedded from `profiles.display_name` server-side. */
  creator_display_name: string | null
  /** Local-day key the expense belongs to. Computed server-side using
   *  the timezone passed to the RPC. */
  iso_date: string
  /** True cuando el expense fue creado al registrar pago sobre un fijo
   *  VENCIDO. Proyectado desde `expenses.paid_in_arrears` (migración
   *  20260530120000). Optional para tolerar payloads pre-migración. */
  paid_in_arrears?: boolean | null
}

export interface GastosExpensesPage {
  expenses: GastosExpenseRow[]
  /** ISO date of the oldest day in this page. Pass as
   *  `p_before_iso_date` to fetch the next page. `null` when no more
   *  pages exist. */
  next_cursor: string | null
  has_more: boolean
}

export interface GastosExpensesForDay {
  expenses: GastosExpenseRow[]
}
