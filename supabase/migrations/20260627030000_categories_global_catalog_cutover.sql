-- ────────────────────────────────────────────────────────────────
-- 20260627030000_categories_global_catalog_cutover.sql  (EXPAND · cutover)
--
-- Convierte el modelo "categories per-familia copiadas" en:
--   standard = category_templates (global, read-only)
--   custom   = family_custom_categories (per-familia)
--   `categories` pasa a ser una VIEW (security_invoker) = templates ∪ custom.
--
-- expenses/fixed_expenses/category_limits.category_id pasa a referencia
-- BLANDA (template global O custom de la familia), validada por trigger.
-- Determinística: 0 custom hoy → toda categoría tiene template_id.
--
-- ⚠️ CUTOVER: rompe el build viejo (manda category_id viejos). Aplicar
-- coordinado con el reship. `categories_legacy` + backup = reversible.
-- Ver docs/sistemas/category-architecture-refactor.md.
-- ────────────────────────────────────────────────────────────────

-- 0. Robustez: si hubiera categorías CUSTOM (template_id null), preservarlas
--    en family_custom_categories con el MISMO id → expenses que las referencian
--    siguen resolviendo por la view. (Hoy son 0; no-op defensivo.)
insert into public.family_custom_categories (id, family_id, name, color, scope, created_at)
  select id, family_id, name, color, scope, created_at
  from public.categories where template_id is null
on conflict (id) do nothing;

-- 1. Backup de los category_id viejos (rollback).
create table if not exists public._migration_category_id_backup as
  select 'expenses'::text as tbl, id as row_id, category_id from public.expenses
  union all
  select 'fixed_expenses', id, category_id from public.fixed_expenses where category_id is not null
  union all
  select 'category_limits', id, category_id from public.category_limits;

-- 2. Migrar category_id := template_id (standard). Las custom (template_id null)
--    ya están en family_custom_categories con el mismo id → no se tocan.
update public.expenses e set category_id = c.template_id
  from public.categories c where c.id = e.category_id and c.template_id is not null;
update public.fixed_expenses fe set category_id = c.template_id
  from public.categories c where c.id = fe.category_id and c.template_id is not null;
update public.category_limits cl set category_id = c.template_id
  from public.categories c where c.id = cl.category_id and c.template_id is not null;

-- 3. Drop FKs duras a categories (pasan a referencia blanda + trigger).
alter table public.expenses        drop constraint if exists expenses_category_id_fkey;
alter table public.fixed_expenses  drop constraint if exists fixed_expenses_category_id_fkey;
alter table public.category_limits drop constraint if exists category_limits_category_id_fkey;

-- 4. Renombrar la tabla per-familia a _legacy (backup) y crear la VIEW.
alter table public.categories rename to categories_legacy;

create view public.categories with (security_invoker = true) as
  -- Standard: templates globales, family_id NULL, una sola vez (no dup en joins).
  select t.id,
         null::uuid          as family_id,
         t.name,
         coalesce(t.color, '#8A8A8A') as color,
         t.created_at,
         t.id                as template_id,
         t.scope
  from public.category_templates t
  union all
  -- Custom: per-familia.
  select fcc.id,
         fcc.family_id,
         fcc.name,
         coalesce(fcc.color, '#8A8A8A') as color,
         fcc.created_at,
         null::uuid          as template_id,
         fcc.scope
  from public.family_custom_categories fcc;

-- 5. Validación: category_id de un gasto/fijo debe ser un template global O un
--    custom de la familia. Reemplaza el join a categories per-familia.
create or replace function public.ensure_expense_category_belongs_family()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.category_id is null then
    return new;  -- fixed_expenses.category_id es nullable
  end if;
  -- template global (válido para cualquier familia)
  if exists (select 1 from public.category_templates t where t.id = new.category_id) then
    return new;
  end if;
  -- custom de ESTA familia
  if exists (
    select 1 from public.family_custom_categories fcc
    where fcc.id = new.category_id and fcc.family_id = new.family_id
  ) then
    return new;
  end if;
  raise exception 'Category does not belong to selected family.';
end;
$function$;

