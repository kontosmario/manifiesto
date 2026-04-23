alter table public.expenses
  add column if not exists commitment_id uuid null references public.fixed_expenses(id) on delete set null;

create index if not exists expenses_family_commitment_created_idx
on public.expenses (family_id, commitment_id, created_at desc);

alter table public.fixed_expenses
  add column if not exists kind text default 'recurring',
  add column if not exists status text default 'active',
  add column if not exists frequency text default 'monthly',
  add column if not exists category_id uuid null references public.categories(id) on delete set null,
  add column if not exists next_due_on date default current_date,
  add column if not exists ends_on date null,
  add column if not exists installments_total integer null,
  add column if not exists installments_paid integer not null default 0,
  add column if not exists remaining_balance numeric(12,2) null,
  add column if not exists lender_name text null,
  add column if not exists notes text null,
  add column if not exists last_paid_at timestamptz null;

update public.fixed_expenses
set kind = coalesce(nullif(kind, ''), 'recurring'),
    status = coalesce(nullif(status, ''), 'active'),
    frequency = coalesce(nullif(frequency, ''), 'monthly'),
    next_due_on = coalesce(next_due_on, current_date),
    installments_paid = greatest(coalesce(installments_paid, 0), 0)
where true;

alter table public.fixed_expenses
  alter column kind set default 'recurring',
  alter column kind set not null,
  alter column status set default 'active',
  alter column status set not null,
  alter column frequency set default 'monthly',
  alter column frequency set not null,
  alter column next_due_on set default current_date,
  alter column next_due_on set not null,
  alter column installments_paid set default 0,
  alter column installments_paid set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fixed_expenses'::regclass
      and conname = 'fixed_expenses_kind_check'
  ) then
    alter table public.fixed_expenses
      add constraint fixed_expenses_kind_check
      check (kind in ('recurring', 'periodic', 'installment', 'debt'));
  end if;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fixed_expenses'::regclass
      and conname = 'fixed_expenses_status_check'
  ) then
    alter table public.fixed_expenses
      add constraint fixed_expenses_status_check
      check (status in ('active', 'paused', 'completed', 'archived'));
  end if;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fixed_expenses'::regclass
      and conname = 'fixed_expenses_frequency_check'
  ) then
    alter table public.fixed_expenses
      add constraint fixed_expenses_frequency_check
      check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual'));
  end if;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fixed_expenses'::regclass
      and conname = 'fixed_expenses_installments_total_check'
  ) then
    alter table public.fixed_expenses
      add constraint fixed_expenses_installments_total_check
      check (installments_total is null or installments_total > 0);
  end if;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fixed_expenses'::regclass
      and conname = 'fixed_expenses_installments_paid_check'
  ) then
    alter table public.fixed_expenses
      add constraint fixed_expenses_installments_paid_check
      check (installments_paid >= 0);
  end if;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fixed_expenses'::regclass
      and conname = 'fixed_expenses_remaining_balance_check'
  ) then
    alter table public.fixed_expenses
      add constraint fixed_expenses_remaining_balance_check
      check (remaining_balance is null or remaining_balance >= 0);
  end if;
exception
  when duplicate_object then null;
end;
$$;

create index if not exists fixed_expenses_family_status_due_idx
on public.fixed_expenses (family_id, status, next_due_on);

create or replace function public.advance_fixed_expense_due_date(
  p_current_due date,
  p_frequency text
)
returns date
language plpgsql
immutable
set search_path = public
as $$
begin
  case p_frequency
    when 'weekly' then
      return p_current_due + 7;
    when 'biweekly' then
      return p_current_due + 14;
    when 'quarterly' then
      return (p_current_due + interval '3 months')::date;
    when 'semiannual' then
      return (p_current_due + interval '6 months')::date;
    when 'annual' then
      return (p_current_due + interval '1 year')::date;
    else
      return (p_current_due + interval '1 month')::date;
  end case;
end;
$$;

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

  v_next_due := public.advance_fixed_expense_due_date(v_commitment.next_due_on, v_commitment.frequency);
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

create or replace function public.notify_fixed_expense_change()
returns trigger
language plpgsql
as $$
declare
  v_family_id uuid;
  v_name text;
  v_amount numeric(12,2);
  v_title text;
begin
  if tg_op = 'UPDATE'
     and old.name is not distinct from new.name
     and old.amount is not distinct from new.amount
     and old.kind is not distinct from new.kind
     and old.frequency is not distinct from new.frequency
     and old.category_id is not distinct from new.category_id
     and old.ends_on is not distinct from new.ends_on
     and old.installments_total is not distinct from new.installments_total
     and old.lender_name is not distinct from new.lender_name
     and old.notes is not distinct from new.notes then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_family_id := new.family_id;
    v_name := new.name;
    v_amount := new.amount;
    v_title := 'Nuevo compromiso';
  elsif tg_op = 'UPDATE' then
    v_family_id := new.family_id;
    v_name := new.name;
    v_amount := new.amount;
    v_title := 'Compromiso actualizado';
  else
    v_family_id := old.family_id;
    v_name := old.name;
    v_amount := old.amount;
    v_title := 'Compromiso eliminado';
  end if;

  insert into public.notifications (family_id, title, body, kind, created_by)
  values (
    v_family_id,
    v_title,
    concat(
      coalesce(nullif(btrim(v_name), ''), 'Sin nombre'),
      ' · $',
      coalesce(v_amount, 0)::text
    ),
    'fixed_expense',
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
exception
  when others then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
end;
$$;
