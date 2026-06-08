-- ============================================================
-- WHAT
--   Defense-in-depth en `record_fixed_expense_payment` y
--   `revert_fixed_expense_payment`: el membership check inline
--   (exists() sobre family_members) ahora filtra `role <> 'blocked'`
--   explícitamente. Cero cambios en el resto del cuerpo.
--
-- WHY (Code Review finding H1, SPRINT B)
--   En `20260530180000_fixed_payment_expense_link_and_revert.sql`:
--     - record  :117-124 → exists() sin filtro de role
--     - revert  :303-309 → exists() sin filtro de role
--
--   Aunque la migration C1 (20260608100000_harden_is_family_member)
--   ya bloquea a blocked users vía el helper canónico, estas dos
--   RPCs NO usan el helper — tienen su propio exists() inline.
--   Sin este patch, un blocked user con JWT vivo todavía puede
--   confirmar o revertir pagos de fijos hasta que su token expire.
--
--   Como SECURITY DEFINER no consulta RLS sobre family_members,
--   el helper redefinido tampoco aplica acá; la única forma de
--   cerrar el hueco en estas RPCs es agregar el filtro inline.
--
-- VERIFY
--   select proname, prosrc like '%role <> ''blocked''%' as fixed
--   from pg_proc
--   where proname in ('record_fixed_expense_payment',
--                     'revert_fixed_expense_payment');
-- ============================================================

-- ─── record_fixed_expense_payment ───────────────────────────────
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

  -- ⭐ Hardened: excluir blocked members (CR finding H1).
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

  return v_expense_id;
end;
$$;

grant execute on function public.record_fixed_expense_payment(uuid, numeric) to authenticated;

-- ─── revert_fixed_expense_payment ───────────────────────────────
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

  -- ⭐ Hardened: excluir blocked members (CR finding H1).
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
end;
$$;

grant execute on function public.revert_fixed_expense_payment(uuid) to authenticated;
