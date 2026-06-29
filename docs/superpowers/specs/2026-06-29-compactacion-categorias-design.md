# Compactación de categorías (gasto variable, fijo, ingreso)

**Fecha:** 2026-06-29
**Branch:** `feat/compact-categories`
**Estado:** diseño aprobado · pendiente plan de implementación

## 1. Problema

Cambios recientes agregaron *granularidad* a las categorías (split de fijos Servicios→Luz/Gas/Agua/Internet/Teléfono y Seguros→Seguro auto/hogar/Prepaga el 2026-06-28; 12 categorías "curadas" en variable el 2026-06-27). Eso aumentó la fricción al cargar un gasto/fijo y creó parálisis de decisión (conviven los hijos finos y los padres "cajón"). El owner quiere **compactar a categorías GENERALES e importantes** y bajar la complejidad de cargar un movimiento.

**Evidencia de uso real en producción** (proyecto `xaquigyhylzvuyfslkqq`, medido por referencias en `expenses`/`fixed_expenses`/`category_limits`):

- Los 5 hijos de Servicios (Luz, Gas, Agua, Internet, Teléfono) → **0 referencias**.
- Los 3 de Seguros (Seguro auto, Seguro hogar, Prepaga) → **0 referencias**.
- Las 12 "curadas" variables (Combustible, Delivery, Cafetería, Farmacia, Peluquería, Taxi, Estacionamiento, Libros, Conciertos, Donaciones, Hobbies, Streaming) → **todas 0**.
- También 0: Cuotas, Deudas, Inversiones, Impuestos-fijo, Educación-fijo, Salud-fijo, Gimnasio, Alquiler-variable, Suscripciones-variable.
- Con uso (se conservan): variable Mercado(103), Transporte(48), Restaurantes(43), Otros(20), Ropa(19), Servicios(16), Salud(16), Ocio(15), Tecnología(11), Mascotas(6), Belleza(4), Viajes(4), Regalos(3), Educación(2), Deporte(1), Impuestos(1); fijo Suscripciones(32), Servicios(19), Vivienda(9), Seguros(3).

→ La granularidad tiene **adopción casi nula**, así que la compactación se puede hacer **sin migración de datos riesgosa**.

## 2. Objetivos / No-objetivos

**Objetivos**
- Gasto variable: de 30 → **13 categorías generales + Otros**.
- Gasto fijo: de 19 → **10 generales + Otros** (revierte la granularidad).
- Ingreso: de 4 → **11 tipos** (expansión pedida por el owner).
- Cada categoría/ tipo resuelve a un **ícono sticker real** (ninguna cae al emoji fallback).
- **100% testeado**: cobertura unitaria de resolución de íconos, slugs, filtro variable y catálogo de ingresos.

**No-objetivos**
- No tocar el modelo de sobrante/ciclo, métricas de Home ni el OCR/import.
- No rediseñar el sticker set completo (solo se agrega 1 ícono nuevo: "Venta").
- No migrar/renombrar categorías *custom* de usuarios (no existen en prod: `family_custom_categories` = 0 filas).

## 3. Arquitectura actual (verificada)

- **Catálogo global vivo en prod.** La app lee la VIEW `public.categories` (`mobile/features/categories/use-categories.ts`): `from('categories').or(family_id.eq.X, family_id.is.null).eq('scope', …).order('created_at')`. La view = `category_templates` (standard, `family_id NULL`) ∪ `family_custom_categories` (custom). **Editar `category_templates` impacta a TODAS las familias automáticamente** — no hay seed/backfill por familia.
- **`UNIQUE(scope, lower(name))`** en `category_templates`. **`UNIQUE(sort_order)` GLOBAL** (no por scope) → al renumerar hay que vaciar (`+10000`) antes de reubicar.
- **Nombre crudo = fuente de verdad.** `category_templates.name` (ES) se compara contra `gastos:categoryTemplates.<scope>.<key>.default` para decidir si se muestra localizado. `key = categoryTemplateKey(name)` = NFD, sin diacríticos, `[^a-z0-9]+ → _`, trim `_`. Ej.: "Comida y salidas" → `comida_y_salidas`, "Ropa y calzado" → `ropa_y_calzado`.
  - **Implicación de correctitud:** al renombrar una categoría su `key` cambia → hay que (a) agregar la entrada nueva en `category-icon-map.ts` (si no, el ícono cae al emoji) y (b) crear la key i18n `categoryTemplates.<scope>.<newkey>` con `.default` EXACTAMENTE igual al `name` de la DB (si no, EN muestra el nombre ES crudo).
