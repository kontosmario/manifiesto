-- Sub-usage check-in (spec docs/superpowers/specs/2026-06-23-sub-usage-checkin-design.md).
-- A: home_snapshot() expone subscription_checkins (LIVE, SIN ventana de ciclo).
-- B: RPC record_subscription_usage(feid, level, period) idempotente.
-- C: cron prune 12m de fixed_expense_usage_audit.
-- D: unschedule del cron control_zombies (retiro Sistema A; tablas/funciones quedan dormidas).
-- home_snapshot se re-emite desde pg_get_functiondef (def exacta de prod) + el key nuevo.

CREATE OR REPLACE FUNCTION public.home_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Cycle window via centralized helper. Soporta monthly + rolling-N regimes.
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

    -- Freeze hasta confirmar el cobro (monthly): si el cobro de este ciclo no
    -- fue confirmado (last_salary_confirmed_at < cycle_start), el ciclo activo
    -- del snapshot es el ANTERIOR → el saldo + los fijos NO saltan al ingreso
    -- nuevo hasta que el user confirme. Espeja el freeze del cliente
    -- (computeIsSalaryPendingConfirmation / getCurrentPayCycle).
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
          'created_at', fm.created_at,
          -- 2026-05-09: nuevo campo. Usado por useFamilyMembersDetail
          -- (advisor host, settings, family-admin) para evitar 2
          -- round-trips extras (family_members + profiles).
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
$function$
;


-- ─── record_subscription_usage(feid, level, period) ───────────────
-- Espejo de audit_subscription pero con period EXPLICITO (fecha del
-- check-in 'YYYY-MM-DD') -> historial append-only por check-in.
-- SECURITY DEFINER porque fixed_expense_usage_audit no tiene policy UPDATE.
create or replace function public.record_subscription_usage(
  p_fixed_expense_id uuid, p_level text, p_period text
) returns public.fixed_expense_usage_audit
language plpgsql security definer set search_path = public as $rsu$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
  v_row public.fixed_expense_usage_audit;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_period is null or btrim(p_period) = '' then raise exception 'Period required' using errcode = '22023'; end if;
  select family_id into v_family_id from public.fixed_expenses where id = p_fixed_expense_id;
  if v_family_id is null then raise exception 'Fixed expense not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.family_members fm where fm.family_id = v_family_id and fm.user_id = v_user_id)
    then raise exception 'Not a member of this family' using errcode = '42501'; end if;
  if p_level not in ('mucho','a_veces','casi_nunca') then raise exception 'Invalid level' using errcode = '22023'; end if;
  insert into public.fixed_expense_usage_audit (fixed_expense_id, family_id, user_id, period, level)
  values (p_fixed_expense_id, v_family_id, v_user_id, p_period, p_level)
  on conflict (fixed_expense_id, user_id, period) do update set level = excluded.level, updated_at = now()
  returning * into v_row;
  return v_row;
end; $rsu$;
grant execute on function public.record_subscription_usage(uuid, text, text) to authenticated;

-- ─── Prune cron: usage_audit 12 meses (invariante 9) ──────────────
create or replace function public.cron_prune_usage_audit()
returns void language plpgsql security definer set search_path = public as $cpu$
begin
  delete from public.fixed_expense_usage_audit where created_at < now() - interval '12 months';
end; $cpu$;
revoke all on function public.cron_prune_usage_audit() from public;
grant execute on function public.cron_prune_usage_audit() to service_role;

-- ─── crons: schedule prune + unschedule control_zombies (retiro Sistema A) ──
-- No se borra cron_detect_zombies() ni tablas/columnas (reversible).
do $mig$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'cron_prune_usage_audit') then
      perform cron.unschedule('cron_prune_usage_audit');
    end if;
    perform cron.schedule('cron_prune_usage_audit', '0 5 1 * *', $cron$select public.cron_prune_usage_audit();$cron$);
    if exists (select 1 from cron.job where jobname = 'control_zombies') then
      perform cron.unschedule('control_zombies');
    end if;
  end if;
exception when others then
  raise notice 'sub_usage cron block failed: %', sqlerrm;
end $mig$;
