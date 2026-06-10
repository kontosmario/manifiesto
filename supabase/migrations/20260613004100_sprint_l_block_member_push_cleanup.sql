-- supabase/migrations/20260613004100_sprint_l_block_member_push_cleanup.sql
--
-- Sprint L · Audit #5 L-5 / Medium (2026-06-10):
--   Sprint G-DB2 (20260612002100_sprint_g_family_remove_member_push_cleanup.sql)
--   added a `delete from push_subscriptions` to `family_remove_member`
--   so a kicked member stops receiving family pushes immediately.
--   The sibling RPC `family_block_member` (last defined in
--   20260510000100_security_hardening_rate_limits.sql:341-384) was
--   NOT updated and still leaves push tokens in place.
--
--   Threat model: an ex-partner who is "blocked" (rather than fully
--   removed — common when the owner wants to preserve history)
--   continues to receive notifications such as
--     "Pareja confirmó pago $45.000"
--     "Tu pareja registró un gasto en Restaurantes"
--   This is a surveillance vector. Blocking is the owner's signal
--   that the member should lose all visibility, including the push
--   firehose.
--
-- Fix:
--   • DB layer (this migration): mirror the G-DB2 pattern inside
--     `family_block_member` — DELETE the target user's push
--     subscriptions for this family before the role flip.
--   • Edge layer (separate diff): both `send-family-push` and
--     `notifications-orchestrator::fetchPushTokens` inner-join
--     family_members and filter `role <> 'blocked' and blocked_at
--     is null` so a stale push_subscriptions row (e.g. inserted
--     after this RPC ran but before token expiry) still cannot
--     reach a blocked user.
--
-- Why both layers:
--   The DB cleanup is the canonical fix — without it, stale rows
--   linger until manual re-registration or DeviceNotRegistered
--   cleanup at send time. The edge filter is defense-in-depth: a
--   client could re-register a token immediately after being
--   blocked (push registration is anonymous-ish — the client
--   doesn't know it's blocked yet), and we want the next push to
--   no-op even before the next block call scrubs the new row.
--
-- Manual test plan:
--   1. Block a member with an active push token → push_subscriptions
--      row for (target_user_id, v_family_id) is gone.
--   2. Unblock → role flips back to 'member', but push tokens are NOT
--      restored. The blocked user must reopen the app (which
--      re-registers via `registerForPushNotifications`). This is
--      the right behaviour — the user opted out by being blocked,
--      re-consent on next launch is fine.
--   3. Re-block immediately after unblock → the just-re-registered
--      tokens are scrubbed again.
--
-- Other guards (owner-only, no-self, no-other-owner, rate limit)
-- preserved verbatim from the 20260510000100 version.

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

  perform public.enforce_rate_limit('family_block_member', 5, 60);

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

  -- Sprint L · Audit #5 L-5 (2026-06-10): scrub push subscriptions
  -- BEFORE flipping the role so the blocked user stops receiving
  -- family notifications immediately. Without this, the blocked
  -- member keeps receiving "Pareja confirmó pago…" style pushes —
  -- a surveillance vector for an ex-partner scenario. Mirrors
  -- G-DB2's family_remove_member fix.
  delete from public.push_subscriptions
  where user_id = target_user_id
    and family_id = v_family_id;

  update public.family_members
  set role = 'blocked', blocked_at = now()
  where family_id = v_family_id and user_id = target_user_id;
end;
$$;

grant execute on function public.family_block_member(uuid) to authenticated;

comment on function public.family_block_member(uuid) is
  'Owner-only block of a family member. Sprint L · Audit #5 L-5 '
  '(2026-06-10): scrubs push subscriptions on block to prevent the '
  'blocked user from receiving family activity notifications — '
  'mirrors G-DB2''s family_remove_member behaviour. Rate-limited '
  '5/60s.';