- **Resolución de íconos.** `mobile/components/category/category-icon-map.ts` → `resolveCategoryIconKey(rawName, scope)` busca `categoryTemplateKey(rawName)` en `EXPENSE_ICON_BY_SLUG`/`FIXED_ICON_BY_SLUG` y valida contra el registry generado `category-icon-registry.ts` (89 PNG; SVG fuente en `assets/category-icons/_src/<grupo>/<slug>.svg`, rasterizados por `scripts/gen-category-icons.mjs`).
- **Ingreso NO es catálogo.** `income_events.kind` (texto) + `description`. **Existe CHECK** `income_events_kind_check = kind IN ('transfer','bonus','gift','other')` → agregar tipos **requiere migración** del CHECK. El tipo `IncomeEventKind` vive en `mobile/features/income/use-income-events.ts:19`; el array `KINDS` (label + icon key) está inline en `mobile/screens/home/add-income-screen.tsx` (grilla 2×2, `width:48%`). Labels en `gastos:import.incomeKind.<kind>`.
- **Pickers.** Componente compartido `mobile/components/home/category-horizontal-rail.tsx` (rail scroll 2-filas; soporta modo `staticGrid` no usado hoy). Variable filtra 6 nombres "solo-fijo" (`mobile/features/expenses/variable-expense-categories.ts`) y ordena por uso (`rankCategoriesByUsage` en `category-ranking.ts`). **Fijo NO filtra ni rankea** (orden `created_at` asc) → es el flujo más golpeado.

## 4. Diseño

### 4.1 Gasto variable — 13 + Otros

| Slug (DB name) | i18n key | Acción sobre fila actual | Ícono (icon-map) |
|---|---|---|---|
| Mercado | `mercado` | mantener | `alimentacion/supermercado` |
| **Comida y salidas** | `comida_y_salidas` | **renombrar** ← Restaurantes | `alimentacion/comida-rapida` |
| Transporte | `transporte` | mantener | `transporte/transporte-publico` |
| **Hogar** | `hogar` | **renombrar** ← Servicios (var) | `servicios-general/servicios` |
| Salud | `salud` | mantener | `salud/medico` |
| **Cuidado personal** | `cuidado_personal` | **renombrar** ← Belleza | `cuidado-personal/maquillaje` |
| **Ropa y calzado** | `ropa_y_calzado` | **renombrar** ← Ropa | `cuidado-personal/ropa` |
| Tecnología | `tecnologia` | mantener | `tecnologia/celular` |
| Ocio | `ocio` | mantener | `entretenimiento/salidas-cine` |
| Educación | `educacion` | mantener | `educacion/educacion` |
| Mascotas | `mascotas` | mantener | `servicios-general/mascotas` |
| Viajes | `viajes` | mantener | `transporte/avion` |
| **Regalos y donaciones** | `regalos_y_donaciones` | **renombrar** ← Regalos | `servicios-general/regalos` |
| Otros | `otros` | mantener | `servicios-general/otros` |

**Borrar (0 refs):** Alquiler, Suscripciones, las 12 curadas (Combustible, Delivery, Cafetería, Farmacia, Peluquería, Taxi, Estacionamiento, Libros, Conciertos, Donaciones, Hobbies, Streaming).
**Remap antes de borrar (1 ref c/u):** Deporte-var(1) → Ocio; Impuestos-var(1) → Otros. (`UPDATE expenses SET category_id = <destino> WHERE category_id = <origen>` y recomputar `monthly_summaries.category_breakdown` no hace falta: el breakdown se recalcula al cerrar ciclo; las filas históricas afectadas son del cycle vigente.)
**Quitar filtro:** `FIXED_ONLY_CATEGORY_NAMES` queda vacío (Salud y Educación vuelven a aparecer en variable; Servicios renombrado a Hogar ya no aplica). Se elimina el filtro en el controller (o se deja como no-op documentado).

