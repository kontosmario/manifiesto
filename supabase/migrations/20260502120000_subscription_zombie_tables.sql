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
