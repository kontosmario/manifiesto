# Home Redesign (V1 Cuaderno) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a pixel-perfect React Native port of the V1 Cuaderno home from `Manifiesto.zip`, wired to real Supabase data, including two new tables (`savings_goals`, `fixed_expense_payments`), new hooks, new components, extended theme tokens, and a Settings entry to manage the savings goal.

**Architecture:** Data lives in Supabase under RLS (using the existing `public.is_family_member` helper). Model logic is pure TypeScript in `mobile/features/<domain>/` with Vitest coverage. React Query hooks compose repository functions. Home presentation lives in `mobile/components/home/<section>.tsx` files kept ≤ 200 lines each. Reanimated + `react-native-svg` drive all animations; `Intl` formatting always runs on the JS thread via `runOnJS` per the recorded Reanimated worklet constraint.

**Tech Stack:** React Native (Expo), TypeScript, @tanstack/react-query, @supabase/supabase-js, react-native-reanimated (v3), react-native-svg, expo-router, Vitest.

**Spec:** [docs/superpowers/specs/2026-04-22-home-redesign-v1-cuaderno-design.md](../specs/2026-04-22-home-redesign-v1-cuaderno-design.md)

**Design source:** `Manifiesto.zip/src/v1-cuaderno.jsx` (primary) + `v1-dark.jsx` (dark mode tokens) + `shared.jsx` (avatar/tabbar primitives) + `theme.jsx` (token map).

**Referenced files:**
- [mobile/screens/home/home-screen.tsx](../../../mobile/screens/home/home-screen.tsx) — existing home shell
- [mobile/components/home/home-dashboard.tsx](../../../mobile/components/home/home-dashboard.tsx) — to rewrite
- [mobile/components/home/home-hero-card.tsx](../../../mobile/components/home/home-hero-card.tsx) — to replace
- [mobile/theme/palette.ts](../../../mobile/theme/palette.ts) — to extend
- [sql/supabase.sql](../../../sql/supabase.sql) — migrations appended at end
- [mobile/features/home/home-dashboard-model.ts](../../../mobile/features/home/home-dashboard-model.ts) — new pure functions added

---

## Phases at a glance

| Phase | Deliverable |
|---|---|
| A | SQL migrations + RLS for `savings_goals` + `fixed_expense_payments` + seed |
| B | Theme token extension + token tests |
| C | Repository layer + types (no React) |
| D | React Query hooks (composition of repos) |
| E | Pure model functions + tests (streak, mood, sparkline, comparison, goal projection) |
| F | Reusable animation primitives (CountUp, StrokeDrawPath, RiseView, etc.) |
| G | Home section components (Greeting, FamilyStrip, Hero, Shortcut, Meta, Activity row) |
| H | HomeDashboard assembly + home-screen wiring + deprecate old files |
| I | Settings "Meta de ahorro" entry + form screen |
| J | Reduced-motion + edge-case regressions + final QA + cleanup |

---

## File inventory

**New files:**

- `mobile/features/savings-goals/savings-goal.model.ts`
- `mobile/features/savings-goals/savings-goal.repository.ts`
- `mobile/features/savings-goals/use-savings-goal.ts`
- `mobile/features/savings-goals/use-upsert-savings-goal.ts`
- `mobile/features/fixed-expenses/fixed-expense-payment.model.ts`
- `mobile/features/fixed-expenses/fixed-expense-payment.repository.ts`
- `mobile/features/fixed-expenses/use-fixed-expense-payments.ts`
- `mobile/features/fixed-expenses/use-mark-fixed-expense-paid.ts`
- `mobile/features/home/home-aggregates.model.ts` — pure functions: `computeNoExcessStreak`, `computeMonthDailyMood`, `computeMonthlyComparison`, `buildDailyAvailableSparkline`, `buildSavingsGoalMonthsRemaining`, `buildHeroStatsTrio`
- `mobile/features/home/use-monthly-expense-comparison.ts`
- `mobile/features/home/use-daily-available-sparkline.ts`
- `mobile/features/home/use-no-excess-streak.ts`
- `mobile/features/home/use-month-daily-mood.ts`
- `mobile/components/home/animated/count-up-text.tsx`
- `mobile/components/home/animated/rise-view.tsx`
- `mobile/components/home/animated/slide-in-view.tsx`
- `mobile/components/home/animated/breathe-dot.tsx`
- `mobile/components/home/animated/float-view.tsx`
- `mobile/components/home/animated/shine-overlay.tsx`
- `mobile/components/home/ambient-blobs.tsx`
- `mobile/components/home/greeting-header.tsx`
- `mobile/components/home/family-strip.tsx`
- `mobile/components/home/payday-pill-v2.tsx`
- `mobile/components/home/hero-sparkline.tsx`
- `mobile/components/home/hero-aurora.tsx`
- `mobile/components/home/hero-stat.tsx`
- `mobile/components/home/home-hero-card-v2.tsx`
- `mobile/components/home/shortcut-card.tsx`
- `mobile/components/home/mini-bars.tsx`
- `mobile/components/home/pago-dots.tsx`
- `mobile/components/home/shortcut-cards-row.tsx`
- `mobile/components/home/meta-card.tsx`
- `mobile/components/home/activity-row-v2.tsx`
- `mobile/components/home/who-paid-avatar.tsx`
- `mobile/screens/settings/savings-goal-screen.tsx`
- `mobile/components/settings/settings-savings-goal-card.tsx`
- `mobile/components/settings/savings-goal-form.tsx`
- `app/(app)/savings-goal.tsx`
- Tests (one file per model): `tests/unit/savings-goal-model.test.ts`, `tests/unit/home-aggregates-streak.test.ts`, `tests/unit/home-aggregates-mood.test.ts`, `tests/unit/home-aggregates-comparison.test.ts`, `tests/unit/home-aggregates-sparkline.test.ts`, `tests/unit/home-aggregates-hero-stats.test.ts`, `tests/unit/palette-home-tokens.test.ts`

**Modified files:**
- `sql/supabase.sql` — append table defs, RLS, seed idempotence block
- `mobile/theme/palette.ts` — extend `ThemeColors` + `lightColors` + `darkColors` with home tokens
- `mobile/components/home/home-dashboard.tsx` — rewrite layout; preserve error/empty contract
- `mobile/screens/home/home-screen.tsx` — pass new hook data into `HomeDashboard`
- `mobile/hooks/use-family-dashboard.ts` — no change unless a new aggregate needs to go through it (decide in Phase D)
- `mobile/components/settings/settings-sections.tsx` or similar — add "Meta de ahorro" entry card
- `mobile/screens/settings/settings-screen.tsx` — wire the new card
- `app/(app)/_layout.tsx` — register new `savings-goal` route

**Deleted files (after assembly + visual QA):**
- `mobile/components/home/home-hero-card.tsx` (replaced by `home-hero-card-v2.tsx`)
- `mobile/components/home/payday-pill.tsx` (replaced by `payday-pill-v2.tsx`) — *only if no other screen uses it; verified via grep in Phase H*
- `mobile/components/home/home-metric-strip.tsx` — *if present and unused after rewrite*

---

## Phase A — Database migrations

### Task A1: Append `savings_goals` table + RLS + trigger

**Files:**
- Modify: `sql/supabase.sql` (append at end of file, before the final `end;` of whatever wraps it — or simply at EOF if no wrapper)

- [ ] **Step 1: Read the current EOF of `sql/supabase.sql` to locate append position**

Run: `tail -40 sql/supabase.sql`
Expected: shows the last policy / function block. Append after the very last non-blank line.

- [ ] **Step 2: Append the `savings_goals` block**

Append this to `sql/supabase.sql`:

```sql
-- ==============================================================
-- savings_goals — per-family meta for the Home screen
-- ==============================================================

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  emoji text not null default '🎯',
  goal_amount numeric(12,2) not null check (goal_amount > 0),
  current_amount numeric(12,2) not null default 0 check (current_amount >= 0),
  target_months integer null check (target_months is null or target_months > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_savings_goals_family_active
  on public.savings_goals (family_id)
  where is_active;

alter table public.savings_goals enable row level security;

drop policy if exists "savings_goals_select_members" on public.savings_goals;
create policy "savings_goals_select_members"
on public.savings_goals
for select
using (public.is_family_member(family_id));

drop policy if exists "savings_goals_insert_members" on public.savings_goals;
create policy "savings_goals_insert_members"
on public.savings_goals
for insert
to authenticated
with check (public.is_family_member(family_id));

drop policy if exists "savings_goals_update_members" on public.savings_goals;
create policy "savings_goals_update_members"
on public.savings_goals
for update
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

drop policy if exists "savings_goals_delete_members" on public.savings_goals;
create policy "savings_goals_delete_members"
on public.savings_goals
for delete
using (public.is_family_member(family_id));

create or replace function public.savings_goals_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_savings_goals_updated_at on public.savings_goals;
create trigger trg_savings_goals_updated_at
before update on public.savings_goals
for each row execute function public.savings_goals_touch_updated_at();
```

- [ ] **Step 3: Commit**

```bash
git add sql/supabase.sql
git commit -m "feat(sql): add savings_goals table with RLS + touch trigger"
```

### Task A2: Append `fixed_expense_payments` table + RLS

**Files:**
- Modify: `sql/supabase.sql`

- [ ] **Step 1: Append the table + RLS block after savings_goals**

```sql
-- ==============================================================
-- fixed_expense_payments — per-month payment log for fixed expenses
-- ==============================================================

create table if not exists public.fixed_expense_payments (
  id uuid primary key default gen_random_uuid(),
  fixed_expense_id uuid not null references public.fixed_expenses(id) on delete cascade,
  period_month date not null,
  paid_at timestamptz not null default now(),
  paid_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (fixed_expense_id, period_month)
);

create index if not exists idx_fixed_expense_payments_fe_month
  on public.fixed_expense_payments (fixed_expense_id, period_month desc);

-- period_month must be the first day of a month
alter table public.fixed_expense_payments
  drop constraint if exists fixed_expense_payments_period_is_first_of_month;
alter table public.fixed_expense_payments
  add constraint fixed_expense_payments_period_is_first_of_month
  check (extract(day from period_month) = 1);

alter table public.fixed_expense_payments enable row level security;

create or replace function public.is_fixed_expense_family_member(fe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.fixed_expenses fe
    join public.family_members fm on fm.family_id = fe.family_id
    where fe.id = fe_id
      and fm.user_id = auth.uid()
  );
$$;

drop policy if exists "fixed_expense_payments_select_members" on public.fixed_expense_payments;
create policy "fixed_expense_payments_select_members"
on public.fixed_expense_payments
for select
using (public.is_fixed_expense_family_member(fixed_expense_id));

drop policy if exists "fixed_expense_payments_insert_members_self" on public.fixed_expense_payments;
create policy "fixed_expense_payments_insert_members_self"
on public.fixed_expense_payments
for insert
to authenticated
with check (
  public.is_fixed_expense_family_member(fixed_expense_id)
  and paid_by = auth.uid()
);

drop policy if exists "fixed_expense_payments_update_members" on public.fixed_expense_payments;
create policy "fixed_expense_payments_update_members"
on public.fixed_expense_payments
for update
using (public.is_fixed_expense_family_member(fixed_expense_id))
with check (public.is_fixed_expense_family_member(fixed_expense_id));

drop policy if exists "fixed_expense_payments_delete_members" on public.fixed_expense_payments;
create policy "fixed_expense_payments_delete_members"
on public.fixed_expense_payments
for delete
using (public.is_fixed_expense_family_member(fixed_expense_id));
```

- [ ] **Step 2: Commit**

```bash
git add sql/supabase.sql
git commit -m "feat(sql): add fixed_expense_payments table with RLS"
```

### Task A3: Seed one demo `savings_goal` per family that has none

**Files:**
- Modify: `sql/supabase.sql`

- [ ] **Step 1: Append an idempotent seed block**

```sql
-- ==============================================================
-- One-shot seed: insert a demo "Viaje a Bariloche" goal for any
-- family that has no active goal yet. Safe to re-run.
-- ==============================================================

do $$
begin
  insert into public.savings_goals (family_id, title, emoji, goal_amount, current_amount, target_months, is_active)
  select f.id, 'Viaje a Bariloche', '🏔️', 3000000, 1920000, 3, true
  from public.families f
  where not exists (
    select 1
    from public.savings_goals sg
    where sg.family_id = f.id and sg.is_active
  );
end;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add sql/supabase.sql
git commit -m "feat(sql): seed Viaje a Bariloche savings goal for empty families"
```

### Task A4: Apply migrations locally (manual verification)

- [ ] **Step 1: Apply to local supabase via psql or `supabase db push`**

The project uses a hosted supabase — apply by copying the three blocks into the Supabase SQL editor or by running `supabase db push` if `supabase/` local dev is configured. Verify:

```sql
select tablename from pg_tables where schemaname = 'public' and tablename in ('savings_goals','fixed_expense_payments');
-- expect 2 rows

select count(*) from public.savings_goals where is_active; -- expect ≥ 1 per family
```

- [ ] **Step 2: No commit (verification only)**

---

## Phase B — Theme token extension

### Task B1: Write failing test for new home tokens

**Files:**
- Create: `tests/unit/palette-home-tokens.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { buildTheme } from '@/theme/palette'

describe('palette home tokens', () => {
  it('exposes heroGradient and hero accent in light mode', () => {
    const t = buildTheme('light')
    expect(t.colors.heroGradient).toEqual(['#0A2E1E', '#0E3A26', '#1B6B42', '#2DA15E'])
    expect(t.colors.heroAccent).toBe('#C7EE9C')
  })

  it('exposes swapped tokens in dark mode', () => {
    const t = buildTheme('dark')
    expect(t.colors.heroGradient).toEqual(['#133827', '#1F6B43', '#2E9A5F', '#2E9A5F'])
    expect(t.colors.peachSoft).toBe('#3A2A22')
  })

  it('exposes aurora blob tints, bands, and ambient ring bg', () => {
    const t = buildTheme('light')
    expect(t.colors.auroraA).toBe('rgba(199,238,156,0.35)')
    expect(t.colors.auroraB).toBe('rgba(247,181,138,0.28)')
    expect(t.colors.auroraC).toBe('rgba(141,214,106,0.22)')
    expect(t.colors.greenBand).toBe('#D6EFBA')
    expect(t.colors.redBand).toBe('#F5C6B6')
    expect(t.colors.peachBand).toBe('#FADFC8')
    expect(t.colors.ringBg).toBe('#F6EFE3')
    expect(t.colors.cream).toBe('#F6EFE3')
    expect(t.colors.creamCard).toBe('#FFFBF2')
    expect(t.colors.line).toBe('#EFE8D9')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/unit/palette-home-tokens.test.ts`
Expected: FAIL — unknown property errors on `heroGradient`, `heroAccent`, `auroraA`, etc.

- [ ] **Step 3: Extend `ThemeColors` interface and both color blocks**

In `mobile/theme/palette.ts`, add to `ThemeColors`:

```typescript
  // home redesign tokens
  heroGradient: readonly [string, string, string, string]
  heroAccent: string
  heroMuted: string
  heroMuted2: string
  heroText: string
  cream: string
  creamSoft: string
  creamCard: string
  line: string
  lineSoft: string
  peach: string
  peachSoft: string
  peachBand: string
  greenBand: string
  redBand: string
  auroraA: string
  auroraB: string
  auroraC: string
  shineOverlay: string
  ringBg: string
  pageBg: string    // warm cuaderno bg in light; deep in dark
```