### 4.2 Gasto fijo — 10 + Otros (revierte granularidad)

| Slug (DB name) | i18n key | Acción | Ícono (FIXED_ICON_BY_SLUG) |
|---|---|---|---|
| Servicios | `servicios` | mantener (absorbe Luz/Gas/Agua/Internet/Teléfono) | `vivienda/electricidad` |
| Vivienda | `vivienda` | mantener | `vivienda/vivienda` |
| Salud | `salud` | mantener (Prepaga/obra social) | `salud/medico` |
| **Deporte** | `deporte` | **renombrar** ← Gimnasio | `salud/gimnasio` |
| Seguros | `seguros` | mantener (auto/vida/hogar) | `finanzas/seguros` |
| Suscripciones | `suscripciones` | mantener | `extra/subscripciones` |
| Educación | `educacion` | mantener | `educacion/educacion` |
| **Cuotas y deudas** | `cuotas_y_deudas` | **renombrar** ← Cuotas (fusiona Deudas) | `finanzas/deuda` |
| Impuestos | `impuestos` | mantener | `finanzas/impuestos` |
| Inversiones | `inversiones` | mantener | `finanzas/inversiones` |
| **Otros** | `otros` | **insertar** (catch-all nuevo en fijos) | `servicios-general/otros` |

**Borrar (0 refs):** Luz, Gas, Agua, Internet, Teléfono, Seguro auto, Seguro hogar, Prepaga, Deudas.
**Sin remap necesario** (las 9 a borrar tienen 0/0 referencias).
Nota: la migración nueva **supersede** a `20260628170200…` (que está aplicada en prod pero sin commitear). Hay que dejar el estado de prod consistente con el repo (ver §7).

### 4.3 Ingreso — 4 → 11 tipos

| `kind` (valor DB) | label i18n `import.incomeKind.*` | Ícono | Estado |
|---|---|---|---|
| `salary_extra` | `salaryExtra` — "Sueldo extra / 2do trabajo" | `finanzas/banco` | nuevo |
| `freelance` | `freelance` — "Freelance / Honorarios" | `extra/computadora` | nuevo |
| `sale` | `sale` — "Venta" | `finanzas/venta` | nuevo · **ícono SVG nuevo** |
| `aguinaldo` | `aguinaldo` — "Aguinaldo" | `finanzas/bono` (hoy sin uso) | nuevo |
| `bonus` | `bonus` — "Bono" | `finanzas/bonus` | existente |
| `investment` | `investment` — "Inversiones / Rendimientos" | `finanzas/inversiones` | nuevo |
| `rental` | `rental` — "Alquiler / Renta" | `vivienda/vivienda` | nuevo |
| `refund` | `refund` — "Reintegro / Reembolso" | `finanzas/cajero` | nuevo |
| `gift` | `gift` — "Regalo" | `servicios-general/regalos` | existente |
| `transfer` | `transfer` — "Transferencia" | `finanzas/transferencia` | existente (se conserva, ubicada abajo) |
| `other` | `other` — "Otro" | `finanzas/billetera` | existente (fallback) |

- **Migración:** `ALTER TABLE income_events DROP CONSTRAINT income_events_kind_check`, recrear con los 11 valores. (Columna sigue siendo texto libre a nivel tipo; el CHECK la acota.)
- **App:** extender `IncomeEventKind` a los 11; **extraer `KINDS` a un módulo puro** `mobile/features/income/income-kinds.ts` (label key + icon key) para poder testearlo sin React; el picker pasa de grilla 2×2 a **grilla de 3 columnas** (`width≈31%`, wrap a ~4 filas) dentro del `ScrollView` del Screen. Orden sugerido: Sueldo extra, Freelance, Venta, Aguinaldo, Bono, Inversiones, Alquiler, Reintegro, Regalo, Transferencia, Otro.
- El push hardcodeado en `use-income-events.ts` (`transfer/bonus/gift→else 'Ingreso'`) queda igual: los kinds nuevos caen a "Ingreso" (server-bound, @i18n-ignore; follow-up).

