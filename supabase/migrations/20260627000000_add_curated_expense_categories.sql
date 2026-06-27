-- ────────────────────────────────────────────────────────────────
-- 20260627000000_add_curated_expense_categories.sql
--
-- Suma 12 categorías de gasto curadas (las más comunes genuinamente
-- nuevas) al catálogo de templates, expandiendo el set consolidado de
-- 18 → 30. Acompaña el nuevo sistema de íconos sticker: cada una ya
-- tiene su ícono mapeado en el cliente (category-icon-map.ts) por su
-- slug estable (categoryTemplateKey del nombre).
--
--   1. Inserta los 12 templates en sort_order 19-30 (expense usa 1-18,
--      fixed_expense usa 1001+, así que 19-30 está libre).
--   2. Backfill: crea la categoría en TODAS las familias existentes que
--      no la tengan (mismo patrón que la consolidación 20260424160000).
--      Las familias NUEVAS las reciben automáticamente vía bootstrap_family
--      (siembra todos los templates scope='expense').
--
-- categories.color queda NULL (igual que el bootstrap): el color/hue del
-- badge se deriva del NOMBRE en el cliente (resolveCategoryHueByName),
-- no de esta columna. Idempotente (on conflict / not exists).
-- ────────────────────────────────────────────────────────────────

insert into public.category_templates (name, color, emoji, quick_descriptions, sort_order, scope)
values
  ('Combustible',     '#C9A23A', '⛽', array['Nafta','Gasoil','Carga','Estación']::text[],      19, 'expense'),
  ('Delivery',        '#A04040', '🛵', array['Pedido','Comida','Envío','App']::text[],           20, 'expense'),
  ('Cafetería',       '#8A5A3A', '☕', array['Café','Desayuno','Merienda','Bar']::text[],        21, 'expense'),
  ('Farmacia',        '#4A7FB8', '💊', array['Remedios','Receta','Cuidado','Farmacia']::text[],  22, 'expense'),
  ('Peluquería',      '#B06590', '💇', array['Corte','Color','Peinado','Barba']::text[],         23, 'expense'),
  ('Taxi',            '#D4A017', '🚕', array['Taxi','Uber','Remis','Cabify']::text[],            24, 'expense'),
  ('Estacionamiento', '#6B7A8A', '🅿️', array['Cochera','Peaje','Garage','Parking']::text[],      25, 'expense'),
  ('Libros',          '#7A5AA0', '📖', array['Libro','Librería','eBook','Revista']::text[],      26, 'expense'),
  ('Conciertos',      '#6B3A4F', '🎵', array['Recital','Show','Entrada','Festival']::text[],     27, 'expense'),
  ('Donaciones',      '#4A7A3D', '🤝', array['Donación','Aporte','Caridad','Colecta']::text[],   28, 'expense'),
  ('Hobbies',         '#2A7A7A', '🎨', array['Arte','Pasatiempo','Taller','Hobby']::text[],      29, 'expense'),
  ('Streaming',       '#5A4A7A', '📺', array['Netflix','Spotify','Disney','HBO']::text[],        30, 'expense')
on conflict (scope, lower(name)) do nothing;

-- Backfill a familias existentes (no pisa categorías con el mismo nombre).
insert into public.categories (family_id, template_id, name, scope)
select fam.id, tpl.id, tpl.name, 'expense'
from public.families fam
cross join public.category_templates tpl
where tpl.scope = 'expense'
  and tpl.sort_order between 19 and 30
  and not exists (
    select 1 from public.categories c
    where c.family_id = fam.id
      and c.scope = 'expense'
      and lower(c.name) = lower(tpl.name)
  );
