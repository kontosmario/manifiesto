-- supabase/migrations/20260613004200_sprint_l_record_fixed_payment_concurrency.sql
--
-- Sprint L · Audit #5 finding L-Med1 — concurrent double-charge on
-- `record_fixed_expense_payment` (and double-revert mirror on
-- `revert_fixed_expense_payment`).
--
-- Issue:
--   `record_fixed_expense_payment` inserts the `expenses` row BEFORE the
--   `fixed_expense_payments` insert. The unique constraint on
--   `(fixed_expense_id, period_month)` had `on conflict do nothing`, so
--   two concurrent calls (rapid double-tap, two devices) raced:
--     T1                              T2
--     INSERT expenses (row A)         INSERT expenses (row B)
--     INSERT payment row (winner)     INSERT payment row → on conflict do nothing
--     COMMIT                          COMMIT
--   Result: TWO `expenses` rows for the same period, ONE payment row.
--   The audit_log entry from T2 still points at orphan expense B, the
--   fixed_expense status/balance got double-mutated, and the user got
--   charged twice.
--
--   `revert_fixed_expense_payment` had the symmetric problem: two
--   concurrent reverts could each delete the expense + payment, both
--   succeed (DELETE on already-deleted row is a no-op), and each write
--   an audit_log entry → status/balance double-rolled-back.
--
-- Fix:
--   1. `select ... for update` on `fixed_expenses` at the top of both
--      RPCs to serialize concurrent calls on the SAME commitment. The
--      lock is scoped tight (just the parent row) so unrelated commits
--      don't block each other.
--   2. In `record_fixed_expense_payment`: after `insert ... on conflict
--      do nothing`, check `get diagnostics v_inserted = row_count;` and
--      `raise exception` with errcode '23505' if zero. Aborts the
--      second call BEFORE it returns its orphan expense row.
--      Postgres rolls back the whole txn (the prior INSERT into expenses,
--      the UPDATE fixed_expenses, everything) — clean rollback, no
--      orphan expense.
--   3. In `revert_fixed_expense_payment`: same `get diagnostics
--      v_deleted = row_count;` check on the payment DELETE — if zero
--      the payment was already reverted by another tab, abort with
--      a clear error instead of writing a duplicate audit entry.
--
-- Idempotent: pure `create or replace function`.

-- ────────────────────────────────────────────────────────────────────
-- 1 · record_fixed_expense_payment — concurrent-safe
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
  v_inserted integer;
begin
  if auth.uid() is null then
    raise exception 'Necesitás una sesión activa para registrar pagos.';
  end if;

  -- L-Med1: lock the parent commitment row for the duration of the txn.
  -- Concurrent calls on the SAME fixed_expense_id queue here; calls on
  -- different commitments are unaffected. Scoped to just this row to
  -- minimize lock contention.
  select *
  into v_commitment
  from public.fixed_expenses
  where id = p_fixed_expense_id
  for update;

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

  v_period_month := date_trunc(
    'month',
    coalesce(v_commitment.next_due_on, current_date)
  )::date;

  -- L-Med1: pre-flight idempotency check while we hold the FOR UPDATE
  -- lock. Even though we still gate on the unique constraint below
  -- (defense in depth), this path catches the typical "tap-tap" UX
  -- without paying for the expense INSERT + ROLLBACK round-trip.
  if exists (
    select 1
    from public.fixed_expense_payments
    where fixed_expense_id = v_commitment.id
      and period_month = v_period_month
  ) then
    raise exception 'payment-already-recorded'
      using errcode = '23505',
            hint = 'duplicate_payment_for_period';
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

  insert into public.fixed_expense_payments (
    fixed_expense_id,
    period_month,
    paid_by,
    expense_id
  )
  values (v_commitment.id, v_period_month, auth.uid(), v_expense_id)
  on conflict (fixed_expense_id, period_month) do nothing;

  -- L-Med1: defense-in-depth guard. If something snuck past the FOR
  -- UPDATE lock (e.g. a future code path inserts payments without
  -- locking), abort before mutating fixed_expenses state. The 23505
  -- errcode lets the client recognise it as a duplicate.
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception 'payment-already-recorded'
      using errcode = '23505',
            hint = 'duplicate_payment_for_period';
  end if;

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
-- 2 · revert_fixed_expense_payment — concurrent-safe
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
  v_deleted integer;
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

  -- L-Med1: lock the parent commitment row so concurrent reverts on
  -- the same fixed_expense queue here instead of double-deleting the
  -- expense + double-mutating the commitment status.
  select * into v_commitment
  from public.fixed_expenses
  where id = v_payment.fixed_expense_id
  for update;

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

  -- L-Med1: if the payment row was already deleted by a concurrent
  -- revert (rare without the FOR UPDATE lock above, but guard anyway),
  -- abort instead of writing a duplicate audit_log entry + a no-op
  -- update on fixed_expenses.
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'payment-already-reverted'
      using errcode = 'P0002',
            hint = 'payment_not_found';
  end if;

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

comment on function public.record_fixed_expense_payment(uuid, numeric) is
  'Sprint L · Audit #5 L-Med1 (2026-06-13): hardened against concurrent '
  'double-charge via FOR UPDATE lock on fixed_expenses + row_count guard '
  'on payment INSERT. Two concurrent calls on the same commitment + '
  'period produce ONE expense and ONE payment row.';

comment on function public.revert_fixed_expense_payment(uuid) is
  'Sprint L · Audit #5 L-Med1 (2026-06-13): hardened against concurrent '
  'double-revert via FOR UPDATE lock on fixed_expenses + row_count guard '
  'on payment DELETE. Two concurrent reverts of the same payment produce '
  'ONE audit_log entry and a clean rollback on the loser.';
