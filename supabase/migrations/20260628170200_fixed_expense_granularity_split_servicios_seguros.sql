-- ────────────────────────────────────────────────────────────────
-- 20260628170200_fixed_expense_granularity_split_servicios_seguros.sql
--
-- Granularidad de gastos FIJOS: 11 → 19. El detalle de fijos vale (se
-- cargan ~1 vez y alimentan presupuesto + asesor de suscripciones), así
-- que partimos las 2 categorías más gruesas:
--   • "Servicios" → Luz, Gas, Agua, Internet, Teléfono
--   • "Seguros"   → Seguro auto, Seguro hogar, Prepaga
--
-- ADITIVO: "Servicios" y "Seguros" se MANTIENEN como cajón/fallback —
-- hay fixed_expenses históricos que referencian su category_id y, bajo la
-- vista global, no se pueden borrar sin romperlos.
--
-- POST-CUTOVER (a diferencia de 20260627051928_add_fixed_education_health_gym):
-- `categories` ya NO es tabla sino una VIEW que proyecta
-- COALESCE(category_templates.color, '#8A8A8A'). Por eso:
--   • alcanza con setear `color` en el template (la UI de fijos usa el
--     color de la categoría) — NO hay CASE de bootstrap que tocar.
--   • bootstrap_family() ya no siembra categorías y no hay backfill
--     por-familia: insertar en category_templates las expone a TODAS las
--     familias (nuevas y existentes) automáticamente.
--
-- UNIQUE(sort_order) es GLOBAL (no por scope) → vacateamos el bloque fijo
-- +10000 antes de reubicar para que ningún paso colisione (los rangos
-- 1001-1011 y 11001-11011 no solapan). Todo corre en una transacción.
--
-- Íconos (mobile/components/category/category-icon-map.ts · FIXED_ICON_BY_SLUG):
-- luz/gas/agua/internet/telefono/prepaga ya estaban mapeados; este cambio
-- agrega seguro_auto→transporte/automovil y seguro_hogar→vivienda/vivienda.
-- Copy: mobile/lib/i18n/locales/{es,en}/gastos.json · categoryTemplates.fixed_expense.
-- ────────────────────────────────────────────────────────────────

-- 1. Vacate: sacar las 11 filas fijas actuales de la banda destino 1001-1019.
update public.category_templates
set sort_order = sort_order + 10000
where scope = 'fixed_expense';

-- 2. Insertar las 8 categorías nuevas en su posición final.
insert into public.category_templates (name, color, emoji, quick_descriptions, sort_order, scope) values
  ('Luz',          '#C9A23A', '💡', array['Factura de luz','EDESUR/EDENOR','Boleta']::text[],   1002, 'fixed_expense'),
  ('Gas',          '#A35545', '🔥', array['Factura de gas','Garrafa','Metrogas']::text[],       1003, 'fixed_expense'),
  ('Agua',         '#4A7FB8', '💧', array['Factura de agua','AySA','Boleta']::text[],           1004, 'fixed_expense'),
  ('Internet',     '#3D6A8A', '🌐', array['Cable','WiFi','Fibra']::text[],                       1005, 'fixed_expense'),
  ('Teléfono',     '#6B7A8A', '📱', array['Celular','Plan','Línea fija']::text[],                1006, 'fixed_expense'),
  ('Seguro auto',  '#3D6A8A', '🚗', array['Póliza','Cobertura','Cuota']::text[],                 1010, 'fixed_expense'),
  ('Seguro hogar', '#2A7A7A', '🏠', array['Póliza','Incendio','Robo']::text[],                   1011, 'fixed_expense'),
  ('Prepaga',      '#4A7FB8', '🩺', array['OSDE','Swiss Medical','Obra social']::text[],         1012, 'fixed_expense')
on conflict (scope, lower(name)) do nothing;

-- 3. Reubicar las filas existentes a su posición final (agrupado: utilities
--    detrás de Servicios, seguros detrás de Seguros).
update public.category_templates set sort_order = 1001 where scope='fixed_expense' and name='Servicios';
update public.category_templates set sort_order = 1007 where scope='fixed_expense' and name='Vivienda';
update public.category_templates set sort_order = 1008 where scope='fixed_expense' and name='Suscripciones';
update public.category_templates set sort_order = 1009 where scope='fixed_expense' and name='Seguros';
update public.category_templates set sort_order = 1013 where scope='fixed_expense' and name='Cuotas';
update public.category_templates set sort_order = 1014 where scope='fixed_expense' and name='Impuestos';
update public.category_templates set sort_order = 1015 where scope='fixed_expense' and name='Deudas';
update public.category_templates set sort_order = 1016 where scope='fixed_expense' and name='Inversiones';
update public.category_templates set sort_order = 1017 where scope='fixed_expense' and name='Educación';
update public.category_templates set sort_order = 1018 where scope='fixed_expense' and name='Salud';
update public.category_templates set sort_order = 1019 where scope='fixed_expense' and name='Gimnasio';
