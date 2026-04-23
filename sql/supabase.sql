-- ==============================================================
-- Family Expenses App - Supabase SQL (tables + RLS + triggers)
-- ==============================================================

create extension if not exists pgcrypto;

create or replace function public.random_category_color()
returns text
language sql
volatile
set search_path = public
as $$
  select (
    array[
      '#89C8F7',
      '#7EE3D4',
      '#95E38E',
      '#CBEA7A',
      '#F4D87E',
      '#FFBF8A',
      '#FFA3A6',
      '#F6A3D1',
      '#C7AEFF',
      '#AEBBFF',
      '#8FD9E8',
      '#9DE7C8'
    ]
  )[1 + floor(random() * 12)::int];
$$;

-- -----------------------
-- Tables
-- -----------------------
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (family_id, user_id),
  constraint family_members_one_family_per_user unique (user_id)
);

create table if not exists public.category_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  quick_descriptions text[] not null default '{}',
  sort_order integer not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  template_id uuid null references public.category_templates(id) on delete set null,
  name text not null,
  color text not null default public.random_category_color(),
  created_at timestamptz not null default now(),
  unique (family_id, name)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  description text not null,
  price numeric(12,2) not null check (price >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.family_finance (
  family_id uuid primary key references public.families(id) on delete cascade,
  monthly_income numeric(12,2) not null default 0 check (monthly_income >= 0),
  savings_goal numeric(12,2) not null default 0 check (savings_goal >= 0),
  savings_goal_percent smallint not null default 20 check (savings_goal_percent between 0 and 50),
  essential_monthly_cost numeric(12,2) not null default 0 check (essential_monthly_cost >= 0),
  usd_exchange_rate numeric(12,4) not null default 1000 check (usd_exchange_rate > 0),
  salary_payment_day smallint not null default 1 check (salary_payment_day between 1 and 31),
  last_salary_confirmed_at timestamptz null,
  updated_at timestamptz not null default now()
);

create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  kind text not null default 'recurring' check (kind in ('recurring', 'periodic', 'installment', 'debt')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  frequency text not null default 'monthly' check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual')),
  category_id uuid null references public.categories(id) on delete set null,
  next_due_on date not null default current_date,
  ends_on date null,
  installments_total integer null check (installments_total is null or installments_total > 0),
  installments_paid integer not null default 0 check (installments_paid >= 0),
  remaining_balance numeric(12,2) null check (remaining_balance is null or remaining_balance >= 0),
  lender_name text null,
  notes text null,
  last_paid_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, name)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  body text not null default '',
  kind text not null default 'info',
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_family_created_at_idx
on public.notifications (family_id, created_at desc);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'web' check (provider in ('web', 'expo')),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_family_idx
on public.push_subscriptions (family_id);

-- -----------------------
-- Compatibility guards (important when tables already existed)
-- -----------------------
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_subscriptions'
      and column_name = 'provider'
  ) then
    alter table public.push_subscriptions
      add column provider text;
  end if;
exception
  when duplicate_column then null;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_subscriptions'
      and column_name = 'provider'
  ) then
    update public.push_subscriptions
    set provider = case
      when endpoint ilike 'ExponentPushToken[%'
        or endpoint ilike 'ExpoPushToken[%'
        then 'expo'
      else 'web'
    end
    where provider is null
       or btrim(provider) = ''
       or provider not in ('web', 'expo');

    alter table public.push_subscriptions
      alter column provider set default 'web';

    alter table public.push_subscriptions
      alter column provider set not null;
  end if;
exception
  when undefined_column then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.push_subscriptions'::regclass
      and conname = 'push_subscriptions_provider_check'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_provider_check
      check (provider in ('web', 'expo'));
  end if;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'categories'
      and column_name = 'color'
  ) then
    alter table public.categories
      add column color text not null default public.random_category_color();
  end if;
exception
  when duplicate_column then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'family_finance'
      and column_name = 'savings_goal_percent'
  ) then
    alter table public.family_finance
      add column savings_goal_percent smallint not null default 20 check (savings_goal_percent between 0 and 50);
  end if;
exception
  when duplicate_column then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'family_finance'
      and column_name = 'essential_monthly_cost'
  ) then
    alter table public.family_finance
      add column essential_monthly_cost numeric(12,2) not null default 0 check (essential_monthly_cost >= 0);
  end if;
