/**
 * Seed helpers for integration tests.
 *
 * `seedMinimalFamily()` provisions a self-contained family in the LOCAL DB
 * with one owner user, one expense category, five expenses, one fixed
 * expense, and a baseline `family_finance` row. It returns the user's
 * access token so the test can call RPCs through `userClient(token)` and
 * exercise the same RLS path the app uses.
 *
 * We intentionally bypass the `bootstrap_family` SECURITY DEFINER RPC and
 * insert directly via the service-role client. `bootstrap_family` reads
 * `auth.uid()` from the session and is awkward to drive from the admin
 * client; direct inserts give us deterministic, fast, isolated fixtures
 * without losing coverage — `home_snapshot` is what we're testing here,
 * not the bootstrap path.
 *
 * `cleanupFamily()` deletes the family (cascades to members, expenses,
 * fixed_expenses, etc.) and the auth user (cascades to the profile).
 * Idempotent: missing rows are tolerated.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { adminClient } from './supabase-test-client'

export type SeededFamily = {
  familyId: string
  ownerId: string
  ownerEmail: string
  ownerAccessToken: string
}

export type CycleConfigSeed =
  | { cycle_type: 'monthly'; salary_payment_day: number }
  | { cycle_type: 'biweekly'; cycle_anchor_date: string; cycle_length_days: 14 }
  | { cycle_type: 'weekly'; cycle_anchor_date: string; cycle_length_days: 7 }
  | { cycle_type: 'custom'; cycle_anchor_date: string; cycle_length_days: number }

export interface SeedOptions {
  /** Cycle config a setear en `family_finance` post-seed. Default monthly day 1. */
  cycle?: CycleConfigSeed
  /** Override de monthly_income. Default 1_000_000. */
  monthlyIncome?: number
}

const TEST_PASSWORD = 'test1234!'

export async function seedMinimalFamily(
  suffix = '',
  options: SeedOptions = {},
): Promise<SeededFamily> {
  const admin = adminClient()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const email = `test-${stamp}${suffix}@manifiesto.test`

  // 1) Create user (trigger auto-creates the profile row).
  const { data: signup, error: signupErr } =
    await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'Test Owner' },
    })
  if (signupErr || !signup.user) {
    throw signupErr ?? new Error('createUser returned no user')
  }
  const ownerId = signup.user.id

  // 2) Create the family + owner membership + finance row.
  const { data: family, error: familyErr } = await admin
    .from('families')
    .insert({})
    .select('id')
    .single()
  if (familyErr || !family) {
    throw familyErr ?? new Error('failed to create family')
  }
  const familyId = family.id as string

  const { error: memberErr } = await admin
    .from('family_members')
    .insert({ family_id: familyId, user_id: ownerId, role: 'owner' })
  if (memberErr) throw memberErr

  // The `family_members` insert above triggers `recompute_family_income`,
  // which upserts a `family_finance` row. Update the auto-created row with
  // the values we need for the snapshot fixture.
  const cycle = options.cycle ?? { cycle_type: 'monthly' as const, salary_payment_day: 1 }
  const financeUpdate: Record<string, unknown> = {
    monthly_income: options.monthlyIncome ?? 1_000_000,
    savings_goal: 0,
    savings_goal_percent: 0,
    usd_exchange_rate: 1000,
    cycle_type: cycle.cycle_type,
  }
  if (cycle.cycle_type === 'monthly') {
    financeUpdate.salary_payment_day = cycle.salary_payment_day
    financeUpdate.cycle_anchor_date = null
    financeUpdate.cycle_length_days = null
  } else {
    financeUpdate.salary_payment_day = 1
    financeUpdate.cycle_anchor_date = cycle.cycle_anchor_date
    financeUpdate.cycle_length_days = cycle.cycle_length_days
  }
  const { error: financeErr } = await admin
    .from('family_finance')
    .update(financeUpdate)
    .eq('family_id', familyId)
  if (financeErr) throw financeErr

  // 3) One expense category to anchor the expenses.
  const { data: category, error: categoryErr } = await admin
    .from('categories')
    .insert({
      family_id: familyId,
      name: 'Gastos generales',
      scope: 'expense',
    })
    .select('id')
    .single()
  if (categoryErr || !category) {
    throw categoryErr ?? new Error('failed to create category')
  }

  // 4) Five expenses.
  const expenses = Array.from({ length: 5 }, (_, i) => ({
    family_id: familyId,
    category_id: category.id,
    description: `Gasto ${i + 1}`,
    price: 1000 + i * 100,
    created_by: ownerId,
  }))
  const { error: expensesErr } = await admin.from('expenses').insert(expenses)
  if (expensesErr) throw expensesErr

  // 5) One fixed expense.
  const today = new Date()
  const nextDueOn = new Date(today.getFullYear(), today.getMonth() + 1, 5)
    .toISOString()
    .slice(0, 10)
  const { error: fixedErr } = await admin.from('fixed_expenses').insert({
    family_id: familyId,
    name: 'Alquiler',
    amount: 200_000,
    kind: 'recurring',
    status: 'active',
    frequency: 'monthly',
    day_of_month: 5,
    next_due_on: nextDueOn,
    installments_paid: 0,
  })
  if (fixedErr) throw fixedErr

  // 6) Sign in as the user to get an access token.
  const { data: session, error: signInErr } =
    await admin.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (signInErr || !session.session) {
    throw signInErr ?? new Error('signInWithPassword returned no session')
  }

  return {
    familyId,
    ownerId,
    ownerEmail: email,
    ownerAccessToken: session.session.access_token,
  }
}

export async function cleanupFamily(family: SeededFamily | undefined | null): Promise<void> {
  if (!family) return
  const admin = adminClient()
  await safeDeleteFamily(admin, family.familyId)
  await safeDeleteUser(admin, family.ownerId)
}

async function safeDeleteFamily(admin: SupabaseClient, familyId: string) {
  try {
    await admin.from('families').delete().eq('id', familyId)
  } catch {
    /* idempotent */
  }
}

async function safeDeleteUser(admin: SupabaseClient, userId: string) {
  try {
    await admin.auth.admin.deleteUser(userId)
  } catch {
    /* idempotent */
  }
}
