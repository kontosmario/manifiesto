-- Ciclo extendido · 2/5 — close_monthly_cycle dual-mode.
--
-- El cierre es 100% server y es exactamente donde nace (o se evita) el doble
-- conteo. Los llamadores (cron `cron_close_previous_cycles` y trigger
-- `trg_family_finance_salary_confirm`, ambos vía try_close_previous_cycle)
-- siguen proponiendo ventanas NOMINALES y NO se tocan: la ventana real se
-- deriva acá adentro, solo para familias con `cycle_model = 'extended'`.
--
--   nominal  (todas las familias hoy): v_start/v_end = los params → la función
--            es equivalente byte por byte a la versión vigente, salvo el
--            dual-write de `nominal_period_end` (columna que ningún cliente
--            de producción lee: todos usan selects de columnas explícitas).
--   extended (solo build V2): la ventana arranca donde REALMENTE terminó el
--            ciclo anterior (encadenado por period_end) y termina en la fecha
--            de confirmación del cobro (current_cycle_anchor).
--
-- Propiedad que hace sólido el modelo: los ciclos quedan CONTIGUOS, sin huecos
-- ni solapamientos — cada gasto pertenece a exactamente un ciclo. El anchor es
-- el MISMO string de fecha que el cliente V2 estampa como arranque del ciclo
-- nuevo, y el trigger es AFTER UPDATE (ve el row nuevo en la misma transacción)
-- → period_end == anchor == arranque del cliente POR CONSTRUCCIÓN.
--
-- IMPORTANTE (drift del ledger): esta redefinición parte del cuerpo DEPLOYED en
-- producción, no del archivo 20260708202341 del repo. La diferencia es el ancla
-- de zona horaria de `daily_totals` (`at time zone 'America/Argentina/
-- Buenos_Aires'`), que 20260722174332 aplica por text-patch sobre la definición
-- viva. Reemplazar a partir del archivo del repo REGRESARÍA ese fix.
--
-- NO lleva clamp en la rama legacy. Un clamp por `max(period_end)` global
-- parecía inocuo, pero producción tiene familias con summaries solapados
-- legítimos (hogares `dynamic` que arrastran un summary mensual viejo y encima
-- summaries semanales): ahí `max(period_end)` > `p_period_start` y el clamp
-- habría devuelto una ventana vacía, saltándose el cierre. La rama nominal usa
-- los params tal cual, sin excepción.

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
  v_family_created timestamptz;
  v_is_dynamic boolean := false;
  v_days int;
  v_label_start_abbr text;
  v_label_end_abbr text;
  -- Ciclo extendido:
  v_extended boolean := false;
  v_prev_end date;
  v_start date;
  v_end date;
  v_tz constant text := 'America/Argentina/Buenos_Aires';
