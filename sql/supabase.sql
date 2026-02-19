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

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
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
  usd_exchange_rate numeric(12,4) not null default 1000 check (usd_exchange_rate > 0),
  salary_payment_day smallint not null default 1 check (salary_payment_day between 1 and 31),
  last_salary_confirmed_at timestamptz null,
  updated_at timestamptz not null default now()
);

-- -----------------------
-- Compatibility guards (important when tables already existed)
-- -----------------------
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

  insert into public.categories(family_id, name)
  select v_existing_family_id, defaults.name
  from (
    values
      ('Gastos generales'::text),
      ('Gastos de comida'::text),
      ('Gastos de la casa'::text)
  ) as defaults(name)
  where not exists (
    select 1
    from public.categories c
    where c.family_id = v_existing_family_id
      and c.name = defaults.name
  );

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
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.profiles enable row level security;
alter table public.family_finance enable row level security;

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
