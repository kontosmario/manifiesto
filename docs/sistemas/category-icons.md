# Sistema de íconos de categoría (stickers)

Reemplaza los emojis de categorías/ingresos/fijos/frecuencias/metas/jardín por
**stickers PNG multicolor** (90 íconos). Diseñado para crecer sin inflar el
bundle JS y para "encenderse" automáticamente en categorías custom.

## Pipeline

`scripts/gen-category-icons.mjs`:
1. Lee SVGs del owner desde `mobile/assets/category-icons/_src/<grupo>/<slug>.svg`.
2. Optimiza con SVGO (floatPrecision 1).
3. Rasteriza a PNG @256px con `sharp` (density 384).
4. Escribe `mobile/assets/category-icons/<grupo>/<slug>.png` + regenera
   `mobile/components/category/category-icon-registry.ts`.

Flag `--import="<carpeta>"` copia+optimiza SVGs crudos a `_src/` primero.
Correr: `node scripts/gen-category-icons.mjs` (node vía `source ~/.nvm/nvm.sh`).

Los PNG van por el **asset pipeline de Metro** (lazy, cacheados) → NO inflan el
bundle JS (vs SVG inline). El registry exporta `CATEGORY_ICONS: Record<string,
ImageSourcePropType>` (key = `<grupo>/<slug>`) + el tipo `CategoryIconKey`.

## Resolución (categoría → ícono)

`mobile/components/category/category-icon-map.ts`:
- `EXPENSE_ICON_BY_SLUG` / `FIXED_ICON_BY_SLUG`: **slug** → key del registry.
- El slug se computa con `categoryTemplateKey(nombreCRUDO)` — separador `_`
  (NO `-`), acentos quitados. ⚠️ Las keys multi-palabra del mapa van con
  underscore (`corte_de_pelo`), nunca guión, sino NO matchean.
- `resolveCategoryIconKey(rawName, scope)` → key o `null`.
- Incluye **sinónimos ES** (combustible/nafta, taxi/uber, gimnasio/gym…) así
  cualquier categoría custom que el usuario nombre se enciende con su sticker.

`<CategoryIcon name={rawName} scope size emojiStyle />`
(`mobile/components/category/category-icon.tsx`): rendea el sticker si hay slug
mapeado, sino cae al emoji legacy (`pickIconForCategory` /
`pickIconForFixedExpenseCategory`). SIEMPRE pasar el nombre **crudo** (no el
`displayName` localizado).

## Superficies cableadas

- Picker (`category-horizontal-rail`, prop `iconScope`) — add-gasto y add-fijo.
- Filas/listas: `gasto-row`, `fijo-row`, `fijo-category-groups`,
  `home-activity` (ActivityRowV2 `icon: ReactNode`), `gastos-smart-filter`
  (GastosFilterPill `iconNode`), `step2-summary`, `calendar-drop-impact`.
- Ingresos: `income-kinds.ts` (`INCOME_KINDS`, 11 tipos — módulo puro testeable)
  renderizado por `add-income-screen` + `income-row` (`finanzas/*`, `vivienda`, `regalos`).
- Ciclos/frecuencias: `cycle-config-section` + `FreqTile` (FREQ_OPTIONS →
  `frecuencias/*`).
- Metas: `GoalIcon` (`goal-icon.tsx` + `goal-icon.ts`) detecta sticker-key vs
  emoji; el campo `emoji` guarda el emoji literal o la key (`metas/playa`).
- Jardín: `sprout.tsx` (`seed`→`crecimiento/semilla`, `germ`→`crecimiento/mini-brote`).
- **Excepción**: `month-summary-card` mantiene su glyph monocromo
  (`pickMaterialIconForCategory`) por decisión del owner.

El color/hue del badge se deriva del **nombre** (`resolveCategoryHueByName`), no
del sticker ni de `categories.color`.

## Recetas

**Sumar un ícono nuevo**: dejar el SVG en `_src/<grupo>/<slug>.svg` → correr el
generador → mapear el slug en `category-icon-map.ts`.

**Sumar una categoría default nueva** (post-cutover): migración aditiva a
`category_templates` (sort_order libre: expense 1-30+, fixed 1001+). Como
`categories` es una VIEW global (templates ∪ custom per-familia), insertar el
template ya la expone a TODAS las familias —nuevas y existentes—: NO hay backfill
ni CASE de `bootstrap_family` que tocar (eso era el patrón pre-cutover, ver
`20260627051928`). Para `fixed_expense` SETEAR `color` en el template: la vista
proyecta `COALESCE(category_templates.color,'#8A8A8A')` y la UI de fijos
(fijo-row/grupos) usa ese color. Para `expense` el color queda NULL (hue por
nombre). Agregar i18n en `categoryTemplates.<scope>.<slug>` (ES + EN,
`default`=nombre español para el gate de localización) y el slug en el icon-map.
⚠️ `sort_order` tiene UNIQUE **global** (no por scope): si renumerás, vacateá
(+10000) antes de reubicar para no colisionar (ver `20260628170200`).

Catálogo actual (compactado 2026-06-29, migración `20260629120000`): **14 expense**
(13 generales + Otros) + **11 fixed** (10 generales + Otros). Revierte la
granularidad de fijos (`20260628170200`) y las 12 "curadas" variables
(`20260627000000`): lo fino (Luz/Gas/Taxi/Prepaga…) se absorbe en su general y la
especificidad la cubren los sinónimos del icon-map + categorías custom. **Ingresos**:
11 tipos en `income-kinds.ts` (acotados por `income_events_kind_check`). De los **90
íconos**, 3 quedan sin asignar a propósito (`deportes/objetivo` y
`entretenimiento/deportes` = arte duplicado; `crecimiento/brote-bebe` = swap del
jardín); `finanzas/venta` (sticker del dólar) lo usa el ingreso "Venta" y
`finanzas/bono` el "Aguinaldo".
