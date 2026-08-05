-- WHAT: Corta el CIERRE FANTASMA de ciclos en cuentas nuevas + limpia las filas
--       ya generadas.
-- WHY:  El cron nocturno `cron_close_previous_cycles` (3 AM) → `try_close_previous_cycle`
--       → `close_monthly_cycle` cierra el "ciclo anterior" de TODA familia sin
--       chequear si la familia existía en ese ciclo. Una cuenta nueva onboardeada
--       mid-ciclo (p.ej. 24/06, payday 5 → anchor 5/jun) tiene un "ciclo anterior"
--       (5/may–5/jun) que terminó ANTES de que la cuenta existiera; las 2 guardas
--       de close_monthly_cycle (ciclo terminó + sueldo confirmado) pasan por
--       casualidad → se crea un monthly_summary con savings_delta = sueldo entero
--       → salta el modal de "asignar sobrante". El fix 20260623120000 sólo cubrió
--       el TRIGGER de confirmar-sueldo (guarda OLD.current_cycle_anchor); el CRON
--       llama close_monthly_cycle DIRECTO, sin guarda. Esto cierra esa puerta.
-- FIX:  Guard 0 en close_monthly_cycle (sólo cuando NOT p_force): no cerrar un
--       ciclo cuyo period_end es <= la fecha de creación de la familia.

create or replace function public.close_monthly_cycle(
  p_family_id uuid,
  p_period_start date,
  p_period_end date,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing_id uuid;
  v_finance record;
  v_family_created timestamptz;
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

  -- Guard 0 (ANTI-FANTASMA): no cerrar un ciclo que terminó ANTES de que la
  -- familia existiera. Una cuenta nueva onboardeada mid-ciclo tiene un "ciclo
  -- anterior" (computado por try_close_previous_cycle) que predata la familia; el
  -- cron nocturno lo cerraba con savings_delta = sueldo entero → modal de sobrante
  -- falso. El fix del trigger (20260623120000) sólo cubría el confirm; el cron
  -- llama close_monthly_cycle directo. Esta guarda lo cubre para todos los callers
  -- automáticos (force=true sigue pudiendo cerrar lo que quiera).
  if not p_force then
    select created_at into v_family_created from public.families where id = p_family_id;
    if v_family_created is not null and v_family_created::date >= p_period_end then
      return jsonb_build_object(
        'status', 'family_too_new',
        'family_created', v_family_created,
        'period_end', p_period_end
      );
    end if;
  end if;

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

-- Limpieza: borrar las filas FANTASMA ya creadas por el cron (período que
-- terminó antes de que la familia existiera, sin gasto). Idempotente.
delete from public.monthly_summaries ms
using public.families f
where f.id = ms.family_id
  and ms.period_end <= f.created_at::date
  and ms.total_spent = 0
  and ms.expenses_count = 0;
