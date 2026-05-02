# Suscripciones Zombie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Manifiesto's family-transparent subscription audit feature: detect candidate subscriptions, ask each family member individually, classify with a pure engine, surface declarative intents (cancel/pause/downgrade), follow up against the payment cycle, replace the legacy passive heuristic.

**Architecture:**
- **Pure engine** (`subscription-audit-engine.ts`) consumes fijos + audits + intents + family + now → emits candidates + classifications. No React, no Supabase, no Date.now().
- **Two new tables** (`fixed_expense_usage_audit`, `fixed_expense_action_intent`) with RLS by `family_id` and unique partial constraint on open intents.
- **Three RPCs** (`audit_subscription`, `declare_subscription_intent`, `resolve_subscription_intent`) wrap the writes; clients call them via mutations with optimistic updates.
- **Surface in Asesor (control-v2)** as new signal cards in the existing feed; **badges in Fijos tab** for fijos with open intents; **inline chip** in Fijos cards for onboarding contextual.
- **Push** reuses existing `send-family-push` edge function, fires only on final classification.
- **Legacy heuristic deleted** — `ZOMBIE_INACTIVITY_DAYS`, `ZOMBIE_MAX_AMOUNT`, `isLikelyZombie()`, `captureZombieDeletion()` and the smart-alerts zombie card all removed.

**Tech Stack:** TypeScript, React Native (Expo), Supabase (Postgres + RLS + Edge Functions Deno), React Query, vitest, Reanimated v4.

**Spec:** `docs/superpowers/specs/2026-05-02-suscripciones-zombie-design.md`

**Phasing:** 6 phases, mergeable independently. Each phase ends with a typecheck + lint + test green and a commit.

---

## Phase 1 — Data layer (SQL migrations + RPCs)

### Task 1.1: Create the audit and intent tables migration

**Files:**
- Create: `supabase/migrations/20260502120000_subscription_zombie_tables.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Subscription zombie audit + intent tables
-- Spec: docs/superpowers/specs/2026-05-02-suscripciones-zombie-design.md §4

-- ─── fixed_expense_usage_audit ────────────────────────────────────

create table if not exists public.fixed_expense_usage_audit (
  id uuid primary key default gen_random_uuid(),
  fixed_expense_id uuid not null references public.fixed_expenses(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  level text not null check (level in ('mucho', 'a_veces', 'casi_nunca')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixed_expense_id, user_id, period)
);

create index if not exists fixed_expense_usage_audit_family_period_idx
  on public.fixed_expense_usage_audit (family_id, period);

create index if not exists fixed_expense_usage_audit_fixed_expense_idx
  on public.fixed_expense_usage_audit (fixed_expense_id);

alter table public.fixed_expense_usage_audit enable row level security;

drop policy if exists "fixed_expense_usage_audit_select_members"
  on public.fixed_expense_usage_audit;
create policy "fixed_expense_usage_audit_select_members"
  on public.fixed_expense_usage_audit
  for select
  using (
    exists (
      select 1
      from public.family_members fm
      where fm.family_id = fixed_expense_usage_audit.family_id
        and fm.user_id = auth.uid()
    )
  );

drop policy if exists "fixed_expense_usage_audit_insert_self"
  on public.fixed_expense_usage_audit;
create policy "fixed_expense_usage_audit_insert_self"
  on public.fixed_expense_usage_audit
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.family_members fm
      where fm.family_id = fixed_expense_usage_audit.family_id
        and fm.user_id = auth.uid()
    )
  );
-- No update or delete policy: responses are immutable in v1.

-- ─── fixed_expense_action_intent ──────────────────────────────────

create table if not exists public.fixed_expense_action_intent (
  id uuid primary key default gen_random_uuid(),
  fixed_expense_id uuid not null references public.fixed_expenses(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  intent text not null check (intent in ('cancel', 'pause', 'downgrade')),
  declared_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolution text null check (resolution in ('completed', 'abandoned')),
  notes text null
);

create unique index if not exists fixed_expense_action_intent_open_unique
  on public.fixed_expense_action_intent (fixed_expense_id)
  where (resolved_at is null);

create index if not exists fixed_expense_action_intent_family_open_idx
  on public.fixed_expense_action_intent (family_id)
  where (resolved_at is null);

alter table public.fixed_expense_action_intent enable row level security;

drop policy if exists "fixed_expense_action_intent_select_members"
  on public.fixed_expense_action_intent;
create policy "fixed_expense_action_intent_select_members"
  on public.fixed_expense_action_intent
  for select
  using (
    exists (
      select 1
      from public.family_members fm
      where fm.family_id = fixed_expense_action_intent.family_id
        and fm.user_id = auth.uid()
    )
  );

drop policy if exists "fixed_expense_action_intent_insert_self"
  on public.fixed_expense_action_intent;
create policy "fixed_expense_action_intent_insert_self"
  on public.fixed_expense_action_intent
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.family_members fm
      where fm.family_id = fixed_expense_action_intent.family_id
        and fm.user_id = auth.uid()
    )
  );

drop policy if exists "fixed_expense_action_intent_update_members"
  on public.fixed_expense_action_intent;
create policy "fixed_expense_action_intent_update_members"
  on public.fixed_expense_action_intent
  for update
  using (
    exists (
      select 1
      from public.family_members fm
      where fm.family_id = fixed_expense_action_intent.family_id
        and fm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.family_members fm
      where fm.family_id = fixed_expense_action_intent.family_id
        and fm.user_id = auth.uid()
    )
  );
-- No delete policy: intents are append-only, abandonment uses resolution='abandoned'.
```

- [ ] **Step 2: Apply via management API or supabase CLI**

If Docker is up: `npm run supabase:db:push -- --linked` (linked project).
If working remotely without Docker: copy the SQL into the Supabase SQL editor and run, or use `npm run supabase:remote:db:push` after committing.

For this plan we **do not run the migration in this phase**; the executing engineer should run `npm run supabase:remote:db:push` after the entire phase is committed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260502120000_subscription_zombie_tables.sql
git commit -m "feat(db): add fixed_expense_usage_audit and fixed_expense_action_intent tables with RLS"
```

---

### Task 1.2: Backfill the Suscripciones category for legacy families

**Files:**
- Create: `supabase/migrations/20260502120100_backfill_suscripciones_category.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Backfill: ensure every family has a 'Suscripciones' category with scope='fixed_expense'.
-- bootstrap_family() seeds it for new families, but families created before
-- 20260423151925_add_fixed_expense_category_scope.sql may be missing it.

insert into public.categories (id, family_id, name, color, scope, created_at, updated_at)
select
  gen_random_uuid(),
  f.id,
  'Suscripciones',
  '#C9A6E0',
  'fixed_expense',
  now(),
  now()
from public.families f
where not exists (
  select 1
  from public.categories c
  where c.family_id = f.id
    and c.name = 'Suscripciones'
    and c.scope = 'fixed_expense'
);
```

- [ ] **Step 2: Verify idempotency**

This migration is idempotent because of the `not exists` clause. Running twice produces zero new inserts.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260502120100_backfill_suscripciones_category.sql
git commit -m "feat(db): backfill Suscripciones category for legacy families"
```

---

### Task 1.3: Create the three RPCs

**Files:**
- Create: `supabase/migrations/20260502120200_subscription_zombie_rpcs.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- RPCs for subscription zombie audit/intent flow.

-- ─── audit_subscription(fixed_expense_id, level) ──────────────────
-- Inserts a usage audit row for the calling user, period derived from now().
create or replace function public.audit_subscription(
  p_fixed_expense_id uuid,
  p_level text
)
returns public.fixed_expense_usage_audit
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
  v_period text := to_char(now(), 'YYYY-MM');
  v_row public.fixed_expense_usage_audit;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select family_id into v_family_id
  from public.fixed_expenses
  where id = p_fixed_expense_id;

  if v_family_id is null then
    raise exception 'Fixed expense not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_family_id and fm.user_id = v_user_id
  ) then
    raise exception 'Not a member of this family' using errcode = '42501';
  end if;

  if p_level not in ('mucho', 'a_veces', 'casi_nunca') then
    raise exception 'Invalid level' using errcode = '22023';
  end if;

  insert into public.fixed_expense_usage_audit
    (fixed_expense_id, family_id, user_id, period, level)
  values
    (p_fixed_expense_id, v_family_id, v_user_id, v_period, p_level)
  on conflict (fixed_expense_id, user_id, period) do update
    set level = excluded.level,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.audit_subscription(uuid, text) to authenticated;

-- ─── declare_subscription_intent(fixed_expense_id, intent, notes?) ─
create or replace function public.declare_subscription_intent(
  p_fixed_expense_id uuid,
  p_intent text,
  p_notes text default null
)
returns public.fixed_expense_action_intent
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
  v_row public.fixed_expense_action_intent;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select family_id into v_family_id
  from public.fixed_expenses
  where id = p_fixed_expense_id;

  if v_family_id is null then
    raise exception 'Fixed expense not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_family_id and fm.user_id = v_user_id
  ) then
    raise exception 'Not a member of this family' using errcode = '42501';
  end if;

  if p_intent not in ('cancel', 'pause', 'downgrade') then
    raise exception 'Invalid intent' using errcode = '22023';
  end if;

  insert into public.fixed_expense_action_intent
    (fixed_expense_id, family_id, user_id, intent, notes)
  values
    (p_fixed_expense_id, v_family_id, v_user_id, p_intent, p_notes)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.declare_subscription_intent(uuid, text, text) to authenticated;

-- ─── resolve_subscription_intent(intent_id, resolution, new_amount?) ─
create or replace function public.resolve_subscription_intent(
  p_intent_id uuid,
  p_resolution text,
  p_new_amount numeric default null
)
returns public.fixed_expense_action_intent
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_fixed_expense_id uuid;
  v_intent text;
  v_user_id uuid := auth.uid();
  v_row public.fixed_expense_action_intent;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select family_id, fixed_expense_id, intent
    into v_family_id, v_fixed_expense_id, v_intent
  from public.fixed_expense_action_intent
  where id = p_intent_id;

  if v_family_id is null then
    raise exception 'Intent not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_family_id and fm.user_id = v_user_id
  ) then
    raise exception 'Not a member of this family' using errcode = '42501';
  end if;

  if p_resolution not in ('completed', 'abandoned') then
    raise exception 'Invalid resolution' using errcode = '22023';
  end if;

  update public.fixed_expense_action_intent
    set resolved_at = now(),
        resolution = p_resolution
  where id = p_intent_id and resolved_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Intent already resolved' using errcode = '22023';
  end if;

  -- Apply effects on the fixed expense if the intent was completed.
  if p_resolution = 'completed' then
    if v_intent = 'cancel' then
      update public.fixed_expenses
        set status = 'archived', updated_at = now()
      where id = v_fixed_expense_id;
    elsif v_intent = 'pause' then
      update public.fixed_expenses
        set status = 'paused', updated_at = now()
      where id = v_fixed_expense_id;
    elsif v_intent = 'downgrade' and p_new_amount is not null then
      update public.fixed_expenses
        set amount = p_new_amount, updated_at = now()
      where id = v_fixed_expense_id;
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.resolve_subscription_intent(uuid, text, numeric) to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260502120200_subscription_zombie_rpcs.sql
git commit -m "feat(db): add audit_subscription, declare_subscription_intent, resolve_subscription_intent RPCs"
```

