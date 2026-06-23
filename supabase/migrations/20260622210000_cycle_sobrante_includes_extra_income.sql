-- supabase/migrations/20260622210000_cycle_sobrante_includes_extra_income.sql
--
-- FIX del "sobrante decidible" de un ciclo: hasta ahora se calculaba
-- `monthly_income − total_spent − savings_goal_amount`, donde `monthly_income`
-- es SOLO el sueldo base (family_finance.monthly_income). Eso IGNORA los
-- `income_events` extra del ciclo (arrastres de un "acumular" previo, bonos,
-- transferencias). Resultado: un ciclo donde (sueldo + extras) > gastos aparece
-- "empatado" (sobrante 0, clampeado) y la escena de decisión del Wrapped no se
-- dispara.
--
-- Caso real (kontosmario, Mayo 2026): sueldo 6.4M + arrastre de Abril 1.727M =
-- 8.127M de income real; gasto 7.99M → sobrante REAL ~+130k. Pero el cálculo
-- daba max(0, 6.4M − 7.99M) = 0.
--
-- Este fix guarda el income extra del ciclo en `monthly_summaries.extra_income`
-- (lo calcula `close_monthly_cycle` al cerrar) y lo incluye en el sobrante
-- (`apply_month_close_decision`). El cliente lo suma en `computeSobranteFromSummary`.
-- NO se toca `savings_delta` (queda como base histórica para otros consumidores).
-- El arrastre NO se re-arrastra: es un income_event histórico del ciclo, contado
-- una sola vez.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Columna nueva (aditiva).
-- ─────────────────────────────────────────────────────────────────────────
alter table public.monthly_summaries
  add column if not exists extra_income numeric not null default 0;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Backfill: sumar los income_events de cada ciclo ya cerrado.
