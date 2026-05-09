-- Advisor cognitive layer hardening — closes ADV-1..ADV-5 from the
-- 2026-05-08 coverage-gap audit.
--
-- The advisor RPCs (`log_advisor_interaction`, `log_advisor_value`)
-- predate the security pass that fixed `log_home_event` and were
-- never retrofitted with the same controls. The result is that the
-- two highest-traffic insert paths in the cognitive layer are
-- unbounded in row size and call rate, blocked members can still
-- write, and `advisor_value_log` has no prune cron at all (its
-- design comment said "kept forever for the lifetime-saved
-- surface" — fine for legitimate rows, catastrophic for an attacker
-- writing 4 MB blobs).
--
-- This migration applies the same checklist used in
-- `20260510000100_security_hardening_rate_limits.sql`:
--   1. octet_length cap on jsonb (≤4 KB)
--   2. char_length cap on free-text columns
--   3. enforce_rate_limit per RPC
--   4. is_family_member_active (excludes blocked members)
--   5. Pruning cron where retention isn't business-critical
--   6. SELECT policies tightened to own-only where the data is PII
--
-- Findings closed: ADV-1, ADV-2, ADV-3, ADV-4, ADV-5.

-- ─── 1. log_advisor_interaction — ADV-1 ──────────────────────────
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
  v_ctx jsonb := coalesce(p_context, '{}'::jsonb);
  v_signal_id text := coalesce(p_signal_id, '');
  v_signal_family text := coalesce(p_signal_family, '');
  v_outcome text := coalesce(p_outcome, '');
  v_surface text := coalesce(p_surface, '');
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  if length(v_signal_id) = 0 or length(v_signal_id) > 120 then
    raise exception 'Invalid signal_id';
  end if;
  if length(v_signal_family) > 64 then
    raise exception 'Invalid signal_family';
  end if;
  if length(v_outcome) > 64 then
    raise exception 'Invalid outcome';
  end if;
  if length(v_surface) > 64 then
    raise exception 'Invalid surface';
  end if;
  if octet_length(v_ctx::text) > 4096 then
    raise exception 'Context too large';
  end if;

  if not public.is_family_member_active(p_family_id) then
    raise exception 'Forbidden: not an active member of family';
  end if;

  -- 120/min/user: high enough that legitimate "view several signals
  -- in a session" doesn't trip it, low enough to neutralize spam.
  perform public.enforce_rate_limit('log_advisor_interaction', 120, 60);

  insert into public.advisor_interactions (
    family_id, user_id, signal_id, signal_family,
    outcome, surface, context, time_to_action_ms
  )
  values (
    p_family_id, auth.uid(), v_signal_id, nullif(v_signal_family, ''),
    nullif(v_outcome, ''), nullif(v_surface, ''), v_ctx, p_time_to_action_ms
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_advisor_interaction(uuid, text, text, text, text, jsonb, int) from public;
grant execute on function public.log_advisor_interaction(uuid, text, text, text, text, jsonb, int) to authenticated;

-- ─── 2. log_advisor_value — ADV-2 ───────────────────────────────
-- Same hardening + add a prune cron. The original design said
-- "kept forever to power lifetime-saved" — we preserve that for
-- recent history but cap retention at 24 months. The lifetime
-- aggregate is computed from rolled-up summaries downstream, not
-- from raw rows, so this retention is enough.
-- Match original signature exactly (param names + types) so
-- create-or-replace updates the existing function rather than
-- creating a new overload. The original column is
-- `value_horizon_months`, not `horizon_months`.
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
  v_evidence jsonb := coalesce(p_evidence, '{}'::jsonb);
  v_signal_id text := coalesce(p_signal_id, '');
  v_signal_family text := coalesce(p_signal_family, '');
  v_action_taken text := coalesce(p_action_taken, '');
  v_horizon int := coalesce(p_value_horizon_months, 12);
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  if length(v_signal_id) = 0 or length(v_signal_id) > 120 then
    raise exception 'Invalid signal_id';
  end if;
  if length(v_signal_family) > 64 then
    raise exception 'Invalid signal_family';
  end if;
  if length(v_action_taken) > 64 then
    raise exception 'Invalid action_taken';
  end if;
  if octet_length(v_evidence::text) > 4096 then
    raise exception 'Evidence too large';
  end if;
  if p_value_saved is null or not (p_value_saved = p_value_saved) then
    raise exception 'Invalid value_saved';
  end if;
  if p_value_saved < 0 or p_value_saved > 1000000000 then
    raise exception 'value_saved out of range';
  end if;
  if v_horizon < 0 or v_horizon > 600 then
    raise exception 'horizon out of range';
  end if;

  if not public.is_family_member_active(p_family_id) then
    raise exception 'Forbidden: not an active member of family';
  end if;

  perform public.enforce_rate_limit('log_advisor_value', 60, 60);

  insert into public.advisor_value_log (
    family_id, user_id, signal_id, signal_family,
    action_taken, value_saved, value_horizon_months,
    evidence, is_estimated
  )
  values (
    p_family_id, auth.uid(), v_signal_id, nullif(v_signal_family, ''),
    nullif(v_action_taken, ''), p_value_saved, v_horizon,
    v_evidence, coalesce(p_is_estimated, true)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_advisor_value from public;
grant execute on function public.log_advisor_value to authenticated;

create or replace function public.cron_prune_advisor_value_log()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.advisor_value_log
  where acted_at < now() - interval '730 days';
end;
$$;

revoke all on function public.cron_prune_advisor_value_log() from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('cron_prune_advisor_value_log');
    perform cron.schedule(
      'cron_prune_advisor_value_log',
      '0 5 1 * *',  -- 05:00 UTC el 1 de cada mes
      $cron$select public.cron_prune_advisor_value_log();$cron$
    );
  end if;
exception when others then
  null;
end;
$$;

-- ─── 3. advisor_value_log SELECT — ADV-3 ────────────────────────
-- Was family-wide → leaked per-member behavioral history (which
-- subscriptions each member cancelled, how much each saved). Tighten
-- to own-only. Household-aggregate UI must use a SECURITY DEFINER
-- RPC that returns sums, never raw rows.
drop policy if exists "advisor_value_log_select_family" on public.advisor_value_log;
drop policy if exists "advisor_value_log_select_own" on public.advisor_value_log;
create policy "advisor_value_log_select_own"
  on public.advisor_value_log
  for select
  using (auth.uid() = user_id);

-- Aggregate-only RPC for household lifetime savings. Returns a
-- single row of family-level totals; no per-member breakdown. Use
-- this from the "we saved $X together" surface.
create or replace function public.advisor_value_family_totals(p_family_id uuid)
returns table (
  total_actions int,
  total_saved numeric,
  estimated_actions int,
  estimated_saved numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;
  if not public.is_family_member_active(p_family_id) then
    raise exception 'Forbidden';
  end if;

  return query
  select
    count(*)::int as total_actions,
    coalesce(sum(value_saved), 0)::numeric as total_saved,
    count(*) filter (where is_estimated)::int as estimated_actions,
    coalesce(sum(value_saved) filter (where is_estimated), 0)::numeric
      as estimated_saved
  from public.advisor_value_log
  where family_id = p_family_id;
end;
$$;

revoke all on function public.advisor_value_family_totals(uuid) from public;
grant execute on function public.advisor_value_family_totals(uuid) to authenticated;

-- ─── 4. user_signal_blocklist — ADV-4 ───────────────────────────
-- Direct-INSERT policy with no length caps, no rate limit, no
-- blocked-member check. Replace with a SECURITY DEFINER RPC and
-- deny direct writes. SELECT/DELETE policies stay (own-only).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_signal_blocklist'::regclass
      and conname = 'user_signal_blocklist_signal_family_len'
  ) then
    alter table public.user_signal_blocklist
      add constraint user_signal_blocklist_signal_family_len
      check (char_length(signal_family) between 1 and 64);
  end if;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_signal_blocklist'::regclass
      and conname = 'user_signal_blocklist_reason_len'
  ) then
    alter table public.user_signal_blocklist
      add constraint user_signal_blocklist_reason_len
      check (reason is null or char_length(reason) <= 280);
  end if;
exception when duplicate_object then null;
end;
$$;

drop policy if exists "user_signal_blocklist_insert_own"
  on public.user_signal_blocklist;
create policy "user_signal_blocklist_insert_denied"
  on public.user_signal_blocklist
  for insert
  to authenticated
  with check (false);

-- The user_signal_blocklist table has primary key (user_id,
-- signal_family) — no separate id column — so the RPC returns void
-- and uses the natural key.
create or replace function public.block_advisor_signal(
  p_signal_family text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_signal_family text := coalesce(p_signal_family, '');
  v_reason text := coalesce(p_reason, '');
begin
  if v_user_id is null then
    raise exception 'Auth required';
  end if;
  if length(v_signal_family) = 0 or length(v_signal_family) > 64 then
    raise exception 'Invalid signal_family';
  end if;
  if length(v_reason) > 280 then
    raise exception 'Reason too long';
  end if;

  perform public.enforce_rate_limit('block_advisor_signal', 30, 60);

  insert into public.user_signal_blocklist(user_id, signal_family, reason)
  values (v_user_id, v_signal_family, nullif(v_reason, ''))
  on conflict (user_id, signal_family) do update
    set reason = excluded.reason;
end;
$$;

revoke all on function public.block_advisor_signal(text, text) from public;
grant execute on function public.block_advisor_signal(text, text) to authenticated;

-- ─── 5. advisor_signal_dismissals — ADV-5 ───────────────────────
-- Drop policies by their actual names (defined with quoted spaces
-- in 20260509000000_advisor_signal_dismissals.sql) and replace
-- write paths with a SECURITY DEFINER RPC.
drop policy if exists "Members insert their own dismissals"
  on public.advisor_signal_dismissals;
drop policy if exists "Members update their own dismissals"
  on public.advisor_signal_dismissals;

create policy "advisor_signal_dismissals_insert_denied"
  on public.advisor_signal_dismissals
  for insert
  to authenticated
  with check (false);

create policy "advisor_signal_dismissals_update_denied"
  on public.advisor_signal_dismissals
  for update
  to authenticated
  using (false)
  with check (false);

-- The trigger `trg_touch_advisor_signal_dismissals_updated_at`
-- handles `updated_at`; we set `dismissed_at` explicitly so the
-- server clock is authoritative (no client-clock skew abuse).
create or replace function public.dismiss_advisor_signal(
  p_family_id uuid,
  p_signal_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_signal_id text := coalesce(p_signal_id, '');
begin
  if v_user_id is null then
    raise exception 'Auth required';
  end if;
  if length(v_signal_id) = 0 or length(v_signal_id) > 120 then
    raise exception 'Invalid signal_id';
  end if;
  if not public.is_family_member_active(p_family_id) then
    raise exception 'Forbidden';
  end if;

  perform public.enforce_rate_limit('dismiss_advisor_signal', 60, 60);

  insert into public.advisor_signal_dismissals(
    user_id, family_id, signal_id, dismissed_at, ignore_count
  )
  values (v_user_id, p_family_id, v_signal_id, now(), 1)
  on conflict (user_id, signal_id) do update
    set ignore_count = public.advisor_signal_dismissals.ignore_count + 1,
        dismissed_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.dismiss_advisor_signal(uuid, text) from public;
grant execute on function public.dismiss_advisor_signal(uuid, text) to authenticated;