---

## Phase 2 — Pure engine + period helpers + known providers

### Task 2.1: Known providers list

**Files:**
- Create: `mobile/features/subscriptions-zombie/known-providers.ts`
- Create: `mobile/features/subscriptions-zombie/known-providers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/features/subscriptions-zombie/known-providers.test.ts
import { describe, expect, it } from 'vitest'
import { matchesKnownProvider } from './known-providers'

describe('matchesKnownProvider', () => {
  it('matches well-known names case-insensitively', () => {
    expect(matchesKnownProvider('Netflix')).toBe(true)
    expect(matchesKnownProvider('netflix')).toBe(true)
    expect(matchesKnownProvider('NETFLIX')).toBe(true)
    expect(matchesKnownProvider('Disney+')).toBe(true)
    expect(matchesKnownProvider('Apple Music')).toBe(true)
    expect(matchesKnownProvider('Apple marito')).toBe(true)
    expect(matchesKnownProvider('chatgpt plus')).toBe(true)
  })

  it('does not match unknown providers', () => {
    expect(matchesKnownProvider('Multiplay Premium')).toBe(false)
    expect(matchesKnownProvider('Cuota colegio')).toBe(false)
    expect(matchesKnownProvider('Donación Cruz Roja')).toBe(false)
    expect(matchesKnownProvider('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm run test -- known-providers`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement known-providers.ts**

```typescript
// mobile/features/subscriptions-zombie/known-providers.ts

/**
 * Hardcoded list of well-known subscription brands for the contextual
 * onboarding chip. Match is case-insensitive substring; conservative —
 * we prefer false negatives (no chip on unknown local brands) over
 * false positives (chip on something that isn't a subscription).
 */
export const KNOWN_SUBSCRIPTION_PROVIDERS = [
  'netflix',
  'spotify',
  'disney',
  'hbo',
  'max',
  'prime video',
  'amazon prime',
  'apple',
  'icloud',
  'youtube premium',
  'youtube music',
  'crunchyroll',
  'storytel',
  'audible',
  'chatgpt',
  'claude',
  'notion',
  'adobe',
  'canva',
  'github',
  'gym',
  'smartfit',
  'megatlon',
  'fit',
] as const

export function matchesKnownProvider(name: string): boolean {
  if (!name) return false
  const lower = name.toLowerCase()
  return KNOWN_SUBSCRIPTION_PROVIDERS.some((p) => lower.includes(p))
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm run test -- known-providers`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/subscriptions-zombie/known-providers.ts mobile/features/subscriptions-zombie/known-providers.test.ts
git commit -m "feat(subs-zombie): add known providers matcher with tests"
```

---

### Task 2.2: Period helper

**Files:**
- Create: `mobile/features/subscriptions-zombie/period.ts`
- Create: `mobile/features/subscriptions-zombie/period.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/features/subscriptions-zombie/period.test.ts
import { describe, expect, it } from 'vitest'
import { periodOf, periodsBetween } from './period'