-- ─────────────────────────────────────────────────────────────────────────
update public.monthly_summaries s
set extra_income = coalesce((
  select sum(ie.amount)
  from public.income_events ie
  where ie.family_id = s.family_id
    and ie.event_date >= s.period_start
    and ie.event_date < s.period_end
), 0);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) close_monthly_cycle: computar + guardar extra_income (cambio aditivo).
--    Idéntico al original salvo: `v_extra_income`, su cálculo, y las 2 líneas
--    de la columna en el insert/upsert.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.close_monthly_cycle(p_family_id uuid, p_period_start date, p_period_end date, p_force boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_existing_id uuid;
  v_finance record;
  v_variable_total numeric := 0;
  v_fixed_total numeric := 0;
  v_extra_income numeric := 0;
  v_expenses_count int := 0;
  v_fixed_paid_count int := 0;
  v_category_breakdown jsonb;
  v_daily_totals jsonb;
  v_by_member jsonb;
  v_top_expense jsonb;
  v_previous_total numeric;
  v_delta_pct numeric;
  v_mood text;
  v_period_label text;
  v_expected_monthly numeric;
  v_summary_id uuid;
begin
  -- Idempotency: already closed for this exact period?
  select id into v_existing_id
  from public.monthly_summaries
  where family_id = p_family_id and period_start = p_period_start;

  if v_existing_id is not null and not p_force then
    return jsonb_build_object(
      'status', 'already_closed',
      'id', v_existing_id,
      'period_start', p_period_start
    );
  end if;

  -- Load finance once (we use it for guard 2 and for context).
  select * into v_finance from public.family_finance where family_id = p_family_id;

  -- Guard 1: cycle must have ended.
  if not p_force and current_date < p_period_end then
    return jsonb_build_object('status', 'not_yet_ended', 'period_end', p_period_end);
  end if;

  -- Guard 2: user must have confirmed the next salary.
  if not p_force and (
    v_finance.last_salary_confirmed_at is null
    or v_finance.last_salary_confirmed_at < p_period_end::timestamptz
  ) then
    return jsonb_build_object(
      'status', 'salary_not_confirmed',
      'last_salary_confirmed_at', v_finance.last_salary_confirmed_at,
      'period_end', p_period_end
    );
  end if;

  -- Totals (variable = expenses without commitment_id; fixed = those with).
  select
    coalesce(sum(price) filter (where commitment_id is null), 0),
    coalesce(sum(price) filter (where commitment_id is not null), 0),
    coalesce(count(*) filter (where commitment_id is null), 0)::int
  into v_variable_total, v_fixed_total, v_expenses_count
  from public.expenses
  where family_id = p_family_id
    and created_at >= p_period_start::timestamptz
    and created_at < p_period_end::timestamptz;

  -- Income extra del ciclo (income_events: arrastres "acumular", bonos,
  -- transferencias). Es parte del income real del ciclo y por eso entra al
  -- sobrante decidible. Ventana por event_date, igual que el resto del app.
  select coalesce(sum(amount), 0) into v_extra_income
  from public.income_events
  where family_id = p_family_id
    and event_date >= p_period_start
    and event_date < p_period_end;

  -- Count of fixed expenses paid in the period.
  select count(*)::int into v_fixed_paid_count
  from public.fixed_expense_payments fep
  join public.fixed_expenses fe on fe.id = fep.fixed_expense_id
  where fe.family_id = p_family_id
    and fep.period_month >= p_period_start
    and fep.period_month < p_period_end;

  -- Category breakdown (variable only).
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'category_id', cat_id,
      'name', cat_name,
      'color', cat_color,
      'total', cat_total,
      'count', cat_count,
      'pct', case when v_variable_total > 0
        then round((cat_total / v_variable_total) * 100, 1)
        else 0::numeric end
    ) order by cat_total desc
  ), '[]'::jsonb) into v_category_breakdown
  from (
    select
      c.id as cat_id,
      c.name as cat_name,
      c.color as cat_color,
      sum(e.price)::numeric as cat_total,
      count(*)::int as cat_count
    from public.expenses e
    left join public.categories c on c.id = e.category_id
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_period_start::timestamptz
      and e.created_at < p_period_end::timestamptz
    group by c.id, c.name, c.color
  ) x;

  -- Daily totals (for sparkline).
  select coalesce(jsonb_agg(
    jsonb_build_object('day', d::text, 'total', daily_total)
    order by d asc
  ), '[]'::jsonb) into v_daily_totals
  from (
    select date(e.created_at) as d, sum(e.price)::numeric as daily_total
    from public.expenses e
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_period_start::timestamptz
      and e.created_at < p_period_end::timestamptz
    group by date(e.created_at)
  ) x;

  -- Per-member contribution.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', member_id,
      'display_name', coalesce(member_name, 'Usuario'),
      'total', member_total,
      'count', member_count
    ) order by member_total desc
  ), '[]'::jsonb) into v_by_member
  from (
    select
      e.created_by as member_id,
      p.display_name as member_name,
      sum(e.price)::numeric as member_total,
      count(*)::int as member_count
    from public.expenses e
    left join public.profiles p on p.id = e.created_by
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_period_start::timestamptz
      and e.created_at < p_period_end::timestamptz
    group by e.created_by, p.display_name
  ) x;

  -- Top expense (variable, highest price).
  select jsonb_build_object(
    'id', e.id,
    'description', e.description,
    'price', e.price,
    'category_id', e.category_id,
    'created_at', e.created_at
  ) into v_top_expense
  from public.expenses e
  where e.family_id = p_family_id
    and e.commitment_id is null
    and e.created_at >= p_period_start::timestamptz
    and e.created_at < p_period_end::timestamptz
  order by e.price desc, e.created_at desc
  limit 1;

  -- Delta vs previous rollup (whose period_end == this period_start).
  select total_variable_spent into v_previous_total
  from public.monthly_summaries
  where family_id = p_family_id and period_end = p_period_start
  limit 1;

  if v_previous_total is not null and v_previous_total > 0 then
    v_delta_pct := round(
      ((v_variable_total - v_previous_total) / v_previous_total) * 100,
      1
    );
  end if;

  -- Mood = how the cycle went vs expected variable budget.
  v_expected_monthly := greatest(
    0,
    coalesce(v_finance.monthly_income, 0)
      - coalesce(v_finance.savings_goal, 0)
      - v_fixed_total
  );
  v_mood := case
    when v_expected_monthly = 0 then null
    when v_variable_total <= v_expected_monthly * 0.85 then 'green'
    when v_variable_total <= v_expected_monthly then 'yellow'
    else 'red'
  end;

  v_period_label := (case extract(month from p_period_start)::int
    when 1 then 'Enero'
    when 2 then 'Febrero'
    when 3 then 'Marzo'
    when 4 then 'Abril'
    when 5 then 'Mayo'
    when 6 then 'Junio'
    when 7 then 'Julio'
    when 8 then 'Agosto'
    when 9 then 'Septiembre'
    when 10 then 'Octubre'
    when 11 then 'Noviembre'
    when 12 then 'Diciembre'
  end) || ' ' || extract(year from p_period_start)::text;

  -- Upsert the summary.
  insert into public.monthly_summaries (
    family_id, period_start, period_end, period_label,
    total_variable_spent, total_fixed_spent, total_spent,
    expenses_count, fixed_paid_count,
    monthly_income, savings_goal_amount, savings_delta, extra_income,
    category_breakdown, daily_totals, by_member, top_expense,
    delta_vs_previous_percent, mood
  )
  values (
    p_family_id, p_period_start, p_period_end, v_period_label,
    v_variable_total, v_fixed_total, v_variable_total + v_fixed_total,
    v_expenses_count, v_fixed_paid_count,
    coalesce(v_finance.monthly_income, 0),
    coalesce(v_finance.savings_goal, 0),
    greatest(0, coalesce(v_finance.monthly_income, 0) - (v_variable_total + v_fixed_total)),
    v_extra_income,
    v_category_breakdown, v_daily_totals, v_by_member, v_top_expense,
    v_delta_pct, v_mood
  )
  on conflict (family_id, period_start) do update set
    period_end = excluded.period_end,
    period_label = excluded.period_label,
    total_variable_spent = excluded.total_variable_spent,
    total_fixed_spent = excluded.total_fixed_spent,
    total_spent = excluded.total_spent,
    expenses_count = excluded.expenses_count,
    fixed_paid_count = excluded.fixed_paid_count,
    monthly_income = excluded.monthly_income,
    savings_goal_amount = excluded.savings_goal_amount,
    savings_delta = excluded.savings_delta,
    extra_income = excluded.extra_income,
    category_breakdown = excluded.category_breakdown,
    daily_totals = excluded.daily_totals,
    by_member = excluded.by_member,
    top_expense = excluded.top_expense,
    delta_vs_previous_percent = excluded.delta_vs_previous_percent,
    mood = excluded.mood
  returning id into v_summary_id;

  -- Archive the underlying expenses (soft delete via archived_at).
  update public.expenses
  set archived_at = now()
  where family_id = p_family_id
    and created_at >= p_period_start::timestamptz
    and created_at < p_period_end::timestamptz
    and archived_at is null;

  return jsonb_build_object(
    'status', 'closed',
    'id', v_summary_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'period_label', v_period_label,
    'variable_total', v_variable_total,
    'fixed_total', v_fixed_total,
    'extra_income', v_extra_income,
    'expenses_count', v_expenses_count
  );
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) apply_month_close_decision: incluir extra_income en el sobrante, así el
--    monto del income_event del "acumular" (= el que se arrastra al ciclo
--    SIGUIENTE) usa el sobrante REAL. NO re-arrastra el extra del ciclo origen:
--    ese ya es un income_event histórico, contado una sola vez.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.apply_month_close_decision(p_monthly_summary_id uuid, p_decision text, p_meta_goal_id uuid default null::uuid, p_new_cycle_anchor text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_summary record;
  v_sobrante numeric;
  v_decision_id uuid;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  select id, family_id, period_label, monthly_income, extra_income, total_spent, savings_goal_amount
    into v_summary
    from public.monthly_summaries
   where id = p_monthly_summary_id;

  if not found then
    raise exception 'monthly_summary not accessible';
  end if;

  if not exists (
    select 1 from public.family_members
    where family_id = v_summary.family_id
      and user_id = v_user_id
      and role <> 'blocked'
  ) then
    raise exception 'monthly_summary not accessible';
  end if;

  if not public.is_family_owner(v_summary.family_id) then
    raise exception 'only family owner can apply month close decision';
  end if;

  if p_decision not in ('meta', 'acumular', 'reserva', 'skip') then
    raise exception 'invalid decision';
  end if;

  if p_decision = 'meta' and p_meta_goal_id is null then
    raise exception 'meta decision requires meta_goal_id';
  end if;

  if p_meta_goal_id is not null then
    if not exists (
      select 1
        from public.savings_goals
       where id = p_meta_goal_id
         and family_id = v_summary.family_id
    ) then
      raise exception 'meta goal does not belong to family';
    end if;
  end if;

  perform public.check_rate_limit('apply_month_close_decision', 5, 3600);

  -- Sobrante decidible = (sueldo base + income extra del ciclo) − gastos −
  -- ahorro comprometido. El `extra_income` (arrastres/bonos) es income real
  -- del ciclo; sin él, un ciclo con arrastre > gastos daba 0 y nunca ofrecía
  -- la decisión.
  v_sobrante := greatest(
    0,
    coalesce(v_summary.monthly_income, 0)
      + coalesce(v_summary.extra_income, 0)
      - coalesce(v_summary.total_spent, 0)
      - coalesce(v_summary.savings_goal_amount, 0)
  );

  insert into public.month_close_decisions (
    family_id, monthly_summary_id, sobrante, decision, meta_goal_id, decided_by
  ) values (
    v_summary.family_id, p_monthly_summary_id, v_sobrante,
    p_decision, p_meta_goal_id, v_user_id
  )
  returning id into v_decision_id;

  if p_decision = 'meta' then
    update public.savings_goals
       set current_amount = current_amount + v_sobrante,
           updated_at = now()
     where id = p_meta_goal_id and family_id = v_summary.family_id;
  elsif p_decision = 'acumular' and v_sobrante > 0 then
    -- Sumar al mes = un ingreso extra del ciclo SIGUIENTE. Entra al mismo
    -- pipeline que transferencias/bonos: disponible del Home, cupo y
    -- proyección de Control, checkin matinal y card "Entró este ciclo".
    insert into public.income_events (
      family_id, created_by, amount, kind, description, event_date
    ) values (
      v_summary.family_id,
      v_user_id,
      least(v_sobrante, 1000000000),
      'other',
      'Sobrante de ' || coalesce(v_summary.period_label, 'mes anterior'),
      (now() at time zone 'America/Argentina/Buenos_Aires')::date
    );
  elsif p_decision = 'reserva' then
    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) + v_sobrante,
           updated_at = now()
     where family_id = v_summary.family_id;
  end if;

  insert into public.audit_log (user_id, family_id, action, target_table, target_id, payload)
  values (
    v_user_id,
    v_summary.family_id,
    'apply_month_close_decision',
    'month_close_decisions',
    v_decision_id,
    jsonb_build_object(
      'monthly_summary_id', p_monthly_summary_id,
      'decision', p_decision,
      'sobrante', v_sobrante,
      'meta_goal_id', p_meta_goal_id,
      'new_cycle_anchor', p_new_cycle_anchor
    )
  );
end;
$function$;