begin
  -- Finance primero: la ventana efectiva depende del modelo de ciclo, y la
  -- comprobación de idempotencia depende de la ventana. Cargar el row no tiene
  -- efectos secundarios, así que el orden observable de los guards no cambia.
  select * into v_finance from public.family_finance where family_id = p_family_id;
  v_is_dynamic := coalesce(v_finance.income_mode, 'fixed') = 'dynamic';

  -- Gate del modelo extendido. `p_force` lo desactiva a propósito: un
  -- recompute manual del operador honra los params textuales que le pasan.
  v_extended :=
    coalesce(v_finance.cycle_model, 'nominal') = 'extended'
    and not v_is_dynamic
    and coalesce(v_finance.cycle_type, 'monthly') = 'monthly'
    and not p_force;

  if v_extended then
    -- Encadenar con el fin REAL del ciclo anterior. Acotado a los summaries
    -- que terminan en/antes del fin nominal de ESTE ciclo: sin ese filtro, un
    -- summary histórico solapado (legado de un cambio de modelo de ciclo)
    -- envenenaría el arranque.
    select max(ms.period_end) into v_prev_end
    from public.monthly_summaries ms
    where ms.family_id = p_family_id
      and ms.period_end <= p_period_end;

    v_start := coalesce(v_prev_end, p_period_start);
    -- Piso defensivo: una familia con huecos históricos absorbe el gap en un
    -- solo ciclo largo, pero nunca uno absurdo.
    v_start := greatest(v_start, p_period_end - 185);

    -- Fin real = fecha de confirmación del cobro. `current_cycle_anchor` es la
    -- fuente PRIMARIA: es el string exacto (fecha local) que el cliente V2
    -- estampa como arranque de su ciclo nuevo, así que las tres vistas
    -- (summary, server, cliente) comparten frontera sin off-by-one de tz.
    -- Fallback: la fecha local de last_salary_confirmed_at. Techo defensivo
    -- contra un anchor corrupto.
    v_end := least(
      greatest(
        p_period_end,
        coalesce(
          v_finance.current_cycle_anchor,
          (v_finance.last_salary_confirmed_at at time zone v_tz)::date,
          p_period_end
        )
      ),
      p_period_end + 185
    );

    if v_start >= v_end then
      return jsonb_build_object(
        'status', 'window_empty',
        'period_start', v_start,
        'period_end', v_end
      );
    end if;
  else
    -- Rama nominal: los params, sin tocar. Idéntica a la versión vigente.
    v_start := p_period_start;
    v_end := p_period_end;
  end if;

  -- Idempotency: already closed for this exact period?
  select id into v_existing_id
  from public.monthly_summaries
  where family_id = p_family_id and period_start = v_start;

  if v_existing_id is not null and not p_force then
    return jsonb_build_object(
      'status', 'already_closed',
      'id', v_existing_id,
      'period_start', v_start
    );
  end if;

  -- Guard 0 (ANTI-FANTASMA, de 20260625040000 — preservado en esta
  -- redefinición): no cerrar un ciclo que terminó ANTES de que la familia
  -- existiera. Una cuenta onboardeada mid-ciclo tiene un "ciclo anterior"
  -- que predata la familia; el cron nocturno lo cerraba con savings_delta
  -- = sueldo entero → modal de sobrante falso.
  -- Los tres guards se evalúan sobre los params NOMINALES: la extensión no
  -- cambia cuándo corresponde cerrar, solo qué ventana se archiva.
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

  -- Guard 2: user must have confirmed the next salary. Familias en modo
  -- 'dynamic' no tienen cobro fijo que confirmar -> el guard no aplica
  -- (sin esto, sus ciclos no cerrarian nunca).
  if not p_force and coalesce(v_finance.income_mode, 'fixed') <> 'dynamic' and (
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
    and created_at >= v_start::timestamptz
    and created_at < v_end::timestamptz;

  -- Income extra del ciclo (income_events: arrastres "acumular", bonos,
  -- transferencias). Es parte del income real del ciclo y por eso entra al
  -- sobrante decidible. Ventana por event_date, igual que el resto del app.
  select coalesce(sum(amount), 0) into v_extra_income
  from public.income_events
  where family_id = p_family_id
    and event_date >= v_start
    and event_date < v_end;

  -- Count of fixed expenses paid in the period.
  select count(*)::int into v_fixed_paid_count
  from public.fixed_expense_payments fep
  join public.fixed_expenses fe on fe.id = fep.fixed_expense_id
  where fe.family_id = p_family_id
    and fep.period_month >= v_start
    and fep.period_month < v_end;

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
      and e.created_at >= v_start::timestamptz
      and e.created_at < v_end::timestamptz
    group by c.id, c.name, c.color
  ) x;

  -- Daily totals (for sparkline). El ancla de tz AR (20260722174332) hace que
  -- los días se bucketeen por fecha LOCAL: sin ella, los gastos de 21:00-23:59
  -- caían en el día siguiente y el calendario de intensidad mentía.
  select coalesce(jsonb_agg(
    jsonb_build_object('day', d::text, 'total', daily_total)
    order by d asc
  ), '[]'::jsonb) into v_daily_totals
  from (
    select date(e.created_at at time zone 'America/Argentina/Buenos_Aires') as d, sum(e.price)::numeric as daily_total
    from public.expenses e
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= v_start::timestamptz
      and e.created_at < v_end::timestamptz
    group by date(e.created_at at time zone 'America/Argentina/Buenos_Aires')
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
      and e.created_at >= v_start::timestamptz
      and e.created_at < v_end::timestamptz
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
    and e.created_at >= v_start::timestamptz
    and e.created_at < v_end::timestamptz
  order by e.price desc, e.created_at desc
  limit 1;

  -- Delta vs previous rollup (whose period_end == this period_start).
  select total_variable_spent into v_previous_total
  from public.monthly_summaries
  where family_id = p_family_id and period_end = v_start
  limit 1;

  if v_previous_total is not null and v_previous_total > 0 then
    v_delta_pct := round(
      ((v_variable_total - v_previous_total) / v_previous_total) * 100,
      1
    );
  end if;

  -- Mood = how the cycle went vs expected variable budget.
  -- DINÁMICO: el presupuesto esperado no sale del sueldo (=0) sino de
  -- los ingresos reales del ciclo — sin esto mood quedaba null y la
  -- notificación de cierre nunca decía "Guardaste $X".
  v_expected_monthly := case
    when v_is_dynamic then greatest(0, v_extra_income - v_fixed_total)
    else greatest(
      0,
      coalesce(v_finance.monthly_income, 0)
        - coalesce(v_finance.savings_goal, 0)
        - v_fixed_total
    )
  end;
  v_mood := case
    when v_expected_monthly = 0 then null
    when v_variable_total <= v_expected_monthly * 0.85 then 'green'
    when v_variable_total <= v_expected_monthly then 'yellow'
    else 'red'
  end;

  -- Ciclos CORTOS (semana/quincena, <21 días): rango "7–13 jul 2026" en
  -- vez del nombre de mes que se repetiría 2-4 veces por mes (dinámico Y
  -- sueldos rolling — mismo criterio que el wrapped en cliente).
  -- period_end es exclusivo → el último día mostrado es period_end - 1.
  -- Con ciclo extendido la etiqueta describe la ventana REAL (39 días
  -- "Junio 2026", no "20 jun – 27 jul"): pasa el umbral de 21 y cae en la
  -- rama de nombre de mes, que es lo que el usuario espera leer.
  v_days := (v_end - v_start);
  if v_days > 0 and v_days < 21 then
    v_label_start_abbr := case extract(month from v_start)::int
      when 1 then 'ene' when 2 then 'feb' when 3 then 'mar' when 4 then 'abr'
      when 5 then 'may' when 6 then 'jun' when 7 then 'jul' when 8 then 'ago'
      when 9 then 'sep' when 10 then 'oct' when 11 then 'nov' when 12 then 'dic' end;
    v_label_end_abbr := case extract(month from (v_end - 1))::int
      when 1 then 'ene' when 2 then 'feb' when 3 then 'mar' when 4 then 'abr'
      when 5 then 'may' when 6 then 'jun' when 7 then 'jul' when 8 then 'ago'
      when 9 then 'sep' when 10 then 'oct' when 11 then 'nov' when 12 then 'dic' end;
    if date_trunc('month', v_start::timestamp) = date_trunc('month', (v_end - 1)::timestamp) then
      v_period_label := extract(day from v_start)::int::text
        || '–' || extract(day from (v_end - 1))::int::text
        || ' ' || v_label_end_abbr
        || ' ' || extract(year from (v_end - 1))::text;
    else
      v_period_label := extract(day from v_start)::int::text || ' ' || v_label_start_abbr
        || ' – ' || extract(day from (v_end - 1))::int::text || ' ' || v_label_end_abbr
        || ' ' || extract(year from (v_end - 1))::text;
    end if;
  else
    v_period_label := (case extract(month from v_start)::int
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
    end) || ' ' || extract(year from v_start)::text;
  end if;

  -- Upsert the summary.
  insert into public.monthly_summaries (
    family_id, period_start, period_end, nominal_period_end, period_label,
    total_variable_spent, total_fixed_spent, total_spent,
    expenses_count, fixed_paid_count,
    monthly_income, savings_goal_amount, savings_delta, extra_income,
    category_breakdown, daily_totals, by_member, top_expense,
    delta_vs_previous_percent, mood
  )
  values (
    -- period_end = fin REAL; nominal_period_end = el payday configurado.
    -- En modo nominal ambos coinciden (dual-write inocuo); en extendido la
    -- diferencia es lo que la UI del build V2 pinta como días de extensión.
    p_family_id, v_start, v_end, p_period_end, v_period_label,
    v_variable_total, v_fixed_total, v_variable_total + v_fixed_total,
    v_expenses_count, v_fixed_paid_count,
    -- DINÁMICO: sueldo/ahorro 0 (defensivo vs. monthly_income stale de
    -- un hogar que cambió de modo — sin esto el sobrante decidible y el
    -- wrapped inflaban con un sueldo fantasma) y savings_delta desde los
    -- ingresos REALES del ciclo (antes quedaba 0 siempre y la notificación
    -- de cierre nunca decía "Guardaste $X").
    case when v_is_dynamic then 0 else coalesce(v_finance.monthly_income, 0) end,
    case when v_is_dynamic then 0 else coalesce(v_finance.savings_goal, 0) end,
    case when v_is_dynamic
         then greatest(0, v_extra_income - (v_variable_total + v_fixed_total))
         else greatest(0, coalesce(v_finance.monthly_income, 0) - (v_variable_total + v_fixed_total)) end,
    v_extra_income,
    v_category_breakdown, v_daily_totals, v_by_member, v_top_expense,
    v_delta_pct, v_mood
  )
  on conflict (family_id, period_start) do update set
    period_end = excluded.period_end,
    nominal_period_end = excluded.nominal_period_end,
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
  -- MISMA ventana que los totales: sin esto los gastos de la extensión no se
  -- archivarían y se recontarían en el ciclo siguiente (el doble conteo que es
  -- el riesgo #1 de esta feature).
  update public.expenses
  set archived_at = now()
  where family_id = p_family_id
    and created_at >= v_start::timestamptz
    and created_at < v_end::timestamptz
    and archived_at is null;

  return jsonb_build_object(
    'status', 'closed',
    'id', v_summary_id,
    'period_start', v_start,
    'period_end', v_end,
    'nominal_period_end', p_period_end,
    'extended', v_extended,
    'period_label', v_period_label,
    'variable_total', v_variable_total,
    'fixed_total', v_fixed_total,
    'extra_income', v_extra_income,
    'expenses_count', v_expenses_count
  );
end;
$function$;

-- Lockdown igual que el resto de las security-definer internas
-- (20260630034907): nadie la llama desde el cliente; entra por el cron y por
-- el trigger de confirmación, ambos server-side.
revoke execute on function public.close_monthly_cycle(uuid, date, date, boolean)
  from public, anon, authenticated;