exception
  when duplicate_column then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'family_finance'
      and column_name = 'last_salary_confirmed_at'
  ) then
    alter table public.family_finance
      add column last_salary_confirmed_at timestamptz null;
  end if;
exception
  when duplicate_column then null;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'categories'
      and column_name = 'color'
  ) then
    update public.categories
    set color = public.random_category_color()
    where color is null
       or btrim(color) = ''
       or upper(color) in (
         '#0EA5E9',
         '#14B8A6',
         '#22C55E',
         '#84CC16',
         '#EAB308',
         '#F97316',
         '#EF4444',
         '#EC4899',
         '#8B5CF6',
         '#6366F1',
         '#06B6D4',
         '#10B981',
         '#7FA8C9',
         '#7FB8B2',
         '#8FB68C',
         '#B4BE8A',
         '#C7B38A',
         '#C89D84',
         '#C98B8B',
         '#C48FAE',
         '#A596C7',
         '#8F9DCB',
         '#7FAFBE',
         '#88B79F',
         '#8EBFE2',
         '#8FCFC7',
         '#9DCD9B',
         '#C2D693',
         '#D9C78F',
         '#DEB08E',
         '#DEA0A0',
         '#D6A1C0',
         '#B7A9DD',
         '#A5B4DF',
         '#92C7D5',
         '#9CCFB6'
       );

    alter table public.categories
      alter column color set default public.random_category_color();

    alter table public.categories
      alter column color set not null;
  end if;
exception
  when undefined_column then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.families'::regclass
      and c.contype = 'u'
      and c.conkey = array[
        (
          select a.attnum
          from pg_attribute a
          where a.attrelid = 'public.families'::regclass
            and a.attname = 'code'
        )
      ]::smallint[]
  ) then
    alter table public.families
      add constraint families_code_key unique (code);
  end if;
exception
  when duplicate_object or duplicate_table then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'family_finance'
      and column_name = 'usd_exchange_rate'
  ) then
    alter table public.family_finance
      add column usd_exchange_rate numeric(12,4) not null default 1000 check (usd_exchange_rate > 0);
  end if;
exception
  when duplicate_column then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'family_finance'
      and column_name = 'salary_payment_day'
  ) then
    alter table public.family_finance
      add column salary_payment_day smallint not null default 1 check (salary_payment_day between 1 and 31);
  end if;
exception
  when duplicate_column then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.family_members'::regclass
      and c.contype = 'u'
      and c.conkey = array[
        (
          select a.attnum
          from pg_attribute a
          where a.attrelid = 'public.family_members'::regclass
            and a.attname = 'user_id'
        )
      ]::smallint[]
  ) then
    alter table public.family_members
      add constraint family_members_one_family_per_user unique (user_id);
  end if;
exception
  when duplicate_object or duplicate_table then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.categories'::regclass
      and c.contype = 'u'
      and c.conkey = array[
        (
          select a.attnum
          from pg_attribute a
          where a.attrelid = 'public.categories'::regclass
            and a.attname = 'family_id'
        ),
        (
          select a.attnum
          from pg_attribute a
          where a.attrelid = 'public.categories'::regclass
            and a.attname = 'name'
        )
      ]::smallint[]
  ) then
    alter table public.categories
      add constraint categories_family_name_key unique (family_id, name);
  end if;
exception
  when duplicate_object or duplicate_table then null;
end;
$$;

-- -----------------------
-- Commitments expansion
-- -----------------------
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

-- -----------------------
-- Data integrity helpers
-- -----------------------
create or replace function public.ensure_expense_category_belongs_family()
returns trigger
language plpgsql
as $$
declare
  v_category_family uuid;
begin
  select c.family_id
    into v_category_family
  from public.categories c
  where c.id = new.category_id;

  if v_category_family is null then
    raise exception 'Category not found.';
  end if;

  if v_category_family <> new.family_id then
    raise exception 'Category does not belong to selected family.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_expense_category_family on public.expenses;
create trigger trg_expense_category_family
before insert or update on public.expenses
for each row
execute function public.ensure_expense_category_belongs_family();

create or replace function public.prevent_expense_creator_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.created_by <> old.created_by then
    raise exception 'created_by cannot be changed after insert.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_expense_creator_immutable on public.expenses;
create trigger trg_expense_creator_immutable
before update on public.expenses
for each row
execute function public.prevent_expense_creator_change();