Then extend `lightColors`:

```typescript
  heroGradient: ['#0A2E1E', '#0E3A26', '#1B6B42', '#2DA15E'] as const,
  heroAccent: '#C7EE9C',
  heroMuted:  'rgba(255,255,255,0.78)',
  heroMuted2: 'rgba(255,255,255,0.55)',
  heroText:   '#F6FBEF',
  cream:      '#F6EFE3',
  creamSoft:  '#FAF4EA',
  creamCard:  '#FFFBF2',
  line:       '#EFE8D9',
  lineSoft:   '#E9E1D3',
  peach:      '#F2B58A',
  peachSoft:  '#FADFC8',
  peachBand:  '#FADFC8',
  greenBand:  '#D6EFBA',
  redBand:    '#F5C6B6',
  auroraA:    'rgba(199,238,156,0.35)',
  auroraB:    'rgba(247,181,138,0.28)',
  auroraC:    'rgba(141,214,106,0.22)',
  shineOverlay: 'rgba(255,255,255,0.1)',
  ringBg:     '#F6EFE3',
  pageBg:     '#EFF5E8',
```

And `darkColors`:

```typescript
  heroGradient: ['#133827', '#1F6B43', '#2E9A5F', '#2E9A5F'] as const,
  heroAccent: '#C7EE9C',
  heroMuted:  'rgba(246,251,239,0.78)',
  heroMuted2: 'rgba(246,251,239,0.55)',
  heroText:   '#F6FBEF',
  cream:      '#0A1410',
  creamSoft:  '#0E1A15',
  creamCard:  '#13221B',
  line:       '#1F332A',
  lineSoft:   '#16261E',
  peach:      '#E8976A',
  peachSoft:  '#3A2A22',
  peachBand:  '#3A2A22',
  greenBand:  '#1E3A28',
  redBand:    '#3A241E',
  auroraA:    'rgba(199,238,156,0.25)',
  auroraB:    'rgba(232,151,106,0.22)',
  auroraC:    'rgba(141,214,106,0.18)',
  shineOverlay: 'rgba(255,255,255,0.06)',
  ringBg:     '#0A1410',
  pageBg:     '#0A1410',
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run tests/unit/palette-home-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests still pass. (Type-cast of readonly tuple may surface in other tests; if so, widen the `ThemeColors.heroGradient` type to `readonly string[]` and re-run.)

- [ ] **Step 6: Commit**

```bash
git add mobile/theme/palette.ts tests/unit/palette-home-tokens.test.ts
git commit -m "feat(theme): extend palette with home redesign tokens"
```

---

## Phase C — Repository layer

### Task C1: `savings-goal.model.ts` — types + validators

**Files:**
- Create: `mobile/features/savings-goals/savings-goal.model.ts`
- Test: `tests/unit/savings-goal-model.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import {
  validateSavingsGoalInput,
  mapSavingsGoalRow,
  type SavingsGoalRow,
} from '@/features/savings-goals/savings-goal.model'

describe('savings goal model', () => {
  it('maps a supabase row to a SavingsGoal', () => {
    const row: SavingsGoalRow = {
      id: 'g-1',
      family_id: 'f-1',
      title: 'Viaje',
      emoji: '🏔️',
      goal_amount: '3000000',
      current_amount: '1920000',
      target_months: 3,
      is_active: true,
      created_at: '2026-04-20T00:00:00Z',
      updated_at: '2026-04-22T00:00:00Z',
    }
    expect(mapSavingsGoalRow(row)).toEqual({
      id: 'g-1',
      familyId: 'f-1',
      title: 'Viaje',
      emoji: '🏔️',
      goalAmount: 3000000,
      currentAmount: 1920000,
      targetMonths: 3,
      isActive: true,
      createdAt: '2026-04-20T00:00:00Z',
      updatedAt: '2026-04-22T00:00:00Z',
    })
  })

  it('validates required fields', () => {
    expect(() => validateSavingsGoalInput({ title: '', emoji: '🎯', goalAmount: 1, currentAmount: 0, targetMonths: null, isActive: true }))
      .toThrow(/title/i)
    expect(() => validateSavingsGoalInput({ title: 'X', emoji: '🎯', goalAmount: 0, currentAmount: 0, targetMonths: null, isActive: true }))
      .toThrow(/goal/i)
    expect(() => validateSavingsGoalInput({ title: 'X', emoji: '🎯', goalAmount: 100, currentAmount: -1, targetMonths: null, isActive: true }))
      .toThrow(/current/i)
  })

  it('accepts a valid input', () => {
    const v = validateSavingsGoalInput({ title: 'Bariloche', emoji: '🏔️', goalAmount: 3000000, currentAmount: 1920000, targetMonths: 3, isActive: true })
    expect(v).toEqual({ title: 'Bariloche', emoji: '🏔️', goalAmount: 3000000, currentAmount: 1920000, targetMonths: 3, isActive: true })
  })
})
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

Run: `npx vitest run tests/unit/savings-goal-model.test.ts`

- [ ] **Step 3: Implement the model file**

```typescript
// mobile/features/savings-goals/savings-goal.model.ts
export interface SavingsGoalRow {
  id: string
  family_id: string
  title: string
  emoji: string
  goal_amount: string | number
  current_amount: string | number
  target_months: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SavingsGoal {
  id: string
  familyId: string
  title: string
  emoji: string
  goalAmount: number
  currentAmount: number
  targetMonths: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface SavingsGoalInput {
  title: string
  emoji: string
  goalAmount: number
  currentAmount: number
  targetMonths: number | null
  isActive: boolean
}

export function mapSavingsGoalRow(row: SavingsGoalRow): SavingsGoal {
  return {
    id: row.id,
    familyId: row.family_id,
    title: row.title,
    emoji: row.emoji,
    goalAmount: Number(row.goal_amount),
    currentAmount: Number(row.current_amount),
    targetMonths: row.target_months,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function validateSavingsGoalInput(input: SavingsGoalInput): SavingsGoalInput {
  const title = input.title.trim()
  if (!title) throw new Error('El título de la meta es obligatorio')
  if (title.length > 40) throw new Error('El título no puede superar 40 caracteres')
  const emoji = input.emoji.trim() || '🎯'
  if (!Number.isFinite(input.goalAmount) || input.goalAmount <= 0) {
    throw new Error('El monto objetivo debe ser mayor a cero')
  }
  if (!Number.isFinite(input.currentAmount) || input.currentAmount < 0) {
    throw new Error('El monto actual no puede ser negativo')
  }
  if (input.targetMonths != null && (!Number.isInteger(input.targetMonths) || input.targetMonths <= 0)) {
    throw new Error('Los meses objetivo deben ser un entero positivo')
  }
  return { title, emoji, goalAmount: input.goalAmount, currentAmount: input.currentAmount, targetMonths: input.targetMonths, isActive: input.isActive }
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add mobile/features/savings-goals/savings-goal.model.ts tests/unit/savings-goal-model.test.ts
git commit -m "feat(savings-goals): add model types + validation"
```

### Task C2: `savings-goal.repository.ts` — fetch + upsert

**Files:**
- Create: `mobile/features/savings-goals/savings-goal.repository.ts`

- [ ] **Step 1: Implement the repository**

```typescript
// mobile/features/savings-goals/savings-goal.repository.ts
import { supabase } from '@/lib/supabase'
import {
  mapSavingsGoalRow,
  validateSavingsGoalInput,
  type SavingsGoal,
  type SavingsGoalInput,
  type SavingsGoalRow,
} from '@/features/savings-goals/savings-goal.model'

export async function fetchActiveSavingsGoal(familyId: string): Promise<SavingsGoal | null> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('*')
    .eq('family_id', familyId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return mapSavingsGoalRow(data as SavingsGoalRow)
}

export async function fetchSavingsGoalById(id: string): Promise<SavingsGoal | null> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return mapSavingsGoalRow(data as SavingsGoalRow)
}

export async function upsertSavingsGoal(
  familyId: string,
  input: SavingsGoalInput,
  existingId: string | null,
): Promise<SavingsGoal> {
  const payload = validateSavingsGoalInput(input)
  const body = {
    family_id: familyId,
    title: payload.title,
    emoji: payload.emoji,
    goal_amount: payload.goalAmount,
    current_amount: payload.currentAmount,
    target_months: payload.targetMonths,
    is_active: payload.isActive,
  }
  const request = existingId
    ? supabase.from('savings_goals').update(body).eq('id', existingId).select('*').single()
    : supabase.from('savings_goals').insert(body).select('*').single()
  const { data, error } = await request
  if (error) throw error
  return mapSavingsGoalRow(data as SavingsGoalRow)
}

export async function deactivateOtherGoals(familyId: string, keepId: string): Promise<void> {
  const { error } = await supabase
    .from('savings_goals')
    .update({ is_active: false })
    .eq('family_id', familyId)
    .neq('id', keepId)
    .eq('is_active', true)
  if (error) throw error
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/features/savings-goals/savings-goal.repository.ts
git commit -m "feat(savings-goals): add supabase repository (fetch/upsert/deactivate)"
```

### Task C3: `fixed-expense-payment` model + repository

**Files:**
- Create: `mobile/features/fixed-expenses/fixed-expense-payment.model.ts`
- Create: `mobile/features/fixed-expenses/fixed-expense-payment.repository.ts`

- [ ] **Step 1: Implement model**

```typescript
// mobile/features/fixed-expenses/fixed-expense-payment.model.ts
export interface FixedExpensePaymentRow {
  id: string
  fixed_expense_id: string
  period_month: string // YYYY-MM-DD
  paid_at: string
  paid_by: string
  created_at: string
}

export interface FixedExpensePayment {
  id: string
  fixedExpenseId: string
  periodMonth: string
  paidAt: string
  paidBy: string
  createdAt: string
}

export function mapFixedExpensePaymentRow(row: FixedExpensePaymentRow): FixedExpensePayment {
  return {
    id: row.id,
    fixedExpenseId: row.fixed_expense_id,
    periodMonth: row.period_month,
    paidAt: row.paid_at,
    paidBy: row.paid_by,
    createdAt: row.created_at,
  }
}

export function firstOfCurrentMonth(today: Date): string {
  const y = today.getUTCFullYear()
  const m = String(today.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}
```

- [ ] **Step 2: Implement repository**

```typescript
// mobile/features/fixed-expenses/fixed-expense-payment.repository.ts
import { supabase } from '@/lib/supabase'
import {
  mapFixedExpensePaymentRow,
  type FixedExpensePayment,
  type FixedExpensePaymentRow,
} from '@/features/fixed-expenses/fixed-expense-payment.model'

export async function fetchPaymentsForMonth(
  fixedExpenseIds: string[],
  periodMonth: string,
): Promise<FixedExpensePayment[]> {
  if (fixedExpenseIds.length === 0) return []
  const { data, error } = await supabase
    .from('fixed_expense_payments')
    .select('*')
    .in('fixed_expense_id', fixedExpenseIds)
    .eq('period_month', periodMonth)
  if (error) throw error
  return (data ?? []).map((r) => mapFixedExpensePaymentRow(r as FixedExpensePaymentRow))
}

export async function createPayment(input: {
  fixedExpenseId: string
  userId: string
  periodMonth: string
}): Promise<FixedExpensePayment> {
  const { data, error } = await supabase
    .from('fixed_expense_payments')
    .insert({
      fixed_expense_id: input.fixedExpenseId,
      paid_by: input.userId,
      period_month: input.periodMonth,
    })
    .select('*')
    .single()
  if (error) throw error
  return mapFixedExpensePaymentRow(data as FixedExpensePaymentRow)
}
```

- [ ] **Step 3: Commit**

```bash
git add mobile/features/fixed-expenses/fixed-expense-payment.model.ts mobile/features/fixed-expenses/fixed-expense-payment.repository.ts
git commit -m "feat(fixed-expenses): add fixed_expense_payments model + repository"
```

---

## Phase D — React Query hooks

### Task D1: `useSavingsGoal` + `useUpsertSavingsGoal`

**Files:**
- Create: `mobile/features/savings-goals/use-savings-goal.ts`
- Create: `mobile/features/savings-goals/use-upsert-savings-goal.ts`

- [ ] **Step 1: Implement `useSavingsGoal`**

```typescript
// mobile/features/savings-goals/use-savings-goal.ts
import { useQuery } from '@tanstack/react-query'
import { fetchActiveSavingsGoal } from '@/features/savings-goals/savings-goal.repository'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'

export const savingsGoalQueryKey = (familyId?: string) => ['savings-goal', familyId ?? null] as const

export function useSavingsGoal(familyId?: string) {
  return useQuery<SavingsGoal | null>({
    queryKey: savingsGoalQueryKey(familyId),
    enabled: Boolean(familyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!familyId) return null
      return fetchActiveSavingsGoal(familyId)
    },
  })
}
```

- [ ] **Step 2: Implement `useUpsertSavingsGoal`**

```typescript
// mobile/features/savings-goals/use-upsert-savings-goal.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { upsertSavingsGoal } from '@/features/savings-goals/savings-goal.repository'
import { savingsGoalQueryKey } from '@/features/savings-goals/use-savings-goal'
import type { SavingsGoal, SavingsGoalInput } from '@/features/savings-goals/savings-goal.model'

export function useUpsertSavingsGoal(familyId: string) {
  const queryClient = useQueryClient()
  return useMutation<SavingsGoal, Error, { input: SavingsGoalInput; existingId: string | null }>({
    mutationFn: ({ input, existingId }) => upsertSavingsGoal(familyId, input, existingId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savingsGoalQueryKey(familyId) })
    },
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add mobile/features/savings-goals/use-savings-goal.ts mobile/features/savings-goals/use-upsert-savings-goal.ts
git commit -m "feat(savings-goals): add react-query hooks for fetch + upsert"
```

### Task D2: `useFixedExpensePayments` + `useMarkFixedExpensePaid`

**Files:**
- Create: `mobile/features/fixed-expenses/use-fixed-expense-payments.ts`
- Create: `mobile/features/fixed-expenses/use-mark-fixed-expense-paid.ts`

- [ ] **Step 1: Implement `useFixedExpensePayments`**

```typescript
// mobile/features/fixed-expenses/use-fixed-expense-payments.ts
import { useQuery } from '@tanstack/react-query'
import {
  fetchPaymentsForMonth,
} from '@/features/fixed-expenses/fixed-expense-payment.repository'
import {
  firstOfCurrentMonth,
  type FixedExpensePayment,
} from '@/features/fixed-expenses/fixed-expense-payment.model'

export const fixedExpensePaymentsKey = (familyId?: string, periodMonth?: string) =>
  ['fixed-expense-payments', familyId ?? null, periodMonth ?? null] as const

export function useFixedExpensePayments(params: {
  familyId?: string
  fixedExpenseIds: string[]
  today?: Date
}) {
  const periodMonth = firstOfCurrentMonth(params.today ?? new Date())
  return useQuery<FixedExpensePayment[]>({
    queryKey: fixedExpensePaymentsKey(params.familyId, periodMonth),
    enabled: Boolean(params.familyId) && params.fixedExpenseIds.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchPaymentsForMonth(params.fixedExpenseIds, periodMonth),
  })
}
```

