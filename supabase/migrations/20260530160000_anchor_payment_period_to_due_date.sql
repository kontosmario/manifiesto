-- ============================================================
-- WHAT
--   Cambia el anchor de `period_month` en `record_fixed_expense_payment`
--   del CALENDAR MONTH actual (`date_trunc('month', current_date)`) al
--   mes en el que vence la cuota que se está pagando
--   (`date_trunc('month', v_commitment.next_due_on)`).
--
-- WHY (bug confirmado en prod 2026-05-30)
--   La migración previa `20260423180653_anchor_payment_period_to_current_month.sql`
--   ancló period_month al mes calendario actual para resolver un bug
--   del cliente VIEJO que filtraba payments por `period_month =
--   first-of-current-month`. Pero ese cliente fue reemplazado — el
--   cliente moderno (`useFixedExpensePayments`) filtra por `paid_at`
--   dentro del cycle window, no por period_month.
--
--   El anchor al calendar month tiene un bug serio cuando el usuario
--   paga dos veces en el mismo mes calendario:
--
--   Escenario real reproducido con el usuario kontosmario@gmail.com:
--     - salary_payment_day = 20 → cycle [2026-05-20, 2026-06-20).
--     - 8 mayo: paga Expensas (cuota del ciclo anterior).
--       period_month = 2026-05-01, paid_at = 8 mayo.
--       next_due_on avanza a 2026-06-10 (cuota del ciclo nuevo).
--     - 30 mayo (HOY): paga Expensas DE NUEVO anticipando junio
--       (la UI lo mostraba como pending en el ciclo activo porque
--       next_due_on = 2026-06-10 ∈ ciclo [2026-05-20, 2026-06-20)).
--     - RPC corre con v_period_month = date_trunc('month', current_date)
--       = 2026-05-01.
--     - INSERT public.fixed_expense_payments(...,'2026-05-01',...)
--       ON CONFLICT (fixed_expense_id, period_month) DO NOTHING
--       → COLISIONA con el row del 8 mayo → NO inserta.
--     - PERO advance_fixed_expense_due_date() sí corre →
--       next_due_on avanza a 2026-07-10 (saltó la cuota de junio).
--
--   Resultado: doble pago registrado en `expenses` (2 rows con
--   commitment_id), único payment row, next_due_on adelantado un mes
--   extra (cuota de junio perdida). Cliente ve `paymentsThisCycle=[]`
--   para ese fijo + `next_due_on = 2026-07-10 >= cycleEnd 2026-06-20`
--   → `computedStatus = 'future'` → fijo aparece en tab "Próximos"
--   en vez de "Pagados".
--
-- FIX
--   `v_period_month = date_trunc('month', v_commitment.next_due_on)::date`.
--   Cada cuota se identifica por el MES en que vence (la cuota que
--   está cubriendo el pago), no por el mes en que se hace el pago.
--   El UNIQUE constraint entonces protege contra "pagar la misma
--   cuota dos veces" pero permite "pagar dos cuotas distintas en el
--   mismo mes calendario" (caso anticipado válido).
--
--   El cliente moderno filtra por `paid_at` (timestamp real) dentro
--   del cycle window, así que no le importa el valor de period_month
--   — solo lo usa para la unique constraint.
--
--   Fallback: si por algún motivo `next_due_on` es null (no debería
--   pasar en fijos válidos, pero defense in depth), caemos al
--   calendar month como antes.
-- ============================================================

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

  -- ⭐ FIX 2026-05-30: anchor al mes de vencimiento (cuota que se
  -- está pagando), no al mes calendario actual. Evita colisiones de
  -- UNIQUE constraint cuando se pagan dos cuotas distintas en el
  -- mismo mes calendario (caso "pago anticipado de la cuota del mes
  -- siguiente").
  v_period_month := date_trunc(
    'month',
    coalesce(v_commitment.next_due_on, current_date)
  )::date;

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

grant execute on function public.record_fixed_expense_payment(uuid, numeric) to authenticated;