## 5. Ícono nuevo: "Venta"

- Crear `mobile/assets/category-icons/_src/finanzas/venta.svg` en el estilo de los stickers `finanzas/*` existentes (revisar un `_src/finanzas/*.svg` para igualar trazo, padding, paleta). Concepto: etiqueta de precio / "vendido".
- Correr `node scripts/gen-category-icons.mjs` para rasterizar el PNG (@256) y regenerar `category-icon-registry.ts` (la key `finanzas/venta` debe aparecer en `CATEGORY_ICONS` y en el tipo `CategoryIconKey`).
- Verificar conteo: registry pasa de 89 → 90 entradas; PNGs `assets/category-icons/finanzas/venta.png` presente.

## 6. Cambios por archivo

**DB (1 migración nueva, transaccional):** `supabase/migrations/<ts>_compact_categories.sql`
1. Remap `expenses` (Deporte-var→Ocio, Impuestos-var→Otros) — por `category_id` resuelto vía subquery a `category_templates` (scope='expense').
2. `DELETE` 16 templates variable (Alquiler, Suscripciones, Deporte, Impuestos + 12 curadas) y 9 fijos (Luz, Gas, Agua, Internet, Teléfono, Seguro auto, Seguro hogar, Prepaga, Deudas). **Guardas:** `WHERE scope=… AND name=…`; abortar si quedan referencias inesperadas (`expenses`/`fixed_expenses`/`category_limits`).
3. `UPDATE … set name` para renombres (variable: Restaurantes→Comida y salidas, Servicios→Hogar, Belleza→Cuidado personal, Ropa→Ropa y calzado, Regalos→Regalos y donaciones; fijo: Gimnasio→Deporte, Cuotas→Cuotas y deudas). Setear `color`/`emoji` coherentes.
4. `INSERT` fijo "Otros".
5. Renumerar `sort_order` (vaciar `+10000` por scope, luego asignar 1..N variable y 1001..N fijo).
6. `ALTER … income_events_kind_check` con los 11 kinds.

**Cliente:**
- `mobile/components/category/category-icon-map.ts`: agregar keys `comida_y_salidas`, `hogar`, `cuidado_personal`, `ropa_y_calzado`, `regalos_y_donaciones` (EXPENSE) y `deporte`, `cuotas_y_deudas`, `otros` (FIXED). (Mantener los slugs viejos no molesta, pero se pueden limpiar.)
- `mobile/features/income/use-income-events.ts`: `IncomeEventKind` → 11 valores.
- `mobile/features/income/income-kinds.ts` (**nuevo, puro**): catálogo `KINDS` (key, labelKey, icon).
- `mobile/screens/home/add-income-screen.tsx`: importar `KINDS` del módulo nuevo; grilla 3-col.
- `mobile/features/expenses/variable-expense-categories.ts`: vaciar el set (o quitar el filtro en el controller).
- Fijo picker: aplicar `rankCategoriesByUsage` también en el flujo de fijos (paridad con variable) — `mobile/screens/home/add-fijo-v2-screen.tsx`.

**i18n** (`mobile/lib/i18n/locales/{es,en}/gastos.json`):
- `categoryTemplates.expense`: agregar `comida_y_salidas`, `hogar`, `cuidado_personal`, `ropa_y_calzado`, `regalos_y_donaciones` (con `.default` = name ES exacto, `.name`, `.quickDescriptions`); borrar las keys de las categorías eliminadas/renombradas viejas.
- `categoryTemplates.fixed_expense`: agregar `deporte`, `cuotas_y_deudas`, `otros`; borrar `luz`,`gas`,`agua`,`internet`,`telefono`,`seguro_auto`,`seguro_hogar`,`prepaga`,`deudas`,`gimnasio`,`cuotas`.
- `import.incomeKind`: agregar `salaryExtra`, `freelance`, `sale`, `aguinaldo`, `investment`, `rental`, `refund`.
- Paridad ES/EN obligatoria (gate de `npm run validate`).

