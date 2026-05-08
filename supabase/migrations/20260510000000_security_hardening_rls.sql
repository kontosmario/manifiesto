-- Security hardening — Phase 1: RLS + RPC authz tightening.
--
-- Closes the highest-severity findings from the 2026-05-07 security
-- audit. No new domain features; this migration is purely defensive.
--
-- Findings addressed:
--   AB-1  family_members_insert_self lets a kicked / arbitrary user
--         re-join any family by UUID, bypassing the invite system.
--   BE-1  add_savings_contribution gated on is_family_member, so a
--         blocked member could still mutate goals.
--   BE-2  audit_subscription / declare_subscription_intent /
--         resolve_subscription_intent let blocked members write.
--   BE-3  notifications_select_members exposed per-user rows to all
--         family members — fan-out leak via realtime.
--   BE-7  display_name defaulted to email local-part on signup,
--         leaking a person-identifiable string into the family roster
--         until the user finished onboarding.
--   BE-8  notifications_update_mark_read let any member mark another
--         member's per-user notifications as read.
--   AB-2  notifications_insert_members did not bind created_by, so a
--         member could spoof notifications attributed to the owner.
--   CL/AB push_subscriptions_select_members exposed device tokens
--         across all family members; only the owner of a subscription
--         needs read access (the edge function uses service_role).

-- ─── 1. Family membership: drop self-insert; route joins via RPC ───
-- The single-use invite system (`consume_family_invite`) is now the
-- canonical way to join a family. It runs SECURITY DEFINER so it does
-- not need an INSERT policy. Keep an explicit deny so any future code
-- doing a direct insert fails closed.
drop policy if exists "family_members_insert_self" on public.family_members;

create policy "family_members_insert_denied"
on public.family_members
for insert
to authenticated
with check (false);

-- Tighten UPDATE / DELETE on family_members so a member cannot mutate
-- their own row to escalate role or unblock themselves. Owner-driven
-- admin RPCs (transfer_ownership, block, unblock, remove) are
-- SECURITY DEFINER and continue to work; direct table writes are
-- denied.
drop policy if exists "family_members_update_self" on public.family_members;
drop policy if exists "family_members_update_members" on public.family_members;
drop policy if exists "family_members_update_denied" on public.family_members;
create policy "family_members_update_denied"
on public.family_members
for update
to authenticated
using (false)
with check (false);

drop policy if exists "family_members_delete_self" on public.family_members;
drop policy if exists "family_members_delete_members" on public.family_members;
drop policy if exists "family_members_delete_denied" on public.family_members;
create policy "family_members_delete_denied"
on public.family_members
for delete
to authenticated
using (false);

-- ─── 2. Notifications: tighten select / update / insert ───────────
-- A member can only see broadcast rows (user_id is null) and rows
-- targeted at themselves. Fixes the realtime fan-out leak (BE-3).
drop policy if exists "notifications_select_members" on public.notifications;
create policy "notifications_select_members"
on public.notifications
for select
using (
  public.is_family_member(family_id)
  and (user_id is null or user_id = auth.uid())
);

-- A member can mark broadcast (user_id IS NULL) and their own
-- per-user notifications as read. The SELECT tightening above stops
-- a member from even seeing another member's per-user rows, so the
-- attack surface for cross-targeting an UPDATE is closed at the
-- read layer. Marking a broadcast as read is a shared shoulder
-- effect by design (one row per family) and stays as is.
drop policy if exists "notifications_update_mark_read" on public.notifications;
create policy "notifications_update_mark_read"
on public.notifications
for update
to authenticated
using (
  public.is_family_member(family_id)
  and (user_id is null or user_id = auth.uid())
)
with check (
  public.is_family_member(family_id)
  and (user_id is null or user_id = auth.uid())
);

-- Direct INSERT into notifications is denied. All notification
-- emission goes through SECURITY DEFINER helpers (`emit_notification`,
-- `emit_user_notification`) which hard-code created_by = auth.uid()
-- and validate the kind / size of the payload. Closes the spoofing
-- vector AB-2.
drop policy if exists "notifications_insert_members" on public.notifications;
create policy "notifications_insert_denied"
on public.notifications
for insert
to authenticated
with check (false);

