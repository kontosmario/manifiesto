-- supabase/migrations/20260614004100_sprint_q_consume_invite_owner_lock.sql
--
-- Sprint Q · Audit #10 Q-3 (2026-06-10):
--   `consume_family_invite` (Sprint P · P-8) `FOR UPDATE`-locks the
--   `family_invites` row but NOT the owner's `profiles` row when it
--   checks `deletion_scheduled_at`. That leaves a millisecond-scale
--   race window:
--
--      T0  consume reads owner.deletion_scheduled_at IS NULL   (no lock)
--      T1  deletion processor sets deletion_scheduled_at + tombstones
--      T2  consume INSERTs INTO family_members
--      ⇒   joiner lands in a family whose owner just got hard-deleted.
--
--   Sprint L · L-1 closes the GROSS case (owner already pending
--   deletion at check time). This migration closes the millisecond
--   race by taking a `FOR UPDATE` row-level lock on the owner's
--   profile inside the consume transaction. The deletion processor
--   acquires the same lock when it tombstones — so it waits for
--   consume to commit (or roll back) before flipping the flag.
--
--   Deadlock order audit: the deletion processor (see
--   20260614001000_sprint_n_account_deletion_processor_race.sql)
--   takes `profiles FOR UPDATE` BEFORE touching family_members.
--   This migration follows the same lock order:
--     1. family_invites FOR UPDATE (unchanged)
--     2. profiles FOR UPDATE (new — owner row)
--     3. family_members INSERT
--   Both code paths acquire `profiles` before `family_members`, so no
--   cyclic wait is possible.
--
-- Manual test plan:
--   1. Happy path: fresh code redeems and joiner lands in family — no
--      behaviour change.
--   2. Race simulation: in two psql sessions,
--        session A: begin; select * from consume_family_invite('CODE');
--        session B: begin; update profiles set deletion_scheduled_at = now()
--                   where id = '<owner-uuid>';
--      Session B blocks until A commits. Verify A's INSERT lands; B
--      proceeds afterwards (no deadlock).
--   3. Re-run the test with A starting AFTER B's update committed —
--      A's owner-check finds the row and raises generic 'Invalid invite'.
--   4. All four error paths (not found / used / expired / pending del)
--      still surface as generic 'Invalid invite' (Sprint P · P-8 intact).

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
  v_owner_user_id uuid;
  v_owner_deletion_scheduled_at timestamptz;
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

  -- Sprint Q · Audit #10 Q-3 (2026-06-10): take a FOR UPDATE lock on
  -- the owner's profile row BEFORE checking `deletion_scheduled_at`.
  -- Without the lock, the deletion processor can flip the flag and
  -- tombstone the owner in the milliseconds between this check and
  -- the family_members INSERT below — leaving the joiner orphaned in
  -- a family whose owner just got hard-deleted.
  --
  -- The deletion processor takes the same FOR UPDATE on profiles
  -- before touching family_members (Sprint N migration
  -- 20260614001000_sprint_n_account_deletion_processor_race.sql), so
  -- both code paths acquire locks in the same order
  -- (profiles → family_members) and cyclic wait is impossible.
  --
  -- Lookup owner row + lock it. We split this from the original
  -- EXISTS check (Sprint L · L-1) so we can hold the lock for the
  -- remainder of the transaction.
  select fm.user_id
    into v_owner_user_id
  from public.family_members fm
  where fm.family_id = v_family_id
    and fm.role = 'owner'
  limit 1;

  if v_owner_user_id is not null then
    select p.deletion_scheduled_at
      into v_owner_deletion_scheduled_at
    from public.profiles p
    where p.id = v_owner_user_id
    for update;

    if v_owner_deletion_scheduled_at is not null then
      raise notice 'consume_family_invite: family owner pending deletion (family=%)', v_family_id;
      raise exception 'Invalid invite';
    end if;
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
  'from Sprint H · H-12) and log the specific reason via raise notice. '
  'Sprint Q · Audit #10 Q-3 (2026-06-10): takes FOR UPDATE on the owner''s '
  'profile row to serialize against the deletion processor and close the '
  'millisecond race between the deletion check and the family_members '
  'INSERT. Logic otherwise unchanged from Sprint P.';
