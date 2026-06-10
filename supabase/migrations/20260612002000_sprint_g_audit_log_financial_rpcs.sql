-- supabase/migrations/20260612002000_sprint_g_audit_log_financial_rpcs.sql
--
-- Sprint G-DB · Red team finding G-DB1 (2026-06-10):
--   The Sprint B B5 audit triggers (20260609050000_service_role_audit_triggers)
--   only fire when `auth.role() = 'service_role'`. SECDEF RPCs run as the
--   function owner (`postgres`) but the *caller's* `auth.role()` remains
--   `authenticated`, so those triggers short-circuit and produce zero rows
--   in `audit_log` for every financial RPC that moves money.
--
-- Result: forensic gap. We have NO trail when:
--   · An owner re-routes reserve into a goal or back into the cycle.
--   · An owner commits a month-close decision (meta / reserva / acumular).
--   · A member confirms or reverts a fixed-expense payment.
--   · A member bumps a savings goal via add_savings_contribution.
--
-- Fix:
--   At the end of each successful RPC (after every mutation succeeded but
--   before the function returns) insert an explicit row into
--   `public.audit_log` with:
--     · user_id    = auth.uid()
--     · family_id  = derived inside the RPC
--     · action     = '<rpc_name>' (kebab-cased exists too; keep snake_case
--                    to match the function symbol so grep-by-action works)
--     · target_table / target_id = the row most directly mutated
--     · payload    = jsonb with the relevant business inputs
--
-- Each RPC is rewritten with `create or replace function` — fully
-- idempotent. Signatures, owner / blocked / rate-limit guards, atomic
-- WHERE-clause patterns from Sprint A/F are preserved verbatim.
--
-- IMPORTANT: failures inside the audit_log insert MUST NOT silently break
-- the RPC, but we WANT them to fail loudly so forensics aren't quietly
-- lost. We rely on the audit_log schema (20260609040000) being stable —
-- columns used: user_id, family_id, action, target_table, target_id,
-- payload (no `metadata`; the existing column is `payload`).

-- ────────────────────────────────────────────────────────────────────
-- 1 · apply_reserve_decision  (V4: + audit_log write)
-- ────────────────────────────────────────────────────────────────────
create or replace function public.apply_reserve_decision(
  p_amount numeric,
  p_target text,
  p_meta_goal_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_family_count int;
  v_updated int;
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
    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) - p_amount,
           current_cycle_starting_balance =
             coalesce(current_cycle_starting_balance, coalesce(monthly_income, 0))
             + p_amount,
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
$$;

revoke all on function public.apply_reserve_decision(numeric, text, uuid) from public;
grant execute on function public.apply_reserve_decision(numeric, text, uuid) to authenticated;

comment on function public.apply_reserve_decision(numeric, text, uuid) is
  'Re-routes reserve balance into the current cycle or a savings goal. '
  'Owner-only (Sprint F-DB F3). Atomic guard via WHERE-clause reserve check. '
  'Rate-limited 10/hour. Audit-logged (Sprint G-DB G-DB1, 2026-06-10).';

-- ────────────────────────────────────────────────────────────────────
-- 2 · apply_month_close_decision  (V8: + audit_log write)
-- ────────────────────────────────────────────────────────────────────
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
           current_cycle_anchor = p_new_cycle_anchor::date,
           updated_at = now()
     where family_id = v_summary.family_id;
  elsif p_decision = 'reserva' then
    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) + v_sobrante,
           updated_at = now()
     where family_id = v_summary.family_id;
  end if;

  -- Sprint G-DB G-DB1 (2026-06-10): explicit audit_log write.
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
  'Rate-limited 5/hour. Audit-logged (Sprint G-DB G-DB1, 2026-06-10).';