-- ─── 3. Push subscriptions: own-only SELECT ───────────────────────
-- Tokens are device-secret. The send-family-push edge function uses
-- the service_role key, so RLS narrowing here doesn't break push
-- delivery — only direct client reads.
drop policy if exists "push_subscriptions_select_members" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
on public.push_subscriptions
for select
using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_update_self_member" on public.push_subscriptions;
create policy "push_subscriptions_update_self_member"
on public.push_subscriptions
for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_family_member(family_id)
)
with check (
  user_id = auth.uid()
  and public.is_family_member(family_id)
);

drop policy if exists "push_subscriptions_delete_self_member" on public.push_subscriptions;
create policy "push_subscriptions_delete_self_member"
on public.push_subscriptions
for delete
to authenticated
using (
  user_id = auth.uid()
  and public.is_family_member(family_id)
);

-- ─── 4. handle_new_user_profile — neutral default display_name ───
-- Email local-parts often equal the full email's identifier portion;
-- defaulting `display_name` to that leaks PII into the family roster
-- until the user reaches the onboarding rename step.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      'Usuario'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ─── 5. add_savings_contribution — owner-only writes ─────────────
-- The savings_goals UPDATE policy is owner-only since
-- 20260424001858_family_roles_admin.sql. The contribution RPC was
-- gated on is_family_member, which (a) included blocked members and
-- (b) bypassed the owner-only intent of the RLS by running as
-- SECURITY DEFINER. Re-align with the policy.
create or replace function public.add_savings_contribution(
  p_goal_id uuid,
  p_amount numeric
)
returns public.savings_goals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal public.savings_goals%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El aporte debe ser mayor a cero';
  end if;

  select * into v_goal from public.savings_goals where id = p_goal_id;
  if not found then
    raise exception 'Meta no encontrada';
  end if;

  if not public.is_family_owner(v_goal.family_id) then
    raise exception 'Solo el owner puede aportar a la meta';
  end if;

  update public.savings_goals
  set current_amount = current_amount + p_amount,
      updated_at = now()
  where id = p_goal_id
  returning * into v_goal;

  return v_goal;
end;
$$;

revoke all on function public.add_savings_contribution(uuid, numeric) from public;
grant execute on function public.add_savings_contribution(uuid, numeric) to authenticated;

-- ─── 6. Subscription audit/intent RPCs — exclude blocked members ─
-- Replace the inline membership existence checks with
-- is_family_member_active so a blocked user (who still holds a JWT)
-- cannot keep mutating subscription state for the family that just
-- blocked them.
create or replace function public.audit_subscription(
  p_fixed_expense_id uuid,
  p_level text
)
returns public.fixed_expense_usage_audit
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
  v_period text := to_char(now(), 'YYYY-MM');
  v_row public.fixed_expense_usage_audit;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select family_id into v_family_id
  from public.fixed_expenses
  where id = p_fixed_expense_id;

  if v_family_id is null then
    raise exception 'Fixed expense not found' using errcode = 'P0002';
  end if;

  if not public.is_family_member_active(v_family_id) then
    raise exception 'Not a member of this family' using errcode = '42501';
  end if;

  if p_level not in ('mucho', 'a_veces', 'casi_nunca') then
    raise exception 'Invalid level' using errcode = '22023';
  end if;

  insert into public.fixed_expense_usage_audit
    (fixed_expense_id, family_id, user_id, period, level)
  values
    (p_fixed_expense_id, v_family_id, v_user_id, v_period, p_level)
  on conflict (fixed_expense_id, user_id, period) do update
    set level = excluded.level,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.declare_subscription_intent(
  p_fixed_expense_id uuid,
  p_intent text,
  p_notes text default null
)
returns public.fixed_expense_action_intent
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
  v_row public.fixed_expense_action_intent;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select family_id into v_family_id
  from public.fixed_expenses
  where id = p_fixed_expense_id;

  if v_family_id is null then
    raise exception 'Fixed expense not found' using errcode = 'P0002';
  end if;

  if not public.is_family_member_active(v_family_id) then
    raise exception 'Not a member of this family' using errcode = '42501';
  end if;

  if p_intent not in ('cancel', 'pause', 'downgrade') then
    raise exception 'Invalid intent' using errcode = '22023';
  end if;

  insert into public.fixed_expense_action_intent
    (fixed_expense_id, family_id, user_id, intent, notes)
  values
    (p_fixed_expense_id, v_family_id, v_user_id, p_intent, p_notes)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.resolve_subscription_intent(
  p_intent_id uuid,
  p_resolution text,
  p_new_amount numeric default null
)
returns public.fixed_expense_action_intent
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_fixed_expense_id uuid;
  v_intent text;
  v_user_id uuid := auth.uid();
  v_row public.fixed_expense_action_intent;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select family_id, fixed_expense_id, intent
    into v_family_id, v_fixed_expense_id, v_intent
  from public.fixed_expense_action_intent
  where id = p_intent_id;

  if v_family_id is null then
    raise exception 'Intent not found' using errcode = 'P0002';
  end if;

  if not public.is_family_member_active(v_family_id) then
    raise exception 'Not a member of this family' using errcode = '42501';
  end if;

  if p_resolution not in ('completed', 'abandoned') then
    raise exception 'Invalid resolution' using errcode = '22023';
  end if;

  update public.fixed_expense_action_intent
    set resolved_at = now(),
        resolution = p_resolution
  where id = p_intent_id and resolved_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Intent already resolved' using errcode = '22023';
  end if;

  if p_resolution = 'completed' then
    if v_intent = 'cancel' then
      update public.fixed_expenses
        set status = 'archived', updated_at = now()
      where id = v_fixed_expense_id;
    elsif v_intent = 'pause' then
      update public.fixed_expenses
        set status = 'paused', updated_at = now()
      where id = v_fixed_expense_id;
    elsif v_intent = 'downgrade' and p_new_amount is not null then
      update public.fixed_expenses
        set amount = p_new_amount, updated_at = now()
      where id = v_fixed_expense_id;
    end if;
  end if;

  return v_row;