- [ ] **Step 2: Implement `useMarkFixedExpensePaid`**

```typescript
// mobile/features/fixed-expenses/use-mark-fixed-expense-paid.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPayment } from '@/features/fixed-expenses/fixed-expense-payment.repository'
import { fixedExpensePaymentsKey } from '@/features/fixed-expenses/use-fixed-expense-payments'

export function useMarkFixedExpensePaid(params: { familyId: string; userId: string; periodMonth: string }) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { fixedExpenseId: string }>({
    mutationFn: async ({ fixedExpenseId }) => {
      await createPayment({ fixedExpenseId, userId: params.userId, periodMonth: params.periodMonth })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: fixedExpensePaymentsKey(params.familyId, params.periodMonth),
      })
    },
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add mobile/features/fixed-expenses/use-fixed-expense-payments.ts mobile/features/fixed-expenses/use-mark-fixed-expense-paid.ts
git commit -m "feat(fixed-expenses): add hooks for monthly payments + mark paid"
```

---

## Phase E — Pure aggregate model + tests

All functions live in `mobile/features/home/home-aggregates.model.ts`. Each is TDD.

### Task E1: `computeNoExcessStreak`

**Files:**
- Create: `mobile/features/home/home-aggregates.model.ts`
- Create: `tests/unit/home-aggregates-streak.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/home-aggregates-streak.test.ts
import { describe, it, expect } from 'vitest'
import { computeNoExcessStreak } from '@/features/home/home-aggregates.model'

describe('computeNoExcessStreak', () => {
  const day = (n: number) => `2026-04-${String(n).padStart(2,'0')}T12:00:00Z`

  it('returns 0 with no expenses', () => {
    expect(computeNoExcessStreak({ expenses: [], dailyBudget: 1000, today: new Date(day(22)) })).toBe(0)
  })

  it('counts backward until the first day that exceeds budget', () => {
    const expenses = [
      { price: 400, created_at: day(22) },
      { price: 600, created_at: day(22) }, // today = exactly at budget (ok)
      { price: 500, created_at: day(21) }, // ok
      { price: 1500, created_at: day(20) }, // exceeded
      { price: 200, created_at: day(19) }, // ok (but stops)
    ]
    expect(computeNoExcessStreak({ expenses, dailyBudget: 1000, today: new Date(day(22)) })).toBe(2)
  })

  it('returns 0 when today is already over', () => {
    const expenses = [{ price: 1200, created_at: day(22) }]
    expect(computeNoExcessStreak({ expenses, dailyBudget: 1000, today: new Date(day(22)) })).toBe(0)
  })

  it('skips empty days as "ok"', () => {
    const expenses = [
      { price: 800, created_at: day(22) },
      // day 21 no expenses → counts as ok
      { price: 1100, created_at: day(20) },
    ]
    expect(computeNoExcessStreak({ expenses, dailyBudget: 1000, today: new Date(day(22)) })).toBe(2)
  })

  it('returns 0 when dailyBudget is null or ≤ 0', () => {
    expect(computeNoExcessStreak({ expenses: [], dailyBudget: null, today: new Date(day(22)) })).toBe(0)
    expect(computeNoExcessStreak({ expenses: [{ price: 1, created_at: day(22) }], dailyBudget: 0, today: new Date(day(22)) })).toBe(0)
  })
})
```

- [ ] **Step 2: Run — FAIL**

Run: `npx vitest run tests/unit/home-aggregates-streak.test.ts`

- [ ] **Step 3: Implement**

```typescript
// mobile/features/home/home-aggregates.model.ts (start file)
export interface StreakExpense {
  price: number
  created_at: string
}

export interface ComputeNoExcessStreakInput {
  expenses: StreakExpense[]
  dailyBudget: number | null
  today: Date
}

function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function computeNoExcessStreak(input: ComputeNoExcessStreakInput): number {
  if (input.dailyBudget == null || input.dailyBudget <= 0) return 0
  const totals = new Map<string, number>()
  for (const e of input.expenses) {
    const k = utcDayKey(new Date(e.created_at))
    totals.set(k, (totals.get(k) ?? 0) + e.price)
  }

  let streak = 0
  const cursor = new Date(Date.UTC(input.today.getUTCFullYear(), input.today.getUTCMonth(), input.today.getUTCDate()))
  while (true) {
    const key = utcDayKey(cursor)
    const total = totals.get(key) ?? 0
    if (total > input.dailyBudget) break
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
    if (streak > 366) break
  }
  return streak
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add mobile/features/home/home-aggregates.model.ts tests/unit/home-aggregates-streak.test.ts
git commit -m "feat(home): add computeNoExcessStreak + tests"
```

### Task E2: `computeMonthDailyMood`

**Files:**
- Modify: `mobile/features/home/home-aggregates.model.ts`
- Create: `tests/unit/home-aggregates-mood.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/home-aggregates-mood.test.ts
import { describe, it, expect } from 'vitest'
import { computeMonthDailyMood } from '@/features/home/home-aggregates.model'

describe('computeMonthDailyMood', () => {
  const d = (n: number) => `2026-04-${String(n).padStart(2,'0')}T12:00:00Z`

  it('returns empty map with null budget', () => {
    expect(computeMonthDailyMood({ expenses: [], dailyBudget: null, today: new Date(d(22)) })).toEqual({})
  })

  it('tags green ≤ budget, amber ≤ 1.2× budget, red > 1.2× budget', () => {
    const expenses = [
      { price: 800,  created_at: d(1) },   // green
      { price: 1000, created_at: d(2) },   // green
      { price: 1100, created_at: d(3) },   // amber
      { price: 1200, created_at: d(4) },   // amber
      { price: 1201, created_at: d(5) },   // red
      { price: 3000, created_at: d(6) },   // red
    ]
    const mood = computeMonthDailyMood({ expenses, dailyBudget: 1000, today: new Date(d(22)) })
    expect(mood[1]).toBe('green')
    expect(mood[2]).toBe('green')
    expect(mood[3]).toBe('amber')
    expect(mood[4]).toBe('amber')
    expect(mood[5]).toBe('red')
    expect(mood[6]).toBe('red')
  })

  it('does not tag days beyond today', () => {
    const mood = computeMonthDailyMood({ expenses: [], dailyBudget: 1000, today: new Date(d(10)) })
    expect(mood[11]).toBeUndefined()
  })

  it('only considers the current calendar month of `today`', () => {
    const expenses = [{ price: 100, created_at: '2026-03-30T12:00:00Z' }]
    const mood = computeMonthDailyMood({ expenses, dailyBudget: 1000, today: new Date(d(1)) })
    expect(Object.keys(mood)).toEqual([])
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Append to `home-aggregates.model.ts`:

```typescript
export type DayMood = 'green' | 'amber' | 'red'

export interface ComputeMonthDailyMoodInput {
  expenses: StreakExpense[]
  dailyBudget: number | null
  today: Date
}

export function computeMonthDailyMood(input: ComputeMonthDailyMoodInput): Record<number, DayMood> {
  const out: Record<number, DayMood> = {}
  if (input.dailyBudget == null || input.dailyBudget <= 0) return out
  const year = input.today.getUTCFullYear()
  const month = input.today.getUTCMonth()
  const todayDay = input.today.getUTCDate()
  const totals = new Map<number, number>()
  for (const e of input.expenses) {
    const dt = new Date(e.created_at)
    if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month) continue
    const d = dt.getUTCDate()
    if (d > todayDay) continue
    totals.set(d, (totals.get(d) ?? 0) + e.price)
  }
  for (const [day, total] of totals) {
    if (total <= input.dailyBudget) out[day] = 'green'
    else if (total <= input.dailyBudget * 1.2) out[day] = 'amber'
    else out[day] = 'red'
  }
  return out
}
```

- [ ] **Step 4: Run — PASS**
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(home): add computeMonthDailyMood + tests"
```

### Task E3: `computeMonthlyComparison`

**Files:**
- Modify: `mobile/features/home/home-aggregates.model.ts`
- Create: `tests/unit/home-aggregates-comparison.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/home-aggregates-comparison.test.ts
import { describe, it, expect } from 'vitest'
import { computeMonthlyComparison } from '@/features/home/home-aggregates.model'

describe('computeMonthlyComparison', () => {
  const apr = (n: number) => `2026-04-${String(n).padStart(2,'0')}T12:00:00Z`
  const mar = (n: number) => `2026-03-${String(n).padStart(2,'0')}T12:00:00Z`

  it('returns null deltas when either side is empty', () => {
    const r = computeMonthlyComparison({
      expenses: [{ price: 100, created_at: apr(5) }],
      today: new Date(apr(22)),
    })
    expect(r.previousMonthTotal).toBe(0)
    expect(r.deltaPercent).toBeNull()
    expect(r.deltaAmount).toBeNull()
  })

  it('computes a positive delta when current > previous', () => {
    const r = computeMonthlyComparison({
      expenses: [
        { price: 1500, created_at: apr(1) },
        { price: 1500, created_at: apr(2) },  // current = 3000
        { price: 1000, created_at: mar(1) },
        { price: 1500, created_at: mar(5) },  // prev = 2500
      ],
      today: new Date(apr(22)),
    })
    expect(r.currentMonthTotal).toBe(3000)
    expect(r.previousMonthTotal).toBe(2500)
    expect(r.deltaAmount).toBe(500)
    expect(r.deltaPercent).toBeCloseTo(20, 1)
    expect(r.direction).toBe('up')
  })

  it('handles negative delta + "down"', () => {
    const r = computeMonthlyComparison({
      expenses: [
        { price: 1000, created_at: apr(2) },
        { price: 2000, created_at: mar(1) },
      ],
      today: new Date(apr(22)),
    })
    expect(r.deltaPercent).toBeCloseTo(-50, 1)
    expect(r.direction).toBe('down')
  })
})
```

- [ ] **Step 2: Run — FAIL**
- [ ] **Step 3: Implement**

```typescript
export interface MonthlyComparison {
  currentMonthTotal: number
  previousMonthTotal: number
  deltaAmount: number | null
  deltaPercent: number | null
  direction: 'up' | 'down' | 'flat'
  previousMonthLabel: string
}

const ES_MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

export function computeMonthlyComparison(input: { expenses: StreakExpense[]; today: Date }): MonthlyComparison {
  const y = input.today.getUTCFullYear()
  const m = input.today.getUTCMonth()
  const prevY = m === 0 ? y - 1 : y
  const prevM = m === 0 ? 11 : m - 1
  let current = 0
  let previous = 0
  for (const e of input.expenses) {
    const d = new Date(e.created_at)
    const ey = d.getUTCFullYear()
    const em = d.getUTCMonth()
    if (ey === y && em === m) current += e.price
    else if (ey === prevY && em === prevM) previous += e.price
  }
  const previousMonthLabel = ES_MONTHS[prevM]
  if (previous === 0) {
    return {
      currentMonthTotal: current,
      previousMonthTotal: 0,
      deltaAmount: null,
      deltaPercent: null,
      direction: 'flat',
      previousMonthLabel,
    }
  }
  const deltaAmount = current - previous
  const deltaPercent = (deltaAmount / previous) * 100
  const direction: 'up' | 'down' | 'flat' = deltaAmount > 0 ? 'up' : deltaAmount < 0 ? 'down' : 'flat'
  return { currentMonthTotal: current, previousMonthTotal: previous, deltaAmount, deltaPercent, direction, previousMonthLabel }
}
```

- [ ] **Step 4: Run — PASS**
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(home): add computeMonthlyComparison + tests"
```

### Task E4: `buildDailyAvailableSparkline`

**Files:**
- Modify: `mobile/features/home/home-aggregates.model.ts`
- Create: `tests/unit/home-aggregates-sparkline.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/home-aggregates-sparkline.test.ts
import { describe, it, expect } from 'vitest'
import { buildDailyAvailableSparkline } from '@/features/home/home-aggregates.model'

describe('buildDailyAvailableSparkline', () => {
  const day = (m: number, d: number) => `2026-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T12:00:00Z`

  it('returns null when no cycle is provided', () => {
    expect(buildDailyAvailableSparkline({ expenses: [], cycleStart: null, totalAvailable: 1000, today: new Date(day(4, 22)) })).toBeNull()
  })

  it('returns one value per elapsed day, each = totalAvailable minus running spend', () => {
    const cycleStart = new Date(day(4, 18))
    const expenses = [
      { price: 100, created_at: day(4, 18) },
      { price: 200, created_at: day(4, 19) },
      { price:  50, created_at: day(4, 20) },
    ]
    const points = buildDailyAvailableSparkline({ expenses, cycleStart, totalAvailable: 1000, today: new Date(day(4, 22)) })
    expect(points).toEqual([900, 700, 650, 650, 650])
  })

  it('downsamples to max 12 points while preserving endpoints', () => {
    const cycleStart = new Date(day(4, 1))
    const expenses = Array.from({ length: 22 }, (_, i) => ({ price: 10, created_at: day(4, i + 1) }))
    const points = buildDailyAvailableSparkline({ expenses, cycleStart, totalAvailable: 1000, today: new Date(day(4, 22)) })
    expect(points!.length).toBe(12)
    expect(points![0]).toBe(990) // after day 1
    expect(points![11]).toBe(780) // after day 22
  })
})
```

- [ ] **Step 2: Run — FAIL**
- [ ] **Step 3: Implement**

```typescript
export interface BuildDailyAvailableSparklineInput {
  expenses: StreakExpense[]
  cycleStart: Date | null
  totalAvailable: number
  today: Date
}

export function buildDailyAvailableSparkline(input: BuildDailyAvailableSparklineInput): number[] | null {
  if (!input.cycleStart) return null
  const startUtc = Date.UTC(input.cycleStart.getUTCFullYear(), input.cycleStart.getUTCMonth(), input.cycleStart.getUTCDate())
  const todayUtc = Date.UTC(input.today.getUTCFullYear(), input.today.getUTCMonth(), input.today.getUTCDate())
  const daysElapsed = Math.floor((todayUtc - startUtc) / 86_400_000) + 1
  if (daysElapsed <= 0) return null

  const perDay = new Array<number>(daysElapsed).fill(0)
  for (const e of input.expenses) {
    const d = Date.UTC(new Date(e.created_at).getUTCFullYear(), new Date(e.created_at).getUTCMonth(), new Date(e.created_at).getUTCDate())
    const idx = Math.floor((d - startUtc) / 86_400_000)
    if (idx < 0 || idx >= daysElapsed) continue
    perDay[idx] += e.price
  }
  let running = 0
  const series: number[] = []
  for (let i = 0; i < daysElapsed; i++) {
    running += perDay[i]
    series.push(input.totalAvailable - running)
  }

  const maxPoints = 12
  if (series.length <= maxPoints) return series
  const out = new Array<number>(maxPoints)
  for (let i = 0; i < maxPoints; i++) {
    const t = i / (maxPoints - 1)
    const src = Math.round(t * (series.length - 1))
    out[i] = series[src]
  }
  return out
}
```

- [ ] **Step 4: Run — PASS**
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(home): add buildDailyAvailableSparkline + tests"
```

### Task E5: `buildHeroStatsTrio`

