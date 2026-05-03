-- Rate limiting for invite RPCs.
--
-- The single-use invite system closed the worst attack vector
-- (persistent leaked codes), but `peek_family_invite` and
-- `consume_family_invite` are still authenticated RPCs anyone with
-- a session can call. Without rate limits a determined attacker
-- can still try millions of codes per second.
--
-- This migration adds:
--   1. `rpc_rate_limits` table — keyed on (user_id, action,
--      window_start), counts attempts per window.
--   2. `enforce_rate_limit(action, max_attempts, window_seconds)`
--      helper — atomically increments the counter and raises if
--      over the limit.
--   3. peek_family_invite + consume_family_invite recreated with
--      the helper called at the top.
--
-- Limits chosen:
--   • peek_family_invite     → 10 attempts per minute per user
--                              (covers retries on typos without
--                              enabling enumeration; an attacker
--                              would need ~3 years at this rate to
--                              brute-force a single valid code).
--   • consume_family_invite  → 5 attempts per minute per user
--                              (lower because successful consumes
--                              are rare; rapid attempts indicate
--                              brute force).

-- ─── 1. Table ──────────────────────────────────────────────────────
create table if not exists public.rpc_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  attempts int not null default 0,
  primary key (user_id, action, window_start)
);

-- TTL index so old windows can be pruned cheaply; the helper
-- doesn't actively prune but a periodic cleanup (cron / pg_cron)
-- would use this.
create index if not exists rpc_rate_limits_window_idx
  on public.rpc_rate_limits(window_start);

alter table public.rpc_rate_limits enable row level security;

drop policy if exists rpc_rate_limits_no_direct_access
  on public.rpc_rate_limits;
create policy rpc_rate_limits_no_direct_access
  on public.rpc_rate_limits
  for all
  using (false)
  with check (false);

-- ─── 2. Enforcer helper ──────────────────────────────────────────
-- Bumps the count for the current bucket and raises P0001 with a
-- descriptive message when over the limit. Buckets are aligned to
-- `floor(epoch / window_seconds)` so they roll over deterministically.
create or replace function public.enforce_rate_limit(
  p_action text,
  p_max_attempts int,
  p_window_seconds int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_window_start timestamptz;
  v_attempts int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Truncate `now()` to the start of the current window. e.g. for
  -- 60-second windows, 14:32:47.123 → 14:32:00.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rpc_rate_limits(user_id, action, window_start, attempts)
  values (v_user_id, p_action, v_window_start, 1)
  on conflict (user_id, action, window_start)
  do update
    set attempts = rpc_rate_limits.attempts + 1
  returning attempts into v_attempts;

  if v_attempts > p_max_attempts then
    raise exception 'Demasiados intentos. Esperá un momento e intentá de nuevo.'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.enforce_rate_limit(text, int, int) from public;
grant execute on function public.enforce_rate_limit(text, int, int) to authenticated;

-- ─── 3. peek_family_invite — with rate limit ────────────────────
create or replace function public.peek_family_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_invite_expires timestamptz;
  v_invite_consumed_at timestamptz;
  v_period_start date := date_trunc('month', current_date)::date;
  v_period_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Throttle: 10 attempts per 60 seconds per user. Generous enough
  -- to absorb a couple of typo retries without locking out the user
  -- but tight enough that brute-force enumeration is impractical
  -- (10/min × 60min × 24h = 14400/day vs 32^8 = 1.1T keyspace).
  perform public.enforce_rate_limit('peek_family_invite', 10, 60);

  select fi.family_id, fi.expires_at, fi.consumed_at
    into v_family_id, v_invite_expires, v_invite_consumed_at
  from public.family_invites fi
  where fi.code = upper(btrim(p_code))
  limit 1;

  if v_family_id is null then
    raise exception 'Invite code not found';
  end if;
  if v_invite_consumed_at is not null then
    raise exception 'Invite already used';
  end if;
  if v_invite_expires < now() then
    raise exception 'Invite expired';
  end if;

  select jsonb_build_object(
    'family_id', v_family_id,
    'family_code', upper(btrim(p_code)),
    'monthly_income', coalesce((
      select ff.monthly_income
      from public.family_finance ff
      where ff.family_id = v_family_id
    ), 0),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', fm.user_id,
        'display_name', coalesce(p.display_name, ''),
        'avatar_animal', p.avatar_animal,
        'monthly_income_contribution',
          coalesce(fm.monthly_income_contribution, 0),
        'role', coalesce(fm.role, 'member'),
        'is_blocked', fm.blocked_at is not null
      ) order by fm.created_at asc)
      from public.family_members fm
      left join public.profiles p on p.id = fm.user_id
      where fm.family_id = v_family_id
    ), '[]'::jsonb),
    'cycle_variable_spent', coalesce((
      select sum(e.price)::numeric(12,2)
      from public.expenses e
      where e.family_id = v_family_id
        and e.commitment_id is null
        and e.created_at::date >= v_period_start
        and e.created_at::date <= v_period_end
    ), 0),
    'active_fixed_count', coalesce((
      select count(*)::int
      from public.fixed_expenses fe
      where fe.family_id = v_family_id
        and fe.status = 'active'
    ), 0),
    'active_goal', (
      select jsonb_build_object(
        'title', sg.title,
        'goal_amount', sg.goal_amount,
        'current_amount', sg.current_amount
      )
      from public.savings_goals sg
      where sg.family_id = v_family_id
        and sg.is_active = true
      order by sg.created_at desc
      limit 1
    ),
    'invite_expires_at', v_invite_expires
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.peek_family_invite(text) from public;
grant execute on function public.peek_family_invite(text) to authenticated;

-- ─── 4. consume_family_invite — with rate limit ────────────────
create or replace function public.consume_family_invite(
  p_code text,
  p_contribution numeric default null
)
returns table (family_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_invite_expires timestamptz;
  v_invite_consumed_at timestamptz;
  v_existing_family_id uuid;
  v_contribution numeric(12,2);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Throttle BEFORE the idempotent-already-member shortcut so an
  -- attacker can't bypass via a successful prior join.
  perform public.enforce_rate_limit('consume_family_invite', 5, 60);

  select fm.family_id
    into v_existing_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_existing_family_id is not null then
    family_id := v_existing_family_id;
    return next;
    return;
  end if;

  select fi.family_id, fi.expires_at, fi.consumed_at
    into v_family_id, v_invite_expires, v_invite_consumed_at
  from public.family_invites fi
  where fi.code = upper(btrim(p_code))
  for update;

  if v_family_id is null then
    raise exception 'Invite code not found';
  end if;
  if v_invite_consumed_at is not null then
    raise exception 'Invite already used';
  end if;
  if v_invite_expires < now() then
    raise exception 'Invite expired';
  end if;

  v_contribution := greatest(coalesce(p_contribution, 0), 0);

  insert into public.family_members(
    family_id, user_id, role, monthly_income_contribution
  )
  values (
    v_family_id, v_user_id, 'member', v_contribution
  )
  on conflict (user_id) do update
    set monthly_income_contribution = excluded.monthly_income_contribution;

  update public.family_invites
  set consumed_by = v_user_id,
      consumed_at = now()
  where family_invites.code = upper(btrim(p_code));

  update public.profiles
  set family_closed_by_owner_at = null
  where profiles.id = v_user_id
    and family_closed_by_owner_at is not null;

  family_id := v_family_id;
  return next;
end;
$$;

revoke all on function public.consume_family_invite(text, numeric) from public;
grant execute on function public.consume_family_invite(text, numeric) to authenticated;
