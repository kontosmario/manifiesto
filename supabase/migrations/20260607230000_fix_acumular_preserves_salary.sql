-- supabase/migrations/20260607230000_fix_acumular_preserves_salary.sql
--
-- Bug reportado por owner: aplicar la decisión "acumular" (sumar al
-- mes actual) hacía que el dashboard mostrara como income del cycle
-- SOLO el sobrante, perdiendo el sueldo. Causa raíz:
--
--   update family_finance
--      set current_cycle_starting_balance =
--            coalesce(current_cycle_starting_balance, 0) + v_sobrante  -- BUG
--
-- Cuando `current_cycle_starting_balance` es null (caso default — el
-- user no overrideó el monto al confirmar cobro), `coalesce(null, 0)`
-- da 0 → el balance final queda en sólo v_sobrante. El dashboard ve
-- el balance no-null + anchor matching → activa el modo override y
-- trata el cycle income como sólo el sobrante. El sueldo "desaparece".
--
-- Fix: coalesce con `monthly_income` en vez de 0. Cuando el user no
-- tenía override, asumimos que su income real del cycle ES el sueldo
-- configurado; el sobrante se SUMA encima. Si el user sí había
-- overrideado (e.g. cobró distinto al sueldo), preservamos ese monto.

create or replace function public.apply_month_close_decision(
  p_monthly_summary_id uuid,
  p_decision text,
  p_meta_goal_id uuid default null,
  p_new_cycle_anchor text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_summary record;
  v_sobrante numeric;
  v_current_balance numeric;
  v_monthly_income numeric;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  select id, family_id, monthly_income, total_spent, savings_delta
    into v_summary
    from public.monthly_summaries
   where id = p_monthly_summary_id;

  if not found then
    raise exception 'monthly_summary not found';
  end if;

  if not exists (
    select 1 from public.family_members
    where family_id = v_summary.family_id
      and user_id = v_user_id
      and role <> 'blocked'
  ) then
    raise exception 'Not a family member';
  end if;

  if p_decision not in ('meta', 'acumular', 'reserva', 'skip') then
    raise exception 'invalid decision';
  end if;

  if p_decision = 'meta' and p_meta_goal_id is null then
    raise exception 'meta decision requires meta_goal_id';
  end if;

  v_sobrante := greatest(
    0,
    coalesce(v_summary.monthly_income, 0)
      - coalesce(v_summary.total_spent, 0)
      - coalesce(v_summary.savings_delta, 0)
  );

  insert into public.month_close_decisions (
    family_id, monthly_summary_id, sobrante, decision, meta_goal_id, decided_by
  ) values (
    v_summary.family_id, p_monthly_summary_id, v_sobrante,
    p_decision, p_meta_goal_id, v_user_id
  );

  if p_decision = 'meta' then
    update public.savings_goals
       set current_amount = current_amount + v_sobrante,
           updated_at = now()
     where id = p_meta_goal_id and family_id = v_summary.family_id;
  elsif p_decision = 'acumular' then
    if p_new_cycle_anchor is null then
      raise exception 'acumular decision requires new_cycle_anchor';
    end if;
    -- Fetch current balance + sueldo configurado para preservar el
    -- income del cycle cuando el user no tenía override previo.
    select current_cycle_starting_balance, monthly_income
      into v_current_balance, v_monthly_income
      from public.family_finance
     where family_id = v_summary.family_id;
    update public.family_finance
       set current_cycle_starting_balance =
             coalesce(v_current_balance, coalesce(v_monthly_income, 0))
             + v_sobrante,
           current_cycle_anchor = p_new_cycle_anchor::date,
           updated_at = now()
     where family_id = v_summary.family_id;
  elsif p_decision = 'reserva' then
    update public.family_finance
       set monthly_reserve_amount = monthly_reserve_amount + v_sobrante,
           updated_at = now()
     where family_id = v_summary.family_id;
  end if;
end;
$$;

revoke all on function public.apply_month_close_decision(uuid, text, uuid, text) from public;
grant execute on function public.apply_month_close_decision(uuid, text, uuid, text) to authenticated;