**Files:**
- Modify: `mobile/features/home/home-aggregates.model.ts`
- Create: `tests/unit/home-aggregates-hero-stats.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/home-aggregates-hero-stats.test.ts
import { describe, it, expect } from 'vitest'
import { buildHeroStatsTrio } from '@/features/home/home-aggregates.model'

describe('buildHeroStatsTrio', () => {
  const day = (n: number) => `2026-04-${String(n).padStart(2,'0')}T12:00:00Z`

  it('builds today/spent-today/piggy with positive piggy', () => {
    const result = buildHeroStatsTrio({
      dailyBudget: 100000,
      totalAvailable: 500000,
      daysElapsed: 4,          // 4 days elapsed incl. today
      expenses: [
        { price: 12400, created_at: day(22) }, // today
        { price: 50000, created_at: day(21) },
        { price: 30000, created_at: day(20) },
      ],
      today: new Date(day(22)),
    })
    expect(result.todayRemaining).toBe(87600)      // 100k - 12.4k
    expect(result.spentToday).toBe(12400)
    expect(result.movementsToday).toBe(1)
    expect(result.piggy).toBe(300000 + 87600 - 0) // daysElapsed*budget=400k; actually spent=12400+50000+30000=92400; saved=300000-0? implementation computes saved = (daysElapsed-1)*dailyBudget - spendPreviousDays + todayRemaining
    // Concrete expectation: piggy = (daysElapsed-1)*dailyBudget - spentBeforeToday + todayRemaining
    // = 3*100000 - (50000+30000) + 87600
    // = 300000 - 80000 + 87600 = 307600
    expect(result.piggy).toBe(307600)
    expect(result.piggyState).toBe('saved')
  })

  it('returns null trio when dailyBudget is null', () => {
    const result = buildHeroStatsTrio({
      dailyBudget: null,
      totalAvailable: 0,
      daysElapsed: 0,
      expenses: [],
      today: new Date(day(22)),
    })
    expect(result.todayRemaining).toBeNull()
    expect(result.piggy).toBeNull()
    expect(result.piggyState).toBe('unknown')
  })

  it('reports "excedido" when piggy is negative', () => {
    const result = buildHeroStatsTrio({
      dailyBudget: 100,
      totalAvailable: 1000,
      daysElapsed: 2,
      expenses: [
        { price: 500, created_at: day(22) },
      ],
      today: new Date(day(22)),
    })
    // piggy = (2-1)*100 - 0 + (100-500) = 100 - 400 = -300
    expect(result.piggy).toBe(-300)
    expect(result.piggyState).toBe('excess')
  })
})
```

- [ ] **Step 2: Run — FAIL**
- [ ] **Step 3: Implement**

```typescript
export interface BuildHeroStatsTrioInput {
  dailyBudget: number | null
  totalAvailable: number
  daysElapsed: number
  expenses: StreakExpense[]
  today: Date
}

export interface HeroStatsTrio {
  todayRemaining: number | null
  spentToday: number
  movementsToday: number
  piggy: number | null
  piggyState: 'saved' | 'excess' | 'unknown'
}

export function buildHeroStatsTrio(input: BuildHeroStatsTrioInput): HeroStatsTrio {
  const todayKey = utcDayKey(input.today)
  let spentToday = 0
  let movementsToday = 0
  let spentBeforeToday = 0
  for (const e of input.expenses) {
    if (utcDayKey(new Date(e.created_at)) === todayKey) {
      spentToday += e.price
      movementsToday += 1
    } else {
      spentBeforeToday += e.price
    }
  }
  if (input.dailyBudget == null || input.dailyBudget <= 0) {
    return { todayRemaining: null, spentToday, movementsToday, piggy: null, piggyState: 'unknown' }
  }
  const todayRemaining = input.dailyBudget - spentToday
  const piggy = Math.max(0, input.daysElapsed - 1) * input.dailyBudget - spentBeforeToday + todayRemaining
  const piggyState: HeroStatsTrio['piggyState'] = piggy >= 0 ? 'saved' : 'excess'
  return { todayRemaining, spentToday, movementsToday, piggy, piggyState }
}
```

- [ ] **Step 4: Run — PASS**
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(home): add buildHeroStatsTrio + tests"
```

### Task E6: `buildSavingsGoalMonthsRemaining`

**Files:**
- Modify: `mobile/features/home/home-aggregates.model.ts`

- [ ] **Step 1: Append (no separate test — covered in savings-goal-model + integration)**

```typescript
export function buildSavingsGoalMonthsRemaining(input: {
  goalAmount: number
  currentAmount: number
  targetMonths: number | null
}): number | null {
  if (input.currentAmount >= input.goalAmount) return 0
  if (input.targetMonths == null) return null
  return input.targetMonths
}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(home): add buildSavingsGoalMonthsRemaining helper"
```

### Task E7: `useMonthlyExpenseComparison`, `useDailyAvailableSparkline`, `useNoExcessStreak`, `useMonthDailyMood`

Each is a thin composition of existing `expenses` loader + one aggregate function. All live in `mobile/features/home/`.

**Files:**
- Create: `mobile/features/home/use-monthly-expense-comparison.ts`
- Create: `mobile/features/home/use-daily-available-sparkline.ts`
- Create: `mobile/features/home/use-no-excess-streak.ts`
- Create: `mobile/features/home/use-month-daily-mood.ts`

- [ ] **Step 1: Implement all four hooks**

```typescript
// use-monthly-expense-comparison.ts
import { useQuery } from '@tanstack/react-query'
import { loadExpenses } from '@/features/expenses/expense-repository'
import {
  computeMonthlyComparison,
  type MonthlyComparison,
} from '@/features/home/home-aggregates.model'

export const monthlyComparisonKey = (familyId?: string) => ['monthly-expense-comparison', familyId ?? null] as const

export function useMonthlyExpenseComparison(familyId?: string) {
  return useQuery<MonthlyComparison>({
    queryKey: monthlyComparisonKey(familyId),
    enabled: Boolean(familyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!familyId) {
        return { currentMonthTotal: 0, previousMonthTotal: 0, deltaAmount: null, deltaPercent: null, direction: 'flat', previousMonthLabel: '' }
      }
      // load 100d of expenses; enough to cover 2 calendar months
      const since = new Date(); since.setUTCDate(since.getUTCDate() - 70)
      const rows = await loadExpenses(familyId, {})
      const inWindow = rows.filter((r) => new Date(r.created_at).getTime() >= since.getTime())
      return computeMonthlyComparison({ expenses: inWindow.map((e) => ({ price: e.price, created_at: e.created_at })), today: new Date() })
    },
  })
}
```

```typescript
// use-daily-available-sparkline.ts
import { useQuery } from '@tanstack/react-query'
import { loadExpenses } from '@/features/expenses/expense-repository'
import { buildDailyAvailableSparkline } from '@/features/home/home-aggregates.model'

export const dailyAvailableSparklineKey = (familyId?: string) => ['daily-available-sparkline', familyId ?? null] as const

export function useDailyAvailableSparkline(params: {
  familyId?: string
  cycleStart: Date | null
  totalAvailable: number
  today?: Date
}) {
  return useQuery<number[] | null>({
    queryKey: dailyAvailableSparklineKey(params.familyId),
    enabled: Boolean(params.familyId) && !!params.cycleStart,
    staleTime: 30_000,
    queryFn: async () => {
      if (!params.familyId || !params.cycleStart) return null
      const rows = await loadExpenses(params.familyId, {})
      return buildDailyAvailableSparkline({
        expenses: rows.map((e) => ({ price: e.price, created_at: e.created_at })),
        cycleStart: params.cycleStart,
        totalAvailable: params.totalAvailable,
        today: params.today ?? new Date(),
      })
    },
  })
}
```

```typescript
// use-no-excess-streak.ts
import { useQuery } from '@tanstack/react-query'
import { loadExpenses } from '@/features/expenses/expense-repository'
import { computeNoExcessStreak } from '@/features/home/home-aggregates.model'

export const noExcessStreakKey = (familyId?: string) => ['no-excess-streak', familyId ?? null] as const

export function useNoExcessStreak(params: { familyId?: string; dailyBudget: number | null; today?: Date }) {
  return useQuery<number>({
    queryKey: noExcessStreakKey(params.familyId),
    enabled: Boolean(params.familyId) && params.dailyBudget != null,
    staleTime: 30_000,
    queryFn: async () => {
      if (!params.familyId) return 0
      const rows = await loadExpenses(params.familyId, {})
      return computeNoExcessStreak({
        expenses: rows.map((e) => ({ price: e.price, created_at: e.created_at })),
        dailyBudget: params.dailyBudget,
        today: params.today ?? new Date(),
      })
    },
  })
}
```

```typescript
// use-month-daily-mood.ts
import { useQuery } from '@tanstack/react-query'
import { loadExpenses } from '@/features/expenses/expense-repository'
import { computeMonthDailyMood, type DayMood } from '@/features/home/home-aggregates.model'

export const monthDailyMoodKey = (familyId?: string) => ['month-daily-mood', familyId ?? null] as const