create or replace function public.touch_family_finance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_family_finance_updated_at on public.family_finance;
create trigger trg_family_finance_updated_at
before update on public.family_finance
for each row
execute function public.touch_family_finance_updated_at();

create or replace function public.touch_fixed_expenses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_fixed_expenses_updated_at on public.fixed_expenses;
create trigger trg_fixed_expenses_updated_at
before update on public.fixed_expenses
for each row
execute function public.touch_fixed_expenses_updated_at();

create or replace function public.touch_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_push_subscriptions_updated_at on public.push_subscriptions;
create trigger trg_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row
execute function public.touch_push_subscriptions_updated_at();

create or replace function public.notify_expense_insert()
returns trigger
language plpgsql
as $$
begin
  insert into public.notifications (family_id, title, body, kind, created_by)
  values (
    new.family_id,
    'Nuevo gasto cargado',
    concat(
      coalesce(nullif(btrim(new.description), ''), 'Sin descripción'),
      ' · $',
      coalesce(new.price, 0)::text
    ),
    'expense',
    new.created_by
  );

  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists trg_expenses_notify_insert on public.expenses;
create trigger trg_expenses_notify_insert
after insert on public.expenses
for each row
execute function public.notify_expense_insert();

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

drop trigger if exists trg_fixed_expenses_notify_change on public.fixed_expenses;
create trigger trg_fixed_expenses_notify_change
after insert or update or delete on public.fixed_expenses
for each row
execute function public.notify_fixed_expense_change();

