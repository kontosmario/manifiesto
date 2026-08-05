-- ════════════════════════════════════════════════════════════════════
-- FIX: liberar la reserva "al ciclo" dejaba la plata INVISIBLE si el
-- anchor del override no coincidía con el inicio del ciclo vigente.
--
-- `apply_reserve_decision(target='cycle')` sumaba p_amount a
-- current_cycle_starting_balance SIN re-estampar current_cycle_anchor.
-- El override solo participa del presupuesto cuando
-- anchor == inicio del ciclo VIGENTE (cycle_disponible + cliente):
--   · en DINÁMICO el anchor está stale SIEMPRE (nadie confirma cobro
--     que lo estampe) → toda liberación era invisible (cazado en la
--     cuenta marcos: $499.000 liberados que no aparecían en el saldo);
--   · en FIJO el flujo diseñado corre post-confirm (anchor fresco,
--     asunción documentada en 20260608140000) — pero si corriera fuera
--     de esa ventana, mismo agujero.
--
-- Fix (solo la rama 'cycle'; 'meta' intacta):
--   1. Ventana vigente con la MISMA selección que cycle_disponible:
--      dinámico sigue su ciclo elegido, fijo la mensual del salary_day.
--   2. Anchor fresco → compone sobre el balance existente (resultado
--      IDÉNTICO al comportamiento anterior del flujo diseñado).
--   3. Anchor stale → re-ancla al ciclo vigente con base fresca
--      (fijo: monthly_income; dinámico: 0 — los ingresos del ciclo
--      entran por extra_income, y el 0 es además el defensivo contra
--      sueldo stale post-switch).
-- Base verbatim: pg_get_functiondef de prod (2026-07-08).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_reserve_decision(p_amount numeric, p_target text, p_meta_goal_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_family_count int;
  v_updated int;
  v_finance record;
  v_cycle_start date;
  v_base numeric;
begin
  if v_user_id is null then raise exception 'No session'; end if;

  if p_target not in ('cycle', 'meta') then raise exception 'invalid target'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_target = 'meta' and p_meta_goal_id is null then raise exception 'meta requires meta_goal_id'; end if;

  select count(*)
    into v_family_count
    from public.family_members
   where user_id = v_user_id
     and role <> 'blocked';
  if v_family_count > 1 then
    raise exception 'multi-family detected, p_family_id required';
  end if;

  select fm.family_id
    into v_family_id
    from public.family_members fm
   where fm.user_id = v_user_id
     and fm.role <> 'blocked'
   limit 1;
  if v_family_id is null then raise exception 'No family'; end if;

  -- Sprint F-DB F3 (2026-06-10): owner-only guard.
  if not public.is_family_owner(v_family_id) then
    raise exception 'only family owner can apply reserve decision';
  end if;

  perform public.check_rate_limit('apply_reserve_decision', 10, 3600);

  if p_target = 'cycle' then
    select ff.income_mode, ff.monthly_income, ff.salary_payment_day,
           ff.cycle_type, ff.cycle_anchor_date, ff.cycle_length_days,
           ff.current_cycle_anchor, ff.current_cycle_starting_balance
      into v_finance
      from public.family_finance ff
     where ff.family_id = v_family_id;
    if not found then
      raise exception 'family finance not found';
    end if;

    select cp.cycle_start
      into v_cycle_start
      from public.compute_pay_cycle(
        current_date,
        case when coalesce(v_finance.income_mode, 'fixed') = 'dynamic'
             then coalesce(v_finance.cycle_type, 'monthly')
             else 'monthly' end,
        coalesce(v_finance.salary_payment_day, 1)::smallint,
        v_finance.cycle_anchor_date,
        v_finance.cycle_length_days
      ) cp;

    -- Anchor fresco → componer (comportamiento anterior); stale →
    -- base fresca del modo. Anchor null cae al else (comparación null).
    v_base := case
      when v_finance.current_cycle_anchor = v_cycle_start then
        coalesce(
          v_finance.current_cycle_starting_balance,
          case when coalesce(v_finance.income_mode, 'fixed') = 'dynamic'
               then 0 else coalesce(v_finance.monthly_income, 0) end
        )
      else
        case when coalesce(v_finance.income_mode, 'fixed') = 'dynamic'
             then 0 else coalesce(v_finance.monthly_income, 0) end
    end;

    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) - p_amount,
           current_cycle_starting_balance = v_base + p_amount,
           current_cycle_anchor = v_cycle_start,
           updated_at = now()
     where family_id = v_family_id
       and coalesce(monthly_reserve_amount, 0) >= p_amount;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'amount exceeds reserve';
    end if;
  elsif p_target = 'meta' then
    if not exists (select 1 from public.savings_goals where id = p_meta_goal_id and family_id = v_family_id) then
      raise exception 'meta goal does not belong to family';
    end if;
    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) - p_amount,
           updated_at = now()
     where family_id = v_family_id
       and coalesce(monthly_reserve_amount, 0) >= p_amount;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'amount exceeds reserve';
    end if;
    update public.savings_goals
       set current_amount = current_amount + p_amount,
           updated_at = now()
     where id = p_meta_goal_id and family_id = v_family_id;
  end if;

  -- Sprint G-DB G-DB1 (2026-06-10): explicit audit_log write.
  insert into public.audit_log (user_id, family_id, action, target_table, target_id, payload)
  values (
    v_user_id,
    v_family_id,
    'apply_reserve_decision',
    case when p_target = 'meta' then 'savings_goals' else 'family_finance' end,
    case when p_target = 'meta' then p_meta_goal_id else v_family_id end,
    jsonb_build_object(
      'amount', p_amount,
      'target', p_target,
      'meta_goal_id', p_meta_goal_id
    )
  );
end;
$function$;
