-- ════════════════════════════════════════════════════════════════════
-- FIXES de la auditoría backend completa (2026-07-08).
--
-- Técnica: CIRUGÍA sobre la definición VIVA (pg_get_functiondef →
-- replace con ancla única verificada → execute). Verbatim-base por
-- construcción: ancla ambigua (>1) ABORTA; ancla ausente (0) emite
-- WARNING y omite el parche — en prod nunca pasa (anclas verificadas
-- 1/1 antes de aplicar), pero un replay en entorno fresco (db reset /
-- preview branch) cuya cadena local difiera del vivo de prod no debe
-- romper el provisioning entero. Nota para el drift checker: las
-- funciones tocadas acá divergen del último archivo local con CREATE —
-- este archivo es la fuente del delta.
--
-- Hallazgos (agentes A y B de la auditoría):
--  A1 recompute_family_income escribía Σ contribuciones en
--     monthly_income SIN mirar income_mode → el "sueldo fantasma" de
--     los hogares dinámicos era estado NORMAL, no residuo (root cause).
--  A2 compute_control_snapshot: baseline de stress desde monthly_income
--     crudo → overshoot engañoso (fantasma) o 0 perpetuo en dinámico.
--  A3 tr_award_first_cycle_under_budget: leía family_finance en vivo →
--     dinámico NUNCA ganaba el logro (o contra sueldo fantasma).
--  A4 user_current_cycle_start: fallback a inicio de MES calendario →
--     ventana equivocada para logros no-spend y gating de notifs
--     (dinámico Y fijos con día de cobro ≠ 1).
--  A5 trg_family_finance_on_salary_confirm: sin exención income_mode
--     (defensa en profundidad).
--  B1 resolve_subscription_intent (downgrade): sin validar p_new_amount
--     → un miembro podía dejar amount negativo/absurdo en un fijo.
--  B2 record_fixed_expense_payment: perdió su rate-limit dedicado en la
--     redefinición 20260530120000 (regresión, mitigada por el trigger
--     de expenses) → restaurado.
--  B3 declare_subscription_intent: sin rate-limit ni dedup → intents
--     ilimitados.
--  B4 advance_fixed_expense_due_date(date,text): wrapper legacy con
--     firma ambigua vs la 3-arg (PGRST203 latente). 0 llamadores
--     verificados (prosrc de las 156 funciones + grep del cliente).
--  B5 db_health_snapshot: referenciaba public.pg_stat_statements (vive
--     en schema extensions) → la sección Slow Queries siempre vacía.
-- ════════════════════════════════════════════════════════════════════

create or replace function pg_temp.patch_fn(p_fn regprocedure, p_from text, p_to text)
returns void language plpgsql as $helper$
declare
  src text;
  n int;
begin
  src := pg_get_functiondef(p_fn);
  n := (length(src) - length(replace(src, p_from, ''))) / length(p_from);
  if n > 1 then
    raise exception 'patch_fn %: ancla ambigua (% veces)', p_fn, n;
  end if;
  if n = 0 then
    raise warning 'patch_fn %: ancla ausente — parche omitido (replay en entorno fresco)', p_fn;
    return;
  end if;
  execute replace(src, p_from, p_to);
end;
$helper$;

create or replace function pg_temp.patch_fn_after_begin(p_fn regprocedure, p_insert text)
returns void language plpgsql as $helper$
declare
  src text;
  i int;
begin
  src := pg_get_functiondef(p_fn);
  i := position(E'\nbegin\n' in src);
  if i = 0 then
    raise exception 'patch_fn_after_begin %: sin bloque begin', p_fn;
  end if;
  execute substring(src, 1, i + 6) || p_insert || substring(src, i + 7);
end;
$helper$;