-- ────────────────────────────────────────────────────────────────────
-- 3 · record_fixed_expense_payment  (V?: + audit_log write)
-- ────────────────────────────────────────────────────────────────────
create or replace function public.record_fixed_expense_payment(
  p_fixed_expense_id uuid,
  p_amount_override numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commitment public.fixed_expenses%rowtype;
  v_expense_id uuid;
  v_next_due date;
  v_payment_amount numeric(12,2);
  v_remaining_balance numeric(12,2);
  v_installments_paid integer;
  v_new_status text;
  v_period_month date;
  v_was_overdue boolean;
begin
  if auth.uid() is null then
    raise exception 'Necesitás una sesión activa para registrar pagos.';
  end if;

  select *
  into v_commitment
  from public.fixed_expenses
  where id = p_fixed_expense_id;

  if not found then
    raise exception 'Compromiso no encontrado.';
  end if;

  -- Hardened: excluir blocked members (CR finding H1).
  if not exists (
    select 1
    from public.family_members fm
    where fm.family_id = v_commitment.family_id
      and fm.user_id = auth.uid()
      and fm.role <> 'blocked'
  ) then
    raise exception 'No tenés permisos para registrar este pago.';
  end if;

  if v_commitment.status <> 'active' then
    raise exception 'Solo podés registrar pagos sobre compromisos activos.';
  end if;

  if v_commitment.category_id is null then
    raise exception 'Definí una categoría antes de registrar el pago.';
  end if;

  if p_amount_override is not null then
    if p_amount_override <= 0 then
      raise exception 'El monto del pago debe ser mayor a 0.';
    end if;
    if p_amount_override > 1000000000 then
      raise exception 'El monto del pago supera el máximo permitido.';
    end if;
  end if;

  v_was_overdue := coalesce(v_commitment.next_due_on, current_date) < current_date;

  if p_amount_override is not null then
    v_payment_amount := p_amount_override::numeric(12,2);

    if v_payment_amount <> v_commitment.amount then
      update public.fixed_expenses
      set amount = v_payment_amount,
          updated_at = now()
      where id = v_commitment.id;
      select *
      into v_commitment
      from public.fixed_expenses
      where id = p_fixed_expense_id;
    end if;
  else
    v_payment_amount := case
      when v_commitment.kind = 'debt' and coalesce(v_commitment.remaining_balance, 0) > 0
        then least(v_commitment.amount, v_commitment.remaining_balance)
      else v_commitment.amount
    end;
  end if;

  insert into public.expenses (
    family_id,
    category_id,
    commitment_id,
    description,
    price,
    created_by,
    paid_in_arrears
  )
  values (
    v_commitment.family_id,
    v_commitment.category_id,
    v_commitment.id,
    coalesce(nullif(btrim(v_commitment.name), ''), 'Compromiso'),
    v_payment_amount,
    auth.uid(),
    v_was_overdue
  )
  returning id into v_expense_id;

  v_period_month := date_trunc(
    'month',
    coalesce(v_commitment.next_due_on, current_date)
  )::date;

  insert into public.fixed_expense_payments (
    fixed_expense_id,
    period_month,
    paid_by,
    expense_id
  )
  values (v_commitment.id, v_period_month, auth.uid(), v_expense_id)
  on conflict (fixed_expense_id, period_month) do nothing;

  v_next_due := public.advance_fixed_expense_due_date(
    v_commitment.next_due_on,
    v_commitment.frequency,
    v_commitment.day_of_month
  );
  v_installments_paid := coalesce(v_commitment.installments_paid, 0);
  v_remaining_balance := v_commitment.remaining_balance;
  v_new_status := 'active';

  if v_commitment.kind = 'installment' then
    v_installments_paid := v_installments_paid + 1;

    if coalesce(v_commitment.installments_total, 0) > 0 and v_installments_paid >= v_commitment.installments_total then
      v_new_status := 'completed';
    end if;
  elsif v_commitment.kind = 'debt' then
    v_remaining_balance := greatest(0, coalesce(v_commitment.remaining_balance, v_payment_amount) - v_payment_amount);

    if v_remaining_balance <= 0 then
      v_new_status := 'completed';
    end if;
  elsif v_commitment.ends_on is not null and v_next_due > v_commitment.ends_on then
    v_new_status := 'completed';
  end if;

  update public.fixed_expenses
  set next_due_on = case
        when v_new_status = 'completed' then v_commitment.next_due_on
        else v_next_due
      end,
      installments_paid = v_installments_paid,
      remaining_balance = v_remaining_balance,
      status = v_new_status,
      last_paid_at = now()
  where id = v_commitment.id;

  -- Sprint G-DB G-DB1 (2026-06-10): explicit audit_log write.
  insert into public.audit_log (user_id, family_id, action, target_table, target_id, payload)
  values (
    auth.uid(),
    v_commitment.family_id,
    'record_fixed_expense_payment',
    'fixed_expense_payments',
    v_expense_id,
    jsonb_build_object(
      'fixed_expense_id', p_fixed_expense_id,
      'expense_id', v_expense_id,
      'amount', v_payment_amount,
      'period_month', v_period_month,
      'amount_override_used', p_amount_override is not null,
      'paid_in_arrears', v_was_overdue,
      'new_status', v_new_status
    )
  );

  return v_expense_id;
end;
$$;

grant execute on function public.record_fixed_expense_payment(uuid, numeric) to authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 4 · revert_fixed_expense_payment  (V?: + audit_log write)
-- ────────────────────────────────────────────────────────────────────
create or replace function public.revert_fixed_expense_payment(
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.fixed_expense_payments%rowtype;
  v_commitment public.fixed_expenses%rowtype;
  v_expense public.expenses%rowtype;
  v_prev_payment public.fixed_expense_payments%rowtype;
  v_prev_due date;
  v_days_in_month int;
  v_target_day int;
  v_new_installments_paid int;
  v_new_remaining numeric(12,2);
  v_new_status text;
  v_reverted_expense_id uuid;
  v_reverted_amount numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'Necesitás una sesión activa para revertir pagos.';
  end if;

  select * into v_payment
  from public.fixed_expense_payments
  where id = p_payment_id;

  if not found then
    raise exception 'Pago no encontrado.';
  end if;

  select * into v_commitment
  from public.fixed_expenses
  where id = v_payment.fixed_expense_id;

  if not found then
    raise exception 'El fijo asociado al pago ya no existe.';
  end if;

  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_commitment.family_id
      and fm.user_id = auth.uid()
      and fm.role <> 'blocked'
  ) then
    raise exception 'No tenés permisos para revertir este pago.';
  end if;

  if v_payment.expense_id is not null then
    select * into v_expense
    from public.expenses
    where id = v_payment.expense_id;
  end if;

  select * into v_prev_payment
  from public.fixed_expense_payments
  where fixed_expense_id = v_commitment.id
    and id <> p_payment_id
  order by paid_at desc
  limit 1;

  v_target_day := coalesce(v_commitment.day_of_month, extract(day from v_commitment.next_due_on)::int);
  v_days_in_month := extract(day from
    (date_trunc('month', v_payment.period_month) + interval '1 month - 1 day')
  )::int;
  v_target_day := least(greatest(v_target_day, 1), v_days_in_month);
  v_prev_due := date_trunc('month', v_payment.period_month)::date
              + (v_target_day - 1) * interval '1 day';

  v_new_installments_paid := greatest(0, coalesce(v_commitment.installments_paid, 0) - 1);
  v_new_remaining := v_commitment.remaining_balance;
  v_new_status := v_commitment.status;

  if v_commitment.kind = 'installment' then
    if v_new_status = 'completed' then
      v_new_status := 'active';
    end if;
  elsif v_commitment.kind = 'debt' then
    if v_expense.id is not null then
      v_new_remaining := coalesce(v_new_remaining, 0) + v_expense.price;
    end if;
    if v_new_status = 'completed' then
      v_new_status := 'active';
    end if;
  elsif v_commitment.ends_on is not null and v_commitment.next_due_on > v_commitment.ends_on then
    if v_new_status = 'completed' then
      v_new_status := 'active';
    end if;
  end if;

  -- Snapshot the deleted expense id + amount before the delete for audit.
  v_reverted_expense_id := v_payment.expense_id;
  v_reverted_amount := coalesce(v_expense.price, null);

  if v_payment.expense_id is not null then
    delete from public.expenses where id = v_payment.expense_id;
  end if;

  delete from public.fixed_expense_payments where id = p_payment_id;

  update public.fixed_expenses
  set next_due_on = v_prev_due,
      last_paid_at = v_prev_payment.paid_at,
      installments_paid = v_new_installments_paid,
      remaining_balance = v_new_remaining,
      status = v_new_status,
      updated_at = now()
  where id = v_commitment.id;

  -- Sprint G-DB G-DB1 (2026-06-10): explicit audit_log write.
  insert into public.audit_log (user_id, family_id, action, target_table, target_id, payload)
  values (
    auth.uid(),
    v_commitment.family_id,
    'revert_fixed_expense_payment',
    'fixed_expense_payments',
    p_payment_id,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'fixed_expense_id', v_commitment.id,
      'reverted_expense_id', v_reverted_expense_id,
      'reverted_amount', v_reverted_amount,
      'period_month', v_payment.period_month,
      'new_status', v_new_status
    )
  );
