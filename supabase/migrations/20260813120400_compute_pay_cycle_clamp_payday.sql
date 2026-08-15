-- Ciclo extendido · 5/5 — fix del día 31 en compute_pay_cycle.
--
-- ARCHIVO SEPARADO A PROPÓSITO. Las migraciones 1-4 de esta tanda son
-- dormantes: no mueven un solo número del build de producción. Esta SÍ los
-- mueve, para las familias con salary_payment_day > 28. Va en su propio commit
-- y con su propio sign-off.
--
-- El bug (doc §6): la rama del régimen mensual compara el día de hoy contra el
-- payday SIN CLAMPEAR:
--
--     if extract(day from p_today)::int >= v_day then   -- v_day = 31
--
-- y recién clampea al construir la fecha. Con salary_payment_day = 31 y
-- p_today = 2026-06-30 (junio tiene 30 días):
--     30 >= 31  → false  → rama "else" → cycle_start = 31-may
--     cycle_end = 31-may + 1 mes = 30-jun
--     ventana [31-may → 30-jun)  ← NO CONTIENE al 30-jun que se consultó.
--
-- El cliente nunca tuvo este bug: `buildPayDate` clampea ANTES de comparar
-- (mobile/utils/pay-cycle.ts), así que este fix AUMENTA la paridad app↔server
-- en vez de romperla.
--
-- El fix: clampear el payday al último día del mes consultado y comparar contra
-- ese payday EFECTIVO. Para todo salary_payment_day <= 28 la expresión es
-- idénticamente igual a la anterior (least(day, ultimo_dia) = day siempre),
-- así que el cambio sólo alcanza a las familias con día 29/30/31.
--
-- Exposición viva al momento de escribir esto: 2 familias en producción
-- (payday 29 y payday 31).

create or replace function public.compute_pay_cycle(
  p_today date,
  p_cycle_type text,
  p_salary_payment_day smallint,
  p_cycle_anchor_date date,
  p_cycle_length_days smallint
)
returns table (cycle_start date, cycle_end_exclusive date, cycle_days integer)
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_day int;
  v_month_last_day int;
  v_prev_month_last_day int;
  v_next_month_last_day int;
  v_payday_this int;
  v_next_month timestamp;
  v_diff_days int;
  v_period_index int;
begin
  if p_cycle_type = 'monthly' then
    v_day := greatest(1, coalesce(p_salary_payment_day::int, 1));

    -- Último día del mes de `p_today` y payday EFECTIVO de ese mes.
    v_month_last_day := extract(day from
      (date_trunc('month', p_today) + interval '1 month' - interval '1 day')
    )::int;
    v_payday_this := least(v_day, v_month_last_day);

    -- Comparar contra el payday clampeado, no contra el número configurado:
    -- espeja `todayNormalized >= currentMonthPayDate` del cliente, donde
    -- `currentMonthPayDate` ya viene clampeado por buildPayDate.
    if extract(day from p_today)::int >= v_payday_this then
      cycle_start := make_date(
        extract(year from p_today)::int,
        extract(month from p_today)::int,
        v_payday_this
      );
    else
      v_prev_month_last_day := extract(day from
        (date_trunc('month', p_today) - interval '1 day')
      )::int;
      cycle_start := make_date(
        extract(year from (p_today - interval '1 month'))::int,
        extract(month from (p_today - interval '1 month'))::int,
        least(v_day, v_prev_month_last_day)
      );
    end if;

    -- SEGUNDO bug del mismo helper: `cycle_start + interval '1 month'` deriva
    -- el fin del día YA CLAMPEADO, no del payday configurado. Con día 31,
    -- cycle_start de junio es el 30 y el fin salía 30-jul... pero el payday de
    -- julio es el 31, así que la ventana [30-jun → 30-jul) dejaba al 30-jul
    -- sin ciclo. El fin tiene que ser el payday del mes SIGUIENTE, clampeado a
    -- ese mes — que es exactamente lo que hace el cliente:
    --   buildPayDate(cycleStart.getFullYear(), cycleStart.getMonth() + 1, paymentDay)
    v_next_month := date_trunc('month', cycle_start) + interval '1 month';
    v_next_month_last_day := extract(day from
      (v_next_month + interval '1 month' - interval '1 day')
    )::int;
    cycle_end_exclusive := make_date(
      extract(year from v_next_month)::int,
      extract(month from v_next_month)::int,
      least(v_day, v_next_month_last_day)
    );
    cycle_days := (cycle_end_exclusive - cycle_start)::int;
  else
    v_diff_days := (p_today - p_cycle_anchor_date)::int;
    v_period_index := floor(v_diff_days::numeric / p_cycle_length_days)::int;
    cycle_start := p_cycle_anchor_date + (v_period_index * p_cycle_length_days);
    cycle_end_exclusive := cycle_start + p_cycle_length_days;
    cycle_days := p_cycle_length_days;
  end if;
  return next;
end;
$function$;

-- compute_pay_cycle es un helper puro y client-facing (lo consumen home_snapshot,
-- cycle_disponible y try_close_previous_cycle). CREATE OR REPLACE preserva los
-- grants; se re-afirman por si esto corriera sobre una base sin ellos.
grant execute on function public.compute_pay_cycle(date, text, smallint, date, smallint)
  to anon, authenticated;
