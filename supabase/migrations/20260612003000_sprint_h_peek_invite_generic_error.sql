-- Sprint H — H-12 (red-team 2026-06-10)
-- ─────────────────────────────────────────────────────────────────────────────
-- `peek_family_invite` previously raised three distinct errors:
--   1. 'Invite code not found'
--   2. 'Invite already used'
--   3. 'Invite expired'
--
-- A leaked / brute-forced code could let an attacker learn WHY a given
-- code is invalid (e.g. distinguishing "this code exists but was
-- already consumed" from "this code never existed"). The information
-- leak is marginal — codes are 6-char and rate-limited at 10/min — but
-- collapsing to a single generic public message removes the side
-- channel entirely while keeping rich detail in server logs for the
-- owner debugging real support cases.
--
-- Strategy:
--   * All three failure branches `raise notice` with the specific
--     reason (visible in Postgres logs, captured by Supabase) and then
--     `raise exception 'Invalid invite'` with the generic message that
--     reaches the client.
--   * No behavior change for the happy path.
--   * No signature or grant change — pure body rewrite.
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.enforce_rate_limit('peek_family_invite', 10, 60);

  select fi.family_id, fi.expires_at, fi.consumed_at
    into v_family_id, v_invite_expires, v_invite_consumed_at
  from public.family_invites fi
  where fi.code = upper(btrim(p_code))
  limit 1;

  -- H-12: collapse the three distinct failure modes to a single
  -- generic public-facing message. Keep the specific reason in
  -- server logs (RAISE NOTICE) so owners can still triage support
  -- cases against the Supabase log stream.
  if v_family_id is null then
    raise notice 'peek_family_invite: code not found (code=%)', upper(btrim(p_code));
    raise exception 'Invalid invite';
  end if;
  if v_invite_consumed_at is not null then
    raise notice 'peek_family_invite: code already used (family=%, consumed_at=%)',
      v_family_id, v_invite_consumed_at;
    raise exception 'Invalid invite';
  end if;
  if v_invite_expires < now() then
    raise notice 'peek_family_invite: code expired (family=%, expires_at=%)',
      v_family_id, v_invite_expires;
    raise exception 'Invalid invite';
  end if;

  select jsonb_build_object(
    'family_id', v_family_id,
    'family_code', upper(btrim(p_code)),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'display_name', coalesce(p.display_name, 'Usuario'),
        'avatar_animal', p.avatar_animal,
        'role', coalesce(fm.role, 'member')
      ) order by fm.created_at asc)
      from public.family_members fm
      left join public.profiles p on p.id = fm.user_id
      where fm.family_id = v_family_id
        and fm.role <> 'blocked'
    ), '[]'::jsonb),
    'member_count', coalesce((
      select count(*)::int
      from public.family_members fm
      where fm.family_id = v_family_id
        and fm.role <> 'blocked'
    ), 0),
    'monthly_income', coalesce((
      select ff.monthly_income
      from public.family_finance ff
      where ff.family_id = v_family_id
    ), 0),
    'active_goal_title', (
      select sg.title
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

-- Re-assert grants to keep them aligned with the original migration
-- (idempotent; matches 20260510000100 final state).
revoke all on function public.peek_family_invite(text) from public;
grant execute on function public.peek_family_invite(text) to authenticated;
