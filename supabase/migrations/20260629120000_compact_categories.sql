-- ────────────────────────────────────────────────────────────────
-- 20260629120000_compact_categories.sql
--
-- COMPACTACIÓN de categorías. Revierte la granularidad de fijos
-- (20260628170200: split Servicios/Seguros) y las 12 "curadas" variables
-- (20260627000000), dejando un catálogo GENERAL:
--   • Gasto variable: 30 → 14 (13 generales + Otros)
--   • Gasto fijo:     19 → 11 (10 generales + Otros)
--   • Ingreso:        CHECK income_events.kind 4 → 11 tipos
--
-- Evidencia de uso real (2026-06-29): todas las categorías a eliminar tienen
-- 0 referencias salvo 2 "stragglers" variable (Deporte=1, Impuestos=1) que se
-- REMAPEAN antes de borrar. Guarda transaccional: aborta si aparece una
-- referencia inesperada.
--
-- Idempotente respecto del split: borra las granulares si existen (no-op si
-- no). `categories` es una VIEW sobre category_templates → editar el template
-- impacta a TODAS las familias. UNIQUE(sort_order) es GLOBAL → vaciar +10000
-- antes de renumerar. Corre en una transacción.
--
-- Íconos (category-icon-map.ts) e i18n (gastos.json categoryTemplates /
-- import.incomeKind) se actualizan en el mismo cambio (cliente).
-- ────────────────────────────────────────────────────────────────

-- 1. Remap de los 2 stragglers variable ANTES de borrar (preserva su gasto).
update public.expenses
set category_id = (select id from public.category_templates where scope = 'expense' and name = 'Ocio')
where category_id = (select id from public.category_templates where scope = 'expense' and name = 'Deporte');

update public.expenses
set category_id = (select id from public.category_templates where scope = 'expense' and name = 'Otros')
where category_id = (select id from public.category_templates where scope = 'expense' and name = 'Impuestos');

-- 2. Guarda: ninguna categoría a borrar debe tener referencias remanentes.
do $$
declare
  v_refs int;
begin
  select count(*) into v_refs
  from public.category_templates ct
  where (
      (ct.scope = 'expense' and ct.name = any (array[
        'Alquiler','Suscripciones','Impuestos','Deporte','Combustible','Delivery',
        'Cafetería','Farmacia','Peluquería','Taxi','Estacionamiento','Libros',
        'Conciertos','Donaciones','Hobbies','Streaming']))
      or
      (ct.scope = 'fixed_expense' and ct.name = any (array[
        'Luz','Gas','Agua','Internet','Teléfono','Seguro auto','Seguro hogar','Prepaga','Deudas']))
    )
    and (
      exists (select 1 from public.expenses x where x.category_id = ct.id)
      or exists (select 1 from public.fixed_expenses f where f.category_id = ct.id)
      or exists (select 1 from public.category_limits l where l.category_id = ct.id)
    );
  if v_refs > 0 then
    raise exception 'Abort compactación: % categoria(s) a borrar aún tienen referencias', v_refs;
  end if;
end $$;

-- 3. Borrar las categorías eliminadas (variable: curadas + solo-fijo;
--    fijo: granulares del split + Deudas).
delete from public.category_templates
where (scope = 'expense' and name = any (array[
        'Alquiler','Suscripciones','Impuestos','Deporte','Combustible','Delivery',
        'Cafetería','Farmacia','Peluquería','Taxi','Estacionamiento','Libros',
        'Conciertos','Donaciones','Hobbies','Streaming']))
   or (scope = 'fixed_expense' and name = any (array[
        'Luz','Gas','Agua','Internet','Teléfono','Seguro auto','Seguro hogar','Prepaga','Deudas']));

-- 4. Renombrar (general). El slug nuevo (categoryTemplateKey) ya está mapeado
--    en icon-map + i18n. quick_descriptions queda igual (i18n localiza por
--    índice; los counts coinciden).
update public.category_templates set name = 'Comida y salidas'     where scope = 'expense' and name = 'Restaurantes';
update public.category_templates set name = 'Hogar'                where scope = 'expense' and name = 'Servicios';
update public.category_templates set name = 'Cuidado personal'     where scope = 'expense' and name = 'Belleza';
update public.category_templates set name = 'Ropa y calzado'       where scope = 'expense' and name = 'Ropa';
update public.category_templates set name = 'Regalos y donaciones' where scope = 'expense' and name = 'Regalos';
update public.category_templates set name = 'Deporte'             where scope = 'fixed_expense' and name = 'Gimnasio';
update public.category_templates set name = 'Cuotas y deudas'     where scope = 'fixed_expense' and name = 'Cuotas';

