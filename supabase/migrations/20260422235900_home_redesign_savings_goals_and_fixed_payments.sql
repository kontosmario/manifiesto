-- ==============================================================
-- Home redesign (V1 Cuaderno): savings_goals + fixed_expense_payments
-- ==============================================================
-- Mirrors the blocks appended to sql/supabase.sql for the Home V1
-- Cuaderno redesign. Adds:
--   1. public.savings_goals — per-family meta for the Home "Meta de
--      ahorro" card (title, emoji, amounts, target months).
--   2. public.fixed_expense_payments — per-month payment log
--      consumed by the Home "FIJOS" shortcut ("7 de 12 pagados").
--   3. Idempotent seed of a "Viaje a Bariloche" goal for every
--      family that has no active goal yet.
-- All policies reuse public.is_family_member; a new helper
-- public.is_fixed_expense_family_member resolves membership via
-- fixed_expenses → family_members for the payments table.

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
