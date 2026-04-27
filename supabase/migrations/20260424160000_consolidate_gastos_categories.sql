-- ────────────────────────────────────────────────────────────────
-- 20260424160000_consolidate_gastos_categories.sql
--
-- Shrinks the expense-scoped category catalog from 36 fine-grained
-- templates down to the 18 mockup-aligned set (colors + emoji).
--
-- The migration:
--   1. Adds `color` + `emoji` columns to `category_templates`.
--   2. Bumps existing expense-scope sort_orders out of the 1-18
--      range so the upsert in step 4 can land the new ordering
--      without colliding with the UNIQUE constraint.
--   3. Builds a 36→18 mapping in a temp table.
--   4. Upserts the 18 target templates with their visual tokens.
--   5. For each family, ensures the 18 target categories exist.
--   6. Rewrites every `expenses.category_id` that points to an
--      "old" category to point to the consolidated "new" one in
--      the same family.
--   7. Deletes the orphan categories + templates.
--   8. Refreshes every surviving category's color to match its
--      template's tokens.
--
-- Scope: only `scope = 'expense'` templates are affected.
-- `fixed_expense` scope is left intact.
-- ────────────────────────────────────────────────────────────────

-- 1. Add visual-token columns if they aren't there yet.
alter table public.category_templates
  add column if not exists color text,
  add column if not exists emoji text;

-- 2. Template name was historically UNIQUE globally, which means
-- "Servicios" (currently a fixed_expense template at sort_order
-- 1001) would collide with the new expense-scope "Servicios" we're
-- about to insert. Same story for "Impuestos". Replace the global
-- uniqueness with a scoped one: (name, scope) — both can coexist
-- across scopes and ON CONFLICT (name, scope) becomes the natural
-- upsert key.
alter table public.category_templates
  drop constraint if exists category_templates_name_key;

create unique index if not exists category_templates_name_scope_uidx
  on public.category_templates (scope, lower(name));

-- Temporarily drop the UNIQUE(sort_order) constraint so we can
-- reassign values freely during the consolidation. We re-add it
-- at the end of the migration after the final state is stable.
alter table public.category_templates
  drop constraint if exists category_templates_sort_order_key;

-- 3. Build a temporary 36→18 mapping table. Same-name rows are
-- included so step 6's join can skip them (old_name = new_name).
create temporary table tmp_category_map (
  old_name text primary key,
  new_name text not null
) on commit drop;

insert into tmp_category_map (old_name, new_name) values
  ('Gastos generales',          'Otros'),
  ('Supermercado',              'Mercado'),
  ('Almacén y kiosco',          'Mercado'),
  ('Verdulería y carnicería',   'Mercado'),
  ('Panadería',                 'Mercado'),
  ('Delivery y salidas',        'Restaurantes'),
  ('Limpieza y hogar',          'Otros'),
  ('Mantenimiento del hogar',   'Otros'),
  ('Muebles y decoración',      'Otros'),
  ('Alquiler',                  'Alquiler'),
  ('Expensas',                  'Alquiler'),
  ('Luz y gas',                 'Servicios'),
  ('Agua',                      'Servicios'),
  ('Internet, cable y celular', 'Servicios'),
  ('Transporte público',        'Transporte'),
  ('Combustible',               'Transporte'),
  ('Auto y movilidad',          'Transporte'),
  ('Salud y farmacia',          'Salud'),
  ('Obra social y seguros',     'Salud'),
  ('Educación',                 'Educación'),
  ('Niños',                     'Educación'),
  ('Mascotas',                  'Mascotas'),
  ('Ropa y calzado',            'Ropa'),
  ('Cuidado personal',          'Belleza'),
  ('Ocio y entretenimiento',    'Ocio'),
  ('Deportes y bienestar',      'Deporte'),
  ('Suscripciones y apps',      'Suscripciones'),
  ('Tecnología',                'Tecnología'),
  ('Impuestos y tasas',         'Impuestos'),
  ('Deudas y tarjetas',         'Otros'),
  ('Trámites y documentos',     'Otros'),
  ('Regalos y celebraciones',   'Regalos'),
  ('Viajes y vacaciones',       'Viajes'),
  ('Trabajo y oficina',         'Otros'),
  ('Donaciones',                'Otros'),
  ('Emergencias e imprevistos', 'Otros');

