# Refactor: catálogo global de categorías + custom per-familia

**Estado:** ✅ CUTOVER APLICADO A PROD (2026-06-27), mergeado a `main`. Verificado:
categories=view, home_snapshot 30/11, 0 huérfanos, `categories_legacy` +
`_migration_category_id_backup` (399) intactos. **Requiere reship del build** (el
build viejo manda category_id viejos que el modelo nuevo rechaza).
**Motivo:** hoy `bootstrap_family` copia las 41 categorías del catálogo a CADA
familia (`categories` per-familia). 0 familias crearon custom o renombraron →
es 100% duplicación. Objetivo del owner: catálogo global compartido + tabla
per-familia SOLO para custom (preparada para el futuro).

## Modelo actual (antes)

```
category_templates (global, 41 filas)  ──┐ template_id
                                          ▼
categories (per-familia, 451 filas = 11×41)  ◄── FK ── expenses.category_id (NOT NULL)
   id, family_id, name, color, template_id, scope         fixed_expenses.category_id (null)
                                                           category_limits.category_id
```
- `bootstrap_family` copia todos los templates por scope a `categories`.
- 7 RPCs joinean `categories` para name/color; trigger valida family ownership.

## Modelo objetivo (después)

```
category_templates (global, read-only) ── "standard", igual para todas las familias
family_custom_categories (per-familia)  ── "custom", editable por la familia (NUEVO)
```
- **Standard** = los templates globales. Read-only (una familia no puede renombrar
  algo compartido). Su `id` es el `template_id` (global, estable).
- **Custom** = filas per-familia (create/rename/recolor/delete). Preparado para
  el futuro; el create ya se cablea (reemplaza el insert a `categories`).
- `expenses/fixed_expenses/category_limits.category_id` = uuid que apunta a un
  template O a un custom (referencia "blanda", validada por trigger). Se mantiene
  el nombre de columna `category_id` (mínima fricción).
- Las categorías visibles de una familia = `todos los templates de su scope` +
  `sus customs de ese scope`, vía RPC `family_categories(family_id, scope)`.

### Por qué standard read-only (no override-merge)
Las renames/recolores per-familia de un catálogo compartido obligan a una capa de
overrides (merge en cada lectura) — la complejidad que se quería evitar. Como **0
familias** customizaron, adoptamos standard=read-only + custom-editable: cero
merge. El UI de rename/recolor aplica solo a customs (y el delete de standards ya
estaba roto por `trg_prevent_categories_delete`).

## Migración (EXPAND / CONTRACT, reversible)

Determinística porque **toda categoría actual tiene `template_id`** (0 custom):
`category_id` viejo → `template_id` sin ambigüedad.

**EXPAND** (`20260627020000`, additivo, NO rompe el build vivo):
1. Crear `family_custom_categories` (id, family_id, name, color, scope, created_at) + RLS + índices.
2. Backfill `expenses/fixed_expenses/category_limits.category_id := categories.template_id`.
3. Reemplazar FK dura `… → categories` por validación en trigger
   `ensure_category_ref` (acepta template global O custom de la familia).
4. Reescribir RPCs (gastos_categories_with_counts, gastos_hero_summary,
   gastos_expenses_for_day/paginated, home_snapshot, close_monthly_cycle) para
   leer de `category_templates` (∪ `family_custom_categories`) — **mismo shape de salida**.
5. `bootstrap_family`: dejar de copiar al crear familia.
6. **Conservar** `categories` (renombrada `categories_legacy`) como backup. NO se dropea acá.

**CONTRACT** (posterior, tras adoptar el build nuevo): dropear `categories_legacy`.

### Rollback
EXPAND es reversible: `categories_legacy` intacta + las migraciones de FK/trigger
se revierten restaurando la FK. Backup de los `category_id` viejos en una tabla
`_migration_category_id_backup` antes del paso 2.

## App (branch)
- `useCategories` → RPC `family_categories` (templates ∪ custom, ids estables).
- `home_snapshot`/`gastos_*` ya devuelven arrays de categoría → cambia la fuente, mismo shape.
- Mutations: `useCreateCategory` → `family_custom_categories`; rename/delete solo customs.
- `localizeCategoryName`/icon/hue: sin cambio (resuelven por name crudo/template_id).
- Tests golden (home-snapshot-shape, category-display-name-seed, variable-expense-
  categories) pasan SIN cambios: el shape de los RPCs se preserva (la view + los
  tweaks no alteran las columnas/keys de salida).

## Verificación
tsc + bundle + suite vitest + tests de integración en un **Supabase branch** (DB
aislada) antes de aplicar a prod. Code review (agentes) hasta OK.

## Riesgo / coordinación
Toca el flujo núcleo de gasto. Pre-launch (TestFlight) → aceptable, pero el build
nuevo debe shipearse junto con la migración (el build viejo manda `category_id`
viejos; EXPAND mantiene `categories_legacy` por compat durante la transición).
```
```
