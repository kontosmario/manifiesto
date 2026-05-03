-- Joiner contribution + leave-impact notification.
--
-- 1. `join_family_by_code` accepts an optional `p_contribution`. When
--    non-null it records the joiner's monthly income contribution on
--    `family_members.monthly_income_contribution`; the trigger from
--    20260506000000 recomputes `family_finance.monthly_income`.
--
-- 2. `leave_current_family` reads the leaving member's contribution
--    BEFORE deleting the row. If it was > 0 and the family still has
--    remaining members, it inserts a `member_left` notification so
--    the remaining users see the impact on the household total.
--    The trigger then takes care of subtracting the contribution
--    from the cached `monthly_income`.

-- ─── 1. join_family_by_code(p_code, p_contribution) ────────────────
drop function if exists public.join_family_by_code(text);
drop function if exists public.join_family_by_code(text, numeric);
create or replace function public.join_family_by_code(
  p_code text,
  p_contribution numeric default null
)
returns table (family_id uuid, family_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_family_id uuid;
  v_current_family_code text;
  v_target_family_id uuid;
  v_target_family_code text;
  v_contribution numeric(12,2);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, f.code
    into v_current_family_id, v_current_family_code
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  if v_current_family_id is not null then
    return query select v_current_family_id, v_current_family_code;
    return;
  end if;

  select f.id, f.code
    into v_target_family_id, v_target_family_code
  from public.families f
  where f.code = upper(btrim(p_code))
  limit 1;

  if v_target_family_id is null then
    raise exception 'Family code not found';
  end if;

  -- Sanitize the contribution: null or negative → 0.
  v_contribution := greatest(coalesce(p_contribution, 0), 0);

  -- Joining via shared code = member, never owner.
  insert into public.family_members(
    family_id, user_id, role, monthly_income_contribution
  )
  values (
    v_target_family_id, v_user_id, 'member', v_contribution
  )
  on conflict (user_id) do update
    set monthly_income_contribution = excluded.monthly_income_contribution;
  -- The recompute trigger fires here and updates family_finance.

  return query select v_target_family_id, v_target_family_code;
end;
$$;

revoke all on function public.join_family_by_code(text, numeric) from public;
grant execute on function public.join_family_by_code(text, numeric) to authenticated;


-- ─── 2. leave_current_family with member_left notification ─────────
drop function if exists public.leave_current_family();
create or replace function public.leave_current_family()
returns table (family_id uuid, family_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_family_id uuid;
  v_current_family_code text;
  v_remaining_members integer;
  v_contribution numeric(12,2);
  v_display_name text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, f.code, fm.monthly_income_contribution
    into v_current_family_id, v_current_family_code, v_contribution
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  if v_current_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  -- Capture display_name BEFORE deleting the membership so the
  -- notification body can include it.
  select coalesce(p.display_name, 'Un miembro')
    into v_display_name
  from public.profiles p
  where p.id = v_user_id;

  delete from public.push_subscriptions
  where push_subscriptions.family_id = v_current_family_id
    and push_subscriptions.user_id = v_user_id;

  delete from public.family_members
  where family_members.family_id = v_current_family_id
    and family_members.user_id = v_user_id;
  -- Trigger recomputes family_finance.monthly_income here.

  select count(*)
    into v_remaining_members
  from public.family_members
  where family_members.family_id = v_current_family_id;

  -- Only emit the notification when the family still has members
  -- AND the leaving user actually contributed income — otherwise
  -- there's nothing impactful to flag.
  if coalesce(v_remaining_members, 0) > 0
     and coalesce(v_contribution, 0) > 0 then
    insert into public.notifications (
      family_id, kind, severity, title, body, metadata, created_by
    )
    values (
      v_current_family_id,
      'member_left',
      'warning',
      v_display_name || ' se retiró del hogar',
      'El ingreso mensual del hogar bajó en $' ||
        to_char(v_contribution, 'FM999G999G999D00') || '.',
      jsonb_build_object(
        'left_user_id', v_user_id,
        'left_display_name', v_display_name,
        'monthly_income_removed', v_contribution
      ),
      v_user_id
    );
  end if;

  if coalesce(v_remaining_members, 0) = 0 then
    delete from public.families
    where families.id = v_current_family_id;
  end if;

  update public.profiles
  set onboarding_completed_at = null
  where profiles.id = v_user_id;

  return query
    select v_current_family_id, v_current_family_code;
end;
$$;

revoke all on function public.leave_current_family() from public;
grant execute on function public.leave_current_family() to authenticated;