end;
$$;

-- ─── 7. emit_user_notification — only safe path for client-driven
-- per-user notifications. Hard-codes created_by = auth.uid(),
-- validates kind whitelist, length-caps title/body. Closes AB-2.
create or replace function public.emit_user_notification(
  p_target_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_target_family_id uuid;
  v_id uuid;
  v_title text;
  v_body text;
  v_metadata jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- The only kinds the client is allowed to emit. Server-side flows
  -- (streak, fixed payment, savings goal triggers) use the broader
  -- emit_notification helper directly inside SECURITY DEFINER code.
  if p_kind not in ('member_warning', 'member_nudge') then
    raise exception 'Invalid notification kind';
  end if;

  v_title := substr(coalesce(btrim(p_title), ''), 1, 80);
  v_body := substr(coalesce(btrim(p_body), ''), 1, 280);
  if v_title = '' then
    raise exception 'Title required';
  end if;
  v_metadata := coalesce(p_metadata, '{}'::jsonb);
  if octet_length(v_metadata::text) > 2048 then
    raise exception 'Metadata too large';
  end if;

  -- Caller's family.
  select fm.family_id
    into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role <> 'blocked'
    and fm.blocked_at is null
  limit 1;

  if v_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  -- Target must be in the same family.
  select fm.family_id
    into v_target_family_id
  from public.family_members fm
  where fm.user_id = p_target_user_id
  limit 1;

  if v_target_family_id is null or v_target_family_id <> v_family_id then
    raise exception 'Target user is not in your family';
  end if;

  insert into public.notifications (
    family_id, user_id, title, body, kind, severity, created_by, metadata
  )
  values (
    v_family_id, p_target_user_id, v_title, v_body, p_kind, 'info', v_user_id, v_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.emit_user_notification(uuid, text, text, text, jsonb) from public;
grant execute on function public.emit_user_notification(uuid, text, text, text, jsonb) to authenticated;

-- ─── 8. update_my_income_contribution — replaces direct UPDATE ───
-- The deny-update policy on family_members closes a privilege
-- escalation vector (a user editing their own row to flip role,
-- clear blocked_at, change family_id). Members still need to be
-- able to update their declared monthly income contribution, so
-- expose that single-column write via a SECURITY DEFINER RPC.
create or replace function public.update_my_income_contribution(p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_safe numeric(12,2);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount is null or not (p_amount = p_amount) then  -- catches NaN
    v_safe := 0;
  elsif p_amount < 0 then
    v_safe := 0;
  elsif p_amount > 1000000000 then
    raise exception 'Monto fuera de rango';
  else
    v_safe := p_amount::numeric(12,2);
  end if;

  update public.family_members
    set monthly_income_contribution = v_safe
  where user_id = v_user_id;

  if not found then
    raise exception 'No estás en una familia.';
  end if;

  return v_safe;
end;
$$;

revoke all on function public.update_my_income_contribution(numeric) from public;
grant execute on function public.update_my_income_contribution(numeric) to authenticated;
