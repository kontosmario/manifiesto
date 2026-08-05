-- ────────────────────────────────────────────────────────────────
-- 20260627010000_add_fixed_education_health_gym.sql
--
-- Suma 3 categorías al catálogo de FIJOS (scope='fixed_expense'):
-- Educación (cuota colegio/universidad), Salud (prepaga/obra social) y
-- Gimnasio (membresía). Son gastos recurrentes que antes no tenían una
-- categoría fija propia (caían en Cuotas/Seguros/Otros).
--
--   1. Inserta los 3 templates en sort_order 1009-1011 (fixed usa 1001+).
--   2. CREATE OR REPLACE bootstrap_family: agrega los 3 al CASE de color
--      de fixed_expense para que las familias NUEVAS los siembren con un
--      color propio (antes caían al else gris).
--   3. Backfill a familias existentes con el mismo color.
--
-- A diferencia del scope expense, la UI de fijos (fijo-row, grupos) usa
-- el color GUARDADO de la categoría, por eso acá sí se setea.
-- Íconos: educacion/educacion, salud/medico, salud/gimnasio (icon-map).
-- ────────────────────────────────────────────────────────────────

insert into public.category_templates (name, color, emoji, quick_descriptions, sort_order, scope)
values
  ('Educación', '#7A5AA0', '🎓', array['Colegio','Universidad','Cuota','Curso']::text[],          1009, 'fixed_expense'),
  ('Salud',     '#4A7FB8', '🩺', array['Prepaga','Obra social','Plan médico','Cobertura']::text[], 1010, 'fixed_expense'),
  ('Gimnasio',  '#4A7A3D', '🏋️', array['Membresía','Cuota mensual','Club','Entrenamiento']::text[], 1011, 'fixed_expense')
on conflict (scope, lower(name)) do nothing;

-- Bootstrap actualizado (verbatim de prod + 3 entradas nuevas en el CASE).
create or replace function public.bootstrap_family()
 returns table(family_id uuid)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_existing_family_id uuid;
  v_new_family_id uuid;
  v_lifetime_count int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.enforce_rate_limit('bootstrap_family', 3, 3600);

  select fm.family_id
    into v_existing_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_existing_family_id is not null then
    family_id := v_existing_family_id;
    return next;
    return;
  end if;

  select count(*)
    into v_lifetime_count
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role = 'owner';

  if coalesce(v_lifetime_count, 0) >= 5 then
    raise exception 'family-cap-reached' using errcode = 'P0001';
  end if;

  insert into public.families default values
  returning id into v_new_family_id;

  insert into public.family_members(family_id, user_id, role)
  values (v_new_family_id, v_user_id, 'owner')
  on conflict (user_id) do nothing;

  insert into public.categories(family_id, template_id, name, scope)
  select v_new_family_id, templates.id, templates.name, 'expense'
  from public.category_templates templates
  where templates.scope = 'expense'
    and not exists (
      select 1
      from public.categories c
      where c.family_id = v_new_family_id
        and c.scope = 'expense'
        and lower(c.name) = lower(templates.name)
    )
  order by templates.sort_order;

  insert into public.categories(family_id, template_id, name, color, scope)
  select
    v_new_family_id,
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
      when 'Educación'     then '#9B8AD6'
      when 'Salud'         then '#6FC4C0'
      when 'Gimnasio'      then '#C97FA0'
      else '#8A8A8A'
    end,
    'fixed_expense'
  from public.category_templates templates
  where templates.scope = 'fixed_expense'
    and not exists (
      select 1
      from public.categories c
      where c.family_id = v_new_family_id
        and c.scope = 'fixed_expense'
        and lower(c.name) = lower(templates.name)
    )
  order by templates.sort_order;

  update public.profiles
  set family_closed_by_owner_at = null
  where profiles.id = v_user_id
    and family_closed_by_owner_at is not null;

  family_id := v_new_family_id;
  return next;
end;
$function$;

-- Backfill a familias existentes (con el mismo color del CASE).
insert into public.categories (family_id, template_id, name, color, scope)
select fam.id, tpl.id, tpl.name,
  case tpl.name
    when 'Educación' then '#9B8AD6'
    when 'Salud'     then '#6FC4C0'
    when 'Gimnasio'  then '#C97FA0'
    else '#8A8A8A'
  end,
  'fixed_expense'
from public.families fam
cross join public.category_templates tpl
where tpl.scope = 'fixed_expense'
  and tpl.sort_order between 1009 and 1011
  and not exists (
    select 1 from public.categories c
    where c.family_id = fam.id
      and c.scope = 'fixed_expense'
      and lower(c.name) = lower(tpl.name)
  );
