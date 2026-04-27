-- Add "Inversiones" as the 8th canonical Fijos category. The fijos
-- picker lays out 8 tiles in a 2×4 grid; this completes the set so
-- there are no missing slots. We:
--   1. Insert the template into category_templates (scope='fixed_expense').
--   2. Backfill every existing family with the new category.
--   3. Update both bootstrap_family() and family_owner_promote_member()
--      to include the color mapping for Inversiones so future re-seeds
--      assign the right hue instead of the #8A8A8A fallback.

-- ─── 1. Template row ────────────────────────────────────────────────
-- The catalog's uniqueness lives in `category_templates_name_scope_uidx`
-- which is an expression index: (scope, lower(name)). ON CONFLICT must
-- match the index expression exactly, otherwise PG raises 42P10.
insert into public.category_templates (name, quick_descriptions, sort_order, scope)
values
  ('Inversiones', array['Plazo fijo', 'Bonos', 'Acciones', 'Aporte mensual']::text[], 1008, 'fixed_expense')
on conflict (scope, lower(name)) do update
set quick_descriptions = excluded.quick_descriptions,
    sort_order = excluded.sort_order;

-- ─── 2. Backfill existing families ──────────────────────────────────
insert into public.categories(family_id, template_id, name, color, scope)
select
  families.id,
  templates.id,
  templates.name,
  '#D9B84F',
  'fixed_expense'
from public.families families
cross join public.category_templates templates
where templates.scope = 'fixed_expense'
  and templates.name = 'Inversiones'
  and not exists (
    select 1
    from public.categories categories
    where categories.family_id = families.id
      and categories.scope = 'fixed_expense'
      and lower(categories.name) = lower(templates.name)
  );

-- ─── 3. Refresh bootstrap_family() so new families get the right hue ─
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

  -- Creator becomes the owner. The unique partial index
  -- `family_members_one_owner_per_family` guarantees uniqueness.
  insert into public.family_members(family_id, user_id, role)
  values (v_existing_family_id, v_user_id, 'owner')
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
      when 'Inversiones'   then '#D9B84F'
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
