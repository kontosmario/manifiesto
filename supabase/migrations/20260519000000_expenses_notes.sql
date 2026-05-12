-- WHAT: Agrega columna `notes` a `public.expenses` (texto opcional, max
--       500 chars) y actualiza los 3 RPCs que proyectan expenses
--       (`home_snapshot`, `gastos_expenses_paginated`,
--       `gastos_expenses_for_day`) para incluir el nuevo campo en el
--       jsonb que devuelven.
--
-- WHY:  Audit engagement gaps §2.5 pedía "notes/comments en gastos".
--       `description` es corto + obligatorio (max 200, lo que cargás
--       en el quick-add). `notes` es complementario, opcional, hasta
--       500 chars — "compré con tarjeta de mamá para reembolsar".
--       Mejora el historial sin romper el flujo de quick-add (sigue
--       siendo 1 tap → monto + description → guardar).
--
-- NOTE: Los cuerpos de las 3 funciones provienen de
--       `pg_get_functiondef` ejecutado contra prod (2026-05-12).
--       Único cambio respecto del prod actual: agregar `notes` a la
--       proyección de expenses. Cualquier otra divergencia de prod
--       sería una regresión accidental — si releés esta migración
--       en el futuro y la lógica difiere, prefiere la versión que
--       esté viva en prod sobre lo que pegamos acá.
--
-- ROLLBACK (manual):
--   - Restaurar las 3 funciones desde sus migraciones previas
--     (las dumpeadas en /tmp/home_snapshot_prod.sql + gep_prod.sql
--     + gefd_prod.sql para esta sesión).
--   - `alter table public.expenses drop constraint if exists expenses_notes_length_check;`
--   - `alter table public.expenses drop column if exists notes;`

-- ─── 1. Column + CHECK constraint ────────────────────────────────
alter table public.expenses
  add column if not exists notes text null;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_notes_length_check'
  ) then
    alter table public.expenses
      add constraint expenses_notes_length_check
      check (notes is null or length(notes) <= 500);
  end if;
end $$;

comment on column public.expenses.notes is
  'Optional free-form text up to 500 chars. Complements the short '
  '`description` field. NULL when the user did not add context.';

-- ─── 2. home_snapshot — re-define with `notes` in expenses block ─
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
      'advisor_signal_dismissals', '[]'::jsonb
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
    'family', jsonb_build_object('familyId', v_family_id),
    'family_finance', (
      select jsonb_build_object(
        'family_id', ff.family_id,
        'monthly_income', ff.monthly_income::float8,
        'savings_goal', ff.savings_goal::float8,
        'savings_goal_percent', ff.savings_goal_percent,
        'usd_exchange_rate', ff.usd_exchange_rate::float8,
        'salary_payment_day', ff.salary_payment_day,
        'last_salary_confirmed_at', ff.last_salary_confirmed_at,
        'daily_budget_buffer_mode', ff.daily_budget_buffer_mode,
        'daily_budget_buffer_value', ff.daily_budget_buffer_value::float8,
        'daily_budget_nudges_enabled', ff.daily_budget_nudges_enabled,
        'daily_budget_checkin_hour', ff.daily_budget_checkin_hour,
        'current_cycle_starting_balance', ff.current_cycle_starting_balance::float8,
        'current_cycle_anchor', ff.current_cycle_anchor
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
          'mood', ms.mood
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
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$

;

-- ─── 3. gastos_expenses_paginated — add notes to projection ──
CREATE OR REPLACE FUNCTION public.gastos_expenses_paginated(p_family_id uuid, p_cycle_start timestamp with time zone, p_cycle_end timestamp with time zone, p_before_iso_date date DEFAULT NULL::date, p_days_per_page integer DEFAULT 2, p_today date DEFAULT CURRENT_DATE, p_timezone text DEFAULT 'America/Argentina/Buenos_Aires'::text, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with expense_rows as (
    select
      e.id,
      e.family_id,
      e.category_id,
      e.commitment_id,
      e.description,
      e.notes,
      e.price,
      e.created_by,
      e.created_at,
      c.name as category_name,
      c.color as category_color,
      p.display_name as creator_display_name,
      ((e.created_at at time zone p_timezone)::date) as local_date
    from public.expenses e
    left join public.categories c on c.id = e.category_id
    left join public.profiles p on p.id = e.created_by
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_cycle_start
      and e.created_at < p_cycle_end
      and (p_category_id is null or e.category_id = p_category_id)
      and (
        (p_before_iso_date is null
          and ((e.created_at at time zone p_timezone)::date) <= p_today)
        or
        (p_before_iso_date is not null
          and ((e.created_at at time zone p_timezone)::date) < p_before_iso_date)
      )
  ),
  distinct_days as (
    select distinct local_date
    from expense_rows
    order by local_date desc
    limit p_days_per_page
  ),
  selected_rows as (
    select er.*
    from expense_rows er
    where er.local_date in (select local_date from distinct_days)
  ),
  page_min as (
    select min(local_date) as min_date from distinct_days
  ),
  next_cursor_calc as (
    select case
      when (select min_date from page_min) is null then null
      when exists (
        select 1 from expense_rows
        where local_date < (select min_date from page_min)
      ) then (select min_date from page_min)
      else null
    end as cursor_date
  )
  select jsonb_build_object(
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sr.id,
        'family_id', sr.family_id,
        'category_id', sr.category_id,
        'category_name', sr.category_name,
        'category_color', sr.category_color,
        'commitment_id', sr.commitment_id,
        'description', sr.description,
        'notes', sr.notes,
        'price', sr.price,
        'created_at', sr.created_at,
        'created_by', sr.created_by,
        'creator_display_name', sr.creator_display_name,
        'iso_date', sr.local_date
      ) order by sr.created_at desc)
      from selected_rows sr
    ), '[]'::jsonb),
    'next_cursor', (select cursor_date from next_cursor_calc),
    'has_more', (select cursor_date from next_cursor_calc) is not null
  )
$function$

;

-- ─── 4. gastos_expenses_for_day — add notes to projection ────
CREATE OR REPLACE FUNCTION public.gastos_expenses_for_day(p_family_id uuid, p_iso_date date, p_timezone text DEFAULT 'America/Argentina/Buenos_Aires'::text, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with rows as (
    select
      e.id,
      e.family_id,
      e.category_id,
      e.commitment_id,
      e.description,
      e.notes,
      e.price,
      e.created_by,
      e.created_at,
      c.name as category_name,
      c.color as category_color,
      p.display_name as creator_display_name
    from public.expenses e
    left join public.categories c on c.id = e.category_id
    left join public.profiles p on p.id = e.created_by
    where e.family_id = p_family_id
      and e.commitment_id is null
      and ((e.created_at at time zone p_timezone)::date) = p_iso_date
      and (p_category_id is null or e.category_id = p_category_id)
  )
  select jsonb_build_object(
    'expenses', coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'family_id', family_id,
      'category_id', category_id,
      'category_name', category_name,
      'category_color', category_color,
      'commitment_id', commitment_id,
      'description', description,
      'notes', notes,
      'price', price,
      'created_at', created_at,
      'created_by', created_by,
      'creator_display_name', creator_display_name,
      'iso_date', p_iso_date
    ) order by created_at desc), '[]'::jsonb)
  )
  from rows
$function$

;
