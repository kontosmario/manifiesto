-- Fix: una cuenta nueva mostraba "¿qué hacer con el sobrante?" el día 1.
--
-- Al terminar el onboarding se INSERTa family_finance con last_salary_confirmed_at
-- = now() (para anclar al ciclo actual y que los gastos recién cargados no caigan
-- fuera de rango). Ese INSERT dispara trg_family_finance_on_salary_confirm →
-- try_close_previous_cycle → close_monthly_cycle para el ciclo ANTERIOR — uno en
-- el que la cuenta nunca existió. Los guards de close_monthly_cycle pasan (el ciclo
-- previo ya terminó y now() >= su period_end), así que inserta un monthly_summaries
-- "fantasma" con total_spent=0 y monthly_income = el sueldo completo. El cliente lee
-- ese row, computa sobrante ≈ sueldo entero (>> umbral) y auto-abre el
-- MonthCloseDecisionSheet al volver al Home. Una cuenta que recién arranca NO cerró
-- ningún ciclo.
--
-- Fix quirúrgico: cerrar el ciclo previo SOLO cuando la familia YA estaba anclada en
-- un ciclo (OLD.current_cycle_anchor not null). En el primer confirm de sueldo
-- (INSERT en onboarding, o el primer "Ya cobré" en Home donde el anchor sigue null)
-- no hay ciclo previo real que cerrar. Los confirms siguientes (familia ya en el
-- loop recurrente) cierran normalmente. Esto NO afecta el cierre real de fin de
-- ciclo ni el cron (van por close_monthly_cycle con un ciclo genuino), ni el caso
-- legítimo de un ciclo sin gastos de un usuario recurrente (ese tiene
-- OLD.current_cycle_anchor not null → cierra y el sheet standalone aparece como
-- corresponde).

create or replace function public.trg_family_finance_on_salary_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Un family_finance recién creado (primer confirm en onboarding, o tras
  -- abandonar la familia y re-onboardear) no tiene ciclo previo: nunca cerramos
  -- en INSERT.
  if TG_OP = 'INSERT' then
    return NEW;
  elsif TG_OP = 'UPDATE' then
    -- Cerrar el ciclo previo solo cuando el confirm de sueldo avanzó Y la familia
    -- ya estaba anclada en un ciclo. Sin el guard `OLD.current_cycle_anchor is not
    -- null`, el primer "Ya cobré" en Home (anchor todavía null) cerraría un ciclo
    -- sintético que la cuenta nunca vivió → monthly_summaries fantasma.
    if NEW.last_salary_confirmed_at is distinct from OLD.last_salary_confirmed_at
       and NEW.last_salary_confirmed_at is not null
       and (OLD.last_salary_confirmed_at is null
            or NEW.last_salary_confirmed_at > OLD.last_salary_confirmed_at)
       and OLD.current_cycle_anchor is not null then
      perform public.try_close_previous_cycle(NEW.family_id);
    end if;
  end if;
  return NEW;
end;
$$;

-- Backfill: borrar los monthly_summaries fantasma ya creados en prod por cuentas
-- onboardeadas antes de este fix. Un fantasma cierra un ciclo que terminó ANTES de
-- que la familia existiera (period_end <= families.created_at), sin actividad real
-- (cero gasto variable y fijo) y sin decisión tomada. Estrictamente acotado: no
-- toca ningún ciclo con actividad real ni ninguno ya decidido.
delete from public.monthly_summaries ms
using public.families f
where ms.family_id = f.id
  and ms.period_end <= f.created_at::date
  and ms.total_spent = 0
  and ms.total_variable_spent = 0
  and ms.total_fixed_spent = 0
  and not exists (
    select 1
    from public.month_close_decisions d
    where d.monthly_summary_id = ms.id
  );
