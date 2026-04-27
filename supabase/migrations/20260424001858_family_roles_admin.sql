-- Family roles + admin primitives + per-user notification preferences.
--
-- This migration introduces:
--  1. role + blocked_at on family_members (owner / member / blocked).
--  2. Backfill: the earliest member of each family becomes 'owner'.
--  3. Helper functions: is_family_owner, is_family_member_active.
--  4. Tighter RLS: family_finance writes owner-only; savings_goals
--     writes owner-only; expenses INSERT rejects blocked members.
--  5. Admin RPCs: transfer_ownership, block, unblock, remove.
--  6. Reporting RPC: family_member_stats(family_id) for the admin UI.
--  7. notification_preferences table (per-user toggles + check-in hours).

-- ─── 1. role column ─────────────────────────────────────────────────
alter table public.family_members
  add column if not exists role text not null default 'member',
  add column if not exists blocked_at timestamptz null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.family_members'::regclass
      and conname = 'family_members_role_check'
  ) then
    alter table public.family_members
      add constraint family_members_role_check
      check (role in ('owner','member','blocked'));
  end if;
exception when duplicate_object then null;
end;
$$;

create index if not exists family_members_family_role_idx
  on public.family_members (family_id, role);

-- Exactly one owner per family.
create unique index if not exists family_members_one_owner_per_family
  on public.family_members (family_id)
  where role = 'owner';

-- Backfill: earliest member of each family becomes the owner.
with earliest as (
  select family_id, user_id,
         row_number() over (partition by family_id order by created_at asc, user_id asc) as rn
  from public.family_members
)
update public.family_members fm
set role = 'owner'
from earliest e
where fm.family_id = e.family_id
  and fm.user_id = e.user_id
  and e.rn = 1
  and fm.role <> 'owner';

-- ─── 2. helper predicates ───────────────────────────────────────────
create or replace function public.is_family_owner(fam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_members fm
    where fm.family_id = fam_id
      and fm.user_id = auth.uid()
      and fm.role = 'owner'
  );
$$;

revoke all on function public.is_family_owner(uuid) from public;
grant execute on function public.is_family_owner(uuid) to authenticated;

create or replace function public.is_family_member_active(fam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_members fm
    where fm.family_id = fam_id
      and fm.user_id = auth.uid()
      and fm.role <> 'blocked'
  );
$$;

revoke all on function public.is_family_member_active(uuid) from public;
grant execute on function public.is_family_member_active(uuid) to authenticated;

-- ─── 3. RLS: owner-only writes on shared family resources ───────────
drop policy if exists "family_finance_update_members" on public.family_finance;
create policy "family_finance_update_members"
on public.family_finance
for update
using (public.is_family_owner(family_id))
with check (public.is_family_owner(family_id));

drop policy if exists "family_finance_insert_members" on public.family_finance;
create policy "family_finance_insert_members"
on public.family_finance
for insert
with check (public.is_family_owner(family_id));

drop policy if exists "savings_goals_insert_owner" on public.savings_goals;
create policy "savings_goals_insert_owner"
on public.savings_goals
for insert
with check (public.is_family_owner(family_id));

drop policy if exists "savings_goals_update_owner" on public.savings_goals;
create policy "savings_goals_update_owner"
on public.savings_goals
for update
using (public.is_family_owner(family_id))
with check (public.is_family_owner(family_id));

drop policy if exists "savings_goals_delete_owner" on public.savings_goals;
create policy "savings_goals_delete_owner"
on public.savings_goals
for delete
using (public.is_family_owner(family_id));

-- Block blocked members from inserting expenses. SELECT/UPDATE/DELETE
-- policies stay — they still see historical data (read-only).
drop policy if exists "expenses_insert_active" on public.expenses;
create policy "expenses_insert_active"
on public.expenses
for insert
with check (public.is_family_member_active(family_id));

