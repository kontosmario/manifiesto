-- Cleanup of legacy `families.code` + the RPCs that depended on it.
--
-- The single-use invite system (20260507000200) is the only join
-- path now. This migration:
--   1. drops the legacy peek/join RPCs
--   2. recreates `bootstrap_family` so it doesn't generate or
--      return a `code` field
--   3. updates `home_snapshot` to omit `code` from the family slice
--   4. updates `leave_current_family` to stop returning the code
--   5. drops `families.code` column entirely

-- ─── 1. Drop legacy peek/join RPCs ──────────────────────────────────
drop function if exists public.peek_family_by_code(text);
drop function if exists public.join_family_by_code(text);
drop function if exists public.join_family_by_code(text, numeric);

-- ─── 2. bootstrap_family without code ──────────────────────────────
-- The function still creates the family + owner row + default
-- categories. Returns just `family_id` now — there's no shareable
-- "family code" to surface. Joiners receive an invite from an
-- existing member instead.
drop function if exists public.bootstrap_family();
drop function if exists public.bootstrap_family(text);
create or replace function public.bootstrap_family()
returns table (family_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_family_id uuid;
  v_new_family_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

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

  insert into public.families default values
  returning id into v_new_family_id;

  insert into public.family_members(family_id, user_id, role)
  values (v_new_family_id, v_user_id, 'owner')
  on conflict (user_id) do nothing;

  insert into public.categories(family_id, template_id, name, scope)
  select v_new_family_id, templates.id, templates.name, 'expense'
  from public.category_templates templates
  where templates.scope = 'expense'
    and not exists (
      select 1
      from public.categories c
      where c.family_id = v_new_family_id
        and c.scope = 'expense'
        and lower(c.name) = lower(templates.name)
    )
  order by templates.sort_order;

  insert into public.categories(family_id, template_id, name, color, scope)
  select
    v_new_family_id,
    templates.id,
    templates.name,
    case templates.name
      when 'Servicios'     then '#E8976A'
      when 'Vivienda'      then '#8DB46A'
      when 'Suscripciones' then '#C9A6E0'
      when 'Seguros'       then '#F2B58A'
      when 'Cuotas'        then '#6B9AD6'
      when 'Impuestos'     then '#C7A96A'
      when 'Deudas'        then '#D96A4F'
      else '#8A8A8A'
    end,
    'fixed_expense'
  from public.category_templates templates
  where templates.scope = 'fixed_expense'
    and not exists (
      select 1
      from public.categories c
      where c.family_id = v_new_family_id
        and c.scope = 'fixed_expense'
        and lower(c.name) = lower(templates.name)
    )
  order by templates.sort_order;

  update public.profiles
  set family_closed_by_owner_at = null
  where profiles.id = v_user_id
    and family_closed_by_owner_at is not null;

  family_id := v_new_family_id;
  return next;
end;
$$;

revoke all on function public.bootstrap_family() from public;
grant execute on function public.bootstrap_family() to authenticated;

-- ─── 3. leave_current_family without code ──────────────────────────
drop function if exists public.leave_current_family();
create or replace function public.leave_current_family()
returns table (family_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_family_id uuid;
  v_caller_role text;
  v_other_active_members integer;
  v_remaining_members integer;
  v_contribution numeric(12,2);
  v_display_name text;
  v_next_owner uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, fm.role, fm.monthly_income_contribution
    into v_current_family_id, v_caller_role, v_contribution
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_current_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  select coalesce(p.display_name, 'Un miembro')
    into v_display_name
  from public.profiles p
  where p.id = v_user_id;

  select count(*) into v_other_active_members
  from public.family_members fm
  where fm.family_id = v_current_family_id
    and fm.user_id <> v_user_id
    and fm.blocked_at is null;

  -- Owner-alone branch — destroy the family.
  if v_caller_role = 'owner' and coalesce(v_other_active_members, 0) = 0 then
    perform set_config('app.allow_delete_categories', 'on', true);

    delete from public.push_subscriptions
    where push_subscriptions.family_id = v_current_family_id;

    delete from public.family_members
    where family_members.family_id = v_current_family_id;

    delete from public.families
    where families.id = v_current_family_id;

    update public.profiles
    set onboarding_completed_at = null
    where profiles.id = v_user_id;

    family_id := v_current_family_id;
    return next;
    return;
  end if;

  -- Owner with others — promote next active member to owner.
  if v_caller_role = 'owner' then
    select fm.user_id
      into v_next_owner
    from public.family_members fm
    where fm.family_id = v_current_family_id
      and fm.user_id <> v_user_id
      and fm.blocked_at is null
    order by fm.created_at asc
    limit 1;

    if v_next_owner is not null then
      update public.family_members fm
      set role = 'owner'
      where fm.family_id = v_current_family_id
        and fm.user_id = v_next_owner;
    end if;
  end if;

  delete from public.push_subscriptions
  where push_subscriptions.family_id = v_current_family_id
    and push_subscriptions.user_id = v_user_id;

  delete from public.family_members
  where family_members.family_id = v_current_family_id
    and family_members.user_id = v_user_id;

  select count(*)
    into v_remaining_members
  from public.family_members
  where family_members.family_id = v_current_family_id;

  if coalesce(v_remaining_members, 0) = 0 then
    perform set_config('app.allow_delete_categories', 'on', true);
    delete from public.families
    where families.id = v_current_family_id;
  else
    if coalesce(v_contribution, 0) > 0 then
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
  end if;

  update public.profiles
  set onboarding_completed_at = null
  where profiles.id = v_user_id;

  family_id := v_current_family_id;
  return next;
end;
$$;

revoke all on function public.leave_current_family() from public;
grant execute on function public.leave_current_family() to authenticated;

-- ─── 4. home_snapshot — drop `code` from family slice ─────────────
create or replace function public.home_snapshot()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_period_month date := date_trunc('month', current_date)::date;
  v_payment_day int;
  v_today date := current_date;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role <> 'blocked'
  limit 1;

  if v_family_id is null then
    return jsonb_build_object(
      'profile', (
        select to_jsonb(p) from (
          select id, display_name, created_at, avatar_animal, onboarding_completed_at
          from public.profiles
          where id = v_user_id
        ) p
      ),
      'family', null,
      'family_finance', null,
      'fixed_expenses', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'categories_expense', '[]'::jsonb,
      'categories_fixed_expense', '[]'::jsonb,
      'unread_notification_count', 0,
      'family_members', '[]'::jsonb,
      'notifications', '[]'::jsonb,
      'has_push_subscription', false,
      'savings_goal', null,
      'fixed_expense_payments', '[]'::jsonb,
      'period_month', v_period_month,
      'payments_cycle_start', null,
      'payments_cycle_end', null
    );
  end if;

  select coalesce(ff.salary_payment_day, 1) into v_payment_day
  from public.family_finance ff
  where ff.family_id = v_family_id;

  if v_payment_day is null then
    v_payment_day := 1;
  end if;

  if extract(day from v_today)::int >= v_payment_day then
    v_cycle_start := date_trunc('day', make_date(
      extract(year from v_today)::int,
      extract(month from v_today)::int,
      least(v_payment_day,
            extract(day from
              (date_trunc('month', v_today) + interval '1 month' - interval '1 day')
            )::int)
    ))::timestamptz;
  else
    v_cycle_start := date_trunc('day',
      (date_trunc('month', v_today) - interval '1 month')
      + (least(v_payment_day,
               extract(day from
                 (date_trunc('month', v_today) - interval '1 day')
               )::int) - 1) * interval '1 day'
    )::timestamptz;
  end if;
  v_cycle_end := v_cycle_start + interval '1 month';

  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from (
        select id, display_name, created_at, avatar_animal, onboarding_completed_at
        from public.profiles where id = v_user_id
      ) p
    ),
    -- `code` removed: the persistent family code is gone, joins go
    -- through ephemeral invites now.
    'family', jsonb_build_object('familyId', v_family_id),
    'family_finance', (
      select to_jsonb(ff.*) from public.family_finance ff where ff.family_id = v_family_id
    ),
    'fixed_expenses', coalesce((
      select jsonb_agg(to_jsonb(fe.*) order by fe.status, fe.next_due_on, fe.created_at)
      from public.fixed_expenses fe where fe.family_id = v_family_id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(to_jsonb(e.*) order by e.created_at desc)
      from public.expenses e where e.family_id = v_family_id
    ), '[]'::jsonb),
    'categories_expense', coalesce((
      select jsonb_agg(to_jsonb(c.*) order by c.created_at asc)
      from public.categories c
      where c.family_id = v_family_id and c.scope = 'expense'
    ), '[]'::jsonb),
    'categories_fixed_expense', coalesce((
      select jsonb_agg(to_jsonb(c.*) order by c.created_at asc)
      from public.categories c
      where c.family_id = v_family_id and c.scope = 'fixed_expense'
    ), '[]'::jsonb),
    'unread_notification_count', (
      select count(*) from public.notifications n
      where n.family_id = v_family_id
        and n.read_at is null
        and (n.user_id is null or n.user_id = v_user_id)
    ),
    'family_members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', fm.user_id,
          'role', fm.role,
          'blocked_at', fm.blocked_at,
          'display_name', p.display_name,
          'avatar_animal', p.avatar_animal,
          'created_at', fm.created_at
        )
        order by
          case fm.role when 'owner' then 0 when 'member' then 1 else 2 end,
          fm.created_at asc
      )
      from public.family_members fm
      left join public.profiles p on p.id = fm.user_id
      where fm.family_id = v_family_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n.*) order by n.created_at desc)
      from (
        select * from public.notifications
        where family_id = v_family_id
          and (user_id is null or user_id = v_user_id)
        order by created_at desc
        limit 80
      ) n
    ), '[]'::jsonb),
    'has_push_subscription', exists (
      select 1 from public.push_subscriptions ps
      where ps.user_id = v_user_id and ps.family_id = v_family_id
    ),
    'savings_goal', (
      select to_jsonb(sg.*)
      from public.savings_goals sg
      where sg.family_id = v_family_id and sg.is_active = true
      order by sg.created_at asc
      limit 1
    ),
    'fixed_expense_payments', coalesce((
      select jsonb_agg(to_jsonb(fep.*))
      from public.fixed_expense_payments fep
      where fep.paid_at >= v_cycle_start
        and fep.paid_at < v_cycle_end
        and fep.fixed_expense_id in (
          select fe.id from public.fixed_expenses fe where fe.family_id = v_family_id
        )
    ), '[]'::jsonb),
    'period_month', date_trunc('month', v_cycle_start)::date,
    'payments_cycle_start', v_cycle_start,
    'payments_cycle_end', v_cycle_end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.home_snapshot() from public;
grant execute on function public.home_snapshot() to authenticated;

-- ─── 5. Drop families.code column ──────────────────────────────────
-- Done last so the previous RPC drops/recreates can complete first
-- without dependency violations.
alter table public.families
  drop column if exists code;
