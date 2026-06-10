-- supabase/migrations/20260612004300_sprint_i_invite_create_rate_limit.sql
--
-- Sprint I-DB · Red team finding I-DB4 (2026-06-10):
--   `create_family_invite` (latest version in
--   20260612001600_sprint_f_invite_canonical_helper.sql:35-86) has no
--   rate limit. An owner can call it in a loop and mint arbitrarily
--   many invite codes. Real risk is LOW (codes are single-use,
--   8-character keyspace from `generate_invite_code(8)`, 8-attempt
--   collision-retry inside the function), but it's unconventional
--   for an SECDEF mutation RPC to have zero throttle.
--
-- Fix:
--   Add `perform public.check_rate_limit('create_family_invite', 10, 3600)`
--   right after authentication. 10/hour is plenty for legitimate
--   onboarding flows (family resends invite, owner generates a couple
--   for different relatives) while killing scripted abuse.
--
--   Idempotent via `create or replace function`. Body is preserved
--   verbatim from the F13 canonical-helper version — only the rate
--   limit line is new.

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

  -- Sprint I-DB I-DB4 (2026-06-10): rate limit to prevent abusive
  -- bulk-mint of invite codes. 10/hour suffices for normal onboarding.
  perform public.check_rate_limit('create_family_invite', 10, 3600);

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
  '(Sprint F-DB F13). Rate-limited 10/hour (Sprint I-DB I-DB4, 2026-06-10).';
