-- supabase/migrations/20260615050000_fix_closed_month_guard_usa_period_end.sql
--
-- Bug crítico de carga de gastos (device report 2026-06-12).
--
-- `guard_expense_not_in_closed_month` bloqueaba TODO gasto cuyo
-- `created_at` fuera anterior a `max(decided_at)` — el instante de
-- reloj en que el usuario tocó la decisión de cierre de mes. Eso es
-- incorrecto: el período que se cierra es [period_start, period_end)
-- del summary, NO el momento en que se tomó la decisión.
--
-- Repro real: el owner tomó la decisión "Sumar al mes" de Abril 2026
-- (period_end 2026-05-20) el 2026-06-12 a las 02:38 UTC. A partir de
-- ahí, cargar una captura con gastos del 11-jun fallaba con "ese
-- período ya está cerrado" — porque 11-jun < 12-jun-02:38, aunque
-- 11-jun está MUCHÍSIMO después del cierre real (20-may) y en un ciclo
-- perfectamente abierto. Cada insert del import reventaba server-side
-- (cero filas, el wizard mostraba "no se pudo cargar ningún
-- movimiento" / cargas parciales según la fecha de cada fila).
--
-- Fix: comparar la fecha LOCAL del gasto contra el `period_end` del
-- último período cerrado (no contra `decided_at`). Un gasto está en un
-- mes cerrado solo si su fecha local cae ANTES del fin de ese período.
--
-- Mantiene el bypass de service_role / SQL y el short-circuit de
-- UPDATE sin cambio de fecha del guard original
-- (20260612002200_sprint_g_backdate_closed_month_guard.sql).

create or replace function public.guard_expense_not_in_closed_month()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_close_end date;
  v_tz text;
  v_local_date date;
begin
  -- Bypass para service_role y sesiones SQL puras.
  if auth.role() is not distinct from 'service_role' then
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;

  -- En UPDATE, solo validar si created_at realmente cambió. Editar
  -- descripción / categoría / precio de una fila vieja debe seguir
  -- funcionando.
  if tg_op = 'UPDATE' and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  if new.created_at is null then
    return new;
  end if;

  -- Fin del último período CERRADO de la familia. Un mes está cerrado
  -- cuando existe una month_close_decision para su summary; el período
  -- cerrado es [period_start, period_end). Tomamos el period_end más
  -- reciente: todo lo anterior a esa fecha ya fue reconciliado.
  select max(s.period_end)
    into v_last_close_end
    from public.month_close_decisions d
    join public.monthly_summaries s on s.id = d.monthly_summary_id
   where d.family_id = new.family_id;

  if v_last_close_end is null then
    return new;
  end if;

  -- Fecha LOCAL del gasto (los imports anclan a mediodía local, así
  -- que el borde de medianoche no es un problema en la práctica).
  v_tz := coalesce(
    public.user_local_timezone(new.created_by),
    'America/Argentina/Buenos_Aires'
  );
  v_local_date := (new.created_at at time zone v_tz)::date;

  -- period_end es exclusivo (es el period_start del mes siguiente), así
  -- que un gasto fechado EXACTAMENTE en period_end pertenece al mes
  -- nuevo y se permite.
  if v_local_date < v_last_close_end then
    raise exception
      'No podés cargar un gasto con fecha dentro de un mes ya cerrado (hasta %).',
      v_last_close_end
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