-- A1 · recompute_family_income: dinámico ⇒ monthly_income 0 (2 ramas)
select pg_temp.patch_fn(
  'public.recompute_family_income()'::regprocedure,
  'on conflict (family_id) do update
    set monthly_income = excluded.monthly_income;',
  'on conflict (family_id) do update
    -- DINÁMICO: el sueldo del hogar NO deriva de contribuciones — sin
    -- esta exención cada alta/cambio de miembro re-estampaba un sueldo
    -- fantasma >0 en hogares dinámicos (root cause auditoría 2026-07-08).
    set monthly_income = case
      when coalesce(family_finance.income_mode, ''fixed'') = ''dynamic'' then 0
      else excluded.monthly_income end;');

select pg_temp.patch_fn(
  'public.recompute_family_income()'::regprocedure,
  'update public.family_finance
    set monthly_income = v_total
    where family_finance.family_id = old.family_id;',
  'update public.family_finance
    set monthly_income = case
      when coalesce(family_finance.income_mode, ''fixed'') = ''dynamic'' then 0
      else v_total end
    where family_finance.family_id = old.family_id;');

-- A2 · compute_control_snapshot: baseline dinámico = Σ income_events
--      del ciclo elegido (misma ventana que cycle_disponible/velocity)
select pg_temp.patch_fn(
  'public.compute_control_snapshot(uuid)'::regprocedure,
  'v_libre := coalesce(v_finance.monthly_income, 0)
           - coalesce((
               select sum(fe.amount)
               from public.fixed_expenses fe
               where fe.family_id = p_family_id
                 and coalesce(fe.status, ''active'') = ''active''
             ), 0);',
  '-- DINÁMICO (auditoría 2026-07-08): el presupuesto sale de los
  -- ingresos reales del ciclo elegido, no del sueldo (que puede quedar
  -- >0 por contribuciones). Misma ventana que cycle_disponible.
  if coalesce(v_finance.income_mode, ''fixed'') = ''dynamic'' then
    select coalesce(sum(ie.amount), 0) into v_libre
    from public.compute_pay_cycle(
      current_date,
      coalesce(v_finance.cycle_type, ''monthly''),
      coalesce(v_finance.salary_payment_day, 1)::smallint,
      v_finance.cycle_anchor_date,
      v_finance.cycle_length_days
    ) cp
    left join public.income_events ie
      on ie.family_id = p_family_id
     and ie.event_date >= cp.cycle_start
     and ie.event_date < cp.cycle_end_exclusive;
    v_libre := v_libre - coalesce((
        select sum(fe.amount)
        from public.fixed_expenses fe
        where fe.family_id = p_family_id
          and coalesce(fe.status, ''active'') = ''active''
      ), 0);
  else
    v_libre := coalesce(v_finance.monthly_income, 0)
             - coalesce((
                 select sum(fe.amount)
                 from public.fixed_expenses fe
                 where fe.family_id = p_family_id
                   and coalesce(fe.status, ''active'') = ''active''
               ), 0);
  end if;');

-- A3 · logro "cerraste bajo presupuesto": presupuesto desde la FILA del
--      cierre (defensiva por modo, inmune al sueldo fantasma)
select pg_temp.patch_fn(
  'public.tr_award_first_cycle_under_budget()'::regprocedure,
  'select monthly_income into v_total_budget
  from public.family_finance
  where family_id = new.family_id;
  if v_total_budget is null or v_total_budget <= 0 then return new; end if;',
  '-- Presupuesto desde la FILA del cierre (auditoría 2026-07-08): en
  -- dinámico monthly_income=0 y extra_income = Σ ingresos del ciclo —
  -- leer family_finance en vivo hacía que dinámico NUNCA ganara el
  -- logro (o lo evaluara contra un sueldo fantasma).
  v_total_budget := coalesce(new.monthly_income, 0) + coalesce(new.extra_income, 0);
  if v_total_budget <= 0 then return new; end if;');

-- A5 · trigger de salary-confirm: exención income_mode (defensa)
select pg_temp.patch_fn(
  'public.trg_family_finance_on_salary_confirm()'::regprocedure,
  'and OLD.current_cycle_anchor is not null then',
  'and OLD.current_cycle_anchor is not null
       -- DINÁMICO: no hay confirm de cobro; los cierres van por cron.
       and coalesce(NEW.income_mode, ''fixed'') <> ''dynamic'' then');

-- B1 · resolve_subscription_intent: validar p_new_amount en downgrade
select pg_temp.patch_fn(
  'public.resolve_subscription_intent(uuid, text, numeric)'::regprocedure,
  'elsif v_intent = ''downgrade'' and p_new_amount is not null then
      update public.fixed_expenses',
  'elsif v_intent = ''downgrade'' and p_new_amount is not null then
      -- Auditoría 2026-07-08: sin cap, cualquier miembro activo podía
      -- dejar amount negativo/absurdo que se propaga como precio base.
      if p_new_amount <= 0 or p_new_amount > 1000000000 then
        raise exception ''invalid new amount'' using errcode = ''22023'';
      end if;
      update public.fixed_expenses');

-- B2 · record_fixed_expense_payment: restaurar rate limit (regresión
--      de 20260530120000; enforce también re-chequea auth)
select pg_temp.patch_fn_after_begin(
  'public.record_fixed_expense_payment(uuid, numeric)'::regprocedure,
  E'  perform public.enforce_rate_limit(''record_fixed_expense_payment'', 30, 60);\n');

-- B3 · declare_subscription_intent: rate limit
select pg_temp.patch_fn(
  'public.declare_subscription_intent(uuid, text, text)'::regprocedure,
  'if p_intent not in (''cancel'', ''pause'', ''downgrade'') then',
  'perform public.enforce_rate_limit(''declare_subscription_intent'', 10, 3600);

  if p_intent not in (''cancel'', ''pause'', ''downgrade'') then');

-- B5 · db_health: pg_stat_statements vive en el schema extensions —
--      la sección Slow Queries estaba siempre vacía (handler la tragaba)
select pg_temp.patch_fn(
  'public.db_health_snapshot()'::regprocedure,
  'public.pg_stat_statements',
  'extensions.pg_stat_statements');

-- A4 · user_current_cycle_start: ventana REAL vía compute_pay_cycle
--      (dinámico sigue su ciclo; fijo la mensual del día de cobro) —
--      antes: coalesce(anchor, inicio de mes calendario).
create or replace function public.user_current_cycle_start(p_family_id uuid)
returns date
language sql
stable
security definer
set search_path to 'public'
as $function$
  select cp.cycle_start
  from public.family_finance ff
  cross join lateral public.compute_pay_cycle(
    current_date,
    case when coalesce(ff.income_mode, 'fixed') = 'dynamic'
         then coalesce(ff.cycle_type, 'monthly')
         else 'monthly' end,
    coalesce(ff.salary_payment_day, 1)::smallint,
    ff.cycle_anchor_date,
    ff.cycle_length_days
  ) cp
  where ff.family_id = p_family_id
  limit 1;
$function$;

revoke execute on function public.user_current_cycle_start(uuid)
  from public, anon, authenticated;

-- B4 · drop del wrapper legacy ambiguo (0 llamadores verificados en
--      prosrc de las 156 funciones y en el cliente; la 3-arg con
--      default cubre cualquier llamada 2-arg futura)
drop function if exists public.advance_fixed_expense_due_date(date, text);