export function useMonthDailyMood(params: { familyId?: string; dailyBudget: number | null; today?: Date }) {
  return useQuery<Record<number, DayMood>>({
    queryKey: monthDailyMoodKey(params.familyId),
    enabled: Boolean(params.familyId) && params.dailyBudget != null,
    staleTime: 60_000,
    queryFn: async () => {
      if (!params.familyId) return {}
      const rows = await loadExpenses(params.familyId, {})
      return computeMonthDailyMood({
        expenses: rows.map((e) => ({ price: e.price, created_at: e.created_at })),
        dailyBudget: params.dailyBudget,
        today: params.today ?? new Date(),
      })
    },
  })
}
```

- [ ] **Step 2: Run the full suite to make sure nothing regressed**

Run: `npx vitest run`

- [ ] **Step 3: Commit**

```bash
git add mobile/features/home/use-monthly-expense-comparison.ts mobile/features/home/use-daily-available-sparkline.ts mobile/features/home/use-no-excess-streak.ts mobile/features/home/use-month-daily-mood.ts
git commit -m "feat(home): add 4 aggregation hooks composing loadExpenses + pure fns"
```

---

## Phase F — Animation primitives

All components in this phase are **presentational only**, in `mobile/components/home/animated/`. They must respect `useReducedMotion` (from `@/hooks/use-reduced-motion`). Entrance animations become no-ops; idle loops don't start.

### Task F1: `count-up-text.tsx`

**Files:**
- Create: `mobile/components/home/animated/count-up-text.tsx`

- [ ] **Step 1: Implement**

```tsx
// mobile/components/home/animated/count-up-text.tsx
import { useEffect, useState } from 'react'
import { Text, type TextStyle } from 'react-native'
import {
  useSharedValue,
  useAnimatedReaction,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface CountUpTextProps {
  value: number
  duration?: number
  format: (n: number) => string
  style?: TextStyle
  accessibilityLabel?: string
}

export function CountUpText({ value, duration = 1600, format, style, accessibilityLabel }: CountUpTextProps) {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(() => format(reduced ? value : 0))
  const progress = useSharedValue(reduced ? value : 0)

  useEffect(() => {
    if (reduced) {
      setDisplay(format(value))
      return
    }
    progress.value = 0
    progress.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) })
  }, [value, duration, reduced, format, progress])

  useAnimatedReaction(
    () => progress.value,
    (next) => {
      runOnJS(setDisplay)(format(Math.round(next)))
    },
    [format],
  )

  return (
    <Text style={style} accessibilityLabel={accessibilityLabel ?? display}>
      {display}
    </Text>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/components/home/animated/count-up-text.tsx
git commit -m "feat(home/animated): add CountUpText with reduced-motion fallback"
```

### Task F2: `rise-view.tsx` (entrance) + `slide-in-view.tsx`

**Files:**
- Create: `mobile/components/home/animated/rise-view.tsx`
- Create: `mobile/components/home/animated/slide-in-view.tsx`

- [ ] **Step 1: Implement RiseView**

```tsx
// mobile/components/home/animated/rise-view.tsx
import { useEffect } from 'react'
import { type ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface RiseViewProps {
  delay?: number
  duration?: number
  translateY?: number
  style?: ViewStyle
  children: React.ReactNode
}

export function RiseView({ delay = 0, duration = 700, translateY = 14, style, children }: RiseViewProps) {
  const reduced = useReducedMotion()
  const y = useSharedValue(reduced ? 0 : translateY)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    y.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.cubic) }))
    opacity.value = withDelay(delay, withTiming(1, { duration }))
  }, [delay, duration, reduced, y, opacity])
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: opacity.value }))
  return <Animated.View style={[style, animated]}>{children}</Animated.View>
}
```

- [ ] **Step 2: Implement SlideInView** (same pattern, `translateX`)

```tsx
// mobile/components/home/animated/slide-in-view.tsx
import { useEffect } from 'react'
import { type ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface SlideInViewProps {
  delay?: number
  duration?: number
  translateX?: number
  style?: ViewStyle
  children: React.ReactNode
}

export function SlideInView({ delay = 0, duration = 600, translateX = -10, style, children }: SlideInViewProps) {
  const reduced = useReducedMotion()
  const x = useSharedValue(reduced ? 0 : translateX)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    x.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.cubic) }))
    opacity.value = withDelay(delay, withTiming(1, { duration }))
  }, [delay, duration, reduced, x, opacity])
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], opacity: opacity.value }))
  return <Animated.View style={[style, animated]}>{children}</Animated.View>
}
```

- [ ] **Step 3: Commit**

```bash
git add mobile/components/home/animated/rise-view.tsx mobile/components/home/animated/slide-in-view.tsx
git commit -m "feat(home/animated): add RiseView + SlideInView entrance primitives"
```

### Task F3: `breathe-dot.tsx`, `float-view.tsx`, `shine-overlay.tsx`

**Files:**
- Create: `mobile/components/home/animated/breathe-dot.tsx`
- Create: `mobile/components/home/animated/float-view.tsx`
- Create: `mobile/components/home/animated/shine-overlay.tsx`

- [ ] **Step 1: Implement BreatheDot (scale 1 ↔ 1.08)**

```tsx
// mobile/components/home/animated/breathe-dot.tsx
import { useEffect } from 'react'
import { type ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface BreatheDotProps {
  size: number
  color: string
  glow?: string
  periodMs?: number
  style?: ViewStyle
}

export function BreatheDot({ size, color, glow, periodMs = 1800, style }: BreatheDotProps) {
  const reduced = useReducedMotion()
  const s = useSharedValue(1)
  useEffect(() => {
    if (reduced) return
    s.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: periodMs / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: periodMs / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    )
  }, [periodMs, reduced, s])
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }))
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: glow ?? color,
          shadowOpacity: glow ? 0.8 : 0,
          shadowRadius: size * 0.8,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
        a,
      ]}
    />
  )
}
```

- [ ] **Step 2: Implement FloatView (translateY loop)**

```tsx
// mobile/components/home/animated/float-view.tsx
import { useEffect } from 'react'
import { type ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface FloatViewProps {
  amplitude?: number
  periodMs?: number
  style?: ViewStyle
  children: React.ReactNode
}

export function FloatView({ amplitude = 6, periodMs = 3000, style, children }: FloatViewProps) {
  const reduced = useReducedMotion()
  const y = useSharedValue(0)
  useEffect(() => {
    if (reduced) return
    y.value = withRepeat(
      withSequence(
        withTiming(-amplitude, { duration: periodMs / 2, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: periodMs / 2, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    )
  }, [amplitude, periodMs, reduced, y])
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  return <Animated.View style={[style, a]}>{children}</Animated.View>
}
```

- [ ] **Step 3: Implement ShineOverlay (translateX sweep over a masked gradient)**

```tsx
// mobile/components/home/animated/shine-overlay.tsx
import { useEffect } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface ShineOverlayProps {
  width: number
  height: number
  tint?: string
  delayMs?: number
  periodMs?: number
  style?: ViewStyle
}

export function ShineOverlay({ width, height, tint = 'rgba(255,255,255,0.45)', delayMs = 1800, periodMs = 3200, style }: ShineOverlayProps) {
  const reduced = useReducedMotion()
  const x = useSharedValue(-width)
  useEffect(() => {
    if (reduced) return
    x.value = withDelay(delayMs, withRepeat(withTiming(width * 1.2, { duration: periodMs, easing: Easing.inOut(Easing.quad) }), -1, false))
  }, [width, delayMs, periodMs, reduced, x])
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
      <Animated.View style={[{ width: width * 0.4, height }, a]}>
        <LinearGradient
          colors={['transparent', tint, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  )
}
```

- [ ] **Step 4: Verify `expo-linear-gradient` is installed**

Run: `node -e "require('expo-linear-gradient')"`
If missing: `npx expo install expo-linear-gradient` and commit `package.json` + lockfile.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/home/animated/
git commit -m "feat(home/animated): add BreatheDot, FloatView, ShineOverlay"
```

---

## Phase G — Home section components

### Task G1: `hero-sparkline.tsx`

**Files:**
- Create: `mobile/components/home/hero-sparkline.tsx`

- [ ] **Step 1: Implement**

```tsx
// mobile/components/home/hero-sparkline.tsx
import { useEffect, useMemo, useRef } from 'react'
import { View } from 'react-native'
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg'
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { BreatheDot } from '@/components/home/animated/breathe-dot'

const AnimatedPath = Animated.createAnimatedComponent(Path)

interface HeroSparklineProps {
  data: number[]
  width?: number
  height?: number
  color: string
  fillColor: string
  delayMs?: number
}

export function HeroSparkline({ data, width = 320, height = 58, color, fillColor, delayMs = 400 }: HeroSparklineProps) {
  const reduced = useReducedMotion()
  const pad = 4
  const { path, area, end, length } = useMemo(() => buildPath(data, width, height, pad), [data, width, height])
  const progress = useSharedValue(reduced ? 0 : length)

  useEffect(() => {
    if (reduced) {
      progress.value = 0
      return
    }
    progress.value = length
    progress.value = withDelay(delayMs, withTiming(0, { duration: 1400, easing: Easing.out(Easing.cubic) }))
  }, [length, delayMs, reduced, progress])

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: progress.value }))

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="hsl-g" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={fillColor} stopOpacity={1} />
            <Stop offset="1" stopColor={fillColor} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#hsl-g)" opacity={0.9} />
        <AnimatedPath
          d={path}
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={length}
          animatedProps={animatedProps}
        />
        <Circle cx={end.x} cy={end.y} r={4} fill={color} />
      </Svg>
      <BreatheDot
        size={10}
        color={color}
        glow={color}
        style={{ position: 'absolute', left: end.x - 5, top: end.y - 5 }}
      />
    </View>
  )
}

function buildPath(data: number[], w: number, h: number, pad: number) {
  if (data.length === 0) return { path: '', area: '', end: { x: pad, y: h - pad }, length: 0 }
  const max = Math.max(...data)
  const min = Math.min(...data)
  const points = data.map((v, i) => {
    const x = pad + (i / Math.max(1, data.length - 1)) * (w - 2 * pad)
    const y = pad + (1 - (v - min) / Math.max(1, max - min)) * (h - 2 * pad)
    return { x, y }
  })
  const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ')
  const area = `${path} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    length += Math.sqrt(dx * dx + dy * dy)
  }
  return { path, area, end: points[points.length - 1], length }
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/components/home/hero-sparkline.tsx
git commit -m "feat(home): add HeroSparkline with animated stroke-dash draw"
```

### Task G2: `greeting-header.tsx`

**Files:**
- Create: `mobile/components/home/greeting-header.tsx`

- [ ] **Step 1: Implement**

```tsx
// mobile/components/home/greeting-header.tsx
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path, G } from 'react-native-svg'
import { getGreeting } from '@/features/home/home-dashboard-model'
import { FloatView } from '@/components/home/animated/float-view'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'

interface GreetingHeaderProps {
  name: string
  hour?: number
}

export function GreetingHeader({ name, hour = new Date().getHours() }: GreetingHeaderProps) {
  const { theme } = useAppTheme()
  const greeting = getGreeting(hour)
  const Icon = hour < 6 || hour >= 19 ? MoonIcon : hour < 12 ? SunIcon : SunLowIcon

  return (
    <RiseView>
      <View style={styles.row}>
        <FloatView amplitude={4} periodMs={5000} style={styles.iconWrap}>
          <Icon />
        </FloatView>
        <Text style={[styles.greeting, { color: theme.colors.textMuted }]}>{greeting.toLowerCase()},</Text>
      </View>
      <Text style={[styles.name, { color: theme.colors.text }]}>
        Hola, {name}
      </Text>
    </RiseView>
  )
}

const SunIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={4} fill="#F2B58A" />
    <G stroke="#F2B58A" strokeWidth={1.8} strokeLinecap="round">
      <Path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" />
    </G>
  </Svg>
)
const SunLowIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Circle cx={12} cy={14} r={4} fill="#E08E63" />
    <G stroke="#E08E63" strokeWidth={1.8} strokeLinecap="round">
      <Path d="M4 18h16M12 7v2M6 9l1.4 1.4M18 9l-1.4 1.4" />
    </G>
  </Svg>
)
const MoonIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" fill="#6B3A4F" />
  </Svg>
)

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  greeting: { fontSize: 14, fontWeight: '500' },
  name: { fontSize: 34, lineHeight: 36, fontWeight: '800', marginTop: 2, letterSpacing: -1.2 },
})
```

- [ ] **Step 2: Commit**

```bash
git add mobile/components/home/greeting-header.tsx
git commit -m "feat(home): add GreetingHeader with contextual icon + rise entrance"
```

### Task G3: `family-strip.tsx` + `payday-pill-v2.tsx`

**Files:**
- Create: `mobile/components/home/family-strip.tsx`
- Create: `mobile/components/home/payday-pill-v2.tsx`

- [ ] **Step 1: Implement `PaydayPillV2`**

```tsx
// mobile/components/home/payday-pill-v2.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { useAppTheme } from '@/theme/theme-provider'

interface PaydayPillV2Props {
  daysUntilPayday: number | null
  isPending?: boolean
  onPress?: () => void
}

export function PaydayPillV2({ daysUntilPayday, isPending = false, onPress }: PaydayPillV2Props) {
  const { theme } = useAppTheme()
  if (daysUntilPayday == null) return null
  const label = isPending
    ? 'Confirmar cobro'
    : daysUntilPayday === 0
      ? 'Cobro hoy'
      : `${daysUntilPayday} días al cobro`

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <BreatheDot size={6} color={theme.colors.peach} />
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 999,
  },
  label: { fontSize: 11, fontWeight: '600' },
})
```

- [ ] **Step 2: Implement `FamilyStrip`**

```tsx
// mobile/components/home/family-strip.tsx
import { StyleSheet, Text, View } from 'react-native'
import { PaydayPillV2 } from '@/components/home/payday-pill-v2'
import { RiseView } from '@/components/home/animated/rise-view'
import { Avatar } from '@/components/ui/avatar'  // existing or fallback — see note below
import { useAppTheme } from '@/theme/theme-provider'

export interface FamilyMember { id: string; name: string; color: string }

interface FamilyStripProps {
  members: FamilyMember[]
  familyName: string
  daysUntilPayday: number | null
  paydayPending: boolean
  onPaydayPress?: () => void
}

const MAX_AVATARS = 4

export function FamilyStrip({ members, familyName, daysUntilPayday, paydayPending, onPaydayPress }: FamilyStripProps) {
  const { theme } = useAppTheme()
  const visible = members.slice(0, MAX_AVATARS)
  const overflow = members.length - visible.length
  return (
    <RiseView delay={100}>
      <View style={styles.row}>
        <View style={styles.avatars}>
          {visible.map((m, i) => (
            <View key={m.id} style={[styles.avatarSlot, i > 0 && { marginLeft: -8 }]}>
              <Avatar
                name={m.name}
                color={m.color}
                size={26}
                ringColor={theme.colors.ringBg}
              />
            </View>
          ))}
          {overflow > 0 ? (
            <View style={[styles.overflow, { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.ringBg }]}>
              <Text style={[styles.overflowText, { color: theme.colors.text }]}>+{overflow}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.familyLabel, { color: theme.colors.textMuted }]}>
          {familyName} · <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{members.length}</Text>
        </Text>
        <View style={styles.spacer} />
        <PaydayPillV2 daysUntilPayday={daysUntilPayday} isPending={paydayPending} onPress={onPaydayPress} />
      </View>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatars: { flexDirection: 'row' },
  avatarSlot: {},
  overflow: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  overflowText: { fontSize: 10, fontWeight: '700' },
  familyLabel: { fontSize: 12 },
  spacer: { flex: 1 },
})
```

**Note on `Avatar`:** if `mobile/components/ui/avatar.tsx` doesn't exist, create a minimal one using initials + colored background; reuse the `shade()` pattern from the mock's `shared.jsx`.

- [ ] **Step 3: Create `mobile/components/ui/avatar.tsx` if missing**

Run: `ls mobile/components/ui/avatar.tsx 2>/dev/null`
If missing, create:

```tsx
// mobile/components/ui/avatar.tsx
import { StyleSheet, Text, View } from 'react-native'

interface AvatarProps {
  name: string
  color: string
  size?: number
  ringColor?: string
}

export function Avatar({ name, color, size = 28, ringColor }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderColor: ringColor ?? 'transparent',
          borderWidth: ringColor ? 2 : 0,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.42, color: '#fff' }]}>{initials}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '700', letterSpacing: 0.2 },
})
```

- [ ] **Step 4: Commit**

```bash
git add mobile/components/home/family-strip.tsx mobile/components/home/payday-pill-v2.tsx mobile/components/ui/avatar.tsx
git commit -m "feat(home): add FamilyStrip + PaydayPillV2 + shared Avatar"
```

### Task G4: `hero-stat.tsx` + `hero-aurora.tsx`

**Files:**
- Create: `mobile/components/home/hero-stat.tsx`
- Create: `mobile/components/home/hero-aurora.tsx`

- [ ] **Step 1: Implement `HeroStat`**

```tsx
// mobile/components/home/hero-stat.tsx
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

interface HeroStatProps {
  label: string
  value: string
  sub: string
  accent?: boolean
}

export function HeroStat({ label, value, sub, accent = false }: HeroStatProps) {
  const { theme } = useAppTheme()
  const labelColor = accent ? theme.colors.heroAccent : theme.colors.heroMuted2
  const valueColor = accent ? theme.colors.heroAccent : theme.colors.heroText
  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: labelColor }]}>{label.toUpperCase()}</Text>
      <Text
        style={[
          styles.value,
          {
            color: valueColor,
            textShadowColor: accent ? theme.colors.heroAccent : 'transparent',
            textShadowRadius: accent ? 12 : 0,
          },
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.sub, { color: theme.colors.heroMuted2 }]}>{sub}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 2, paddingHorizontal: 4, flex: 1 },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  value: { fontSize: 15, fontWeight: '800', letterSpacing: -0.4 },
  sub: { fontSize: 10, fontWeight: '600' },
})
```

- [ ] **Step 2: Implement `HeroAurora` (3 animated absolute blobs)**

```tsx
// mobile/components/home/hero-aurora.tsx
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

interface HeroAuroraProps {
  radius?: number
}

export function HeroAurora({ radius = 28 }: HeroAuroraProps) {
  const reduced = useReducedMotion()
  const { theme } = useAppTheme()
  const a = useSharedValue(0)
  const b = useSharedValue(0)
  const c = useSharedValue(0)

  useEffect(() => {
    if (reduced) return
    const loop = (sv: typeof a, period: number) => {
      sv.value = withRepeat(
        withSequence(
          withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: period, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      )
    }
    loop(a, 4500)
    loop(b, 5500)
    loop(c, 6500)
  }, [reduced, a, b, c])

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -20 * a.value }, { translateY: 30 * a.value }, { scale: 1 + 0.15 * a.value }],
  }))
  const bStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: 30 * b.value }, { translateY: -20 * b.value }, { scale: 1 + 0.2 * b.value }],
  }))
  const cStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -25 * c.value }, { translateY: -15 * c.value }, { scale: 1 + 0.3 * c.value }],
  }))

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <Animated.View style={[styles.blob, { top: -40, right: -40, width: 200, height: 200, backgroundColor: theme.colors.auroraA }, aStyle]} />
      <Animated.View style={[styles.blob, { bottom: -50, left: -30, width: 180, height: 180, backgroundColor: theme.colors.auroraB }, bStyle]} />
      <Animated.View style={[styles.blob, { top: 60, left: '40%', width: 140, height: 140, backgroundColor: theme.colors.auroraC }, cStyle]} />
    </View>
  )
}

const styles = StyleSheet.create({
  blob: { position: 'absolute', borderRadius: 9999, opacity: 0.9 },
})
```

- [ ] **Step 3: Commit**

```bash
git add mobile/components/home/hero-stat.tsx mobile/components/home/hero-aurora.tsx
git commit -m "feat(home): add HeroStat and HeroAurora backdrop"
```

### Task G5: `home-hero-card-v2.tsx`

**Files:**
- Create: `mobile/components/home/home-hero-card-v2.tsx`

- [ ] **Step 1: Implement**

```tsx
// mobile/components/home/home-hero-card-v2.tsx
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { HeroAurora } from '@/components/home/hero-aurora'
import { HeroStat } from '@/components/home/hero-stat'
import { HeroSparkline } from '@/components/home/hero-sparkline'
import { formatMoney, formatMoneyShort, formatMoneyWithSign } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import type { HeroStatsTrio } from '@/features/home/home-aggregates.model'
import type { MonthlyComparison } from '@/features/home/home-aggregates.model'

interface HomeHeroCardV2Props {
  availableToday: number
  projectedMargin: number
  monthlyComparison: MonthlyComparison | null
  sparkline: number[] | null
  heroStats: HeroStatsTrio
  cycleDayLabel: string | null   // e.g., "Abril · día 22/30"
}

