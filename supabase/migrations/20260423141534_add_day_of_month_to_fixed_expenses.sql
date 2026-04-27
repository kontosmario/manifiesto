-- Align fixed_expenses with the V1 Cuaderno add-fijo design.
-- The design captures `day of month` (1..31) as a first-class anchor for the
-- commitment, independent of the current `next_due_on`. Storing it lets us
-- (a) restore the original day-of-month after Postgres interval math shifts
-- it (Jan 31 + 1 month = Feb 28), and (b) keep the monthly dial labels in
-- the Fijos hero stable across cycles.

alter table public.fixed_expenses
  add column if not exists day_of_month smallint null;

-- Backfill: derive the anchor from the current next_due_on. Rows without a
-- next_due_on fall back to day 1 so the aggregate views keep rendering.
update public.fixed_expenses
set day_of_month = case
  when next_due_on is not null then extract(day from next_due_on)::smallint
  else 1
end
where day_of_month is null;

alter table public.fixed_expenses
  alter column day_of_month set default 1,
  alter column day_of_month set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fixed_expenses'::regclass
      and conname = 'fixed_expenses_day_of_month_check'
  ) then
    alter table public.fixed_expenses
      add constraint fixed_expenses_day_of_month_check
      check (day_of_month between 1 and 31);
  end if;
exception
  when duplicate_object then null;
end;
$$;

-- Re-anchor the advance helper to a day-of-month hint so monthly commitments
-- whose day is past the short-month cutoff (e.g. 31) don't drift forward.
create or replace function public.advance_fixed_expense_due_date(
  p_current_due date,
  p_frequency text,
  p_day_of_month smallint default null
)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  v_next date;
  v_target_month date;
  v_days_in_month integer;
  v_target_day integer;
begin
  case p_frequency
    when 'weekly' then
      return p_current_due + 7;
    when 'biweekly' then
      return p_current_due + 14;
    when 'quarterly' then
      v_next := (p_current_due + interval '3 months')::date;
    when 'semiannual' then
      v_next := (p_current_due + interval '6 months')::date;
    when 'annual' then
      v_next := (p_current_due + interval '1 year')::date;
    else
      v_next := (p_current_due + interval '1 month')::date;
  end case;

  -- For month-anchored frequencies, reset the day to p_day_of_month when
  -- provided. Clamp to the last valid day of the target month so February
  -- receives 28/29 without overflowing.
  if p_day_of_month is not null then
    v_target_month := date_trunc('month', v_next)::date;
    v_days_in_month := extract(day from (v_target_month + interval '1 month - 1 day'))::integer;
    v_target_day := least(greatest(p_day_of_month::integer, 1), v_days_in_month);
    v_next := v_target_month + make_interval(days => v_target_day - 1);
  end if;

  return v_next;
end;
$$;

-- Older callers (pre-migration edge functions / SQL) can still invoke the
-- 2-arg signature. Postgres picks this one when day_of_month isn't supplied.
create or replace function public.advance_fixed_expense_due_date(
  p_current_due date,
  p_frequency text
)
returns date
language sql
immutable
set search_path = public
as $$
  select public.advance_fixed_expense_due_date(p_current_due, p_frequency, null::smallint);
$$;

-- record_fixed_expense_payment: forward the commitment's day_of_month so the
-- rolled-forward next_due_on snaps back to the anchor after interval math.
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