-- 6. Lista de categorías con counts: la lista incluye templates globales
--    (family_id null) + customs de la familia. Tweak parentizado.
create or replace function public.gastos_categories_with_counts(p_family_id uuid, p_cycle_start timestamp with time zone, p_cycle_end timestamp with time zone)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  with counts as (
    select e.category_id, count(*)::int as cnt
    from public.expenses e
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_cycle_start
      and e.created_at < p_cycle_end
    group by e.category_id
  )
  select jsonb_build_object(
    'categories', coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'color', c.color,
      'count_in_cycle', coalesce(co.cnt, 0)
    ) order by coalesce(co.cnt, 0) desc, c.name asc), '[]'::jsonb)
  )
  from public.categories c
  left join counts co on co.category_id = c.id
  where (c.family_id = p_family_id or c.family_id is null)
    and c.scope = 'expense'
$function$;

-- 7. bootstrap_family: deja de copiar categorías (la familia ve los templates
--    vía la view automáticamente). Verbatim de prod SIN los 2 INSERT a categories.
create or replace function public.bootstrap_family()
 returns table(family_id uuid)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_existing_family_id uuid;
  v_new_family_id uuid;
  v_lifetime_count int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.enforce_rate_limit('bootstrap_family', 3, 3600);

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

  select count(*)
    into v_lifetime_count
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role = 'owner';

  if coalesce(v_lifetime_count, 0) >= 5 then
    raise exception 'family-cap-reached' using errcode = 'P0001';
  end if;

  insert into public.families default values
  returning id into v_new_family_id;

  insert into public.family_members(family_id, user_id, role)
  values (v_new_family_id, v_user_id, 'owner')
  on conflict (user_id) do nothing;

  -- (las categorías standard ya no se copian: la familia ve category_templates
  --  vía la view `categories`. Las custom se crean on-demand.)

  update public.profiles
  set family_closed_by_owner_at = null
  where profiles.id = v_user_id
    and family_closed_by_owner_at is not null;

  family_id := v_new_family_id;
  return next;
end;
$function$;

