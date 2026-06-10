-- supabase/migrations/20260612001600_sprint_f_invite_canonical_helper.sql
--
-- Sprint F-DB · Red team finding F13 (2026-06-10):
--   `create_family_invite` (20260507000300:64) checks active membership
--   inline as `fm.blocked_at is null`. The canonical helper
--   `is_family_member_active(fam_id uuid)` (20260424001858) checks
--   `fm.role <> 'blocked'`. Divergent semantics:
--
--     • If `role` is updated to 'blocked' but `blocked_at` is left null
--       (or vice versa), the two predicates disagree. Today the
--       family_block_member RPC sets BOTH columns, so in practice they
--       align — but the future foot-gun is obvious: any new admin path
--       that only touches one column would let blocked users mint
--       invites.
--
-- Fix:
--   Replace the inline `blocked_at is null` check with the canonical
--   `is_family_member_active(fam_id)` helper for consistency. The
--   helper takes a family_id parameter, so we restructure the
--   lookup: first find the user's family_id, then validate active
--   membership via the helper.
--
--   This also locks in the contract: "ANY future block / unblock
--   semantics must go through is_family_member_active to be honored
--   here".
--
-- Manual test plan:
--   1. Active member calls create_family_invite → succeeds.
--   2. Blocked member (role='blocked') calls → raises 'Not currently in a family'.
--   3. Member with blocked_at set but role still 'member' (shouldn't
--      happen in practice but tested): NOW raises (was previously
--      allowed); intended hardening.
--   4. User not in any family → raises 'Not currently in a family'.

create or replace function public.create_family_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_target_code text;
  v_attempts int := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Sprint F-DB F13 (2026-06-10): use canonical is_family_member_active
  -- helper instead of inline `blocked_at is null`. First find the
  -- user's family, then validate active membership via the helper.
  select fm.family_id
    into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  if not public.is_family_member_active(v_family_id) then
    raise exception 'Not currently in a family';
  end if;

  loop
    v_target_code := public.generate_invite_code(8);
    begin
      insert into public.family_invites(code, family_id, created_by)
      values (v_target_code, v_family_id, v_user_id)
      returning family_invites.code, family_invites.expires_at
      into code, expires_at;
      return next;
      return;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 8 then
        raise exception 'Could not generate a unique invite code.';
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.create_family_invite() from public;
grant execute on function public.create_family_invite() to authenticated;

comment on function public.create_family_invite() is
  'Generates a single-use family invite code. Uses canonical '
  'is_family_member_active helper for blocked-member filtering '
  '(Sprint F-DB F13, 2026-06-10) instead of inline blocked_at check.';