-- 4. Upsert the 18 target templates with colors + emoji + sort_order.
-- Names that were already present get their tokens refreshed + sort
-- repositioned; new names (Mercado, Servicios, Restaurantes, etc.)
-- are created fresh.
insert into public.category_templates (name, color, emoji, quick_descriptions, sort_order, scope)
values
  ('Alquiler',      '#E08E63', '🏠', array['Alquiler', 'Expensas', 'Seña']::text[],                 1,  'expense'),
  ('Mercado',       '#2E7D5B', '🛒', array['Supermercado', 'Verdulería', 'Kiosco', 'Panadería']::text[], 2, 'expense'),
  ('Transporte',    '#C9A23A', '🚌', array['SUBE', 'Nafta', 'Uber', 'Estacionamiento']::text[],    3,  'expense'),
  ('Ocio',          '#6B3A4F', '🎬', array['Cine', 'Salida', 'Streaming', 'Juegos']::text[],        4,  'expense'),
  ('Servicios',     '#0F2A1E', '💡', array['Luz', 'Gas', 'Agua', 'Internet']::text[],               5,  'expense'),
  ('Salud',         '#4A7FB8', '💊', array['Farmacia', 'Consulta', 'Prepaga', 'Obra social']::text[], 6, 'expense'),
  ('Educación',     '#7A5AA0', '📚', array['Cuota', 'Curso', 'Libros', 'Colegio']::text[],          7,  'expense'),
  ('Mascotas',      '#A35545', '🐾', array['Alimento', 'Veterinaria', 'Arena', 'Peluquería']::text[], 8, 'expense'),
  ('Ropa',          '#C06787', '👕', array['Ropa', 'Calzado', 'Accesorios']::text[],                9,  'expense'),
  ('Tecnología',    '#3D6A8A', '💻', array['Electrónica', 'Accesorio', 'Reparación']::text[],      10, 'expense'),
  ('Regalos',       '#B8853A', '🎁', array['Regalo', 'Cumpleaños', 'Souvenir']::text[],             11, 'expense'),
  ('Viajes',        '#2A7A7A', '✈️', array['Hotel', 'Pasajes', 'Excursión']::text[],                12, 'expense'),
  ('Restaurantes',  '#A04040', '🍽️', array['Restaurante', 'Café', 'Delivery']::text[],              13, 'expense'),
  ('Deporte',       '#4A7A3D', '⚽', array['Gimnasio', 'Yoga', 'Suplementos']::text[],              14, 'expense'),
  ('Suscripciones', '#5A4A7A', '📱', array['Netflix', 'Spotify', 'iCloud']::text[],                 15, 'expense'),
  ('Impuestos',     '#3A3A3A', '📄', array['ABL', 'Monotributo', 'Municipal']::text[],              16, 'expense'),
  ('Belleza',       '#B06590', '💄', array['Peluquería', 'Perfumería', 'Skincare']::text[],         17, 'expense'),
  ('Otros',         '#8A8A8A', '📦', array['Varios', 'Imprevisto', 'Ajuste']::text[],               18, 'expense')
on conflict (scope, lower(name)) do update
set color              = excluded.color,
    emoji              = excluded.emoji,
    quick_descriptions = excluded.quick_descriptions,
    sort_order         = excluded.sort_order;

-- 5. For every family, make sure each of the 18 target categories
-- exists (linked to its new template + visual tokens). The
-- `categories` table has a functional unique index on
-- (family_id, scope, lower(name)) which ON CONFLICT can't target
-- directly, so we split this into an INSERT ... WHERE NOT EXISTS
-- and a separate UPDATE for the already-existing rows.
insert into public.categories (family_id, template_id, name, color, scope)
select
  fam.id,
  tpl.id,
  tpl.name,
  tpl.color,
  'expense'
from public.families fam
cross join public.category_templates tpl
where tpl.scope = 'expense'
  and tpl.name in (select distinct new_name from tmp_category_map)
  and not exists (
    select 1 from public.categories c
    where c.family_id = fam.id
      and c.scope = 'expense'
      and lower(c.name) = lower(tpl.name)
  );

-- Refresh template_id + color on already-existing categories so
-- they point to the (possibly newly created) consolidated template.
update public.categories c
set template_id = tpl.id,
    color       = tpl.color
from public.category_templates tpl
where tpl.scope = 'expense'
  and tpl.name in (select distinct new_name from tmp_category_map)
  and c.scope = 'expense'
  and lower(c.name) = lower(tpl.name);

-- 6. Move expenses from "old" categories to their "new" target in
-- the same family. Only rows where the mapping actually changes the
-- target (old_name != new_name) are affected.
with mapping as (
  select
    c_old.id as old_category_id,
    c_new.id as new_category_id
  from public.categories c_old
  join public.category_templates t_old
    on t_old.id = c_old.template_id
  join tmp_category_map m
    on m.old_name = t_old.name
  join public.category_templates t_new
    on t_new.name = m.new_name
   and t_new.scope = 'expense'
  join public.categories c_new
    on c_new.family_id  = c_old.family_id
   and c_new.template_id = t_new.id
  where t_old.scope = 'expense'
    and m.old_name != m.new_name
)
update public.expenses
set category_id = mapping.new_category_id
from mapping
where expenses.category_id = mapping.old_category_id;

-- 7. Drop the now-empty "old" category rows from every family.
delete from public.categories c
using public.category_templates t, tmp_category_map m
where t.id = c.template_id
  and t.scope = 'expense'
  and m.old_name = t.name
  and m.old_name != m.new_name;

-- 8. Drop the orphan templates themselves (anything scope='expense'
-- whose name is not in the target 18).
delete from public.category_templates
where scope = 'expense'
  and name not in (select distinct new_name from tmp_category_map);

-- 9. Final refresh: ensure every surviving category row has its
-- color tokens aligned with the current template.
update public.categories c
set color = t.color
from public.category_templates t
where t.id = c.template_id
  and t.scope = 'expense'
  and t.color is not null;

-- 10. Restore the UNIQUE(sort_order) constraint. By now every
-- template row has a distinct sort_order (the 18 expense-scope
-- slots + however many fixed_expense-scope slots existed).
alter table public.category_templates
  add constraint category_templates_sort_order_key unique (sort_order);