describe('periodOf', () => {
  it('formats YYYY-MM in UTC', () => {
    expect(periodOf(new Date('2026-05-02T15:00:00Z'))).toBe('2026-05')
    expect(periodOf(new Date('2026-12-31T23:59:00Z'))).toBe('2026-12')
    expect(periodOf(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })
})

describe('periodsBetween', () => {
  it('counts months inclusive', () => {
    expect(periodsBetween('2026-01', '2026-01')).toBe(0)
    expect(periodsBetween('2026-01', '2026-02')).toBe(1)
    expect(periodsBetween('2026-01', '2027-01')).toBe(12)
    expect(periodsBetween('2026-12', '2027-01')).toBe(1)
  })
})
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm run test -- period`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement period.ts**

```typescript
// mobile/features/subscriptions-zombie/period.ts

/** Format a Date as 'YYYY-MM' in UTC (engine-friendly, no locale). */
export function periodOf(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/** Number of full months from `from` to `to`, both 'YYYY-MM'. */
export function periodsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm run test -- period`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/subscriptions-zombie/period.ts mobile/features/subscriptions-zombie/period.test.ts
git commit -m "feat(subs-zombie): add period helpers (YYYY-MM)"
```

---

### Task 2.3: Engine types

**Files:**
- Create: `mobile/features/subscriptions-zombie/types.ts`

- [ ] **Step 1: Define types**

```typescript
// mobile/features/subscriptions-zombie/types.ts

export type UsageLevel = 'mucho' | 'a_veces' | 'casi_nunca'

export type IntentKind = 'cancel' | 'pause' | 'downgrade'

export type IntentResolution = 'completed' | 'abandoned'

export type Classification =
  | 'zombie_consensuado'
  | 'no_zombie'
  | 'indecisa'
  | 'uso_desigual'
  | 'parcial'

export interface UsageAuditRecord {
  id: string
  fixedExpenseId: string
  familyId: string
  userId: string
  period: string
  level: UsageLevel
  createdAt: string
}

export interface ActionIntentRecord {
  id: string
  fixedExpenseId: string
  familyId: string
  userId: string | null
  intent: IntentKind
  declaredAt: string
  resolvedAt: string | null
  resolution: IntentResolution | null
  notes: string | null
}

export interface FixedExpenseRow {
  id: string
  familyId: string
  name: string
  amount: number
  kind: string
  status: string
  frequency: string
  categoryId: string | null
  categoryName: string | null
  categoryScope: string | null
  nextDueOn: string | null
  lastPaidAt: string | null
  createdAt: string
}

export interface FamilyMemberRow {
  userId: string
  name: string
}

export interface PaymentRow {
  id: string
  fixedExpenseId: string
  paymentPeriod: string
  amount: number
  createdAt: string
}

export interface AuditFeedItem {
  fixedExpenseId: string
  classification: Classification | 'pending_audit'
  audits: UsageAuditRecord[]
  openIntent: ActionIntentRecord | null
  followUpKind: 'awaiting_post_due' | 'payment_recurred' | 'no_payment_after_due' | null
}

export interface EngineInput {
  fixedExpenses: FixedExpenseRow[]
  audits: UsageAuditRecord[]
  intents: ActionIntentRecord[]
  payments: PaymentRow[]
  members: FamilyMemberRow[]
  now: Date
}

export interface EngineResult {
  feed: AuditFeedItem[]
}

export const MIN_AGE_DAYS = 60
export const AUDIT_OPEN_DAYS = 14
export const POST_DUE_GRACE_DAYS = 5
export const COOLDOWN_NO_ZOMBIE_DAYS = 180
export const COOLDOWN_INDECISA_DAYS = 90
export const COOLDOWN_USO_DESIGUAL_DAYS = 180
export const COOLDOWN_PARCIAL_DAYS = 60
export const COOLDOWN_INTENT_ABANDONED_DAYS = 180
```

- [ ] **Step 2: Commit**

```bash
git add mobile/features/subscriptions-zombie/types.ts
git commit -m "feat(subs-zombie): add engine types and constants"
```

---

### Task 2.4: Engine — candidacy filter

**Files:**
- Create: `mobile/features/subscriptions-zombie/subscription-audit-engine.ts`
- Create: `mobile/features/subscriptions-zombie/subscription-audit-engine.test.ts`

- [ ] **Step 1: Write failing tests for `isAuditCandidate`**

```typescript
// mobile/features/subscriptions-zombie/subscription-audit-engine.test.ts
import { describe, expect, it } from 'vitest'
import { isAuditCandidate } from './subscription-audit-engine'
import type { FixedExpenseRow } from './types'

const baseFijo: FixedExpenseRow = {
  id: 'fe-1',
  familyId: 'fam-1',
  name: 'Disney+',
  amount: 18400,
  kind: 'recurring',
  status: 'active',
  frequency: 'monthly',
  categoryId: 'cat-subs',
  categoryName: 'Suscripciones',
  categoryScope: 'fixed_expense',
  nextDueOn: null,
  lastPaidAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
}

const now = new Date('2026-05-01T00:00:00Z')

describe('isAuditCandidate', () => {
  it('returns true for a normal subscription past 60 days', () => {
    expect(isAuditCandidate(baseFijo, now)).toBe(true)
  })

  it('rejects fijos under 60 days', () => {
    const young = { ...baseFijo, createdAt: new Date('2026-04-15T00:00:00Z').toISOString() }
    expect(isAuditCandidate(young, now)).toBe(false)
  })

  it('rejects non-recurring kinds', () => {
    expect(isAuditCandidate({ ...baseFijo, kind: 'installment' }, now)).toBe(false)
    expect(isAuditCandidate({ ...baseFijo, kind: 'debt' }, now)).toBe(false)
    expect(isAuditCandidate({ ...baseFijo, kind: 'periodic' }, now)).toBe(false)
  })

  it('rejects non-active status', () => {
    expect(isAuditCandidate({ ...baseFijo, status: 'paused' }, now)).toBe(false)
    expect(isAuditCandidate({ ...baseFijo, status: 'archived' }, now)).toBe(false)
  })

  it('rejects fijos without Suscripciones category', () => {
    expect(isAuditCandidate({ ...baseFijo, categoryName: 'Servicios' }, now)).toBe(false)
    expect(isAuditCandidate({ ...baseFijo, categoryName: null }, now)).toBe(false)
    expect(isAuditCandidate({ ...baseFijo, categoryScope: 'expense' }, now)).toBe(false)
  })

  it('rejects unsupported frequencies', () => {
    expect(isAuditCandidate({ ...baseFijo, frequency: 'quarterly' }, now)).toBe(false)
    expect(isAuditCandidate({ ...baseFijo, frequency: 'annual' }, now)).toBe(false)
  })

  it('accepts weekly and biweekly', () => {
    expect(isAuditCandidate({ ...baseFijo, frequency: 'weekly' }, now)).toBe(true)
    expect(isAuditCandidate({ ...baseFijo, frequency: 'biweekly' }, now)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm run test -- subscription-audit-engine`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `isAuditCandidate`**

```typescript
// mobile/features/subscriptions-zombie/subscription-audit-engine.ts
import {
  type FixedExpenseRow,
  MIN_AGE_DAYS,
} from './types'

const ALLOWED_FREQUENCIES = new Set(['weekly', 'biweekly', 'monthly'])

function ageDays(createdAtIso: string, now: Date): number {
  const created = Date.parse(createdAtIso)
  if (Number.isNaN(created)) return 0
  return Math.floor((now.getTime() - created) / (1000 * 60 * 60 * 24))
}

export function isAuditCandidate(fijo: FixedExpenseRow, now: Date): boolean {
  if (fijo.kind !== 'recurring') return false
  if (fijo.status !== 'active') return false
  if (fijo.categoryName !== 'Suscripciones') return false
  if (fijo.categoryScope !== 'fixed_expense') return false
  if (!ALLOWED_FREQUENCIES.has(fijo.frequency)) return false
  if (ageDays(fijo.createdAt, now) < MIN_AGE_DAYS) return false
  return true
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm run test -- subscription-audit-engine`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/subscriptions-zombie/subscription-audit-engine.ts mobile/features/subscriptions-zombie/subscription-audit-engine.test.ts
git commit -m "feat(subs-zombie): engine candidacy filter with tests"
```

---

### Task 2.5: Engine — classification rules

**Files:**
- Modify: `mobile/features/subscriptions-zombie/subscription-audit-engine.ts`
- Modify: `mobile/features/subscriptions-zombie/subscription-audit-engine.test.ts`

- [ ] **Step 1: Add failing tests for `classifyAudit`**

Append to `subscription-audit-engine.test.ts`:

```typescript
import { classifyAudit } from './subscription-audit-engine'
import type { UsageAuditRecord, FamilyMemberRow } from './types'

const auditRow = (userId: string, level: 'mucho' | 'a_veces' | 'casi_nunca'): UsageAuditRecord => ({
  id: `a-${userId}`,
  fixedExpenseId: 'fe-1',
  familyId: 'fam-1',
  userId,
  period: '2026-05',
  level,
  createdAt: '2026-05-01T00:00:00Z',
})

const members: FamilyMemberRow[] = [
  { userId: 'u1', name: 'Mario' },
  { userId: 'u2', name: 'Aye' },
]

describe('classifyAudit', () => {
  it('returns zombie_consensuado when all responders said casi_nunca', () => {
    const audits = [auditRow('u1', 'casi_nunca'), auditRow('u2', 'casi_nunca')]
    expect(classifyAudit(audits, members)).toBe('zombie_consensuado')
  })

  it('returns no_zombie when at least one said mucho', () => {
    const audits = [auditRow('u1', 'casi_nunca'), auditRow('u2', 'mucho')]
    expect(classifyAudit(audits, members)).toBe('uso_desigual')
  })

  it('returns no_zombie when only mucho responses', () => {
    const audits = [auditRow('u1', 'mucho')]
    expect(classifyAudit(audits, members)).toBe('parcial') // 1 of 2 < 50%
  })

  it('returns indecisa when only a_veces, no mucho, no casi_nunca', () => {
    const audits = [auditRow('u1', 'a_veces'), auditRow('u2', 'a_veces')]
    expect(classifyAudit(audits, members)).toBe('indecisa')
  })

  it('returns uso_desigual when mix of casi_nunca and a_veces', () => {
    const audits = [auditRow('u1', 'casi_nunca'), auditRow('u2', 'a_veces')]
    expect(classifyAudit(audits, members)).toBe('uso_desigual')
  })

  it('returns parcial when fewer than 50% members responded', () => {
    const fourMembers: FamilyMemberRow[] = [
      { userId: 'u1', name: 'A' },
      { userId: 'u2', name: 'B' },
      { userId: 'u3', name: 'C' },
      { userId: 'u4', name: 'D' },
    ]
    const audits = [auditRow('u1', 'casi_nunca')]
    expect(classifyAudit(audits, fourMembers)).toBe('parcial')
  })

  it('returns no_zombie when all members responded mucho', () => {
    const audits = [auditRow('u1', 'mucho'), auditRow('u2', 'mucho')]
    expect(classifyAudit(audits, members)).toBe('no_zombie')
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `npm run test -- subscription-audit-engine`
Expected: FAIL — `classifyAudit` is not a function.

- [ ] **Step 3: Implement `classifyAudit`**

Append to `subscription-audit-engine.ts`:

```typescript
import {
  type Classification,
  type UsageAuditRecord,
  type FamilyMemberRow,
} from './types'

export function classifyAudit(
  audits: UsageAuditRecord[],
  members: FamilyMemberRow[],
): Classification {
  const totalMembers = Math.max(members.length, 1)
  const responseRate = audits.length / totalMembers
  if (responseRate < 0.5) return 'parcial'

  const levels = new Set(audits.map((a) => a.level))
  const hasMucho = levels.has('mucho')
  const hasAVeces = levels.has('a_veces')
  const hasCasiNunca = levels.has('casi_nunca')

  if (hasCasiNunca && (hasMucho || hasAVeces)) return 'uso_desigual'
  if (hasCasiNunca) return 'zombie_consensuado'
  if (hasMucho && !hasAVeces && !hasCasiNunca) return 'no_zombie'
  if (hasMucho) return 'no_zombie'
  if (hasAVeces) return 'indecisa'
  return 'parcial'
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm run test -- subscription-audit-engine`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/subscriptions-zombie/subscription-audit-engine.ts mobile/features/subscriptions-zombie/subscription-audit-engine.test.ts
git commit -m "feat(subs-zombie): engine classification rules with tests"
```

---

### Task 2.6: Engine — cooldown logic

**Files:**
- Modify: `mobile/features/subscriptions-zombie/subscription-audit-engine.ts`
- Modify: `mobile/features/subscriptions-zombie/subscription-audit-engine.test.ts`

- [ ] **Step 1: Add failing tests for `isInCooldown`**

```typescript
import { isInCooldown } from './subscription-audit-engine'

describe('isInCooldown', () => {
  it('returns false when no prior audits', () => {
    expect(isInCooldown([], [], new Date('2026-05-01T00:00:00Z'), members)).toBe(false)
  })

  it('returns true 30d after no_zombie classification (180d cooldown)', () => {
    const audits = [
      { ...auditRow('u1', 'mucho'), period: '2026-04', createdAt: '2026-04-01T00:00:00Z' },
      { ...auditRow('u2', 'mucho'), period: '2026-04', createdAt: '2026-04-01T00:00:00Z' },
    ]
    expect(isInCooldown(audits, [], new Date('2026-05-01T00:00:00Z'), members)).toBe(true)
  })

  it('returns false 200d after no_zombie classification', () => {
    const audits = [
      { ...auditRow('u1', 'mucho'), period: '2025-10', createdAt: '2025-10-01T00:00:00Z' },
      { ...auditRow('u2', 'mucho'), period: '2025-10', createdAt: '2025-10-01T00:00:00Z' },
    ]
    expect(isInCooldown(audits, [], new Date('2026-05-01T00:00:00Z'), members)).toBe(false)
  })

  it('returns true after abandoned intent (180d)', () => {
    const intent = {
      id: 'i1',
      fixedExpenseId: 'fe-1',
      familyId: 'fam-1',
      userId: 'u1',
      intent: 'cancel' as const,
      declaredAt: '2026-04-01T00:00:00Z',
      resolvedAt: '2026-04-05T00:00:00Z',
      resolution: 'abandoned' as const,
      notes: null,
    }
    expect(isInCooldown([], [intent], new Date('2026-05-01T00:00:00Z'), members)).toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `npm run test -- subscription-audit-engine`
Expected: FAIL — `isInCooldown` is not a function.

- [ ] **Step 3: Implement `isInCooldown`**

Append to `subscription-audit-engine.ts`:

```typescript
import {
  COOLDOWN_INDECISA_DAYS,
  COOLDOWN_INTENT_ABANDONED_DAYS,
  COOLDOWN_NO_ZOMBIE_DAYS,
  COOLDOWN_PARCIAL_DAYS,
  COOLDOWN_USO_DESIGUAL_DAYS,
  type ActionIntentRecord,
} from './types'

function daysAgo(iso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(iso)) / (1000 * 60 * 60 * 24))
}

function lastClassificationDate(audits: UsageAuditRecord[]): {
  classification: Classification
  date: Date
} | null {
  if (audits.length === 0) return null
  // Group by period, classify each, keep latest
  const periods = new Map<string, UsageAuditRecord[]>()
  for (const a of audits) {
    const list = periods.get(a.period) ?? []
    list.push(a)
    periods.set(a.period, list)
  }
  const sorted = [...periods.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  const [period, group] = sorted[0]
  const classification = classifyAudit(group, [
    // members shape unused inside classifyAudit beyond length;
    // caller passes real members in production.
    ...new Set(group.map((g) => g.userId)),
  ].map((u) => ({ userId: u, name: '' })))
  // Use the most recent createdAt as the audit close date.
  const latestCreated = group.reduce(
    (max, a) => (a.createdAt > max ? a.createdAt : max),
    group[0].createdAt,
  )
  return { classification, date: new Date(latestCreated) }
}

function cooldownDaysFor(classification: Classification): number {
  switch (classification) {
    case 'no_zombie':
      return COOLDOWN_NO_ZOMBIE_DAYS
    case 'indecisa':
      return COOLDOWN_INDECISA_DAYS
    case 'uso_desigual':
      return COOLDOWN_USO_DESIGUAL_DAYS
    case 'parcial':
      return COOLDOWN_PARCIAL_DAYS
    case 'zombie_consensuado':
      // Zombie consensuado does not get a cooldown by audits — it
      // gets resolved by intents.
      return 0
  }
}

export function isInCooldown(
  audits: UsageAuditRecord[],
  intents: ActionIntentRecord[],
  now: Date,
  members: FamilyMemberRow[],
): boolean {
  const lastAudit = lastClassificationDate(audits)
  if (lastAudit) {
    // Re-classify with proper members for accurate cooldown decision.
    const groupOfPeriod = audits.filter(
      (a) => a.period === audits.sort((x, y) => (x.period < y.period ? 1 : -1))[0].period,
    )
    const realClassification = classifyAudit(groupOfPeriod, members)
    const cooldown = cooldownDaysFor(realClassification)
    if (cooldown > 0 && daysAgo(lastAudit.date.toISOString(), now) < cooldown) {
      return true
    }
  }

  const abandonedIntent = intents
    .filter((i) => i.resolution === 'abandoned' && i.resolvedAt)
    .sort((a, b) =>
      (a.resolvedAt ?? '') < (b.resolvedAt ?? '') ? 1 : -1,
    )[0]
  if (
    abandonedIntent?.resolvedAt &&
    daysAgo(abandonedIntent.resolvedAt, now) < COOLDOWN_INTENT_ABANDONED_DAYS
  ) {
    return true
  }

  return false
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm run test -- subscription-audit-engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/subscriptions-zombie/subscription-audit-engine.ts mobile/features/subscriptions-zombie/subscription-audit-engine.test.ts
git commit -m "feat(subs-zombie): engine cooldown logic with tests"
```

---

### Task 2.7: Engine — buildFeed integration

**Files:**
- Modify: `mobile/features/subscriptions-zombie/subscription-audit-engine.ts`
- Modify: `mobile/features/subscriptions-zombie/subscription-audit-engine.test.ts`

- [ ] **Step 1: Add failing test for `buildFeed`**

```typescript
import { buildFeed } from './subscription-audit-engine'

describe('buildFeed', () => {
  it('returns no items for non-candidate fijos', () => {
    const result = buildFeed({
      fixedExpenses: [{ ...baseFijo, status: 'archived' }],
      audits: [],
      intents: [],
      payments: [],
      members,
      now: new Date('2026-05-01T00:00:00Z'),
    })
    expect(result.feed).toHaveLength(0)
  })

  it('returns pending_audit for a candidate without responses', () => {
    const result = buildFeed({
      fixedExpenses: [baseFijo],
      audits: [],
      intents: [],
      payments: [],
      members,
      now: new Date('2026-05-01T00:00:00Z'),
    })
    expect(result.feed).toHaveLength(1)
    expect(result.feed[0].classification).toBe('pending_audit')
  })

  it('returns zombie_consensuado when all responded casi_nunca and no intent yet', () => {
    const audits = [
      auditRow('u1', 'casi_nunca'),
      auditRow('u2', 'casi_nunca'),
    ]
    const result = buildFeed({
      fixedExpenses: [baseFijo],
      audits,
      intents: [],
      payments: [],
      members,
      now: new Date('2026-05-15T00:00:00Z'),
    })
    expect(result.feed[0].classification).toBe('zombie_consensuado')
    expect(result.feed[0].openIntent).toBeNull()
  })

  it('exposes openIntent and follow-up kind when payment recurred after declared_at', () => {
    const intent: ActionIntentRecord = {
      id: 'i-1',
      fixedExpenseId: 'fe-1',
      familyId: 'fam-1',
      userId: 'u1',
      intent: 'cancel',
      declaredAt: '2026-05-15T00:00:00Z',
      resolvedAt: null,
      resolution: null,
      notes: null,
    }
    const payment: PaymentRow = {
      id: 'p-1',
      fixedExpenseId: 'fe-1',
      paymentPeriod: '2026-06',
      amount: 18400,
      createdAt: '2026-06-22T00:00:00Z',
    }
    const result = buildFeed({
      fixedExpenses: [baseFijo],
      audits: [auditRow('u1', 'casi_nunca'), auditRow('u2', 'casi_nunca')],
      intents: [intent],
      payments: [payment],
      members,
      now: new Date('2026-06-25T00:00:00Z'),
    })
    expect(result.feed[0].openIntent?.id).toBe('i-1')
    expect(result.feed[0].followUpKind).toBe('payment_recurred')
  })

  it('skips fijos in cooldown', () => {
    const audits = [
      { ...auditRow('u1', 'mucho'), period: '2026-04', createdAt: '2026-04-15T00:00:00Z' },
      { ...auditRow('u2', 'mucho'), period: '2026-04', createdAt: '2026-04-15T00:00:00Z' },
    ]
    const result = buildFeed({
      fixedExpenses: [baseFijo],
      audits,
      intents: [],
      payments: [],
      members,
      now: new Date('2026-05-01T00:00:00Z'),
    })
    expect(result.feed).toHaveLength(0)
  })
})

import type { ActionIntentRecord, PaymentRow } from './types'
```

- [ ] **Step 2: Run, expect failure**

Run: `npm run test -- subscription-audit-engine`
Expected: FAIL — `buildFeed` is not a function.

- [ ] **Step 3: Implement `buildFeed`**

Append to `subscription-audit-engine.ts`:

```typescript
import {
  type AuditFeedItem,
  type EngineInput,
  type EngineResult,
  type PaymentRow,
  POST_DUE_GRACE_DAYS,
} from './types'

function nextDueDate(fijo: FixedExpenseRow): Date | null {
  if (!fijo.nextDueOn) return null
  const d = new Date(fijo.nextDueOn)
  return Number.isNaN(d.getTime()) ? null : d
}

function followUpKind(
  intent: ActionIntentRecord | null,
  fijo: FixedExpenseRow,
  payments: PaymentRow[],
  now: Date,
): AuditFeedItem['followUpKind'] {
  if (!intent || intent.resolvedAt) return null
  const declared = new Date(intent.declaredAt)
  const due = nextDueDate(fijo)
  const paymentAfterDeclared = payments
    .filter((p) => p.fixedExpenseId === fijo.id)
    .find((p) => Date.parse(p.createdAt) > declared.getTime())

  if (paymentAfterDeclared) return 'payment_recurred'
  if (due && now.getTime() > due.getTime() + POST_DUE_GRACE_DAYS * 86400000) {
    return 'no_payment_after_due'
  }
  return 'awaiting_post_due'
}

export function buildFeed(input: EngineInput): EngineResult {
  const { fixedExpenses, audits, intents, payments, members, now } = input
  const feed: AuditFeedItem[] = []

  for (const fijo of fixedExpenses) {
    if (!isAuditCandidate(fijo, now)) continue

    const fijoAudits = audits.filter((a) => a.fixedExpenseId === fijo.id)
    const fijoIntents = intents.filter((i) => i.fixedExpenseId === fijo.id)
    const openIntent = fijoIntents.find((i) => i.resolvedAt === null) ?? null

    if (isInCooldown(fijoAudits, fijoIntents, now, members)) continue

    const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const currentAudits = fijoAudits.filter((a) => a.period === currentPeriod)

    let classification: AuditFeedItem['classification']
    if (currentAudits.length === 0 && !openIntent) {
      classification = 'pending_audit'
    } else if (openIntent) {
      // While intent is open, classification reflects the audit that
      // produced it; we re-derive from the audits in the same period as
      // the intent declaration for surfaces that need it.
      const intentPeriod = `${new Date(openIntent.declaredAt).getUTCFullYear()}-${String(
        new Date(openIntent.declaredAt).getUTCMonth() + 1,
      ).padStart(2, '0')}`
      const intentAudits = fijoAudits.filter((a) => a.period === intentPeriod)
      classification = classifyAudit(intentAudits, members)
    } else {
      classification = classifyAudit(currentAudits, members)
    }

    feed.push({
      fixedExpenseId: fijo.id,
      classification,
      audits: currentAudits,
      openIntent,
      followUpKind: openIntent ? followUpKind(openIntent, fijo, payments, now) : null,
    })
  }

  return { feed }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm run test -- subscription-audit-engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/subscriptions-zombie/subscription-audit-engine.ts mobile/features/subscriptions-zombie/subscription-audit-engine.test.ts
git commit -m "feat(subs-zombie): engine buildFeed integration with tests"
```

---

## Phase 3 — Hooks, queryKeys, repository

### Task 3.1: Query keys factory

**Files:**
- Create: `mobile/features/subscriptions-zombie/query-keys.ts`

- [ ] **Step 1: Implement**

```typescript
// mobile/features/subscriptions-zombie/query-keys.ts

export const subscriptionsZombieQueryKeys = {
  all: ['subscriptions-zombie'] as const,
  feed: (familyId?: string) => ['subscriptions-zombie', 'feed', familyId ?? null] as const,
  audits: (familyId?: string, period?: string) =>
    ['subscriptions-zombie', 'audits', familyId ?? null, period ?? null] as const,
  intents: (familyId?: string) =>
    ['subscriptions-zombie', 'intents', familyId ?? null] as const,
  category: (familyId?: string) =>
    ['subscriptions-zombie', 'category', familyId ?? null] as const,
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/features/subscriptions-zombie/query-keys.ts
git commit -m "feat(subs-zombie): add queryKey factory"
```

---

### Task 3.2: useSubscriptionsCategoryId hook

**Files:**
- Create: `mobile/features/subscriptions-zombie/use-subscriptions-category-id.ts`

- [ ] **Step 1: Implement**

```typescript
// mobile/features/subscriptions-zombie/use-subscriptions-category-id.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscriptionsZombieQueryKeys } from './query-keys'

export function useSubscriptionsCategoryId(familyId?: string) {
  return useQuery({
    queryKey: subscriptionsZombieQueryKeys.category(familyId),
    enabled: Boolean(familyId),
    staleTime: 1000 * 60 * 60 * 24, // 24h — categoría es estable
    queryFn: async (): Promise<string | null> => {
      if (!familyId) return null
      const { data, error } = await supabase
        .from('categories')
        .select('id')
        .eq('family_id', familyId)
        .eq('name', 'Suscripciones')
        .eq('scope', 'fixed_expense')
        .maybeSingle()
      if (error) throw error
      return data?.id ?? null
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/features/subscriptions-zombie/use-subscriptions-category-id.ts
git commit -m "feat(subs-zombie): hook to resolve Suscripciones category id"
```

---

### Task 3.3: useSubscriptionAuditFeed hook

**Files:**
- Create: `mobile/features/subscriptions-zombie/use-subscription-audit-feed.ts`

- [ ] **Step 1: Implement**

```typescript
// mobile/features/subscriptions-zombie/use-subscription-audit-feed.ts
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscriptionsZombieQueryKeys } from './query-keys'
import { buildFeed } from './subscription-audit-engine'
import type {
  ActionIntentRecord,
  EngineResult,
  FamilyMemberRow,
  FixedExpenseRow,
  PaymentRow,
  UsageAuditRecord,
} from './types'

interface RawData {
  fixedExpenses: FixedExpenseRow[]
  audits: UsageAuditRecord[]
  intents: ActionIntentRecord[]
  payments: PaymentRow[]
  members: FamilyMemberRow[]
}

export function useSubscriptionAuditFeed(familyId?: string): {
  data: EngineResult | undefined
  isLoading: boolean
} {
  const query = useQuery<RawData>({
    queryKey: subscriptionsZombieQueryKeys.feed(familyId),
    enabled: Boolean(familyId),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      if (!familyId) {
        return { fixedExpenses: [], audits: [], intents: [], payments: [], members: [] }
      }

      const [fijos, audits, intents, payments, members] = await Promise.all([
        supabase
          .from('fixed_expenses')
          .select(
            'id, family_id, name, amount, kind, status, frequency, category_id, next_due_on, last_paid_at, created_at, categories(name, scope)',
          )
          .eq('family_id', familyId),
        supabase.from('fixed_expense_usage_audit').select('*').eq('family_id', familyId),
        supabase.from('fixed_expense_action_intent').select('*').eq('family_id', familyId),
        supabase
          .from('fixed_expense_payments')
          .select('id, fixed_expense_id, payment_period, amount, created_at')
          .eq('family_id', familyId),
        supabase
          .from('family_members')
          .select('user_id, profiles(display_name)')
          .eq('family_id', familyId),
      ])

      if (fijos.error) throw fijos.error
      if (audits.error) throw audits.error
      if (intents.error) throw intents.error
      if (payments.error) throw payments.error
      if (members.error) throw members.error

      return {
        fixedExpenses: (fijos.data ?? []).map(
          (r): FixedExpenseRow => ({
            id: r.id,
            familyId: r.family_id,
            name: r.name,
            amount: Number(r.amount),
            kind: r.kind,
            status: r.status,
            frequency: r.frequency,
            categoryId: r.category_id,
            categoryName: (r as any).categories?.name ?? null,
            categoryScope: (r as any).categories?.scope ?? null,
            nextDueOn: r.next_due_on,
            lastPaidAt: r.last_paid_at,
            createdAt: r.created_at,
          }),
        ),
        audits: (audits.data ?? []).map(
          (a): UsageAuditRecord => ({
            id: a.id,
            fixedExpenseId: a.fixed_expense_id,
            familyId: a.family_id,
            userId: a.user_id,
            period: a.period,
            level: a.level,
            createdAt: a.created_at,
          }),
        ),
        intents: (intents.data ?? []).map(
          (i): ActionIntentRecord => ({
            id: i.id,
            fixedExpenseId: i.fixed_expense_id,
            familyId: i.family_id,
            userId: i.user_id,
            intent: i.intent,
            declaredAt: i.declared_at,
            resolvedAt: i.resolved_at,
            resolution: i.resolution,
            notes: i.notes,
          }),
        ),
        payments: (payments.data ?? []).map(
          (p): PaymentRow => ({
            id: p.id,
            fixedExpenseId: p.fixed_expense_id,
            paymentPeriod: p.payment_period,
            amount: Number(p.amount),
            createdAt: p.created_at,
          }),
        ),
        members: (members.data ?? []).map(
          (m): FamilyMemberRow => ({
            userId: m.user_id,
            name: (m as any).profiles?.display_name ?? '',
          }),
        ),
      }
    },
  })

  const feed = useMemo<EngineResult | undefined>(() => {
    if (!query.data) return undefined
    return buildFeed({ ...query.data, now: new Date() })
  }, [query.data])

  return { data: feed, isLoading: query.isLoading }
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/features/subscriptions-zombie/use-subscription-audit-feed.ts
git commit -m "feat(subs-zombie): hook to read raw data and build feed via engine"
```

---

### Task 3.4: useRecordSubscriptionAudit mutation

**Files:**
- Create: `mobile/features/subscriptions-zombie/use-record-subscription-audit.ts`

- [ ] **Step 1: Implement**

```typescript
// mobile/features/subscriptions-zombie/use-record-subscription-audit.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscriptionsZombieQueryKeys } from './query-keys'
import type { UsageLevel } from './types'

export function useRecordSubscriptionAudit(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { fixedExpenseId: string; level: UsageLevel }) => {
      const { data, error } = await supabase.rpc('audit_subscription', {
        p_fixed_expense_id: input.fixedExpenseId,
        p_level: input.level,
      })
      if (error) throw error
      return data
    },
    onSettled: async () => {
      if (!familyId) return
      await queryClient.invalidateQueries({
        queryKey: subscriptionsZombieQueryKeys.feed(familyId),
      })
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/features/subscriptions-zombie/use-record-subscription-audit.ts
git commit -m "feat(subs-zombie): mutation to record a usage audit"
```

---

### Task 3.5: useDeclareSubscriptionIntent mutation

**Files:**
- Create: `mobile/features/subscriptions-zombie/use-declare-subscription-intent.ts`

- [ ] **Step 1: Implement**

```typescript
// mobile/features/subscriptions-zombie/use-declare-subscription-intent.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscriptionsZombieQueryKeys } from './query-keys'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import type { IntentKind } from './types'

export function useDeclareSubscriptionIntent(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      fixedExpenseId: string
      intent: IntentKind
      notes?: string
    }) => {
      const { data, error } = await supabase.rpc('declare_subscription_intent', {
        p_fixed_expense_id: input.fixedExpenseId,
        p_intent: input.intent,
        p_notes: input.notes ?? null,
      })
      if (error) throw error
      return data
    },
    onSettled: async () => {
      if (!familyId) return
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: subscriptionsZombieQueryKeys.feed(familyId),
        }),
        queryClient.invalidateQueries({
          queryKey: fixedExpenseQueryKeys.family(familyId),
        }),
      ])
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/features/subscriptions-zombie/use-declare-subscription-intent.ts
git commit -m "feat(subs-zombie): mutation to declare a subscription action intent"
```

---

### Task 3.6: useResolveSubscriptionIntent mutation

**Files:**
- Create: `mobile/features/subscriptions-zombie/use-resolve-subscription-intent.ts`

- [ ] **Step 1: Implement**

```typescript
// mobile/features/subscriptions-zombie/use-resolve-subscription-intent.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscriptionsZombieQueryKeys } from './query-keys'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import type { IntentResolution } from './types'

export function useResolveSubscriptionIntent(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      intentId: string
      resolution: IntentResolution
      newAmount?: number
    }) => {
      const { data, error } = await supabase.rpc('resolve_subscription_intent', {
        p_intent_id: input.intentId,
        p_resolution: input.resolution,
        p_new_amount: input.newAmount ?? null,
      })
      if (error) throw error
      return data
    },
    onSettled: async () => {
      if (!familyId) return
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: subscriptionsZombieQueryKeys.feed(familyId),
        }),
        queryClient.invalidateQueries({
          queryKey: fixedExpenseQueryKeys.family(familyId),
        }),
      ])
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/features/subscriptions-zombie/use-resolve-subscription-intent.ts
git commit -m "feat(subs-zombie): mutation to resolve a subscription action intent"
```

---

### Task 3.7: Feature index re-exports

**Files:**
- Create: `mobile/features/subscriptions-zombie/index.ts`

- [ ] **Step 1: Implement**

```typescript
// mobile/features/subscriptions-zombie/index.ts
export * from './known-providers'
export * from './period'
export * from './query-keys'
export * from './subscription-audit-engine'
export * from './types'
export * from './use-declare-subscription-intent'
export * from './use-record-subscription-audit'
export * from './use-resolve-subscription-intent'
export * from './use-subscription-audit-feed'
export * from './use-subscriptions-category-id'
```

- [ ] **Step 2: Commit**

```bash
git add mobile/features/subscriptions-zombie/index.ts
git commit -m "feat(subs-zombie): index re-exports"
```

---

## Phase 4 — UI components

### Task 4.1: UsageLevelButtons (3 buttons)

**Files:**
- Create: `mobile/components/subscriptions-zombie/usage-level-buttons.tsx`

- [ ] **Step 1: Implement**

```tsx
// mobile/components/subscriptions-zombie/usage-level-buttons.tsx
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import type { UsageLevel } from '@/features/subscriptions-zombie/types'

interface Props {
  onSelect: (level: UsageLevel) => void
  disabled?: boolean
}

const OPTIONS: Array<{ level: UsageLevel; label: string }> = [
  { level: 'mucho', label: 'La uso mucho' },
  { level: 'a_veces', label: 'A veces' },
  { level: 'casi_nunca', label: 'Casi nunca' },
]

export function UsageLevelButtons({ onSelect, disabled = false }: Props) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {OPTIONS.map((opt) => (
        <Pressable
          key={opt.level}
          accessibilityRole="button"
          accessibilityLabel={opt.label}
          disabled={disabled}
          onPress={() => {
            void Haptics.selectionAsync()
            onSelect(opt.level)
          }}
          style={({ pressed }) => [
            styles.btn,
            pressed && styles.btnPressed,
            disabled && styles.btnDisabled,
          ]}
        >
          <Text style={styles.btnText}>{opt.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8D2C7',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  btnPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 14, fontWeight: '600', color: '#2A1F1A' },
})
```

- [ ] **Step 2: Commit**

```bash
git add mobile/components/subscriptions-zombie/usage-level-buttons.tsx
git commit -m "feat(subs-zombie): UsageLevelButtons component (mucho/a_veces/casi_nunca)"
```

---

### Task 4.2: AuditPromptCard (with optional family preview)

**Files:**
- Create: `mobile/components/subscriptions-zombie/audit-prompt-card.tsx`

- [ ] **Step 1: Implement**

```tsx
// mobile/components/subscriptions-zombie/audit-prompt-card.tsx
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Avatar } from '@/components/ui/avatar'
import { UsageLevelButtons } from './usage-level-buttons'
import type { UsageAuditRecord, UsageLevel } from '@/features/subscriptions-zombie/types'

const MEMBER_COLORS = ['#2E7D5B', '#E08E63', '#6B3A4F', '#C9A23A', '#4D6FB3', '#8A4D9A']

interface MemberLite {
  userId: string
  name: string
}

interface Props {
  fijoName: string
  fijoAmount: number
  audits: UsageAuditRecord[]
  members: MemberLite[]
  currentUserId: string
  now: Date
  onSelect: (level: UsageLevel) => void
}

function relativeTime(iso: string, now: Date): string {
  const ms = now.getTime() - Date.parse(iso)
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return 'hace un rato'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'hace 1 día' : `hace ${days} días`
}

const LEVEL_LABEL: Record<UsageLevel, string> = {
  mucho: 'la usa mucho',
  a_veces: 'a veces',
  casi_nunca: 'casi nunca',
}

export function AuditPromptCard({
  fijoName,
  fijoAmount,
  audits,
  members,
  currentUserId,
  now,
  onSelect,
}: Props) {
  const others = audits.filter((a) => a.userId !== currentUserId)
  const youAlreadyAnswered = audits.some((a) => a.userId === currentUserId)

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title}>{fijoName}</Text>
      <Text style={styles.subtitle}>${fijoAmount.toLocaleString('es-AR')} / mes</Text>

      {others.length > 0 && (
        <View style={styles.others}>
          {others.map((a) => {
            const member = members.find((m) => m.userId === a.userId)
            const idx = members.findIndex((m) => m.userId === a.userId)
            const color = MEMBER_COLORS[((idx >= 0 ? idx : 0) % MEMBER_COLORS.length)]
            return (
              <View key={a.id} style={styles.otherRow}>
                <Avatar name={member?.name ?? ''} color={color} size={24} />
                <Text style={styles.otherText}>
                  {member?.name ?? 'Alguien'}{' '}
                  <Text style={styles.otherStrong}>{LEVEL_LABEL[a.level]}</Text> ·{' '}
                  {relativeTime(a.createdAt, now)}
                </Text>
              </View>
            )
          })}
        </View>
      )}

      {!youAlreadyAnswered ? (
        <>
          <Text style={styles.question}>
            {others.length > 0 ? '¿Y vos?' : '¿La estás usando vos?'}
          </Text>
          <UsageLevelButtons onSelect={onSelect} />
        </>
      ) : (
        <Text style={styles.answered}>Ya contestaste — esperando al resto.</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F7F3ED',
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#2A1F1A' },
  subtitle: { fontSize: 14, color: '#6B5E55', marginBottom: 8 },
  others: { gap: 6, marginBottom: 12 },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  otherText: { fontSize: 13, color: '#3A2F26', flex: 1 },
  otherStrong: { fontWeight: '700' },
  question: { fontSize: 15, fontWeight: '600', color: '#2A1F1A', marginTop: 8 },
  answered: { marginTop: 12, fontSize: 13, color: '#6B5E55', fontStyle: 'italic' },
})
```

- [ ] **Step 2: Commit**

```bash
git add mobile/components/subscriptions-zombie/audit-prompt-card.tsx
git commit -m "feat(subs-zombie): AuditPromptCard with family transparent preview"
```

---

### Task 4.3: ClassificationCard (zombie consensuado / uso desigual)

**Files:**
- Create: `mobile/components/subscriptions-zombie/classification-card.tsx`

- [ ] **Step 1: Implement**

```tsx
// mobile/components/subscriptions-zombie/classification-card.tsx
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import type { Classification, IntentKind } from '@/features/subscriptions-zombie/types'

interface Props {
  classification: Classification
  fijoName: string
  fijoAmount: number
  monthsObserved: number
  onDeclareIntent: (intent: IntentKind) => void
  onIgnore: () => void
}

export function ClassificationCard({
  classification,
  fijoName,
  fijoAmount,
  monthsObserved,
  onDeclareIntent,
  onIgnore,
}: Props) {
  if (classification === 'uso_desigual') {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{fijoName}</Text>
        <Text style={styles.body}>
          La usa solo una persona del grupo. ¿Es lo que esperaban?
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sí, está bien"
            style={({ pressed }) => [styles.btnSecondary, pressed && styles.btnPressed]}
            onPress={onIgnore}
          >
            <Text style={styles.btnSecondaryText}>Sí, está bien</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (classification !== 'zombie_consensuado') return null

  const total = fijoAmount * Math.max(monthsObserved, 1)

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{fijoName}</Text>
      <Text style={styles.body}>
        La familia casi no la usa.{'\n'}En {monthsObserved} mes
        {monthsObserved === 1 ? '' : 'es'} fueron ${total.toLocaleString('es-AR')}.
      </Text>
      <Text style={styles.q}>¿Qué hacen?</Text>
      <View style={styles.actionsCol}>
        <ActionButton
          label="Voy a cancelarla"
          variant="primary"
          onPress={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
            onDeclareIntent('cancel')
          }}
        />
        <ActionButton
          label="Voy a pausarla"
          onPress={() => onDeclareIntent('pause')}
        />
        <ActionButton
          label="Voy a bajar el plan"
          onPress={() => onDeclareIntent('downgrade')}
        />
        <ActionButton label="Sigo bancándola" variant="ghost" onPress={onIgnore} />
      </View>
    </View>
  )
}

interface ActionButtonProps {
  label: string
  variant?: 'primary' | 'secondary' | 'ghost'
  onPress: () => void
}

function ActionButton({ label, variant = 'secondary', onPress }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btnBase,
        variant === 'primary' && styles.btnPrimary,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'ghost' && styles.btnGhost,
        pressed && styles.btnPressed,
      ]}
    >
      <Text
        style={
          variant === 'primary'
            ? styles.btnPrimaryText
            : variant === 'ghost'
              ? styles.btnGhostText
              : styles.btnSecondaryText
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF5EE',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#2A1F1A' },
  body: { fontSize: 14, color: '#3A2F26', lineHeight: 20 },
  q: { fontSize: 15, fontWeight: '600', color: '#2A1F1A', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionsCol: { flexDirection: 'column', gap: 8, marginTop: 4 },
  btnBase: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnPrimary: { backgroundColor: '#2E7D5B' },
  btnPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  btnSecondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8D2C7' },
  btnSecondaryText: { color: '#2A1F1A', fontWeight: '600', fontSize: 14 },
  btnGhost: { backgroundColor: 'transparent' },
  btnGhostText: { color: '#6B5E55', fontWeight: '500', fontSize: 13 },
  btnPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
})
```

- [ ] **Step 2: Commit**

```bash
git add mobile/components/subscriptions-zombie/classification-card.tsx
git commit -m "feat(subs-zombie): ClassificationCard for zombie_consensuado and uso_desigual"
```

---

### Task 4.4: IntentStatusCard

**Files:**
- Create: `mobile/components/subscriptions-zombie/intent-status-card.tsx`

- [ ] **Step 1: Implement**

```tsx
// mobile/components/subscriptions-zombie/intent-status-card.tsx
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { IntentKind } from '@/features/subscriptions-zombie/types'

interface Props {
  intent: IntentKind
  declaredByName: string
  declaredAtIso: string
  fijoName: string
  monthlySaving: number
  now: Date
}

const INTENT_LABEL: Record<IntentKind, string> = {
  cancel: 'va a dar de baja',
  pause: 'va a pausar',
  downgrade: 'va a bajar el plan de',
}

function rel(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86400000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'hace 1 día'
  return `hace ${days} días`
}

export function IntentStatusCard({
  intent,
  declaredByName,
  declaredAtIso,
  fijoName,
  monthlySaving,
  now,
}: Props) {
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.line}>
        <Text style={styles.bold}>{declaredByName}</Text> {INTENT_LABEL[intent]}{' '}
        <Text style={styles.bold}>{fijoName}</Text>
      </Text>
      <Text style={styles.meta}>{rel(declaredAtIso, now)}</Text>
      {intent === 'cancel' || intent === 'pause' ? (
        <Text style={styles.savings}>
          Ahorro estimado: ${monthlySaving.toLocaleString('es-AR')} / mes
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F0EDE7',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  line: { fontSize: 14, color: '#2A1F1A' },
  bold: { fontWeight: '700' },
  meta: { fontSize: 12, color: '#6B5E55' },
  savings: { fontSize: 13, color: '#2E7D5B', fontWeight: '600', marginTop: 4 },
})
```

- [ ] **Step 2: Commit**

```bash
git add mobile/components/subscriptions-zombie/intent-status-card.tsx
git commit -m "feat(subs-zombie): IntentStatusCard for declared intents visible to family"
```

---

### Task 4.5: IntentFollowupCard

**Files:**
- Create: `mobile/components/subscriptions-zombie/intent-followup-card.tsx`

- [ ] **Step 1: Implement**

```tsx
// mobile/components/subscriptions-zombie/intent-followup-card.tsx
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { AuditFeedItem } from '@/features/subscriptions-zombie/types'

interface Props {
  fijoName: string
  declaredAtIso: string
  followUpKind: NonNullable<AuditFeedItem['followUpKind']>
  onConfirmDone: () => void
  onStillNo: () => void
  onChangedMind: () => void
  now: Date
}

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(iso)) / 86400000)
}

export function IntentFollowupCard({
  fijoName,
  declaredAtIso,
  followUpKind,
  onConfirmDone,
  onStillNo,
  onChangedMind,
  now,
}: Props) {
  const titleByKind = {
    payment_recurred: `${fijoName} se volvió a cobrar.`,
    no_payment_after_due: `${fijoName} no se cobró este mes.`,
    awaiting_post_due: `Hace ${daysSince(declaredAtIso, now)} días ibas a dar de baja ${fijoName}.`,
  }

  const askByKind = {
    payment_recurred: '¿Pasó algo?',
    no_payment_after_due: '¿Confirmás que la diste de baja?',
    awaiting_post_due: '¿Pudiste?',
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{titleByKind[followUpKind]}</Text>
      <Text style={styles.ask}>{askByKind[followUpKind]}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sí, ya está"
          style={({ pressed }) => [styles.btnPrimary, pressed && styles.btnPressed]}
          onPress={onConfirmDone}
        >
          <Text style={styles.btnPrimaryText}>Sí, ya está</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Todavía no"
          style={({ pressed }) => [styles.btnSecondary, pressed && styles.btnPressed]}
          onPress={onStillNo}
        >
          <Text style={styles.btnSecondaryText}>Todavía no</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cambié de idea"
        style={({ pressed }) => [styles.btnGhost, pressed && styles.btnPressed]}
        onPress={onChangedMind}
      >
        <Text style={styles.btnGhostText}>Cambié de idea</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF5EE',
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  title: { fontSize: 15, fontWeight: '700', color: '#2A1F1A' },
  ask: { fontSize: 14, color: '#3A2F26', marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  btnPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#2E7D5B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  btnSecondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8D2C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { color: '#2A1F1A', fontWeight: '600', fontSize: 14 },
  btnGhost: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  btnGhostText: { color: '#6B5E55', fontSize: 13 },
  btnPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
})
```

- [ ] **Step 2: Commit**

```bash
git add mobile/components/subscriptions-zombie/intent-followup-card.tsx
git commit -m "feat(subs-zombie): IntentFollowupCard for cycle-anchored confirmation"
```

---

### Task 4.6: SubscriptionOnboardingChip (inline en card de Fijos)

**Files:**
- Create: `mobile/components/subscriptions-zombie/subscription-onboarding-chip.tsx`

- [ ] **Step 1: Implement**

```tsx
// mobile/components/subscriptions-zombie/subscription-onboarding-chip.tsx
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'

interface Props {
  onMark: () => void
  onDismiss?: () => void
}

export function SubscriptionOnboardingChip({ onMark, onDismiss }: Props) {
  return (
    <View style={styles.chip}>
      <View style={styles.textWrap}>
        <Text style={styles.text}>¿Es una suscripción?</Text>
        <Text style={styles.subtext}>Marcala para auditar su uso.</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Marcar como suscripción"
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        onPress={() => {
          void Haptics.selectionAsync()
          onMark()
        }}
      >
        <Text style={styles.btnText}>Marcar</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F7F3ED',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  textWrap: { flex: 1 },
  text: { fontSize: 13, fontWeight: '600', color: '#2A1F1A' },
  subtext: { fontSize: 12, color: '#6B5E55', marginTop: 2 },
  btn: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#2E7D5B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
})
```

- [ ] **Step 2: Commit**

```bash
git add mobile/components/subscriptions-zombie/subscription-onboarding-chip.tsx
git commit -m "feat(subs-zombie): SubscriptionOnboardingChip for contextual category assignment"
```

---

## Phase 5 — Integration into Asesor and Fijos tab + push + remove legacy

### Task 5.1: Wiring zombie signals into the Asesor feed

**Files:**
- Modify: `mobile/components/control-v2/control-v2-asesor-card.tsx`
- Create: `mobile/components/control-v2/zombie-feed-section.tsx`

- [ ] **Step 1: Create the section component that consumes the engine feed**

```tsx
// mobile/components/control-v2/zombie-feed-section.tsx
import React from 'react'
import { View } from 'react-native'
import { useAuth } from '@/features/auth/use-auth'
import {
  useDeclareSubscriptionIntent,
  useRecordSubscriptionAudit,
  useResolveSubscriptionIntent,
  useSubscriptionAuditFeed,
} from '@/features/subscriptions-zombie'
import { AuditPromptCard } from '@/components/subscriptions-zombie/audit-prompt-card'
import { ClassificationCard } from '@/components/subscriptions-zombie/classification-card'
import { IntentFollowupCard } from '@/components/subscriptions-zombie/intent-followup-card'
import { IntentStatusCard } from '@/components/subscriptions-zombie/intent-status-card'

interface Props {
  familyId?: string
  fijosByIdQuery: { name: string; amount: number; createdAt: string }[]
  membersByIdQuery: { userId: string; name: string }[]
}

export function ZombieFeedSection({ familyId, fijosByIdQuery, membersByIdQuery }: Props) {
  const { userId } = useAuth()
  const { data } = useSubscriptionAuditFeed(familyId)
  const recordAudit = useRecordSubscriptionAudit(familyId)
  const declareIntent = useDeclareSubscriptionIntent(familyId)
  const resolveIntent = useResolveSubscriptionIntent(familyId)

  if (!data || data.feed.length === 0) return null

  return (
    <View style={{ gap: 12 }}>
      {data.feed.map((item) => {
        const fijo = fijosByIdQuery.find((f: any) => (f as any).id === item.fixedExpenseId) as
          | { name: string; amount: number; createdAt: string }
          | undefined
        if (!fijo) return null

        if (item.openIntent && item.followUpKind) {
          return (
            <IntentFollowupCard
              key={item.fixedExpenseId}
              fijoName={fijo.name}
              declaredAtIso={item.openIntent.declaredAt}
              followUpKind={item.followUpKind}
              now={new Date()}
              onConfirmDone={() =>
                resolveIntent.mutate({
                  intentId: item.openIntent!.id,
                  resolution: 'completed',
                })
              }
              onStillNo={() => {
                /* no-op: user dismissed for now, will reappear next cycle */
              }}
              onChangedMind={() =>
                resolveIntent.mutate({
                  intentId: item.openIntent!.id,
                  resolution: 'abandoned',
                })
              }
            />
          )
        }

        if (item.classification === 'pending_audit') {
          return (
            <AuditPromptCard
              key={item.fixedExpenseId}
              fijoName={fijo.name}
              fijoAmount={fijo.amount}
              audits={item.audits}
              members={membersByIdQuery}
              currentUserId={userId ?? ''}
              now={new Date()}
              onSelect={(level) =>
                recordAudit.mutate({
                  fixedExpenseId: item.fixedExpenseId,
                  level,
                })
              }
            />
          )
        }

        if (
          item.classification === 'zombie_consensuado' ||
          item.classification === 'uso_desigual'
        ) {
          const monthsObserved = Math.max(
            Math.floor(
              (Date.now() - Date.parse(fijo.createdAt)) / (1000 * 60 * 60 * 24 * 30),
            ),
            1,
          )
          return (
            <ClassificationCard
              key={item.fixedExpenseId}
              classification={item.classification}
              fijoName={fijo.name}
              fijoAmount={fijo.amount}
              monthsObserved={monthsObserved}
              onDeclareIntent={(intent) =>
                declareIntent.mutate({
                  fixedExpenseId: item.fixedExpenseId,
                  intent,
                })
              }
              onIgnore={() => {
                /* no-op: cooldown decides re-surface */
              }}
            />
          )
        }

        return null
      })}
    </View>
  )
}
```

- [ ] **Step 2: Mount the section in `control-v2-asesor-card.tsx`**

In `mobile/components/control-v2/control-v2-asesor-card.tsx`, after the existing `<RiseView>` wrapping the asesor cards, render `<ZombieFeedSection ... />` so that audit + classification + follow-up cards appear in the feed. Pass `familyId`, the loaded fijos, and members from the hook used by control-v2 (typically `useControlV2Data`). The exact insertion point: just before the closing of the outer `View` that wraps the LeadBubble + ConstellationStrip.

```tsx
import { ZombieFeedSection } from './zombie-feed-section'

// inside the render, after ConstellationStrip:
<ZombieFeedSection
  familyId={familyId}
  fijosByIdQuery={fixedExpenses.map((f) => ({
    id: f.id,
    name: f.name,
    amount: Number(f.amount),
    createdAt: f.created_at,
  }))}
  membersByIdQuery={members.map((m) => ({
    userId: m.user_id,
    name: m.profile?.display_name ?? '',
  }))}
/>
```

If `fixedExpenses` and `members` are not already in scope at this component, hoist them via the same `useControlV2Data` hook or pass-through props from the parent.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/control-v2/zombie-feed-section.tsx mobile/components/control-v2/control-v2-asesor-card.tsx
git commit -m "feat(subs-zombie): wire zombie feed section into Asesor feed"
```

---

### Task 5.2: Badges + onboarding chip in Fijos tab

**Files:**
- Modify: `app/(app)/(tabs)/fixed-expenses.tsx`
- Modify: `mobile/components/fijos/fijo-card.tsx` (or equivalent — locate the card component used in the list)

- [ ] **Step 1: Render badge for fijos with open intent**

In the card component for a fijo, accept a new prop `openIntent?: { intent: 'cancel' | 'pause' | 'downgrade' }`. If present, render a small label below the title:

```tsx
const intentLabel = {
  cancel: 'Pendiente de cancelar',
  pause: 'Pendiente de pausar',
  downgrade: 'Pendiente de bajar plan',
} as const

{openIntent && (
  <View style={styles.intentBadge} accessibilityLabel={intentLabel[openIntent.intent]}>
    <Text style={styles.intentBadgeText}>🟠 {intentLabel[openIntent.intent]}</Text>
  </View>
)}
```

Style:

```tsx
intentBadge: {
  backgroundColor: '#FFF1E6',
  borderRadius: 8,
  paddingHorizontal: 8,
  paddingVertical: 4,
  alignSelf: 'flex-start',
  marginTop: 4,
},
intentBadgeText: { fontSize: 12, color: '#A35F2A', fontWeight: '600' },
```

In `fixed-expenses.tsx`, inject `openIntent` per card by joining the fijo with the intents loaded from `useSubscriptionAuditFeed` or a direct query against `fixed_expense_action_intent`.

- [ ] **Step 2: Render the onboarding chip**

For each fijo card where:
- `categoryName !== 'Suscripciones'` (or `category_id !== <suscripciones-id>`)
- `matchesKnownProvider(name)` returns `true`
- Status === `active`, kind === `recurring`

Render `<SubscriptionOnboardingChip onMark={...} />` below the card content. The `onMark` handler calls `useUpdateFixedExpense` (existing) with the resolved category id from `useSubscriptionsCategoryId(familyId)`.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/\(tabs\)/fixed-expenses.tsx mobile/components/fijos/fijo-card.tsx
git commit -m "feat(subs-zombie): badges for open intents and onboarding chip in Fijos tab"
```

---

### Task 5.3: Push notification trigger on final classification

**Files:**
- Create: `supabase/functions/notify-subscription-classification/index.ts`

(Alternative: extend an existing edge function. For isolation, create a new one that wraps `send-family-push`.)

- [ ] **Step 1: Implement edge function**

```typescript
// supabase/functions/notify-subscription-classification/index.ts
// Triggered by client after a final classification card appears.
// Reuses send-family-push internally.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.97.0'

interface RequestBody {
  familyId: string
  fixedExpenseName: string
  fixedExpenseAmount: number
  classification: 'zombie_consensuado' | 'uso_desigual'
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  let payload: RequestBody
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { familyId, fixedExpenseName, fixedExpenseAmount, classification } = payload
  if (!familyId || !fixedExpenseName) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
  }

  const title =
    classification === 'zombie_consensuado'
      ? `${fixedExpenseName} — la familia casi no la usa`
      : `${fixedExpenseName} — uso desigual en la familia`
  const body = `Pagás $${fixedExpenseAmount.toLocaleString('es-AR')} al mes. Tocá para revisar.`

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const authHeader = req.headers.get('Authorization') ?? ''
  const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-family-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify({
      familyId,
      title,
      body,
      kind: 'subscription_zombie',
      url: '/asesor',
    }),
  })

  if (!pushResponse.ok) {
    return new Response(JSON.stringify({ error: 'Push dispatch failed' }), { status: 502 })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 2: Add client wrapper**

Create `mobile/lib/notify-subscription-classification.ts`:

```typescript
// mobile/lib/notify-subscription-classification.ts
import { supabase } from './supabase'

export async function notifySubscriptionClassification(input: {
  familyId: string
  fixedExpenseName: string
  fixedExpenseAmount: number
  classification: 'zombie_consensuado' | 'uso_desigual'
}): Promise<void> {
  const session = await supabase.auth.getSession()
  const accessToken = session.data.session?.access_token
  if (!accessToken) return

  await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/notify-subscription-classification`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(input),
    },
  )
}
```

- [ ] **Step 3: Trigger from `ZombieFeedSection`**

When the engine first emits a `zombie_consensuado` or `uso_desigual` classification for a fijo, fire the notification once. Use a local store keyed by `(fixed_expense_id, classification)` so we don't spam.

In `zombie-feed-section.tsx`, add:

```tsx
import { useEffect } from 'react'
import { notifySubscriptionClassification } from '@/lib/notify-subscription-classification'
import {
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'

// inside ZombieFeedSection:
useEffect(() => {
  if (!data || !familyId) return
  ;(async () => {
    const raw = (await getPersistentValue('subs-zombie-notified:v1')) ?? '{}'
    let notified: Record<string, string> = {}
    try {
      notified = JSON.parse(raw)
    } catch {
      notified = {}
    }
    let dirty = false
    for (const item of data.feed) {
      if (
        (item.classification === 'zombie_consensuado' ||
          item.classification === 'uso_desigual') &&
        notified[item.fixedExpenseId] !== item.classification
      ) {
        const fijo = fijosByIdQuery.find((f: any) => (f as any).id === item.fixedExpenseId) as
          | { name: string; amount: number; createdAt: string }
          | undefined
        if (fijo) {
          await notifySubscriptionClassification({
            familyId,
            fixedExpenseName: fijo.name,
            fixedExpenseAmount: fijo.amount,
            classification: item.classification,
          }).catch(() => {})
          notified[item.fixedExpenseId] = item.classification
          dirty = true
        }
      }
    }
    if (dirty) {
      await setPersistentValue('subs-zombie-notified:v1', JSON.stringify(notified))
    }
  })()
}, [data, familyId, fijosByIdQuery])
```

- [ ] **Step 4: Deploy edge function**

```bash
npm run supabase:remote -- functions deploy notify-subscription-classification
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/notify-subscription-classification mobile/lib/notify-subscription-classification.ts mobile/components/control-v2/zombie-feed-section.tsx
git commit -m "feat(subs-zombie): push notification on final classification with dedupe"
```

---

### Task 5.4: Remove legacy zombie heuristic

**Files:**
- Modify: `mobile/features/fijos/fijos-aggregates.model.ts`
- Modify: `mobile/components/fijos/fijos-smart-alerts.tsx`
- Modify: any consumer of `FijosCycleSummary.zombies`

- [ ] **Step 1: Remove constants and helpers**

In `mobile/features/fijos/fijos-aggregates.model.ts`:

- Remove `ZOMBIE_INACTIVITY_DAYS`, `ZOMBIE_MAX_AMOUNT`.
- Remove `isLikelyZombie()`.
- Remove `captureZombieDeletion()` (and its call sites).
- Remove `zombies` from `FijosCycleSummary` and from `summarizeFijos()`.

Run `grep -rn 'ZOMBIE_INACTIVITY_DAYS\|ZOMBIE_MAX_AMOUNT\|isLikelyZombie\|captureZombieDeletion' mobile app` to ensure no references remain. Each match is a callsite that needs to be updated or removed.

- [ ] **Step 2: Replace zombie alert in FijosSmartAlerts**

In `mobile/components/fijos/fijos-smart-alerts.tsx`, replace the card:

```tsx
{summary.zombies > 0 && (
  <Card>...🧟 X suscripciones zombi...</Card>
)}
```

…with a deep-link card that points to the Asesor when there are open audit candidates. Use the new `useSubscriptionAuditFeed`:

```tsx
import { useSubscriptionAuditFeed } from '@/features/subscriptions-zombie'

const { data: zombieFeed } = useSubscriptionAuditFeed(familyId)
const auditCount = zombieFeed?.feed.filter((i) => i.classification === 'pending_audit').length ?? 0

{auditCount > 0 && (
  <Pressable onPress={() => router.push('/asesor')}>
    <Text>
      Tenés {auditCount} auditoría{auditCount === 1 ? '' : 's'} de suscripciones —
      revisalas en el Asesor.
    </Text>
  </Pressable>
)}
```

- [ ] **Step 3: Update consumers**

Anywhere the codebase reads `FijosCycleSummary.zombies` (search with `grep -rn 'zombies' mobile/components mobile/features`), either remove the reference or replace it with `auditCount` from the new hook.

- [ ] **Step 4: Run validate**

```bash
npm run validate
```

Fix any typecheck/lint/test failures before commit.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(subs-zombie): remove legacy heuristic, link smart alert to Asesor"
```

---

## Phase 6 — Final validation and integration test

### Task 6.1: Manual smoke checklist

- [ ] **Step 1: Run validate end-to-end**

```bash
npm run validate
```

Expected: typecheck OK, lint OK, vitest OK, guards OK.

- [ ] **Step 2: Apply migrations**

```bash
npm run supabase:remote:db:push
```

- [ ] **Step 3: Manual smoke in iOS simulator**

```bash
npm run ios
```

Verify in order:
1. Open the app, navigate to Fijos tab. Cards render with categoría Suscripciones grouped together.
2. (If any fijo `recurring` matches `KNOWN_SUBSCRIPTION_PROVIDERS` and lacks Suscripciones category) the onboarding chip appears below the card.
3. Open the Asesor / control-v2. If a candidate exists past 60 days, an `AuditPromptCard` is visible with the 3 buttons.
4. Tap a level. The card updates; if you switch user (test account with two members) the second user sees the preview row.
5. With both users responding `casi_nunca`, the `ClassificationCard` for `zombie_consensuado` appears with 4 action buttons.
6. Tap "Voy a cancelarla". The `IntentStatusCard` appears for the other user. The Fijos tab shows badge "Pendiente de cancelar".
7. Wait or simulate a `fixed_expense_payment` after the declared date — the `IntentFollowupCard` mutates copy.
8. Tap "Sí, ya está". Toast appears. The fijo moves to archived.

- [ ] **Step 4: Document known-issues**

If any step fails, capture screenshots and add a `known-issues.md` entry. Do not commit broken behavior.

---

### Task 6.2: Final commit and PR

- [ ] **Step 1: Squash or chain commits as preferred**

If you've been committing per task, the branch is ready. Optionally rebase to clean up.

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(subs-zombie): family-transparent subscription audit and intent flow" \
  --body "$(cat <<'EOF'
## Summary
- Replaces legacy passive zombie heuristic with family-transparent audit flow
- Adds 2 tables, 3 RPCs, pure engine, hooks, UI cards in Asesor + Fijos badges
- Push notification on final classification, no dependencies added

## Test plan
- [ ] npm run validate passes
- [ ] iOS simulator smoke (Fase 6.1 checklist)
- [ ] Two-account audit flow: prompt → preview → consensuado → intent → followup → archived
- [ ] Onboarding chip appears for known providers without category
- [ ] Push notification fires once per (fijo, classification)
- [ ] Legacy heuristic constants and FijosSmartAlerts zombie card removed

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

**Spec coverage check:** every section of the spec maps to at least one task.
- §2.1 candidacy → Task 2.4
- §2.2 classification → Task 2.5
- §2.3 cooldown → Task 2.6
- §3.1 onboarding chip → Task 4.6 + 5.2
- §3.2-3.7 user journey → Tasks 4.2, 4.3, 4.4, 4.5 + 5.1
- §4.1 audit table → Task 1.1
- §4.2 intent table → Task 1.1
- §4.4 backfill → Task 1.2
- §4.5 RPCs → Task 1.3
- §5.1 Fijos tab → Task 5.2
- §5.2 Asesor → Task 5.1
- §5.3 push → Task 5.3
- §7 legacy removal → Task 5.4

**Placeholder scan:** all code blocks contain implementations, not "TBD". The `useAuth` hook reference in 5.1 assumes existing — if not present, the engineer should adjust to use the existing auth context. This is acceptable since the codebase has an established auth pattern.

**Type consistency:** `IntentKind`, `UsageLevel`, `Classification`, `AuditFeedItem` are defined once in `types.ts` and referenced consistently. `subscriptionsZombieQueryKeys` factory shape is the same across all hooks. `audit_subscription` / `declare_subscription_intent` / `resolve_subscription_intent` RPC names match between SQL and mutation hooks.

---

**Plan complete.**