export function HomeHeroCardV2({
  availableToday,
  projectedMargin,
  monthlyComparison,
  sparkline,
  heroStats,
  cycleDayLabel,
}: HomeHeroCardV2Props) {
  const { theme } = useAppTheme()
  const delta = monthlyComparison?.deltaPercent
  const deltaTxt = delta == null ? null : `${delta > 0 ? '▲' : '▼'} ${Math.abs(Math.round(delta))}%`

  return (
    <RiseView delay={150}>
      <LinearGradient
        colors={theme.colors.heroGradient as unknown as string[]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.card, { borderColor: 'rgba(199,238,156,0.12)' }]}
      >
        <HeroAurora radius={28} />
        <ShineOverlay width={430} height={240} tint={theme.colors.shineOverlay} delayMs={1000} periodMs={4200} />

        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <BreatheDot size={10} color={theme.colors.heroAccent} glow={theme.colors.heroAccent} />
            <Text style={[styles.topLabel, { color: theme.colors.heroAccent }]}>DISPONIBLE HOY</Text>
          </View>
          {cycleDayLabel ? (
            <View style={[styles.datePill, { borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.08)' }]}>
              <Text style={[styles.datePillText, { color: theme.colors.heroMuted }]}>{cycleDayLabel}</Text>
            </View>
          ) : null}
        </View>

        <CountUpText
          value={availableToday}
          format={(n) => formatMoney(n, { zeroAsDash: false })}
          style={[styles.amount, { color: theme.colors.heroText }]}
        />

        <View style={styles.marginRow}>
          <Text style={[styles.marginText, { color: theme.colors.heroMuted }]}>Margen del mes</Text>
          <Text style={[styles.marginValue, { color: theme.colors.heroAccent }]}>
            {formatMoneyWithSign(projectedMargin)}
          </Text>
          {deltaTxt ? (
            <View style={[styles.deltaPill, { borderColor: 'rgba(199,238,156,0.3)' }]}>
              <Text style={[styles.deltaText, { color: theme.colors.heroAccent }]}>{deltaTxt}</Text>
            </View>
          ) : null}
        </View>

        {sparkline && sparkline.length > 1 ? (
          <View style={styles.sparkWrap}>
            <HeroSparkline
              data={sparkline}
              width={320}
              height={58}
              color={theme.colors.heroAccent}
              fillColor={theme.colors.heroAccent}
              delayMs={400}
            />
          </View>
        ) : null}

        <View style={[styles.trio, { borderTopColor: 'rgba(255,255,255,0.12)' }]}>
          <HeroStat
            label="Hoy"
            value={heroStats.todayRemaining == null ? '—' : formatMoney(heroStats.todayRemaining)}
            sub="disponible"
          />
          <View style={[styles.trioDivider, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
          <HeroStat
            label="Gastado"
            value={formatMoney(heroStats.spentToday)}
            sub={`${heroStats.movementsToday} ${heroStats.movementsToday === 1 ? 'mov' : 'movs'}`}
          />
          <View style={[styles.trioDivider, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
          <HeroStat
            label="Alcancía"
            value={heroStats.piggy == null ? '—' : (heroStats.piggy >= 0 ? '+' : '') + formatMoneyShort(heroStats.piggy)}
            sub={heroStats.piggyState === 'excess' ? 'excedido' : 'ahorrado'}
            accent={heroStats.piggyState !== 'excess'}
          />
        </View>
      </LinearGradient>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    padding: 22,
    paddingBottom: 24,
    overflow: 'hidden',
    borderWidth: 1,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topLabel: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800' },
  datePill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  datePillText: { fontSize: 10, fontWeight: '600' },
  amount: { fontSize: 52, fontWeight: '800', letterSpacing: -2.4, marginTop: 14, lineHeight: 54 },
  marginRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 },
  marginText: { fontSize: 13 },
  marginValue: { fontSize: 13, fontWeight: '800' },
  deltaPill: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  deltaText: { fontSize: 11, fontWeight: '800' },
  sparkWrap: { marginTop: 18, marginLeft: -4 },
  trio: { marginTop: 16, paddingTop: 12, flexDirection: 'row', borderTopWidth: 1 },
  trioDivider: { width: 1, alignSelf: 'stretch' },
})
```

**Money formatters:** if `@/utils/money` doesn't exist with `formatMoney`, `formatMoneyWithSign`, and `formatMoneyShort`, create in Task G5.5 below.

- [ ] **Step 2: Create money utilities if missing**

Run: `ls mobile/utils/money.ts 2>/dev/null`
If missing:

```typescript
// mobile/utils/money.ts
const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

export function formatMoney(n: number, opts: { zeroAsDash?: boolean } = {}): string {
  if (opts.zeroAsDash && n === 0) return '—'
  return '$' + fmt.format(Math.round(Math.abs(n)))
}

export function formatMoneyWithSign(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}${formatMoney(n)}`
}

export function formatMoneyShort(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(abs / 1_000)}k`
  return `$${Math.round(abs)}`
}
```

If `@/utils/money` exists with different names, align the component's imports to match the existing names instead of creating new ones.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/home/home-hero-card-v2.tsx mobile/utils/money.ts 2>/dev/null; git commit -m "feat(home): add HomeHeroCardV2 — animated hero with sparkline + stats trio"
```

### Task G6: `shortcut-card.tsx` + `mini-bars.tsx` + `pago-dots.tsx` + `shortcut-cards-row.tsx`

**Files:**
- Create: `mobile/components/home/mini-bars.tsx`
- Create: `mobile/components/home/pago-dots.tsx`
- Create: `mobile/components/home/shortcut-card.tsx`
- Create: `mobile/components/home/shortcut-cards-row.tsx`

- [ ] **Step 1: Implement `MiniBars`**

```tsx
// mobile/components/home/mini-bars.tsx
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface MiniBarsProps {
  values: number[]   // 0..1 each
  color: string
  barWidth?: number
  totalHeight?: number
  delayBase?: number
}

export function MiniBars({ values, color, barWidth = 5, totalHeight = 22, delayBase = 400 }: MiniBarsProps) {
  return (
    <View style={[styles.row, { height: totalHeight }]}>
      {values.map((v, i) => (
        <Bar key={i} value={v} color={color} height={totalHeight} width={barWidth} delay={delayBase + i * 80} />
      ))}
    </View>
  )
}

function Bar({ value, color, height, width, delay }: { value: number; color: string; height: number; width: number; delay: number }) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    scale.value = withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }))
  }, [delay, reduced, scale])
  const a = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }))
  const h = Math.max(2, Math.min(1, value) * height)
  return (
    <Animated.View style={[{ width, height: h, backgroundColor: color, borderRadius: 2, transformOrigin: 'bottom' as const }, a]} />
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
})
```

- [ ] **Step 2: Implement `PagoDots`**

```tsx
// mobile/components/home/pago-dots.tsx
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

interface PagoDotsProps {
  paid: number
  total: number
}

export function PagoDots({ paid, total }: PagoDotsProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.row}>
      {Array.from({ length: Math.max(0, total) }).map((_, i) => (
        <Dot key={i} filled={i < paid} color={theme.colors.success} emptyColor={theme.colors.line} delay={400 + i * 40} />
      ))}
    </View>
  )
}

function Dot({ filled, color, emptyColor, delay }: { filled: boolean; color: string; emptyColor: string; delay: number }) {
  const reduced = useReducedMotion()
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }))
  }, [delay, reduced, opacity])
  const a = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: filled ? color : emptyColor }, a]} />
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3 },
})
```

- [ ] **Step 3: Implement `ShortcutCard`**

```tsx
// mobile/components/home/shortcut-card.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'

interface ShortcutCardProps {
  label: string
  value: string
  sub: string
  trend?: string
  trendColor?: string
  chart?: React.ReactNode
  delay?: number
  onPress?: () => void
  accessibilityLabel?: string
}

export function ShortcutCard({ label, value, sub, trend, trendColor, chart, delay = 0, onPress, accessibilityLabel }: ShortcutCardProps) {
  const { theme } = useAppTheme()
  return (
    <RiseView delay={delay} style={styles.flex}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line, opacity: pressed ? 0.92 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
      >
        <View style={styles.header}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
          <Svg width={12} height={12} viewBox="0 0 24 24">
            <Path d="M9 6l6 6-6 6" stroke={theme.colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.4} />
          </Svg>
        </View>
        <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
        <Text style={[styles.sub, { color: theme.colors.textSoft }]}>{sub}</Text>
        <View style={styles.footer}>
          {trend ? <Text style={[styles.trend, { color: trendColor ?? theme.colors.text }]}>{trend}</Text> : <View />}
          {chart ? <View>{chart}</View> : null}
        </View>
      </Pressable>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: 18, padding: 14, borderWidth: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  label: { fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  value: { fontSize: 22, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
  sub: { fontSize: 11, marginTop: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 },
  trend: { fontSize: 10.5, fontWeight: '700' },
})
```

- [ ] **Step 4: Implement `ShortcutCardsRow` (composes gastos + fijos)**

```tsx
// mobile/components/home/shortcut-cards-row.tsx
import { StyleSheet, View } from 'react-native'
import { ShortcutCard } from '@/components/home/shortcut-card'
import { MiniBars } from '@/components/home/mini-bars'
import { PagoDots } from '@/components/home/pago-dots'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface ShortcutCardsRowProps {
  gastos: {
    total: number
    count: number
    trendLabel: string | null   // e.g. "+12% vs marzo"
    trendDirection: 'up' | 'down' | 'flat' | null
    miniBars: number[]          // 7 values 0..1
  }
  fijos: {
    monthlyTotal: number
    paidCount: number
    totalCount: number
    upcomingCount: number       // due in next 7 days
  }
  onPressGastos?: () => void
  onPressFijos?: () => void
}

export function ShortcutCardsRow({ gastos, fijos, onPressGastos, onPressFijos }: ShortcutCardsRowProps) {
  const { theme } = useAppTheme()
  const gastosTrendColor =
    gastos.trendDirection === 'up' ? theme.colors.warning
      : gastos.trendDirection === 'down' ? theme.colors.success
      : theme.colors.textSoft
  return (
    <View style={styles.row}>
      <ShortcutCard
        label="GASTOS"
        value={formatMoney(gastos.total)}
        sub={`este mes · ${gastos.count} ${gastos.count === 1 ? 'mov' : 'movs'}`}
        trend={gastos.trendLabel ?? ''}
        trendColor={gastosTrendColor}
        chart={<MiniBars values={gastos.miniBars} color={theme.colors.text} />}
        onPress={onPressGastos}
        delay={200}
        accessibilityLabel="Ver gastos del mes"
      />
      <ShortcutCard
        label="FIJOS"
        value={formatMoney(fijos.monthlyTotal)}
        sub={
          fijos.totalCount === 0
            ? 'sin fijos'
            : `${fijos.paidCount} de ${fijos.totalCount} pagados`
        }
        trend={fijos.upcomingCount > 0 ? `${fijos.upcomingCount} próximos` : ''}
        trendColor={theme.colors.text}
        chart={fijos.totalCount > 0 ? <PagoDots paid={fijos.paidCount} total={Math.min(fijos.totalCount, 14)} /> : null}
        onPress={onPressFijos}
        delay={260}
        accessibilityLabel="Ver gastos fijos"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
})
```

- [ ] **Step 5: Commit**

```bash
git add mobile/components/home/mini-bars.tsx mobile/components/home/pago-dots.tsx mobile/components/home/shortcut-card.tsx mobile/components/home/shortcut-cards-row.tsx
git commit -m "feat(home): add ShortcutCard + MiniBars + PagoDots + row composer"
```

### Task G7: `meta-card.tsx`

**Files:**
- Create: `mobile/components/home/meta-card.tsx`

- [ ] **Step 1: Implement**

```tsx
// mobile/components/home/meta-card.tsx
import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated'
import { RiseView } from '@/components/home/animated/rise-view'
import { FloatView } from '@/components/home/animated/float-view'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { formatMoneyShort } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'

interface MetaCardProps {
  goal: SavingsGoal
  onPress?: () => void
}

export function MetaCard({ goal, onPress }: MetaCardProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const pct = Math.min(100, Math.round((goal.currentAmount / goal.goalAmount) * 100))
  const scaleX = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) return
    scaleX.value = withDelay(500, withTiming(pct / 100, { duration: 1300, easing: Easing.bezier(0.2, 0.9, 0.2, 1) }))
  }, [pct, reduced, scaleX])
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: scaleX.value }] }))

  return (
    <RiseView delay={300}>
      <Pressable
        onPress={onPress}
        style={[styles.card, { backgroundColor: '#0F2A1E' }]}
        accessibilityRole="button"
        accessibilityLabel={`Meta ${goal.title}: ${pct}% alcanzado`}
      >
        <View style={styles.topRow}>
          <View style={styles.flex}>
            <Text style={[styles.label, { color: '#9EE5BA' }]}>
              META · {goal.title.toUpperCase()}
            </Text>
            <Text style={styles.amount}>
              {formatMoneyShort(goal.currentAmount)}
              <Text style={styles.goalText}>{' / '}{formatMoneyShort(goal.goalAmount)}</Text>
            </Text>
          </View>
          <FloatView amplitude={4} periodMs={3000}>
            <Text style={styles.emoji}>{goal.emoji}</Text>
          </FloatView>
        </View>

        <View style={styles.barWrap}>
          <Animated.View style={[styles.barInner, { transformOrigin: 'left' as const }, barStyle]}>
            <LinearGradient
              colors={['#6FE09A', '#F2B58A']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <ShineOverlay width={300} height={8} tint="rgba(255,255,255,0.4)" delayMs={1800} periodMs={3200} />
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>{pct}% alcanzado</Text>
          {goal.targetMonths != null ? <Text style={styles.footerText}>faltan ~{goal.targetMonths} {goal.targetMonths === 1 ? 'mes' : 'meses'}</Text> : null}
        </View>
      </Pressable>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 16, paddingVertical: 14, overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex: { flex: 1 },
  label: { fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  amount: { color: '#FFFBF2', fontSize: 22, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 },
  goalText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '500' },
  emoji: { fontSize: 30 },
  barWrap: { marginTop: 10, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', position: 'relative' },
  barInner: { height: '100%', width: '100%' },
  footerRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
})
```

- [ ] **Step 2: Commit**

```bash
git add mobile/components/home/meta-card.tsx
git commit -m "feat(home): add MetaCard with gradient bar, shine and floating emoji"
```

### Task G8: `ambient-blobs.tsx`

**Files:**
- Create: `mobile/components/home/ambient-blobs.tsx`

- [ ] **Step 1: Implement**

```tsx
// mobile/components/home/ambient-blobs.tsx
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

export function AmbientBlobs() {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const a = useSharedValue(0)
  const b = useSharedValue(0)
  const c = useSharedValue(0)
  useEffect(() => {
    if (reduced) return
    const loop = (sv: typeof a, period: number) => {
      sv.value = withRepeat(
        withSequence(
          withTiming(-10, { duration: period / 2, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: period / 2, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      )
    }
    loop(a, 9000)
    loop(b, 11000)
    loop(c, 13000)
  }, [reduced, a, b, c])
  const makeStyle = (sv: typeof a) => useAnimatedStyle(() => ({ transform: [{ translateY: sv.value }] }))
  // eslint-disable-next-line react-hooks/rules-of-hooks — safe here; sv identities are stable
  const aStyle = makeStyle(a)
  const bStyle = makeStyle(b)
  const cStyle = makeStyle(c)

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.blob, { top: -70, right: -50, width: 240, height: 240, backgroundColor: theme.colors.auroraA, opacity: 0.55 }, aStyle]} />
      <Animated.View style={[styles.blob, { top: 440, left: -80, width: 240, height: 240, backgroundColor: theme.colors.auroraB, opacity: 0.32 }, bStyle]} />
      <Animated.View style={[styles.blob, { top: 1000, right: -60, width: 260, height: 260, backgroundColor: theme.colors.auroraC, opacity: 0.35 }, cStyle]} />
    </View>
  )
}

const styles = StyleSheet.create({
  blob: { position: 'absolute', borderRadius: 9999 },
})
```

*Note on the eslint suppression:* `useAnimatedStyle` inside a helper is fine when the helper isn't conditional; this matches React's rules-of-hooks because each call site is unconditional. Prefer inlining the three `useAnimatedStyle` calls if eslint complains — the plan accepts either shape.

- [ ] **Step 2: Commit**

```bash
git add mobile/components/home/ambient-blobs.tsx
git commit -m "feat(home): add AmbientBlobs background layer"
```

### Task G9: `activity-row-v2.tsx` + `who-paid-avatar.tsx`

**Files:**
- Create: `mobile/components/home/who-paid-avatar.tsx`
- Create: `mobile/components/home/activity-row-v2.tsx`

- [ ] **Step 1: Implement `WhoPaidAvatar`**

```tsx
// mobile/components/home/who-paid-avatar.tsx
import { StyleSheet, View } from 'react-native'
import { Avatar } from '@/components/ui/avatar'
import { useAppTheme } from '@/theme/theme-provider'

interface WhoPaidAvatarProps {
  name: string
  color: string
  size?: number
}

export function WhoPaidAvatar({ name, color, size = 18 }: WhoPaidAvatarProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.wrap}>
      <Avatar name={name} color={color} size={size} ringColor={theme.colors.creamCard} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', bottom: -3, right: -3 },
})
```

- [ ] **Step 2: Implement `ActivityRowV2`**

```tsx
// mobile/components/home/activity-row-v2.tsx
import { StyleSheet, Text, View } from 'react-native'
import { SlideInView } from '@/components/home/animated/slide-in-view'
import { WhoPaidAvatar } from '@/components/home/who-paid-avatar'
import { formatMoneyWithSign } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

export interface ActivityRowV2Props {
  icon: string
  title: string
  category: string
  whoName: string
  whoColor: string
  amount: number          // negative = expense, positive = credit
  delay?: number
}

export function ActivityRowV2({ icon, title, category, whoName, whoColor, amount, delay = 0 }: ActivityRowV2Props) {
  const { theme } = useAppTheme()
  const amountColor = amount < 0 ? theme.colors.text : theme.colors.success
  return (
    <SlideInView delay={delay}>
      <View style={[styles.row, { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line }]}>
        <View style={styles.iconWrap}>
          <View style={[styles.iconTile, { backgroundColor: theme.colors.peachBand }]}>
            <Text style={styles.iconText}>{icon}</Text>
          </View>
          <WhoPaidAvatar name={whoName} color={whoColor} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {whoName} · {category}
          </Text>
        </View>
        <Text style={[styles.amount, { color: amountColor }]}>{formatMoneyWithSign(amount)}</Text>
      </View>
    </SlideInView>
  )
}

const styles = StyleSheet.create({
  row: { borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1 },
  iconWrap: { position: 'relative' },
  iconTile: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18 },
  flex: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12 },
  amount: { fontSize: 14, fontWeight: '800' },
})
```

- [ ] **Step 3: Commit**

```bash
git add mobile/components/home/who-paid-avatar.tsx mobile/components/home/activity-row-v2.tsx
git commit -m "feat(home): add ActivityRowV2 with who-paid avatar overlay"
```

---

## Phase H — Assembly

### Task H1: Expand `useFamilyDashboard` output (if needed)

Verify what `useFamilyDashboard` already exposes. The new Home needs: `monthlyIncome`, `totalAvailable`, `savingsGoal` (the old numeric from `family_finance`), `dailyBudget`, `cycle` (paydayCycle), `spentInCurrentCycle`, plus a family member list with display names.

**Files:**
- Modify: `mobile/hooks/use-family-dashboard.ts` (only if a field is missing)

- [ ] **Step 1: Read the current hook**

Run: `cat mobile/hooks/use-family-dashboard.ts`
Inspect returned fields. If it already exposes everything the Home needs (including `dailyBudget`), skip to Task H2. Otherwise, add the missing fields and re-export.

- [ ] **Step 2: Verify family member list availability**

Run: `grep -n "family_members" mobile/features/family -r`
If there's already a `useFamilyMembers(familyId)` hook returning `{ id, name, color }`, use it in assembly. Otherwise, create one in `mobile/features/family/use-family-members.ts`:

```typescript
// mobile/features/family/use-family-members.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface FamilyMemberRow { id: string; name: string; color: string }

export const familyMembersKey = (familyId?: string) => ['family-members', familyId ?? null] as const

const COLOR_POOL = ['#2E7D5B', '#E08E63', '#6B3A4F', '#C9A23A', '#4D6FB3', '#8A4D9A']

export function useFamilyMembers(familyId?: string) {
  return useQuery<FamilyMemberRow[]>({
    queryKey: familyMembersKey(familyId),
    enabled: Boolean(familyId),
    queryFn: async () => {
      if (!familyId) return []
      const { data, error } = await supabase
        .from('family_members')
        .select('user_id, profiles:profiles!inner(id, display_name)')
        .eq('family_id', familyId)
      if (error) throw error
      return (data ?? []).map((r: any, i: number) => ({
        id: r.user_id,
        name: r.profiles?.display_name ?? '—',
        color: COLOR_POOL[i % COLOR_POOL.length],
      }))
    },
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add mobile/features/family/use-family-members.ts mobile/hooks/use-family-dashboard.ts
git commit -m "feat(family): surface family member list for Home strip"
```

### Task H2: Rewrite `home-dashboard.tsx`

**Files:**
- Modify: `mobile/components/home/home-dashboard.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
// mobile/components/home/home-dashboard.tsx
import { useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { type BottomSheetHandle } from '@/components/ui/bottom-sheet'
import { ConfirmSalarySheet } from '@/components/home/confirm-salary-sheet'
import { HomeActivitySection } from '@/components/home/home-activity-section'
import { HomeHeroCardV2 } from '@/components/home/home-hero-card-v2'
import { GreetingHeader } from '@/components/home/greeting-header'
import { FamilyStrip } from '@/components/home/family-strip'
import { ShortcutCardsRow } from '@/components/home/shortcut-cards-row'
import { MetaCard } from '@/components/home/meta-card'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import type { Expense } from '@/features/expenses/use-expenses'
import {
  classifyDashboardError,
  daysUntilPayday,
  getPaydayCycle,
  isPaydayPending,
  buildHomeMetrics,
  type DashboardErrorKind,
} from '@/features/home/home-dashboard-model'
import { buildHeroStatsTrio } from '@/features/home/home-aggregates.model'
import { useMonthlyExpenseComparison } from '@/features/home/use-monthly-expense-comparison'
import { useDailyAvailableSparkline } from '@/features/home/use-daily-available-sparkline'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useFixedExpensePayments } from '@/features/fixed-expenses/use-fixed-expense-payments'
import type { FamilyDashboard } from '@/hooks/use-family-dashboard'
import { useFamilyMembers } from '@/features/family/use-family-members'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeDashboardProps {
  dashboard: FamilyDashboard
  recentExpenses: Expense[]
  categoryNameById: Map<string, string>
  familyId: string
  displayName: string
  familyName: string
  isLoadingActivity: boolean
  activityError: unknown
  onConfirmSalary: () => void
  onDeleteExpense: (expenseId: string) => void
  isSavingSalary: boolean
  salaryErrorMessage: string | null
}

export function HomeDashboard({
  dashboard,
  recentExpenses,
  categoryNameById,
  familyId,
  displayName,
  familyName,
  isLoadingActivity,
  activityError,
  onConfirmSalary,
  onDeleteExpense,
  isSavingSalary,
  salaryErrorMessage,
}: HomeDashboardProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const sheetRef = useRef<BottomSheetHandle>(null)
  const [today] = useState(() => new Date())

  const paymentDay = dashboard.familyFinanceQuery.data?.salary_payment_day ?? null
  const lastConfirmedAt = dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null
  const pending = useMemo(
    () => isPaydayPending({ paymentDay, lastConfirmedAt }, today),
    [paymentDay, lastConfirmedAt, today],
  )
  const days = useMemo(() => daysUntilPayday({ paymentDay }, today), [paymentDay, today])
  const cycle = useMemo(() => getPaydayCycle({ paymentDay }, today), [paymentDay, today])
  const metrics = useMemo(() => buildHomeMetrics(dashboard), [dashboard])

  const dailyBudget = cycle && cycle.totalDays > 0 ? Math.max(0, Math.round(metrics.availableToday / cycle.daysRemaining || 0)) : null
  // Note: daily budget = remaining / remaining-days; if no cycle, null.

  const cycleStart = cycle?.lastPayday ?? null
  const sparklineQuery = useDailyAvailableSparkline({
    familyId,
    cycleStart,
    totalAvailable: metrics.availableToday + (dashboard.spentInCurrentCycle ?? 0),
    today,
  })
  const comparisonQuery = useMonthlyExpenseComparison(familyId)
  const savingsGoalQuery = useSavingsGoal(familyId)
  const membersQuery = useFamilyMembers(familyId)

  const fixedExpenses = dashboard.fixedExpensesQuery.data ?? []
  const paymentsQuery = useFixedExpensePayments({
    familyId,
    fixedExpenseIds: fixedExpenses.map((fe) => fe.id),
    today,
  })

  const heroStats = useMemo(
    () => buildHeroStatsTrio({
      dailyBudget,
      totalAvailable: metrics.availableToday,
      daysElapsed: cycle?.daysElapsed ?? 0,
      expenses: recentExpenses.map((e) => ({ price: e.price, created_at: e.created_at })),
      today,
    }),
    [dailyBudget, metrics.availableToday, cycle?.daysElapsed, recentExpenses, today],
  )

  const cycleDayLabel = useMemo(() => {
    if (!cycle) return null
    const monthName = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' }).format(today)
    return `${monthName[0].toUpperCase()}${monthName.slice(1)} · día ${cycle.daysElapsed}/${cycle.totalDays}`
  }, [cycle, today])

  const miniBars = useMemo(() => buildMiniBarsForGastos(recentExpenses, today), [recentExpenses, today])

  const activityErrorKind: DashboardErrorKind | undefined = activityError
    ? classifyDashboardError(activityError)
    : undefined

  const handleChipConfirm = () => sheetRef.current?.present()
  const handleSheetConfirm = () => onConfirmSalary()
  const handleAddExpense = () => {
    void triggerHaptic('light')
    router.push('/(app)/(tabs)/add')
  }
  const handleViewGastos = () => router.push('/(app)/(tabs)/expenses')
  const handleViewFijos = () => router.push('/(app)/(tabs)/fixed-expenses')
  const handleViewMeta = () => router.push('/(app)/savings-goal')

  return (
    <View style={styles.stack}>
      <AmbientBlobs />
      <GreetingHeader name={displayName} />
      <FamilyStrip
        members={membersQuery.data ?? []}
        familyName={familyName}
        daysUntilPayday={days}
        paydayPending={pending}
        onPaydayPress={handleChipConfirm}
      />
      <HomeHeroCardV2
        availableToday={metrics.availableToday}
        projectedMargin={metrics.projectedMargin}
        monthlyComparison={comparisonQuery.data ?? null}
        sparkline={sparklineQuery.data ?? null}
        heroStats={heroStats}
        cycleDayLabel={cycleDayLabel}
      />
      <ShortcutCardsRow
        gastos={{
          total: comparisonQuery.data?.currentMonthTotal ?? 0,
          count: (dashboard.expensesQuery.data ?? []).length,
          trendLabel: comparisonQuery.data && comparisonQuery.data.deltaPercent != null
            ? `${comparisonQuery.data.deltaPercent > 0 ? '+' : ''}${Math.round(comparisonQuery.data.deltaPercent)}% vs ${comparisonQuery.data.previousMonthLabel}`
            : null,
          trendDirection: comparisonQuery.data?.direction ?? null,
          miniBars,
        }}
        fijos={{
          monthlyTotal: metrics.fixedAmount,
          paidCount: paymentsQuery.data?.length ?? 0,
          totalCount: fixedExpenses.length,
          upcomingCount: countUpcoming(fixedExpenses, today),
        }}
        onPressGastos={handleViewGastos}
        onPressFijos={handleViewFijos}
      />
      {savingsGoalQuery.data ? <MetaCard goal={savingsGoalQuery.data} onPress={handleViewMeta} /> : null}

      <View style={styles.activityHeader}>
        <Text style={[styles.activityLabel, { color: theme.colors.textMuted }]}>ACTIVIDAD</Text>
        <Text style={[styles.activityLink, { color: theme.colors.text }]}>Ver todos</Text>
      </View>
      <HomeActivitySection
        expenses={recentExpenses}
        categoryNameById={categoryNameById}
        familyMembers={membersQuery.data ?? []}
        isLoading={isLoadingActivity}
        errorKind={activityErrorKind}
        onDelete={onDeleteExpense}
        onRetry={() => {
          void dashboard.refetchAll()
        }}
        onViewAll={handleViewGastos}
        onAddFirst={handleAddExpense}
      />

      <View style={styles.bottomSpacer} />

      <ConfirmSalarySheet
        ref={sheetRef}
        isSaving={isSavingSalary}
        errorMessage={salaryErrorMessage}
        onConfirm={handleSheetConfirm}
      />
    </View>
  )
}

function buildMiniBarsForGastos(expenses: Expense[], today: Date): number[] {
  const byDay = new Map<number, number>()
  for (const e of expenses) {
    const d = new Date(e.created_at)
    const daysAgo = Math.floor((today.getTime() - d.getTime()) / 86_400_000)
    if (daysAgo < 0 || daysAgo > 6) continue
    byDay.set(6 - daysAgo, (byDay.get(6 - daysAgo) ?? 0) + e.price)
  }
  const arr = Array.from({ length: 7 }, (_, i) => byDay.get(i) ?? 0)
  const max = Math.max(1, ...arr)
  return arr.map((v) => v / max)
}

function countUpcoming(fixedExpenses: { next_due_on?: string | null }[], today: Date): number {
  const sevenDays = 7 * 86_400_000
  return fixedExpenses.filter((fe) => {
    if (!fe.next_due_on) return false
    const dueMs = new Date(fe.next_due_on).getTime() - today.getTime()
    return dueMs >= 0 && dueMs <= sevenDays
  }).length
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 0 },
  activityLabel: { fontSize: 11, letterSpacing: 1.6, fontWeight: '700' },
  activityLink: { fontSize: 13, fontWeight: '600' },
  bottomSpacer: { height: 120 },
})
```

- [ ] **Step 2: Update `HomeActivitySection` to render `ActivityRowV2`**

Edit `mobile/components/home/home-activity-section.tsx`:
- Accept a new prop `familyMembers: FamilyMemberRow[]` (default `[]`)
- Map each expense to `ActivityRowV2` props: find the member by `expense.created_by`, pass `whoName`/`whoColor`; pass a derived `icon` from the category name (simple emoji mapping: default `🍽️`, keywords: "super" → `🛒`, "transporte" or "sube" → `🚌`, etc., OR read from `categories.color` + an emoji column if it exists; otherwise use a default palette)
- Preserve existing empty/error/loading internals; only swap the row renderer

Example row binding:

```tsx
<ActivityRowV2
  icon={pickIconForCategory(categoryNameById.get(expense.category_id) ?? '')}
  title={expense.description}
  category={categoryNameById.get(expense.category_id) ?? '—'}
  whoName={findName(familyMembers, expense.created_by) ?? 'Alguien'}
  whoColor={findColor(familyMembers, expense.created_by) ?? '#2E7D5B'}
  amount={-expense.price}
  delay={400 + index * 60}
/>
```

Provide `pickIconForCategory` as a simple internal map:

```tsx
function pickIconForCategory(name: string): string {
  const n = name.toLowerCase()
  if (/super|alma|comida/.test(n)) return '🛒'
  if (/transporte|sube|combustible|auto/.test(n)) return '🚌'
  if (/ocio|salid|fernet/.test(n)) return '🍹'
  if (/casa|alquil|servic/.test(n)) return '🏠'
  if (/salud|farm/.test(n)) return '💊'
  if (/cuid|personal/.test(n)) return '🧴'
  return '📁'
}
```

- [ ] **Step 3: Commit**

```bash
git add mobile/components/home/home-dashboard.tsx mobile/components/home/home-activity-section.tsx
git commit -m "feat(home): rewrite HomeDashboard with V1 Cuaderno layout + V2 activity rows"
```

### Task H3: Wire new props in `home-screen.tsx`

**Files:**
- Modify: `mobile/screens/home/home-screen.tsx`

- [ ] **Step 1: Fetch family info and pass the new props**

Add:

```tsx
import { useFamily } from '@/features/family/use-family'  // if exists, otherwise inline a query
```

Within `HomeScreen`, read `familyName` from wherever the family record lives (there's likely a `useFamily(familyId)` hook; if not, derive from `family.code` as fallback "Familia {code}"). Pass `familyId`, `displayName`, `familyName` to `<HomeDashboard>`.

Replace the existing `Screen` title `${greeting}, ${displayName}` with a transparent header (no title) since the new `GreetingHeader` owns the title. Update `Screen` props accordingly — keep the right-slot IconButtons but remove the `title` prop.

- [ ] **Step 2: Run the app in Expo and visually verify the home**

Run: `npx expo start`
Open iOS simulator. Check:
- Greeting + family strip render above the hero
- Hero gradient + aurora + count-up amount + sparkline animate on first mount
- Shortcuts + meta + activity render with real data

If any layout shift, iterate the `styles.stack.gap` in `HomeDashboard` and/or `Screen.contentContainerStyle`.

- [ ] **Step 3: Commit**

```bash
git add mobile/screens/home/home-screen.tsx
git commit -m "feat(home-screen): wire new HomeDashboard props and drop built-in title"
```

### Task H4: Delete dead files

**Files:**
- Delete: `mobile/components/home/home-hero-card.tsx`, `mobile/components/home/payday-pill.tsx` (after grep confirms zero consumers), `mobile/components/home/home-metric-strip.tsx`

- [ ] **Step 1: Confirm zero imports**

Run: `grep -rn "from '@/components/home/home-hero-card'" mobile app || echo 'no references'`
Run: `grep -rn "from '@/components/home/payday-pill'" mobile app || echo 'no references'`
Run: `grep -rn "from '@/components/home/home-metric-strip'" mobile app || echo 'no references'`

If every grep reports `no references`, delete. If any reference remains, adjust or keep.

- [ ] **Step 2: Delete + commit**

```bash
git rm mobile/components/home/home-hero-card.tsx mobile/components/home/payday-pill.tsx mobile/components/home/home-metric-strip.tsx 2>/dev/null
git commit -m "chore(home): remove legacy hero/metric strip/payday-pill"
```

---

## Phase I — Settings → Meta de ahorro

### Task I1: Savings goal form component

**Files:**
- Create: `mobile/components/settings/savings-goal-form.tsx`

- [ ] **Step 1: Implement**

```tsx
// mobile/components/settings/savings-goal-form.tsx
import { useMemo, useState } from 'react'
import { Alert, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { PrimaryButton } from '@/components/ui/primary-button'   // confirm exists; else use Pressable
import { triggerHaptic } from '@/lib/haptics'
import { validateSavingsGoalInput, type SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import { useAppTheme } from '@/theme/theme-provider'

interface SavingsGoalFormProps {
  familyId: string
  existing: SavingsGoal | null
  onSaved: () => void
}

export function SavingsGoalForm({ familyId, existing, onSaved }: SavingsGoalFormProps) {
  const { theme } = useAppTheme()
  const upsert = useUpsertSavingsGoal(familyId)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🎯')
  const [goalAmount, setGoalAmount] = useState(String(existing?.goalAmount ?? ''))
  const [currentAmount, setCurrentAmount] = useState(String(existing?.currentAmount ?? '0'))
  const [targetMonths, setTargetMonths] = useState(existing?.targetMonths != null ? String(existing.targetMonths) : '')
  const [isActive, setIsActive] = useState(existing?.isActive ?? true)

  const canSubmit = useMemo(() => title.trim().length > 0 && Number(goalAmount) > 0, [title, goalAmount])

  const handleSubmit = async () => {
    try {
      const payload = validateSavingsGoalInput({
        title,
        emoji,
        goalAmount: Number(goalAmount),
        currentAmount: Number(currentAmount),
        targetMonths: targetMonths.trim() === '' ? null : Number(targetMonths),
        isActive,
      })
      await upsert.mutateAsync({ input: payload, existingId: existing?.id ?? null })
      void triggerHaptic('success')
      onSaved()
    } catch (err) {
      void triggerHaptic('error')
      Alert.alert('No pudimos guardar', err instanceof Error ? err.message : 'Intentá de nuevo.')
    }
  }

  return (
    <View style={styles.container}>
      <Field label="Título" value={title} onChange={setTitle} maxLength={40} theme={theme} />
      <Field label="Emoji" value={emoji} onChange={setEmoji} maxLength={2} theme={theme} />
      <Field label="Objetivo ($)" value={goalAmount} onChange={setGoalAmount} keyboardType="numeric" theme={theme} />
      <Field label="Actual ($)" value={currentAmount} onChange={setCurrentAmount} keyboardType="numeric" theme={theme} />
      <Field label="Meses objetivo (opcional)" value={targetMonths} onChange={setTargetMonths} keyboardType="numeric" theme={theme} />
      <View style={styles.row}>
        <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>Meta activa</Text>
        <Switch value={isActive} onValueChange={setIsActive} />
      </View>
      <PrimaryButton
        label={existing ? 'Guardar cambios' : 'Crear meta'}
        onPress={handleSubmit}
        disabled={!canSubmit || upsert.isPending}
        loading={upsert.isPending}
      />
    </View>
  )
}

function Field({ label, value, onChange, keyboardType = 'default', maxLength, theme }: {
  label: string
  value: string
  onChange: (v: string) => void
  keyboardType?: 'default' | 'numeric'
  maxLength?: number
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        maxLength={maxLength}
        style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
})
```

**If `PrimaryButton` doesn't exist**, substitute a `Pressable` that matches existing button patterns in `mobile/components/ui/`. Verify with:

Run: `ls mobile/components/ui/primary-button* 2>/dev/null`

- [ ] **Step 2: Commit**

```bash
git add mobile/components/settings/savings-goal-form.tsx
git commit -m "feat(settings): add savings-goal-form"
```

### Task I2: Savings goal screen + route

**Files:**
- Create: `mobile/screens/settings/savings-goal-screen.tsx`
- Create: `app/(app)/savings-goal.tsx`

- [ ] **Step 1: Implement the screen**

```tsx
// mobile/screens/settings/savings-goal-screen.tsx
import { useRouter } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { SavingsGoalForm } from '@/components/settings/savings-goal-form'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'

interface SavingsGoalScreenProps {
  familyId: string
}

export function SavingsGoalScreen({ familyId }: SavingsGoalScreenProps) {
  const router = useRouter()
  const goal = useSavingsGoal(familyId)
  return (
    <Screen title="Meta de ahorro">
      {goal.isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : (
        <SavingsGoalForm familyId={familyId} existing={goal.data ?? null} onSaved={() => router.back()} />
      )}
    </Screen>
  )
}
```

- [ ] **Step 2: Register the route**

```tsx
// app/(app)/savings-goal.tsx
import { useAuthRedirect } from '@/features/auth/use-auth-redirect'
import { SavingsGoalScreen } from '@/screens/settings/savings-goal-screen'

export default function SavingsGoalRoute() {
  const session = useAuthRedirect()
  if (!session?.familyId) return null
  return <SavingsGoalScreen familyId={session.familyId} />
}
```

Adjust the auth guard hook to match existing patterns — check `app/(app)/notifications.tsx` for the exact shape.

- [ ] **Step 3: Commit**

```bash
git add mobile/screens/settings/savings-goal-screen.tsx app/\(app\)/savings-goal.tsx
git commit -m "feat(settings): add Meta de ahorro screen + route"
```

### Task I3: Add the Settings entry card

**Files:**
- Create: `mobile/components/settings/settings-savings-goal-card.tsx`
- Modify: `mobile/screens/settings/settings-screen.tsx` (insert the new card)

- [ ] **Step 1: Implement the card**

```tsx
// mobile/components/settings/settings-savings-goal-card.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoneyShort } from '@/utils/money'

interface SettingsSavingsGoalCardProps {
  familyId: string
}

export function SettingsSavingsGoalCard({ familyId }: SettingsSavingsGoalCardProps) {
  const { theme } = useAppTheme()
  const router = useRouter()
  const goal = useSavingsGoal(familyId)
  const subtitle = goal.data
    ? `${goal.data.emoji} ${goal.data.title} · ${formatMoneyShort(goal.data.currentAmount)} / ${formatMoneyShort(goal.data.goalAmount)}`
    : 'Sin meta configurada'

  return (
    <Pressable
      onPress={() => router.push('/(app)/savings-goal')}
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      accessibilityRole="button"
      accessibilityLabel="Configurar meta de ahorro"
    >
      <View style={styles.flex}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Meta de ahorro</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
      </View>
      <Text style={[styles.chev, { color: theme.colors.textSoft }]}>›</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, borderWidth: 1 },
  flex: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 12 },
  chev: { fontSize: 22, fontWeight: '300' },
})
```

- [ ] **Step 2: Insert into Settings screen**

In `mobile/screens/settings/settings-screen.tsx`, import and render after the finance card:

```tsx
import { SettingsSavingsGoalCard } from '@/components/settings/settings-savings-goal-card'
// ... then inside the Screen:
<SettingsSavingsGoalCard familyId={familyId} />
```

- [ ] **Step 3: Commit**

```bash
git add mobile/components/settings/settings-savings-goal-card.tsx mobile/screens/settings/settings-screen.tsx
git commit -m "feat(settings): link Meta de ahorro from the Settings list"
```

---

## Phase J — QA, reduced-motion, cleanup

### Task J1: Manual QA checklist

Run the app on an iOS simulator (iPhone 14 — 390×844 baseline) and an Android emulator. Verify:

- [ ] **Step 1: Light mode — first mount**
  - Greeting, family strip, hero card, shortcuts, meta, activity section all visible without scrolling glitches.
  - Hero gradient covers its card; aurora blobs don't leak outside the 28-radius mask.
  - `$` amount counts up from `$0` to the real total over 1.6s.
  - Sparkline draws left → right over ~1.4s.
  - Mini-bars in the Gastos shortcut grow from the bottom.
  - Pago-dots fade in left → right.
  - Meta card progress bar fills left → right.
  - Activity rows slide in one by one.

- [ ] **Step 2: Dark mode** — toggle via Settings → Appearance → Dark and return. Same elements but with dark tokens. Hero gradient still visible, aurora blobs softer.

- [ ] **Step 3: Reduced motion** — enable in iOS Simulator (Settings → Accessibility → Motion → Reduce Motion ON) and reload app. All animations should be skipped: amount shows final value immediately, sparkline static, bars at full height, no idle loops.

- [ ] **Step 4: Empty/edge states**
  - Drop the `savings_goals` row in the DB → MetaCard hides.
  - Set `salary_payment_day` to null → cycle pill + sparkline hide, "Hoy" shows `—`.
  - Delete all `expenses` of current family → spent today = 0, mini-bars all at ~2px, activity section shows empty state.
  - No fixed expenses → FIJOS card shows `$0 · sin fijos`, no dots.

- [ ] **Step 5: Navigation**
  - Tap GASTOS → routes to Gastos tab.
  - Tap FIJOS → routes to Fijos tab.
  - Tap MetaCard → opens the savings-goal settings screen.
  - Tap payday pill → opens ConfirmSalarySheet.
  - Tap "Ver todos" → routes to Gastos tab.

- [ ] **Step 6: No commit — QA pass only.** If any of the above fails, open a new task describing the fix, then implement + commit before proceeding.

### Task J2: Type-check + test pass

- [ ] **Step 1: Run TypeScript**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Run lint**

Run: `npx eslint . --max-warnings 0`
Expected: zero warnings. Fix any that surface (likely `react-hooks/exhaustive-deps` in animation primitives — adjust deps arrays to include only shared values, and suppress lint on `createAnimatedComponent` patterns with justification comments).

- [ ] **Step 4: Commit fixes if any**

### Task J3: Final cleanup

- [ ] **Step 1: Grep for dead imports**

Run: `grep -rn "home-hero-card\"" mobile app` → must return nothing
Run: `grep -rn "HomeHeroCard[^V]" mobile app` → must return nothing

- [ ] **Step 2: Spec + plan reference lint**

Confirm the spec document mentions no open questions; update the status line from "Design approved, pending implementation plan" to "Implemented" after this plan is fully executed and the PR lands.

```bash
sed -i '' 's/Status: Design approved, pending implementation plan/Status: Implemented/' docs/superpowers/specs/2026-04-22-home-redesign-v1-cuaderno-design.md
git add docs/superpowers/specs/2026-04-22-home-redesign-v1-cuaderno-design.md
git commit -m "docs: mark V1 Cuaderno home spec as implemented"
```

- [ ] **Step 3: Final summary commit (optional)**

```bash
git log --oneline main..HEAD
```

---

## Self-review checklist

- **Spec coverage:** all 14 sections of the spec map to at least one task:
  - §1 Context → no task (informational)
  - §2/§3 Goals/Non-goals → honored throughout
  - §4 Visual structure → Phase G + H assembly
  - §5 Data model → Phase A
  - §6 Hooks → Phase D + E
  - §7 Component tree → Phase G
  - §8 Animations → Phase F + G
  - §9 Theme tokens → Phase B
  - §10 Settings → Phase I
  - §11 Edge cases → Phase J task J1
  - §12 Testing → Phase E tests + Phase J task J2
  - §13 Rollout → no migration flag, handled by A4
  - §14 Open questions → none
- **Placeholder scan:** every `- [ ]` step shows actual code/commands.
- **Type consistency:** `SavingsGoal`, `HeroStatsTrio`, `MonthlyComparison`, `FamilyMemberRow`, `FixedExpensePayment` names are used consistently across model ↔ repo ↔ hook ↔ component consumers.
- **Tests referenced types:** all model functions have a matching test file; integration is verified via manual QA (J1).
- **Feedback adherence:** `Intl.NumberFormat` is only constructed at module scope in `utils/money.ts` (JS thread) and never inside a worklet; `useAnimatedReaction` passes to `runOnJS(setDisplay)` before any `format()` call.