-- 8. home_snapshot: las 2 sub-listas de categorías incluyen templates globales
--    (family_id null) + customs. Tweak parentizado (ÚNICO cambio vs el actual).
--    El join de subscription_checkins (c.id = fe.category_id) queda igual.
create or replace function public.home_snapshot()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
      'payments_cycle_end', null,
      'monthly_summaries_history', '[]'::jsonb,
      'category_limits', '[]'::jsonb,
      'velocity_today', null,
      'advisor_signal_dismissals', '[]'::jsonb,
      'subscription_checkins', '[]'::jsonb
      ,
      'no_spend_days_count_cycle', 0,
      'no_spend_days_this_cycle', '[]'::jsonb
    );
  end if;

  declare
    v_cycle_type text;
    v_cycle_anchor_date date;
    v_cycle_length_days smallint;
    v_last_confirmed timestamptz;
    v_helper_result record;
  begin
    select
      coalesce(ff.salary_payment_day, 1)::smallint,
      coalesce(ff.cycle_type, 'monthly'),
      ff.cycle_anchor_date,
      ff.cycle_length_days,
      ff.last_salary_confirmed_at
    into v_payment_day, v_cycle_type, v_cycle_anchor_date, v_cycle_length_days, v_last_confirmed
    from public.family_finance ff
    where ff.family_id = v_family_id;

    if v_payment_day is null then v_payment_day := 1; end if;
    if v_cycle_type is null then v_cycle_type := 'monthly'; end if;

    select cycle_start, cycle_end_exclusive
    into v_helper_result
    from public.compute_pay_cycle(
      v_today::date,
      v_cycle_type,
      v_payment_day::smallint,
      v_cycle_anchor_date,
      v_cycle_length_days
    );

    if v_cycle_type = 'monthly'
       and (
         v_last_confirmed is null
         or v_last_confirmed::date < v_helper_result.cycle_start
       )
    then
      select cycle_start, cycle_end_exclusive
      into v_helper_result
      from public.compute_pay_cycle(
        (v_helper_result.cycle_start - interval '1 day')::date,
        v_cycle_type,
        v_payment_day::smallint,
        v_cycle_anchor_date,
        v_cycle_length_days
      );
    end if;

    v_cycle_start := v_helper_result.cycle_start::timestamptz;
    v_cycle_end := v_helper_result.cycle_end_exclusive::timestamptz;
  end;

  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from (
        select id, display_name, created_at, avatar_animal, onboarding_completed_at
        from public.profiles where id = v_user_id
      ) p
    ),
    'family', jsonb_build_object('familyId', v_family_id, 'kind', (select kind from public.families where id = v_family_id)),
    'family_finance', (
      select jsonb_build_object(
        'family_id', ff.family_id,
        'monthly_income', ff.monthly_income::float8,
        'savings_goal', ff.savings_goal::float8,
        'savings_goal_percent', ff.savings_goal_percent,
        'usd_exchange_rate', ff.usd_exchange_rate::float8,
        'local_currency', ff.local_currency,
        'usd_rate_enabled', ff.usd_rate_enabled,
        'salary_payment_day', ff.salary_payment_day,
        'last_salary_confirmed_at', ff.last_salary_confirmed_at,
        'daily_budget_buffer_mode', ff.daily_budget_buffer_mode,
        'daily_budget_buffer_value', ff.daily_budget_buffer_value::float8,
        'daily_budget_nudges_enabled', ff.daily_budget_nudges_enabled,
        'daily_budget_checkin_hour', ff.daily_budget_checkin_hour,
        'current_cycle_starting_balance', ff.current_cycle_starting_balance::float8,
        'current_cycle_anchor', ff.current_cycle_anchor,
        'cycle_type', ff.cycle_type,
        'cycle_anchor_date', ff.cycle_anchor_date,
        'cycle_length_days', ff.cycle_length_days,
        'monthly_reserve_amount', ff.monthly_reserve_amount::float8
      )
      from public.family_finance ff where ff.family_id = v_family_id
    ),
    'fixed_expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', fe.id,
          'family_id', fe.family_id,
          'name', fe.name,
          'amount', fe.amount::float8,
          'created_at', fe.created_at,
          'updated_at', fe.updated_at,
          'kind', fe.kind,
          'status', fe.status,
          'frequency', fe.frequency,
          'category_id', fe.category_id,
          'next_due_on', fe.next_due_on,
          'ends_on', fe.ends_on,
          'installments_total', fe.installments_total,
          'installments_paid', fe.installments_paid,
          'remaining_balance', fe.remaining_balance::float8,
          'lender_name', fe.lender_name,
          'notes', fe.notes,
          'last_paid_at', fe.last_paid_at,
          'day_of_month', fe.day_of_month,
          'notify_days_before', fe.notify_days_before,
          'last_used_at', fe.last_used_at
        )
        order by fe.status asc, fe.next_due_on asc nulls last, fe.created_at asc
      )
      from (
        select * from public.fixed_expenses
        where family_id = v_family_id
        order by status asc, next_due_on asc nulls last, created_at asc
        limit 100
      ) fe
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'family_id', e.family_id,
          'category_id', e.category_id,
          'description', e.description,
          'notes', e.notes,
          'price', e.price::float8,
          'created_by', e.created_by,
          'created_at', e.created_at,
          'commitment_id', e.commitment_id,
          'archived_at', e.archived_at
        )
        order by e.created_at desc
      )
      from (
        select * from public.expenses
        where family_id = v_family_id
          and archived_at is null
        order by created_at desc
        limit 120
      ) e
    ), '[]'::jsonb),
    'categories_expense', coalesce((
      select jsonb_agg(to_jsonb(c.*) order by c.created_at asc)
      from public.categories c
      where (c.family_id = v_family_id or c.family_id is null) and c.scope = 'expense'
    ), '[]'::jsonb),
    'categories_fixed_expense', coalesce((
      select jsonb_agg(to_jsonb(c.*) order by c.created_at asc)
      from public.categories c
      where (c.family_id = v_family_id or c.family_id is null) and c.scope = 'fixed_expense'
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
          'created_at', fm.created_at,
          'monthly_income_contribution', fm.monthly_income_contribution::float8
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
    'payments_cycle_end', v_cycle_end,
    'monthly_summaries_history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ms.id,
          'period_start', ms.period_start,
          'period_end', ms.period_end,
          'period_label', ms.period_label,
          'total_variable_spent', ms.total_variable_spent::float8,
          'total_fixed_spent', ms.total_fixed_spent::float8,
          'total_spent', ms.total_spent::float8,
          'expenses_count', ms.expenses_count,
          'fixed_paid_count', ms.fixed_paid_count,
          'monthly_income', ms.monthly_income::float8,
          'savings_delta', ms.savings_delta::float8,
          'category_breakdown', ms.category_breakdown,
          'daily_totals', ms.daily_totals,
          'delta_vs_previous_percent', ms.delta_vs_previous_percent,
          'mood', ms.mood,
          'top_expense', ms.top_expense,
          'wrapped_seen_at', ms.wrapped_seen_at
        )
        order by ms.period_start desc
      )
      from (
        select *
        from public.monthly_summaries
        where family_id = v_family_id
        order by period_start desc
        limit 6
      ) ms
    ), '[]'::jsonb),
    'category_limits', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cl.id,
          'category_id', cl.category_id,
          'monthly_cap', cl.monthly_cap::float8,
          'warning_threshold_pct', cl.warning_threshold_pct
        )
        order by cl.created_at asc
      )
      from public.category_limits cl
      where cl.family_id = v_family_id
    ), '[]'::jsonb),
    'velocity_today', (
      select jsonb_build_object(
        'id', vs.id,
        'family_id', vs.family_id,
        'snapshot_date', vs.snapshot_date,
        'avg_daily_last_7', vs.avg_daily_last_7::float8,
        'avg_daily_last_30', vs.avg_daily_last_30::float8,
        'momentum', vs.momentum::float8,
        'forecast_close_amount', vs.forecast_close_amount::float8,
        'stress_level', vs.stress_level,
        'created_at', vs.created_at
      )
      from public.velocity_snapshots vs
      where vs.family_id = v_family_id
      order by vs.snapshot_date desc
      limit 1
    ),
    'advisor_signal_dismissals', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'signal_id', asd.signal_id,
          'dismissed_at', asd.dismissed_at,
          'ignore_count', asd.ignore_count
        )
        order by asd.dismissed_at desc
      )
      from public.advisor_signal_dismissals asd
      where asd.user_id = v_user_id
    ), '[]'::jsonb),
    'subscription_checkins', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'fixed_expense_id', fe.id,
          'name', fe.name,
          'amount', fe.amount::float8,
          'last_payment_at', (
            select max(fep.paid_at) from public.fixed_expense_payments fep
            where fep.fixed_expense_id = fe.id
          ),
          'last_audit_at', (
            select max(fua.created_at) from public.fixed_expense_usage_audit fua
            where fua.fixed_expense_id = fe.id and fua.user_id = v_user_id
          ),
          'recent_levels', coalesce((
            select jsonb_agg(t.level order by t.created_at desc)
            from (
              select fua.level, fua.created_at from public.fixed_expense_usage_audit fua
              where fua.fixed_expense_id = fe.id and fua.user_id = v_user_id
              order by fua.created_at desc limit 3
            ) t
          ), '[]'::jsonb),
          'open_intent', exists(
            select 1 from public.fixed_expense_action_intent fai
            where fai.fixed_expense_id = fe.id and fai.intent = 'cancel' and fai.resolved_at is null
          )
        ) order by fe.created_at asc
      )
      from public.fixed_expenses fe
      join public.categories c on c.id = fe.category_id
      where fe.family_id = v_family_id
        and coalesce(fe.status, 'active') = 'active'
        and c.scope = 'fixed_expense' and c.name = 'Suscripciones'
    ), '[]'::jsonb)
    ,
    'no_spend_days_count_cycle', (
      select count(*)::int
      from public.streak_marked_days md
      where md.user_id = v_user_id
        and md.family_id = v_family_id
        and md.marked_date >= v_cycle_start::date
        and md.marked_date <= current_date
    ),
    'no_spend_days_this_cycle', coalesce((
      select jsonb_agg(md.marked_date::text order by md.marked_date desc)
      from public.streak_marked_days md
      where md.user_id = v_user_id
        and md.family_id = v_family_id
        and md.marked_date >= v_cycle_start::date
        and md.marked_date <= current_date
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;