**Docs:** `docs/sistemas/category-icons.md` (conteos nuevos, ícono "Venta", catálogo de ingresos).

**Tests:** ver §8.

**Limpieza:** descartar el archivo WIP `20260628170200_fixed_expense_granularity_split_servicios_seguros.sql` y `tests/unit/fixed-expense-granularity.test.ts` (testea el split que revertimos).

## 7. Estrategia de prod / migraciones

- Hay **drift**: la migración de granularidad está aplicada en prod pero sin commitear, y el checklist de pre-deploy pide *no* `db push`. → La migración nueva de compactación se **escribe en el repo** y se valida localmente; **el apply a prod se coordina aparte** (no se pushea desde acá sin confirmación explícita del owner). La migración debe ser idempotente/segura ante el estado actual de prod (los 8 splits presentes).
- Las screenshots del App Store ya están armadas; este cambio no altera imágenes ya capturadas (si se re-shootea, se hace aparte).

## 8. Testing (objetivo: 100%)

Entorno vitest = `node`, sin renderer React (solo módulos puros). **Nota de feasibility:** `category-icon-registry.ts` hace `require()` de PNGs → cargarlo en vitest-node puede romper. Antes de escribir los tests, verificar el stub de assets en la config de vitest (`vitest.config`/`setup`); si no existe, los tests de íconos deben validar contra una **lista de keys pura** (p.ej. el set de `CategoryIconKey`) en vez de importar el map con los `require`. Tests nuevos/actualizados:

1. **`tests/unit/category-icon-resolution.test.ts`** — para cada categoría del catálogo final (variable 14, fijo 11) `resolveCategoryIconKey(name, scope)` devuelve una key **no-null** y presente en `CATEGORY_ICONS`. (Esto cubre directamente "íconos correspondientes".)
2. **`tests/unit/category-template-key.test.ts`** — `categoryTemplateKey` produce los slugs esperados para los nombres nuevos (incl. los compuestos con "y").
3. **`tests/unit/income-kinds.test.ts`** — el catálogo `KINDS` tiene 11 entradas; cada `icon` existe en `CATEGORY_ICONS`; cada `labelKey` resuelve a un string no vacío (ES y EN); el set de `key` == el union `IncomeEventKind` == la lista del CHECK (constante espejo).
4. **`tests/unit/variable-expense-categories.test.ts`** — el filtro ya no oculta Salud/Educación; (si se deja) set vacío.
5. **Reemplazar** `tests/unit/fixed-expense-granularity.test.ts` → `tests/unit/category-compaction.test.ts`: cuenta de catálogo (variable 14 incl. Otros, fijo 11 incl. Otros), ausencia de los slugs eliminados, presencia de los renombrados.
6. Gate completo: `npm run validate` (tsc mobile + i18n paridad + lint) y `npx expo export --platform ios` si cambian deps (no se esperan deps nuevas).

## 9. Riesgos / mitigaciones

- **Ícono al emoji por slug nuevo no mapeado** → test (1) lo caza antes de mergear.
- **EN mostrando nombre ES** si `.default` ≠ `name` DB → revisión cuidadosa de que cada `.default` calque el `name` insertado/renombrado; test de paridad i18n.
- **Colisión `UNIQUE(sort_order)` global** al renumerar → patrón vaciar `+10000` (ya probado en la migración de granularidad).
- **Drift prod** → no pushear; migración idempotente; apply coordinado.
- **Borrar fila con referencia inesperada** → guardas de conteo en la migración (abortar la transacción si `count>0`).

## 10. Criterio de "hecho"

- Variable 13+Otros, fijo 10+Otros, ingreso 11 — todos con ícono sticker real.
- `npm run validate` verde; suite unitaria nueva 100% verde; bundle iOS OK.
- Migración escrita, idempotente y revisada (apply a prod coordinado aparte).
- `docs/sistemas/category-icons.md` actualizado; WIP de granularidad descartado.