-- 5. Vaciar el rango de sort_order (UNIQUE global) antes de renumerar.
update public.category_templates set sort_order = sort_order + 10000;

-- 6. Insertar el catch-all "Otros" en fijos (no existía). Posición final 1011.
insert into public.category_templates (name, color, emoji, quick_descriptions, sort_order, scope)
values ('Otros', '#8A8A8A', '📦', array['Varios','Imprevisto','Ajuste']::text[], 1011, 'fixed_expense')
on conflict (scope, lower(name)) do nothing;

-- 7. Renumerar a la posición final (variable 1..14, fijo 1001..1011).
update public.category_templates set sort_order = 1  where scope = 'expense' and name = 'Mercado';
update public.category_templates set sort_order = 2  where scope = 'expense' and name = 'Comida y salidas';
update public.category_templates set sort_order = 3  where scope = 'expense' and name = 'Transporte';
update public.category_templates set sort_order = 4  where scope = 'expense' and name = 'Hogar';
update public.category_templates set sort_order = 5  where scope = 'expense' and name = 'Salud';
update public.category_templates set sort_order = 6  where scope = 'expense' and name = 'Cuidado personal';
update public.category_templates set sort_order = 7  where scope = 'expense' and name = 'Ropa y calzado';
update public.category_templates set sort_order = 8  where scope = 'expense' and name = 'Tecnología';
update public.category_templates set sort_order = 9  where scope = 'expense' and name = 'Ocio';
update public.category_templates set sort_order = 10 where scope = 'expense' and name = 'Educación';
update public.category_templates set sort_order = 11 where scope = 'expense' and name = 'Mascotas';
update public.category_templates set sort_order = 12 where scope = 'expense' and name = 'Viajes';
update public.category_templates set sort_order = 13 where scope = 'expense' and name = 'Regalos y donaciones';
update public.category_templates set sort_order = 14 where scope = 'expense' and name = 'Otros';

update public.category_templates set sort_order = 1001 where scope = 'fixed_expense' and name = 'Servicios';
update public.category_templates set sort_order = 1002 where scope = 'fixed_expense' and name = 'Vivienda';
update public.category_templates set sort_order = 1003 where scope = 'fixed_expense' and name = 'Salud';
update public.category_templates set sort_order = 1004 where scope = 'fixed_expense' and name = 'Deporte';
update public.category_templates set sort_order = 1005 where scope = 'fixed_expense' and name = 'Seguros';
update public.category_templates set sort_order = 1006 where scope = 'fixed_expense' and name = 'Suscripciones';
update public.category_templates set sort_order = 1007 where scope = 'fixed_expense' and name = 'Educación';
update public.category_templates set sort_order = 1008 where scope = 'fixed_expense' and name = 'Cuotas y deudas';
update public.category_templates set sort_order = 1009 where scope = 'fixed_expense' and name = 'Impuestos';
update public.category_templates set sort_order = 1010 where scope = 'fixed_expense' and name = 'Inversiones';
update public.category_templates set sort_order = 1011 where scope = 'fixed_expense' and name = 'Otros';

-- 8. Expandir el CHECK de tipos de ingreso (4 → 11).
alter table public.income_events drop constraint if exists income_events_kind_check;
alter table public.income_events add constraint income_events_kind_check
  check (kind = any (array[
    'transfer','bonus','gift','other',
    'salary_extra','freelance','sale','aguinaldo','investment','rental','refund']::text[]));

-- 9. Verificación final (aborta si el catálogo no quedó como se espera).
do $$
declare
  v_exp int;
  v_fix int;
begin
  select count(*) into v_exp from public.category_templates where scope = 'expense';
  select count(*) into v_fix from public.category_templates where scope = 'fixed_expense';
  if v_exp <> 14 then
    raise exception 'Compactación: expense=% (esperado 14)', v_exp;
  end if;
  if v_fix <> 11 then
    raise exception 'Compactación: fixed_expense=% (esperado 11)', v_fix;
  end if;
end $$;
