-- supabase/migrations/20260615040000_acumular_es_income_event.sql
--
-- Auditoría 2026-06-11 · A5c — "Sumarlo al mes" inflaba el sueldo en
-- vez de sumar al saldo disponible.
--
-- El branch 'acumular' de `apply_month_close_decision` hacía:
--   current_cycle_starting_balance =
--     coalesce(current_cycle_starting_balance, monthly_income) + sobrante
--
-- Dos problemas con eso:
--   1. La semántica del override es "plata disponible HOY" (reemplaza
--      al sueldo como base y solo descuenta gasto desde hoy — ver
--      family-dashboard-model). Sembrarlo con el sueldo BRUTO a mitad
--      de ciclo ignora todo lo ya gastado: caso real del owner,
--      6.4M + 1.727M = 8.127M tratados como disponibles con 4.3M ya
--      gastados → el Home pasó de ~1.6M a ~7.7M "disponibles".
--   2. Duplicaba un mecanismo que ya existe: los `income_events`
--      (2026-06-11) suman al disponible del Home, al cupo/proyección
--      de Control, al checkin matinal y se visualizan en la card
--      "Entró este ciclo".
--
-- Fix: 'acumular' inserta un income_event (kind 'other', event_date
-- hoy, descripción "Sobrante de <periodo>") y NO toca el override.
-- Efecto neto: disponible = saldo actual + sobrante — exactamente lo
-- que el usuario espera de "sumarlo al mes". El trigger
-- trg_income_notification avisa a la familia como con cualquier
-- ingreso. `p_new_cycle_anchor` queda aceptado por compatibilidad con
-- clientes viejos pero se ignora (ya no hay anchor que escribir).
--
-- El resto del body se preserva de 20260615030000 (fórmula canónica
-- del sobrante, guards de ownership/meta, rate limit, audit log).

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
  v_decision_id uuid;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  -- Sprint I-DB I-DB1 (2026-06-10): collapsed lookup + membership check
  -- error messages into a single generic string so an attacker cannot
  -- distinguish "summary does not exist" from "summary belongs to
  -- another family". Lookup shape preserved.
  select id, family_id, period_label, monthly_income, total_spent, savings_goal_amount
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

  -- Fórmula canónica del sobrante decidible (2026-06-11): la meta de
  -- ahorro comprometida no es plata a decidir.
  v_sobrante := greatest(
    0,
    coalesce(v_summary.monthly_income, 0)
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
    -- Sumar al mes = un ingreso extra del ciclo. Entra al mismo
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

  -- Sprint G-DB G-DB1 (2026-06-10): explicit audit_log write (preserved).
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
$$;

revoke all on function public.apply_month_close_decision(uuid, text, uuid, text) from public;
grant execute on function public.apply_month_close_decision(uuid, text, uuid, text) to authenticated;

comment on function public.apply_month_close_decision(uuid, text, uuid, text) is
  'Applies a month-close sobrante decision atomically. Owner-only '
  '(Sprint F-DB F3). Validates meta_goal_id belongs to family (Sprint E C5). '
  'Sobrante = income − total_spent − savings_goal_amount (2026-06-11). '
  'acumular inserts an income_event into the current cycle (2026-06-11: '
  'was a current_cycle_starting_balance override seeded with GROSS '
  'income, which inflated the available balance mid-cycle). '
  'p_new_cycle_anchor is accepted for client back-compat but ignored. '
  'Rate-limited 5/hour. Audit-logged (Sprint G-DB G-DB1). Generic '
  'cross-family error message (Sprint I-DB I-DB1).';
