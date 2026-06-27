# Sistema de íconos de categoría (stickers)

Reemplaza los emojis de categorías/ingresos/fijos/frecuencias/metas/jardín por
**stickers PNG multicolor** (89 íconos). Diseñado para crecer sin inflar el
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
- Ingresos: `add-income-screen` (KINDS) + `income-row` (`finanzas/*`, `regalos`).
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

**Sumar una categoría default nueva**: migración additiva a `category_templates`
(sort_order libre: expense 1-18+, fixed 1001+) + backfill a familias existentes
(patrón de `20260424160000` / `20260627000000`) — el bootstrap siembra las
nuevas a familias nuevas. Agregar i18n en `categoryTemplates.expense.<slug>`
(ES + EN, `default`=nombre español para el gate de localización) y el slug en el
icon-map. `categories.color` queda NULL (hue por nombre).

Catálogo actual: **30 expense** (18 consolidadas + 12 curadas 2026-06-27) +
**11 fixed** (8 + Educación/Salud/Gimnasio 2026-06-27). ⚠️ El scope `fixed_expense`
usa el color GUARDADO de la categoría (fijo-row/grupos), por eso una categoría
fija nueva necesita color en el CASE de `bootstrap_family` (familias nuevas) +
en el backfill (existentes) — a diferencia de expense, que deriva el hue del
nombre. De los 89 íconos, 4 quedan sin asignar a propósito (arte duplicado +
`crecimiento/brote-bebe` como swap del jardín).
