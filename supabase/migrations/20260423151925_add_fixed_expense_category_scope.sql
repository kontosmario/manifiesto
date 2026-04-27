-- Separate Fijos categories from Gastos by introducing a scope column
-- on both the catalog (category_templates) and the per-family rows
-- (categories). V1 Cuaderno's AddFijoSheet uses a fixed palette of 7
-- categories; we seed them per-family and filter the picker client-side
-- by scope.

alter table public.category_templates
  add column if not exists scope text not null default 'expense';

alter table public.categories
  add column if not exists scope text not null default 'expense';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.category_templates'::regclass
      and conname = 'category_templates_scope_check'
  ) then
    alter table public.category_templates
      add constraint category_templates_scope_check
      check (scope in ('expense', 'fixed_expense'));
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
    where conrelid = 'public.categories'::regclass
      and conname = 'categories_scope_check'
  ) then
    alter table public.categories
      add constraint categories_scope_check
      check (scope in ('expense', 'fixed_expense'));
  end if;
exception
  when duplicate_object then null;
end;
$$;

-- Drop the legacy unique(family_id, name) constraint so "Servicios" can
-- exist both as a gastos cat and a fijos cat within the same family.
do $$
declare
  v_constraint_name text;
begin
  select conname
    into v_constraint_name
  from pg_constraint
  where conrelid = 'public.categories'::regclass
    and contype = 'u'
    and conkey = array[
      (select attnum from pg_attribute where attrelid = 'public.categories'::regclass and attname = 'family_id'),
      (select attnum from pg_attribute where attrelid = 'public.categories'::regclass and attname = 'name')
    ];

  if v_constraint_name is not null then
    execute format('alter table public.categories drop constraint %I', v_constraint_name);
  end if;
end;
$$;

create unique index if not exists categories_family_scope_name_uidx
  on public.categories (family_id, scope, lower(name));

-- Relax the Gastos-side template_id uniqueness: template_id is scoped
-- to expense templates so duplicating rows for fixed_expense would
-- collide if we left it as unique. (It wasn't unique before; this is a
-- no-op safety comment.)

-- Seed the 7 Fijos category templates. `sort_order` starts at 1000 to
-- stay well above the existing expense templates (1..36).
insert into public.category_templates (name, quick_descriptions, sort_order, scope)
values
  ('Servicios',     array['Luz', 'Gas', 'Agua', 'Internet']::text[], 1001, 'fixed_expense'),
  ('Vivienda',      array['Alquiler', 'Expensas', 'Garage']::text[], 1002, 'fixed_expense'),
  ('Suscripciones', array['Netflix', 'Spotify', 'Disney+', 'iCloud']::text[], 1003, 'fixed_expense'),
  ('Seguros',       array['Auto', 'Prepaga', 'Hogar', 'Vida']::text[], 1004, 'fixed_expense'),
  ('Cuotas',        array['Tarjeta', 'Préstamo', 'Financiación']::text[], 1005, 'fixed_expense'),
  ('Impuestos',     array['ABL', 'Monotributo', 'Patente']::text[], 1006, 'fixed_expense'),
  ('Deudas',        array['Préstamo personal', 'Tarjeta', 'Familiar']::text[], 1007, 'fixed_expense')
on conflict (name) do update
set quick_descriptions = excluded.quick_descriptions,
    sort_order = excluded.sort_order,
    scope = excluded.scope;

-- Color map lives in the client (`FIJOS_CATS`), so the DB just seeds
-- deterministic names. The client resolves palette by template name.
-- Backfill: drop every existing family's fijos cats (idempotent insert).
insert into public.categories(family_id, template_id, name, color, scope)
select
  families.id,
  templates.id,
  templates.name,
  case templates.name
    when 'Servicios'     then '#E8976A'
    when 'Vivienda'      then '#8DB46A'
    when 'Suscripciones' then '#C9A6E0'
    when 'Seguros'       then '#F2B58A'
    when 'Cuotas'        then '#6B9AD6'
    when 'Impuestos'     then '#C7A96A'
    when 'Deudas'        then '#D96A4F'
    else '#8A8A8A'
  end,
  'fixed_expense'
from public.families families
cross join public.category_templates templates
where templates.scope = 'fixed_expense'
  and not exists (
    select 1
    from public.categories categories
    where categories.family_id = families.id
      and categories.scope = 'fixed_expense'
      and lower(categories.name) = lower(templates.name)
  )
order by families.created_at, templates.sort_order;

-- Update bootstrap_family so new families get both scopes seeded.
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

  -- Expense categories (scope='expense').
  insert into public.categories(family_id, template_id, name, scope)
  select v_existing_family_id, templates.id, templates.name, 'expense'
  from public.category_templates templates
  where templates.scope = 'expense'
    and not exists (
      select 1
      from public.categories categories
      where categories.family_id = v_existing_family_id
        and categories.scope = 'expense'
        and lower(categories.name) = lower(templates.name)
    )
  order by templates.sort_order;

  -- Fixed expense categories (scope='fixed_expense').
  insert into public.categories(family_id, template_id, name, color, scope)
  select
    v_existing_family_id,
    templates.id,
    templates.name,
    case templates.name
      when 'Servicios'     then '#E8976A'
      when 'Vivienda'      then '#8DB46A'
      when 'Suscripciones' then '#C9A6E0'
      when 'Seguros'       then '#F2B58A'
      when 'Cuotas'        then '#6B9AD6'
      when 'Impuestos'     then '#C7A96A'
      when 'Deudas'        then '#D96A4F'
      else '#8A8A8A'
    end,
    'fixed_expense'
  from public.category_templates templates
  where templates.scope = 'fixed_expense'
    and not exists (
      select 1
      from public.categories categories
      where categories.family_id = v_existing_family_id
        and categories.scope = 'fixed_expense'
        and lower(categories.name) = lower(templates.name)
    )
  order by templates.sort_order;

  return query select v_existing_family_id, v_existing_family_code;
end;
$$;

revoke all on function public.bootstrap_family(text) from public;
grant execute on function public.bootstrap_family(text) to authenticated;
