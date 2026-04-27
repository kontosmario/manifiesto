-- The client aggregate that flips a fijo to "paid" queries
-- public.fixed_expense_payments for period_month = first-of-current-month.
-- The prior RPC anchored the payment period to the commitment's
-- next_due_on (before advancing). For items whose next_due_on was
-- already in a future month (common right after a previous payment or
-- when the seed rolled forward past-day-of-month), the RPC ended up
-- writing the payment under that future period — leaving the current
-- cycle "unpaid" from the aggregate's point of view.
--
-- This migration re-anchors the period to the user's calendar month
-- (date_trunc('month', current_date)) so pressing "Registrar pago"
-- always counts for the month you pressed it in.

create or replace function public.record_fixed_expense_payment(p_fixed_expense_id uuid)
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

  if not exists (
    select 1
    from public.family_members fm
    where fm.family_id = v_commitment.family_id
      and fm.user_id = auth.uid()
  ) then
    raise exception 'No tenés permisos para registrar este pago.';
  end if;

  if v_commitment.status <> 'active' then
    raise exception 'Solo podés registrar pagos sobre compromisos activos.';
  end if;

  if v_commitment.category_id is null then
    raise exception 'Definí una categoría antes de registrar el pago.';
  end if;

  v_payment_amount := case
    when v_commitment.kind = 'debt' and coalesce(v_commitment.remaining_balance, 0) > 0
      then least(v_commitment.amount, v_commitment.remaining_balance)
    else v_commitment.amount
  end;

  insert into public.expenses (
    family_id,
    category_id,
    commitment_id,
    description,
    price,
    created_by
  )
  values (
    v_commitment.family_id,
    v_commitment.category_id,
    v_commitment.id,
    coalesce(nullif(btrim(v_commitment.name), ''), 'Compromiso'),
    v_payment_amount,
    auth.uid()
  )
  returning id into v_expense_id;

  -- Anchor the payment to the CALENDAR month the user is in — this is
  -- what the client queries (`firstOfCurrentMonth`) to flip the fijo
  -- to "paid". Using next_due_on led to off-by-one-month bugs
  -- whenever the commitment's next_due_on had already rolled forward.
  v_period_month := date_trunc('month', current_date)::date;
  insert into public.fixed_expense_payments (
    fixed_expense_id,
    period_month,
    paid_by
  )
  values (v_commitment.id, v_period_month, auth.uid())
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

  return v_expense_id;
end;
$$;

grant execute on function public.record_fixed_expense_payment(uuid) to authenticated;