-- ─── 4. admin RPCs ──────────────────────────────────────────────────
create or replace function public.family_transfer_ownership(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception 'No session';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = auth.uid() and fm.role = 'owner';

  if v_family_id is null then
    raise exception 'Solo el owner puede transferir la propiedad.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'No podés transferirte la propiedad a vos mismo.';
  end if;

  select fm.role into v_target_role
  from public.family_members fm
  where fm.family_id = v_family_id and fm.user_id = target_user_id;

  if v_target_role is null then
    raise exception 'El destinatario no es miembro de esta familia.';
  end if;
  if v_target_role = 'blocked' then
    raise exception 'No podés transferir la propiedad a un miembro bloqueado.';
  end if;

  -- Flip roles atomically. The unique partial index guarantees only
  -- one owner per family, so we demote first.
  update public.family_members
  set role = 'member'
  where family_id = v_family_id and user_id = auth.uid();

  update public.family_members
  set role = 'owner'
  where family_id = v_family_id and user_id = target_user_id;
end;
$$;

grant execute on function public.family_transfer_ownership(uuid) to authenticated;

create or replace function public.family_block_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_target_role text;
begin
  if auth.uid() is null then raise exception 'No session'; end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = auth.uid() and fm.role = 'owner';

  if v_family_id is null then
    raise exception 'Solo el owner puede bloquear miembros.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'No podés bloquearte a vos mismo.';
  end if;

  select fm.role into v_target_role
  from public.family_members fm
  where fm.family_id = v_family_id and fm.user_id = target_user_id;

  if v_target_role is null then
    raise exception 'Ese usuario no está en tu familia.';
  end if;
  if v_target_role = 'owner' then
    raise exception 'No podés bloquear a otro owner.';
  end if;

  update public.family_members
  set role = 'blocked', blocked_at = now()
  where family_id = v_family_id and user_id = target_user_id;
end;
$$;

grant execute on function public.family_block_member(uuid) to authenticated;

create or replace function public.family_unblock_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  if auth.uid() is null then raise exception 'No session'; end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = auth.uid() and fm.role = 'owner';

  if v_family_id is null then
    raise exception 'Solo el owner puede desbloquear miembros.';
  end if;

  update public.family_members
  set role = 'member', blocked_at = null
  where family_id = v_family_id and user_id = target_user_id and role = 'blocked';
end;
$$;

grant execute on function public.family_unblock_member(uuid) to authenticated;

create or replace function public.family_remove_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_target_role text;
begin
  if auth.uid() is null then raise exception 'No session'; end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = auth.uid() and fm.role = 'owner';

  if v_family_id is null then
    raise exception 'Solo el owner puede eliminar miembros.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'No podés eliminarte a vos mismo. Transferí la propiedad primero.';
  end if;

  select fm.role into v_target_role
  from public.family_members fm
  where fm.family_id = v_family_id and fm.user_id = target_user_id;

  if v_target_role is null then
    raise exception 'Ese usuario no está en tu familia.';
  end if;

  if v_target_role = 'owner' then
    raise exception 'No podés eliminar a otro owner.';
  end if;

  delete from public.family_members
  where family_id = v_family_id and user_id = target_user_id;
end;
$$;

grant execute on function public.family_remove_member(uuid) to authenticated;

-- ─── 5. family_member_stats reporting RPC ──────────────────────────
-- Returns one row per member in the caller's family with per-cycle
-- stats. Defined as returns table to keep client typing simple.
create or replace function public.family_member_stats()
returns table (
  user_id uuid,
  display_name text,
  avatar_animal text,
  role text,
  blocked_at timestamptz,
  member_since timestamptz,
  expenses_count integer,
  expenses_total numeric,
  fixed_paid_count integer,
  current_streak integer,
  longest_streak integer,
  last_expense_at timestamptz,
  spend_share_pct numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_cycle_start date := date_trunc('month', current_date)::date;
  v_cycle_end date := (v_cycle_start + interval '1 month')::date;
  v_total_spent numeric;
begin
  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = auth.uid() and fm.role <> 'blocked'
  limit 1;

  if v_family_id is null then
    return;
  end if;

  select coalesce(sum(price), 0) into v_total_spent
  from public.expenses
  where family_id = v_family_id
    and created_at >= v_cycle_start
    and created_at < v_cycle_end;

  return query
  select
    fm.user_id,
    coalesce(p.display_name, 'Usuario') as display_name,
    p.avatar_animal,
    fm.role,
    fm.blocked_at,
    fm.created_at as member_since,
    coalesce(ec.cnt, 0)::int as expenses_count,
    coalesce(ec.total, 0)::numeric as expenses_total,
    coalesce(fc.paid_count, 0)::int as fixed_paid_count,
    coalesce(us.current_streak, 0)::int as current_streak,
    coalesce(us.longest_streak, 0)::int as longest_streak,
    ec.last_at as last_expense_at,
    case when v_total_spent > 0
      then round((coalesce(ec.total, 0) / v_total_spent) * 100, 1)
      else 0::numeric
    end as spend_share_pct
  from public.family_members fm
  left join public.profiles p on p.id = fm.user_id
  left join public.user_streaks us
    on us.family_id = fm.family_id and us.user_id = fm.user_id
  left join lateral (
    select count(*)::int as cnt,
           sum(e.price) as total,
           max(e.created_at) as last_at
    from public.expenses e
    where e.family_id = fm.family_id
      and e.created_by = fm.user_id
      and e.created_at >= v_cycle_start
      and e.created_at < v_cycle_end
  ) ec on true
  left join lateral (
    select count(*)::int as paid_count
    from public.fixed_expense_payments p
    where p.paid_by = fm.user_id
      and p.period_month = v_cycle_start
  ) fc on true
  where fm.family_id = v_family_id
  order by
    case fm.role when 'owner' then 0 when 'member' then 1 else 2 end,
    fm.created_at asc;
end;
$$;

grant execute on function public.family_member_stats() to authenticated;

-- ─── 6. notification_preferences per user ───────────────────────────
-- Personal settings that today live either in local state or are
-- misplaced in family_finance (checkin_hour, nudges_enabled). The
-- crons and the client will read from here going forward.
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  channel_push boolean not null default true,
  channel_inapp boolean not null default true,
  kinds_muted text[] not null default '{}',
  checkin_morning_hour smallint not null default 9 check (checkin_morning_hour between 0 and 23),
  checkin_midday_hour smallint not null default 14 check (checkin_midday_hour between 0 and 23),
  checkin_evening_hour smallint not null default 20 check (checkin_evening_hour between 0 and 23),
  nudges_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_notification_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_notification_preferences_updated_at on public.notification_preferences;
create trigger trg_notification_preferences_updated_at
before update on public.notification_preferences
for each row execute function public.touch_notification_preferences_updated_at();

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
on public.notification_preferences for select
using (auth.uid() = user_id);

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
on public.notification_preferences for insert
with check (auth.uid() = user_id);

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
on public.notification_preferences for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Backfill: copy existing per-family defaults into per-user rows so
-- every current user gets a row without losing their chosen check-in
-- hour / nudges toggle.
insert into public.notification_preferences (
  user_id, checkin_morning_hour, nudges_enabled
)
select distinct on (fm.user_id)
  fm.user_id,
  coalesce(ff.daily_budget_checkin_hour, 9)::smallint,
  coalesce(ff.daily_budget_nudges_enabled, true)
from public.family_members fm
left join public.family_finance ff on ff.family_id = fm.family_id
on conflict (user_id) do nothing;
