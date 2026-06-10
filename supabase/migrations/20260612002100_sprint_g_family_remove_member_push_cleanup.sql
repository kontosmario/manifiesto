-- supabase/migrations/20260612002100_sprint_g_family_remove_member_push_cleanup.sql
--
-- Sprint G-DB · Red team finding G-DB2 (2026-06-10):
--   `family_remove_member` (last definition in
--   20260510000100_security_hardening_rate_limits.sql:415) deletes the
--   target row from `public.family_members` but leaves their row in
--   `public.push_subscriptions` orphaned.
--
--   Consequence: after being kicked, the ex-member keeps receiving every
--   push notification the family fires (added expenses, fixed-payment
--   confirmations, month-close prompts) until the FK cascade hits — but
--   the FK on push_subscriptions.user_id is `on delete cascade` against
--   `auth.users`, not against family_members. So the row never leaves
--   until the user deletes the auth account.
--
--   In practice: kicked member sees family activity for up to the JWT
--   expiry window plus however long they retain the device. This is a
--   privacy / data-leak vector.
--
-- Fix:
--   Inside `family_remove_member`, after the family_members delete, also
--   `delete from push_subscriptions where user_id = target_user_id and
--   family_id = v_family_id`. Mirrors what `leave_current_family`
--   (20260421114000_add_leave_current_family_rpc.sql:29) already does for
--   the self-leave path.
--
-- Signature, owner check, blocked filter, rate limit, "no self / no other
-- owner" guards from the previous version are preserved verbatim. Fully
-- idempotent via `create or replace`.

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

  perform public.enforce_rate_limit('family_remove_member', 5, 60);

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

  -- Sprint G-DB G-DB2 (2026-06-10): scrub push subscriptions BEFORE
  -- removing the membership, so the kicked user stops receiving family
  -- notifications immediately. Mirrors `leave_current_family`.
  delete from public.push_subscriptions
  where user_id = target_user_id
    and family_id = v_family_id;

  delete from public.family_members
  where family_id = v_family_id and user_id = target_user_id;
end;
$$;

grant execute on function public.family_remove_member(uuid) to authenticated;

comment on function public.family_remove_member(uuid) is
  'Owner-only removal of a family member. Cleans up push subscriptions '
  'to prevent post-kick notification leakage (Sprint G-DB G-DB2, '
  '2026-06-10). Rate-limited 5/60s.';