end;
$$;

grant execute on function public.revert_fixed_expense_payment(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 5 · add_savings_contribution  (V?: + audit_log write)
-- ────────────────────────────────────────────────────────────────────
create or replace function public.add_savings_contribution(
  p_goal_id uuid,
  p_amount numeric
)
returns public.savings_goals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal public.savings_goals%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El aporte debe ser mayor a cero';
  end if;

  -- Sanity cap preserved from 20260510000100.
  if p_amount > 1000000000 then
    raise exception 'Monto fuera de rango';
  end if;

  perform public.enforce_rate_limit('add_savings_contribution', 30, 60);

  select * into v_goal from public.savings_goals where id = p_goal_id;
  if not found then
    raise exception 'Meta no encontrada';
  end if;

  -- Owner-only check preserved from 20260510000100.
  if not public.is_family_owner(v_goal.family_id) then
    raise exception 'Solo el owner puede aportar a la meta';
  end if;

  update public.savings_goals
  set current_amount = current_amount + p_amount,
      updated_at = now()
  where id = p_goal_id
  returning * into v_goal;

  -- Sprint G-DB G-DB1 (2026-06-10): explicit audit_log write.
  insert into public.audit_log (user_id, family_id, action, target_table, target_id, payload)
  values (
    auth.uid(),
    v_goal.family_id,
    'add_savings_contribution',
    'savings_goals',
    p_goal_id,
    jsonb_build_object(
      'goal_id', p_goal_id,
      'amount', p_amount,
      'new_current_amount', v_goal.current_amount
    )
  );

  return v_goal;
end;
$$;

revoke all on function public.add_savings_contribution(uuid, numeric) from public;
grant execute on function public.add_savings_contribution(uuid, numeric) to authenticated;
