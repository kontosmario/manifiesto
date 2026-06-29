-- ────────────────────────────────────────────────────────────────
-- 20260629140000_categories_bono_alquiler_transferencia.sql
--
-- Ajuste de categorías (post-compactación 20260629120000):
--   • INGRESO: sacar "Bono" (bonus) y "Alquiler" (rental) de los tipos
--     (income_events.kind). Quedan 9 kinds.
--   • GASTO: agregar "Transferencia" como categoría variable — queda DUAL:
--     ya existe como tipo de ingreso (kind 'transfer'); un movimiento de
--     transferencia puede ser plata que entra o que sale.
--
-- En prod hoy: income_events.kind tiene bonus(3); rental no tiene filas.
-- Se remapean los bonus a 'other' antes de recrear el CHECK (sino el ALTER
-- falla por las filas existentes que violarían la nueva restricción).
-- ────────────────────────────────────────────────────────────────

-- 1. Remap de ingresos con kinds eliminados (bonus → other; rental sin filas).
update public.income_events set kind = 'other' where kind in ('bonus', 'rental');

-- 2. CHECK de income: 11 → 9 (sin bonus ni rental).
alter table public.income_events drop constraint if exists income_events_kind_check;
alter table public.income_events add constraint income_events_kind_check
  check (kind = any (array[
    'transfer','gift','other',
    'salary_extra','freelance','sale','aguinaldo','investment','refund']::text[]));

-- 3. "Transferencia" como categoría de GASTO variable (sort_order 15 libre;
--    UNIQUE(sort_order) es global y expense usa 1-14, fixed 1001+).
insert into public.category_templates (name, color, emoji, quick_descriptions, sort_order, scope)
values ('Transferencia', '#5A7A8A', '💸', array['Transferencia','Envío','Pago']::text[], 15, 'expense')
on conflict (scope, lower(name)) do nothing;

-- 4. Verificación.
do $$
declare v_exp int;
begin
  select count(*) into v_exp from public.category_templates where scope = 'expense';
  if v_exp <> 15 then
    raise exception 'Transferencia: expense=% (esperado 15)', v_exp;
  end if;
end $$;
