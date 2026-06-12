-- supabase/migrations/20260615030000_fix_month_close_sobrante_y_anchor_window.sql
--
-- Auditoría 2026-06-11 · A5 (server side) — dos bugs en
-- `apply_month_close_decision`:
--
-- 1. SOBRANTE = 0 SIEMPRE (la doble resta, espejo del bug del cliente):
--      v_sobrante := income − total_spent − savings_delta
--    pero el rollup define savings_delta = greatest(0, income −
--    total_spent) — EL SOBRANTE MISMO. Resultado: aunque la decisión
--    se persistiera, acreditaba $0 a la meta / reserva / ciclo. La
--    fórmula canónica (spec 2026-06-05-month-close-leftover-decision)
--    resta el ahorro COMPROMETIDO, no el delta:
--      v_sobrante := income − total_spent − savings_goal_amount
--    Mismo fix que el cliente (mobile/features/month-close/sobrante.ts).
--
-- 2. VENTANA DEL ANCHOR DEMASIADO ANGOSTA para el flujo real:
--    el guard F10/J-DB1 exigía [today − 7d, today + 45d], pero en
--    'acumular' el cliente manda el INICIO DEL CICLO VIGENTE (el
--    override de family_finance solo aplica si current_cycle_anchor
--    coincide con el cycle start computado por el runtime). Un ciclo
--    mensual arranca hasta ~31 días en el pasado, así que cualquier
--    decisión tomada después del día 7 del ciclo reventaba con
--    P0001 'invalid anchor' (reproducido por el owner: anchor
--    2026-05-20 con today 2026-06-11 → 22 días). Se amplía el límite
--    inferior a −45 días: cubre cualquier inicio de ciclo vigente
--    (mensual máx 31d) + margen, y sigue bloqueando la clase
--    1900-01-01 / 9999-12-31 que motivó el guard. El constraint
--    defense-in-depth de family_finance (±400d) queda igual.
--
-- El resto del body se preserva verbatim de
-- 20260613001000_sprint_j_restore_cycle_anchor_guard.sql (lookup
-- genérico I-DB1, owner-check F3, meta-goal guard E C5, rate limit,
-- audit log G-DB1).

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
  v_anchor_date date;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  -- Sprint I-DB I-DB1 (2026-06-10): collapsed lookup + membership check
  -- error messages into a single generic string so an attacker cannot
  -- distinguish "summary does not exist" from "summary belongs to
  -- another family". Lookup shape preserved.
  select id, family_id, monthly_income, total_spent, savings_goal_amount
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

  if p_decision = 'acumular' and p_new_cycle_anchor is null then
    raise exception 'acumular decision requires new_cycle_anchor';
  end if;

  -- Guard F10 (restaurado en Sprint J) con ventana corregida: el
  -- anchor de 'acumular' es el inicio del ciclo VIGENTE, que puede
  -- estar hasta ~31 días en el pasado. −45/+45 sigue bloqueando
  -- valores basura sin romper decisiones tomadas avanzado el ciclo.
  if p_new_cycle_anchor is not null then
    begin
      v_anchor_date := p_new_cycle_anchor::date;
    exception when others then
      raise exception 'invalid anchor: not a valid date';
    end;

    if v_anchor_date < current_date - interval '45 days'
       or v_anchor_date > current_date + interval '45 days' then
      raise exception 'invalid anchor: must be within [today - 45 days, today + 45 days]';
    end if;
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

  -- Fórmula canónica del sobrante decidible: la meta de ahorro
  -- comprometida no es plata a decidir. Antes restaba savings_delta
  -- (= el sobrante mismo según el rollup) y daba 0 idéntico.
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
  elsif p_decision = 'acumular' then
    update public.family_finance
       set current_cycle_starting_balance =
             coalesce(current_cycle_starting_balance, coalesce(monthly_income, 0))
             + v_sobrante,
           current_cycle_anchor = v_anchor_date,
           updated_at = now()
     where family_id = v_summary.family_id;
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
  'Validates p_new_cycle_anchor within [today-45d, today+45d] '
  '(F10/J-DB1; lower bound widened 2026-06-11 — the acumular anchor is '
  'the CURRENT cycle start, up to ~31 days in the past). Sobrante = '
  'income − total_spent − savings_goal_amount (2026-06-11: was '
  'savings_delta, identically 0 by rollup definition). '
  'Rate-limited 5/hour. Audit-logged (Sprint G-DB G-DB1). Generic '
  'cross-family error message (Sprint I-DB I-DB1).';