-- -----------------------
-- RLS helper function
-- -----------------------
create or replace function public.is_family_member(fam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = fam_id
      and fm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_family_member(uuid) from public;
grant execute on function public.is_family_member(uuid) to authenticated;

-- -----------------------
-- Bootstrap + Join RPC
-- -----------------------
drop function if exists public.bootstrap_family();
drop function if exists public.bootstrap_family(text);
create or replace function public.bootstrap_family(p_preferred_code text default null)
returns table (family_id uuid, family_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_family_id uuid;
  v_existing_family_code text;
  v_target_code text;
  v_attempts integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, f.code
    into v_existing_family_id, v_existing_family_code
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  if v_existing_family_id is not null then
    return query select v_existing_family_id, v_existing_family_code;
    return;
  end if;

  if p_preferred_code is not null and btrim(p_preferred_code) <> '' then
    v_target_code := upper(btrim(p_preferred_code));
  else
    v_target_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  end if;

  loop
    begin
      insert into public.families(code)
      values (v_target_code)
      returning id, code into v_existing_family_id, v_existing_family_code;
      exit;
    exception
      when unique_violation then
        v_attempts := v_attempts + 1;
        if v_attempts > 8 then
          raise exception 'Could not generate a unique family code.';
        end if;
        v_target_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    end;
  end loop;

  insert into public.family_members(family_id, user_id)
  values (v_existing_family_id, v_user_id)
  on conflict (user_id) do nothing;

  insert into public.categories(family_id, template_id, name)
  select v_existing_family_id, template.id, template.name
  from public.category_templates template
  where not exists (
    select 1
    from public.categories c
    where c.family_id = v_existing_family_id
      and lower(c.name) = lower(template.name)
  )
  order by template.sort_order;

  return query select v_existing_family_id, v_existing_family_code;
end;
$$;

revoke all on function public.bootstrap_family(text) from public;
grant execute on function public.bootstrap_family(text) to authenticated;

drop function if exists public.join_family_by_code(text);
create or replace function public.join_family_by_code(p_code text)
returns table (family_id uuid, family_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_family_id uuid;
  v_current_family_code text;
  v_target_family_id uuid;
  v_target_family_code text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, f.code
    into v_current_family_id, v_current_family_code
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  if v_current_family_id is not null then
    return query select v_current_family_id, v_current_family_code;
    return;
  end if;

  select f.id, f.code
    into v_target_family_id, v_target_family_code
  from public.families f
  where f.code = upper(btrim(p_code))
  limit 1;

  if v_target_family_id is null then
    raise exception 'Family code not found';
  end if;

  insert into public.family_members(family_id, user_id)
  values (v_target_family_id, v_user_id)
  on conflict (user_id) do nothing;

  return query select v_target_family_id, v_target_family_code;
end;
$$;

revoke all on function public.join_family_by_code(text) from public;
grant execute on function public.join_family_by_code(text) to authenticated;

drop function if exists public.leave_current_family();
create or replace function public.leave_current_family()
returns table (family_id uuid, family_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_family_id uuid;
  v_current_family_code text;
  v_remaining_members integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, f.code
    into v_current_family_id, v_current_family_code
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  if v_current_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  delete from public.push_subscriptions
  where family_id = v_current_family_id
    and user_id = v_user_id;

  delete from public.family_members
  where family_id = v_current_family_id
    and user_id = v_user_id;

  select count(*)
    into v_remaining_members
  from public.family_members
  where family_id = v_current_family_id;

  if coalesce(v_remaining_members, 0) = 0 then
    delete from public.families
    where id = v_current_family_id;
  end if;

  return query select v_current_family_id, v_current_family_code;
end;
$$;

revoke all on function public.leave_current_family() from public;
grant execute on function public.leave_current_family() to authenticated;

-- -----------------------
-- Profile trigger from auth.users
-- -----------------------
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

-- backfill optional for existing users
insert into public.profiles(id, display_name)
select
  u.id,
  coalesce(
    u.raw_user_meta_data ->> 'display_name',
    split_part(u.email, '@', 1)
  )
from auth.users u
on conflict (id) do nothing;

-- -----------------------
-- RLS enable
-- -----------------------
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.category_templates enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.profiles enable row level security;
alter table public.family_finance enable row level security;
alter table public.fixed_expenses enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

-- -----------------------
-- Policies
-- -----------------------
-- families: select solo para miembros

drop policy if exists "families_select_members" on public.families;
create policy "families_select_members"
on public.families
for select
using (public.is_family_member(id));

-- family_members: select para miembros; insert self

drop policy if exists "family_members_select_members" on public.family_members;
create policy "family_members_select_members"
on public.family_members
for select
using (public.is_family_member(family_id));

drop policy if exists "family_members_insert_self" on public.family_members;
create policy "family_members_insert_self"
on public.family_members
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "category_templates_select_authenticated" on public.category_templates;
create policy "category_templates_select_authenticated"
on public.category_templates
for select
to authenticated
using (true);

-- categories: CRUD para miembros de family

drop policy if exists "categories_select_members" on public.categories;
create policy "categories_select_members"
on public.categories
for select
using (public.is_family_member(family_id));

drop policy if exists "categories_insert_members" on public.categories;
create policy "categories_insert_members"
on public.categories
for insert
to authenticated
with check (public.is_family_member(family_id));

drop policy if exists "categories_update_members" on public.categories;
create policy "categories_update_members"
on public.categories
for update
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

drop policy if exists "categories_delete_members" on public.categories;
create policy "categories_delete_members"
on public.categories
for delete
using (public.is_family_member(family_id));

-- expenses: CRUD para miembros, insert exige created_by = auth.uid()

drop policy if exists "expenses_select_members" on public.expenses;
create policy "expenses_select_members"
on public.expenses
for select
using (public.is_family_member(family_id));

drop policy if exists "expenses_insert_members_created_by_self" on public.expenses;
create policy "expenses_insert_members_created_by_self"
on public.expenses
for insert
to authenticated
with check (
  public.is_family_member(family_id)
  and created_by = auth.uid()
);

drop policy if exists "expenses_update_members" on public.expenses;
create policy "expenses_update_members"
on public.expenses
for update
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

drop policy if exists "expenses_delete_members" on public.expenses;
create policy "expenses_delete_members"
on public.expenses
for delete
using (public.is_family_member(family_id));

-- profiles: select same family (or self); insert/update self

drop policy if exists "profiles_select_same_family_or_self" on public.profiles;
create policy "profiles_select_same_family_or_self"
on public.profiles
for select
using (
  id = auth.uid()
  or exists (
    select 1
    from public.family_members mine
    join public.family_members theirs on theirs.family_id = mine.family_id
    where mine.user_id = auth.uid()
      and theirs.user_id = profiles.id
  )
);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- family_finance: CRUD para miembros de la family

drop policy if exists "family_finance_select_members" on public.family_finance;
create policy "family_finance_select_members"
on public.family_finance
for select
using (public.is_family_member(family_id));

drop policy if exists "family_finance_insert_members" on public.family_finance;
create policy "family_finance_insert_members"
on public.family_finance
for insert
to authenticated
with check (public.is_family_member(family_id));

drop policy if exists "family_finance_update_members" on public.family_finance;
create policy "family_finance_update_members"
on public.family_finance
for update
to authenticated
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

drop policy if exists "family_finance_delete_members" on public.family_finance;
create policy "family_finance_delete_members"
on public.family_finance
for delete
to authenticated
using (public.is_family_member(family_id));

-- fixed_expenses: CRUD para miembros de la family

drop policy if exists "fixed_expenses_select_members" on public.fixed_expenses;
create policy "fixed_expenses_select_members"
on public.fixed_expenses
for select
using (public.is_family_member(family_id));

drop policy if exists "fixed_expenses_insert_members" on public.fixed_expenses;
create policy "fixed_expenses_insert_members"
on public.fixed_expenses
for insert
to authenticated
with check (public.is_family_member(family_id));

drop policy if exists "fixed_expenses_update_members" on public.fixed_expenses;
create policy "fixed_expenses_update_members"
on public.fixed_expenses
for update
to authenticated
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

drop policy if exists "fixed_expenses_delete_members" on public.fixed_expenses;
create policy "fixed_expenses_delete_members"
on public.fixed_expenses
for delete
to authenticated
using (public.is_family_member(family_id));

-- notifications: read + insert para miembros de la family

drop policy if exists "notifications_select_members" on public.notifications;
create policy "notifications_select_members"
on public.notifications
for select
using (public.is_family_member(family_id));

drop policy if exists "notifications_insert_members" on public.notifications;
create policy "notifications_insert_members"
on public.notifications
for insert
to authenticated
with check (public.is_family_member(family_id));

drop policy if exists "notifications_delete_members" on public.notifications;
create policy "notifications_delete_members"
on public.notifications
for delete
to authenticated
using (public.is_family_member(family_id));

-- push_subscriptions: CRUD de suscripción push para miembros

drop policy if exists "push_subscriptions_select_members" on public.push_subscriptions;
create policy "push_subscriptions_select_members"
on public.push_subscriptions
for select
using (public.is_family_member(family_id));

drop policy if exists "push_subscriptions_insert_self_member" on public.push_subscriptions;
create policy "push_subscriptions_insert_self_member"
on public.push_subscriptions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_family_member(family_id)
);

drop policy if exists "push_subscriptions_update_self_member" on public.push_subscriptions;
create policy "push_subscriptions_update_self_member"
on public.push_subscriptions
for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_family_member(family_id)
)
with check (
  user_id = auth.uid()
  and public.is_family_member(family_id)
);

drop policy if exists "push_subscriptions_delete_self_member" on public.push_subscriptions;
create policy "push_subscriptions_delete_self_member"
on public.push_subscriptions
for delete
to authenticated
using (
  user_id = auth.uid()
  and public.is_family_member(family_id)
);

-- Realtime publication (idempotente)

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object or undefined_object then null;
end;
$$;

-- ==============================================================
-- savings_goals — per-family meta for the Home screen
-- ==============================================================

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  emoji text not null default '🎯',
  goal_amount numeric(12,2) not null check (goal_amount > 0),
  current_amount numeric(12,2) not null default 0 check (current_amount >= 0),
  target_months integer null check (target_months is null or target_months > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_savings_goals_family_active
  on public.savings_goals (family_id)
  where is_active;

alter table public.savings_goals enable row level security;

drop policy if exists "savings_goals_select_members" on public.savings_goals;
create policy "savings_goals_select_members"
on public.savings_goals
for select
using (public.is_family_member(family_id));

drop policy if exists "savings_goals_insert_members" on public.savings_goals;
create policy "savings_goals_insert_members"
on public.savings_goals
for insert
to authenticated
with check (public.is_family_member(family_id));

drop policy if exists "savings_goals_update_members" on public.savings_goals;
create policy "savings_goals_update_members"
on public.savings_goals
for update
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

drop policy if exists "savings_goals_delete_members" on public.savings_goals;
create policy "savings_goals_delete_members"
on public.savings_goals
for delete
using (public.is_family_member(family_id));

create or replace function public.savings_goals_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_savings_goals_updated_at on public.savings_goals;
create trigger trg_savings_goals_updated_at
before update on public.savings_goals
for each row execute function public.savings_goals_touch_updated_at();
