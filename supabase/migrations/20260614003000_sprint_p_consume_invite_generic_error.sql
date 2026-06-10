-- supabase/migrations/20260614003000_sprint_p_consume_invite_generic_error.sql
--
-- Sprint P · Audit #9 P-8 (2026-06-10):
--   `consume_family_invite` previously raised four distinct errors
--   when an invite could not be redeemed:
--
--     1. 'Invite code not found'
--     2. 'Invite already used'
--     3. 'Invite expired'
--     4. 'Invite no longer valid' (Sprint L · L-1, owner pending deletion)
--
--   That's the same side channel Sprint H · H-12 closed for
--   `peek_family_invite`: a leaked / brute-forced code lets the
--   attacker learn WHY a given code is invalid. Information leak
--   is marginal (codes are 8-char + rate-limited 5/min) but the
--   inconsistency with peek_family_invite is the actual problem —
--   if an attacker pre-checks via peek (generic 'Invalid invite')
--   then tries consume and gets a different message, the side
--   channel widens beyond what peek closes.
--
-- Strategy (matches Sprint H · H-12 verbatim):
--   * All four failure branches `raise notice` with the specific
--     reason (visible in Postgres logs, captured by Supabase) and
--     then `raise exception 'Invalid invite'` with a generic public
--     message — same string peek raises, so the two RPCs are
--     observationally identical from the client's perspective.
--   * Happy path, rate limits, blocked-member handling, deletion-
--     pending guard, audit log writes — all preserved verbatim
--     from 20260613004000_sprint_l_invite_blocks_pending_deletion.
--   * `create or replace` so the migration is idempotent and only
--     touches the function body. No signature change, no grant
--     change.
--
-- Manual test plan:
--   1. consume_family_invite('NONEXISTENT') → generic 'Invalid invite'.
--   2. consume an already-used code → generic 'Invalid invite' (server
--      log still tells the owner the code was consumed).
--   3. consume an expired code → generic 'Invalid invite' (server log
--      tells the owner expires_at < now()).
--   4. consume a code whose family owner has deletion_scheduled_at →
--      generic 'Invalid invite' (server log says owner pending deletion).
--   5. Happy path: a fresh valid code joins normally — no behaviour
--      change.

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
  v_blocked_family_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Sprint J-Med · J-Med6 (2026-06-10): filter blocked memberships
  -- so a blocked user can fall through to the join path for a new
  -- family. Without the `role <> 'blocked'` filter, the noop branch
  -- silently returns the blocking family's id.
  select fm.family_id
    into v_existing_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role <> 'blocked'
  limit 1;

  if v_existing_family_id is not null then
    perform public.enforce_rate_limit('consume_family_invite_noop', 30, 60);
    family_id := v_existing_family_id;
    return next;
    return;
  end if;

  -- Real throttles for the join path: 5/min (anti-bruteforce) + 3/day.
  perform public.enforce_rate_limit('consume_family_invite', 5, 60);
  perform public.check_rate_limit('consume_family_invite', 3, 86400);

  select fi.family_id, fi.expires_at, fi.consumed_at
    into v_family_id, v_invite_expires, v_invite_consumed_at
  from public.family_invites fi
  where fi.code = upper(btrim(p_code))
  for update;

  -- Sprint P · Audit #9 P-8 (2026-06-10): collapse the four distinct
  -- failure modes to a single generic public-facing message that
  -- matches what peek_family_invite raises (Sprint H · H-12). Keeps
  -- the specific reason in server logs (`raise notice`) so owners can
  -- still triage support cases against the Supabase log stream.
  if v_family_id is null then
    raise notice 'consume_family_invite: code not found (code=%)', upper(btrim(p_code));
    raise exception 'Invalid invite';
  end if;
  if v_invite_consumed_at is not null then
    raise notice 'consume_family_invite: code already used (family=%, consumed_at=%)',
      v_family_id, v_invite_consumed_at;
    raise exception 'Invalid invite';
  end if;
  if v_invite_expires < now() then
    raise notice 'consume_family_invite: code expired (family=%, expires_at=%)',
      v_family_id, v_invite_expires;
    raise exception 'Invalid invite';
  end if;

  -- Sprint L · Audit #5 L-1 (2026-06-10): block consumption if the
  -- target family's owner is in the deletion grace period. Without
  -- this check a joiner can land in a family whose owner gets
  -- hard-deleted in <30 days, leaving them orphaned in a family
  -- with no owner-driven RPC access.
  --
  -- Sprint P · P-8 (2026-06-10): error now matches the other branches
  -- (generic 'Invalid invite'). Server log retains the deletion-pending
  -- reason so the owner can tell apart "leaked code redeem attempt"
  -- from "stale code stuck in someone's clipboard".
  if exists (
    select 1
      from public.profiles p
      join public.family_members fm on fm.user_id = p.id
     where fm.family_id = v_family_id
       and fm.role = 'owner'
       and p.deletion_scheduled_at is not null
  ) then
    raise notice 'consume_family_invite: family owner pending deletion (family=%)', v_family_id;
    raise exception 'Invalid invite';
  end if;

  v_contribution := greatest(coalesce(p_contribution, 0), 0);

  -- Sprint K · Audit #4 K-1 (2026-06-10): regression fix — delete
  -- prior blocked rows so the INSERT lands in the new family. See
  -- 20260613003000_sprint_k_invite_blocked_replace.sql for the full
  -- rationale; logic preserved verbatim.
  select fm.family_id
    into v_blocked_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role = 'blocked'
  limit 1;

  delete from public.family_members
  where user_id = v_user_id
    and role = 'blocked';

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

  if v_blocked_family_id is not null then
    insert into public.audit_log (user_id, family_id, action, target_table, target_id, payload)
    values (
      v_user_id,
      v_family_id,
      'consume_family_invite_unblock',
      'family_members',
      v_user_id,
      jsonb_build_object(
        'prev_family_id', v_blocked_family_id,
        'new_family_id', v_family_id,
        'invite_code', upper(btrim(p_code))
      )
    );
  end if;

  family_id := v_family_id;
  return next;
end;
$$;

-- Re-assert grants (idempotent; matches the prior migration's final state).
revoke all on function public.consume_family_invite(text, numeric) from public;
grant execute on function public.consume_family_invite(text, numeric) to authenticated;

comment on function public.consume_family_invite(text, numeric) is
  'Joins the caller to a family via an invite code. Idempotent for users '
  'already in a NON-BLOCKED family (noop return, throttled 30/min). '
  'Sprint L · Audit #5 L-1 (2026-06-10): refuses consumption if the '
  'target family''s owner has deletion_scheduled_at set. '
  'Sprint P · Audit #9 P-8 (2026-06-10): all four failure branches now '
  'raise the generic ''Invalid invite'' message (matching peek_family_invite '
  'from Sprint H · H-12) and log the specific reason via raise notice — '
  'closes the side channel that let an attacker learn whether a code '
  'was missing vs consumed vs expired vs deletion-pending. Logic otherwise '
  'unchanged from Sprint L.';
