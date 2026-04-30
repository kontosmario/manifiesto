-- Advisor Memory Layer (v2 cognitive layer).
--
-- Three tables that let the Asistente Financiero learn from each
-- interaction and prove value over time:
--
--  1. advisor_interactions  — every (user, signal) tuple shown,
--     acted, dismissed, expired or blocked. Powers signal-family
--     CTR, persona inference and dynamic confidence modulation.
--
--  2. advisor_value_log     — counterfactual value tracking. When
--     a user takes an action, we log the estimated monetary value
--     of that action so the surface can prove "I saved you $X this
--     quarter" rather than just suggesting more things.
--
--  3. user_signal_blocklist — per-user mute list at the family level
--     (e.g. "stop showing me night-impulse signals, ever"). Hard
--     filter applied before ranking.
--
-- All writes go through SECURITY DEFINER RPCs so RLS stays simple
-- and clients never touch internal columns.
--
-- Reads: members can SELECT their own rows (interactions / value
-- log / blocklist). The summary view aggregates the user's family
-- log and is exposed for the "Trust Receipt" UI.

set search_path = public;

-- ─── advisor_interactions ─────────────────────────────────────────

create table if not exists public.advisor_interactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_id text not null,
  signal_family text not null,
  outcome text not null check (
    outcome in ('shown_only', 'acted', 'dismissed', 'expired', 'blocked')
  ),
  surface text not null check (
    surface in ('control_card', 'asistente_screen', 'push_notification')
  ),
  context jsonb not null default '{}'::jsonb,
  time_to_action_ms int,
  created_at timestamptz not null default now()
);

create index if not exists advisor_interactions_user_family_idx
  on public.advisor_interactions (user_id, signal_family, created_at desc);

create index if not exists advisor_interactions_family_outcome_idx
  on public.advisor_interactions (family_id, outcome, created_at desc);

alter table public.advisor_interactions enable row level security;

create policy "advisor_interactions_select_own"
  on public.advisor_interactions
  for select
  using (auth.uid() = user_id);

-- INSERT only via SECURITY DEFINER RPC. No direct INSERT/UPDATE/DELETE
-- policy means clients can't write.

-- ─── advisor_value_log ────────────────────────────────────────────

create table if not exists public.advisor_value_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_id text not null,
  signal_family text not null,
  action_taken text not null check (
    action_taken in (
      'cancelled_zombie',
      'reduced_category',
      'moved_to_savings',
      'renegotiated_hike',
      'avoided_overspend',
      'completed_goal'
    )
  ),
  value_saved numeric(14, 2) not null check (value_saved >= 0),
  value_horizon_months int not null default 12 check (value_horizon_months >= 1),
  evidence jsonb not null default '{}'::jsonb,
  is_estimated boolean not null default true,
  acted_at timestamptz not null default now()
);

create index if not exists advisor_value_log_user_idx
  on public.advisor_value_log (user_id, acted_at desc);

create index if not exists advisor_value_log_family_idx
  on public.advisor_value_log (family_id, acted_at desc);

alter table public.advisor_value_log enable row level security;

create policy "advisor_value_log_select_family"
  on public.advisor_value_log
  for select
  using (
    exists (
      select 1
      from public.family_members fm
      where fm.family_id = advisor_value_log.family_id
        and fm.user_id = auth.uid()
    )
  );

-- ─── advisor_value_summary view ───────────────────────────────────
--
-- `security_invoker = true` (PG15+) makes the view evaluate RLS as the
-- caller, so the existing `advisor_value_log_select_family` policy
-- still gates which rows the user can aggregate. Without this option,
-- views run with the creator's privileges and bypass RLS — we don't
-- want that here.

create or replace view public.advisor_value_summary
  with (security_invoker = true)
as
select
  user_id,
  family_id,
  sum(value_saved * value_horizon_months) as total_saved_lifetime,
  sum(value_saved) filter (where acted_at >= now() - interval '90 days') as saved_quarter,
  sum(value_saved) filter (where acted_at >= now() - interval '30 days') as saved_month,
  count(*) as total_actions,
  count(distinct signal_family) as distinct_signal_families
from public.advisor_value_log
group by user_id, family_id;

grant select on public.advisor_value_summary to authenticated;

-- ─── user_signal_blocklist ────────────────────────────────────────

create table if not exists public.user_signal_blocklist (
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_family text not null,
  reason text,
  blocked_at timestamptz not null default now(),
  primary key (user_id, signal_family)
);

alter table public.user_signal_blocklist enable row level security;

create policy "user_signal_blocklist_select_own"
  on public.user_signal_blocklist
  for select
  using (auth.uid() = user_id);

create policy "user_signal_blocklist_insert_own"
  on public.user_signal_blocklist
  for insert
  with check (auth.uid() = user_id);

create policy "user_signal_blocklist_delete_own"
  on public.user_signal_blocklist
  for delete
  using (auth.uid() = user_id);

-- ─── RPCs ─────────────────────────────────────────────────────────

create or replace function public.log_advisor_interaction(
  p_family_id uuid,
  p_signal_id text,
  p_signal_family text,
  p_outcome text,
  p_surface text,
  p_context jsonb default '{}'::jsonb,
  p_time_to_action_ms int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  -- Caller must belong to the family.
  if not exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = auth.uid()
  ) then
    raise exception 'Forbidden: not a member of family';
  end if;

  insert into public.advisor_interactions (
    family_id, user_id, signal_id, signal_family,
    outcome, surface, context, time_to_action_ms
  )
  values (
    p_family_id, auth.uid(), p_signal_id, p_signal_family,
    p_outcome, p_surface, coalesce(p_context, '{}'::jsonb),
    p_time_to_action_ms
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_advisor_interaction from public;
grant execute on function public.log_advisor_interaction to authenticated;

create or replace function public.log_advisor_value(
  p_family_id uuid,
  p_signal_id text,
  p_signal_family text,
  p_action_taken text,
  p_value_saved numeric,
  p_value_horizon_months int,
  p_evidence jsonb,
  p_is_estimated boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  if not exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = auth.uid()
  ) then
    raise exception 'Forbidden: not a member of family';
  end if;

  if p_value_saved is null or p_value_saved < 0 then
    raise exception 'value_saved must be >= 0';
  end if;

  insert into public.advisor_value_log (
    family_id, user_id, signal_id, signal_family,
    action_taken, value_saved, value_horizon_months,
    evidence, is_estimated
  )
  values (
    p_family_id, auth.uid(), p_signal_id, p_signal_family,
    p_action_taken, p_value_saved,
    coalesce(p_value_horizon_months, 12),
    coalesce(p_evidence, '{}'::jsonb),
    coalesce(p_is_estimated, true)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_advisor_value from public;
grant execute on function public.log_advisor_value to authenticated;

-- ─── Pruning cron ─────────────────────────────────────────────────
--
-- Keep the interaction log bounded — anything older than 180 days is
-- noise for the persona / causal engines. Value log is kept forever
-- (it powers the "lifetime saved" surface). Schedule via pg_cron.

create or replace function public.cron_prune_advisor_interactions()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.advisor_interactions
  where created_at < now() - interval '180 days';
end;
$$;

revoke all on function public.cron_prune_advisor_interactions from public;

-- pg_cron schedule (idempotent — IF NOT EXISTS guard via dynamic SQL):
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'cron_prune_advisor_interactions',
      '0 5 1 * *',  -- 05:00 UTC the 1st of every month
      $cron$select public.cron_prune_advisor_interactions();$cron$
    );
  end if;
exception when others then
  -- Cron job already exists — nothing to do.
  null;
end;
$$;
