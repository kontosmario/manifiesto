# Activity OCR + Import Review — Shipped 2026-06-03

Status: ✅ Code-complete y merged a `main`. **73 commits** sobre la rama `feature/activity-ocr` (especificación + implementación + iteración UX + cross-form rollout). 0 migraciones — todo cliente + reuso de mutations existentes (`createExpense`, `useCreateIncomeEvent`).

> 📖 **Doc canónico del sistema:** [`docs/sistemas/activity-ocr.md`](../sistemas/activity-ocr.md). Esta nota fechada cubre el "qué se trabajó". El doc del sistema cubre el "cómo funciona hoy" y "cómo agregar bancos nuevos".
>
> 📖 **Patrón de validación de forms** introducido en este package y rolloueado a add-expense/income/fijo: [`docs/sistemas/form-validation-pattern.md`](../sistemas/form-validation-pattern.md).

---

## TL;DR

El usuario saca foto del feed de movimientos de su banco/wallet (MP, Macro, Francés, Provincia, Santander, Galicia, Naranja X, banco original), OCR extrae las líneas, un parser puro las convierte a `Transaction[]`, y un **wizard one-by-one** revisa cada movimiento (kind toggle + monto + descripción + fecha + categoría) antes de confirmarlos contra la DB.

Al confirmar: `Promise.allSettled` de `createExpense` / `createIncome` por row + una sola pasada de `syncAllAfterMutation` que invalida ~15 query keys (Home, Gastos, Control, Streaks, snapshot roots). Toast + confetti si ≥3 inserciones sin failures.

El package también introdujo un **patrón de validación de forms** que después se aplicó a add-expense, add-income y add-fijo: no preselect, primary CTA visual-only disabled pero tappable, per-field warning glide cuando el user toca el CTA dimmed.

---

## Stack del feature

```
[Foto del feed]
    ↓ expo-image-picker
[Image URI]
    ↓ @react-native-ml-kit/text-recognition
[Line[]]
    ↓ parser/ (JS puro, testeable)
[Transaction[]]
    ↓ map-to-review-rows
[ReviewRow[]]
    ↓ ImportReviewSheet (wizard N+1 pasos)
    └─ per movement: AmountCard + descripción + CycleDateSlider + categoría + notas
    └─ summary final: lista por confirmar + check icon spring + skipped chip
    ↓ useConfirmImport
[createExpense × N] + [useCreateIncomeEvent × M]
    ↓ syncAllAfterMutation × 1
[15 query keys invalidated → all views refresh]
    ↓ confetti + toast
```

---

## Fases trabajadas

### Phase A — Parser library puro
Tipos en [`types.ts`](../../mobile/features/activity-ocr/types.ts), regex en [`parser/patterns.ts`](../../mobile/features/activity-ocr/parser/patterns.ts), normalize / groupRows / classify en [`parser/`](../../mobile/features/activity-ocr/parser/). Orchestrator: [`parse-activity-lines.ts`](../../mobile/features/activity-ocr/parse-activity-lines.ts). Todo testeable con vitest contra fixtures de captura reales — sin device. Soporta multi-line merchants, herencia de fecha desde sección sticky ("NN de mes"), y signos por paréntesis o columnas según banco.

### Phase B — ML Kit + image picker
Wraps en [`ocr.service.ts`](../../mobile/features/activity-ocr/ocr.service.ts) (text recognition) y [`get-image-width.ts`](../../mobile/features/activity-ocr/get-image-width.ts) (image dimensions). Pipeline real: [`activity-parser.ts`](../../mobile/features/activity-ocr/activity-parser.ts). Dev preview screen en `/(app)/dev-ocr-preview` gated por `ocrPreviewEnabled` para iterar sobre el parser sin desplegar el wizard. ML Kit NO corre en Expo Go — requiere dev-client o EAS build. Patch local en `patches/` borra 4 packs de idioma (chino, japonés, coreano, devanagari) para shavear ~6 MB del IPA.

### Phase C — Bulk Import Review Sheet (v1)
Sheet con header + lista de rows (collapsed pill + expanded form) + footer (CTA + cancel). State: [`review-reducer.ts`](../../mobile/features/import-review/review-reducer.ts) + [`use-import-review-controller.ts`](../../mobile/features/import-review/use-import-review-controller.ts) (useReducer + derivados). Per-row insertion vía Promise.allSettled. Open flow en [`open-import-flow.ts`](../../mobile/features/import-review/open-import-flow.ts).

### Phase D — Wow moment redesign
- `CycleDateSlider` swipeable de días del ciclo activo + selector de fecha al estilo iOS calendar strip.
- Header cinematográfico con thumbnail + breakdown + heading dramático.
- Confirm flow con stagger fade-out + confetti (`motionSprings.celebrate`) cuando hay 3+ inserciones.

### Post-D — Wizard refactor (uno por vez)
La iteración real con usuario expuso que la lista vertical de N rows era confusa — fácil saltar un movimiento sin querer. Refactor completo a wizard step-by-step:
- Cada movimiento ocupa una pantalla completa
- Step indicator arriba con pills colored por status (current / done / pending / invalid / skipped)
- Botones Anterior / Saltear / Siguiente accesibles (44pt min, icon + label, no ghost text)
- Slide transitions horizontales con `FadeInRight/Left`
- Summary final como step N+1 — lista compacta de movimientos por confirmar + check icon springy + skipped chip

### Polish UX iterativo
- Settings preview entry con 10 mock movements deterministas para iterar el wizard sin esperar IPA.
- Compact UI pass para que todo entre en una vista sin scroll.
- Fix off-by-one timezone (helper `isoDateToLocalNoonTimestamp`).
- Fix `transform: undefined` crashea iOS (Animated.View wrapper para press scale).
- Cache invalidation: `syncAllAfterMutation` bulk-at-tail (1 pasada vs N).
- 10-item mock + warning-tinted skipped segments en la franja.

### Cross-form validation pattern rollout
El wizard introdujo un patrón que el usuario quiso aplicar a TODO el producto. Rolloueado a:
- **Add Expense** ([`use-add-expense-controller.ts`](../../mobile/features/expenses/use-add-expense-controller.ts) + [`add-expense-dashboard.tsx`](../../mobile/components/home/add-expense-dashboard.tsx))
- **Add Income** ([`add-income-screen.tsx`](../../mobile/screens/home/add-income-screen.tsx))
- **Add Fijo** ([`add-fijo-v2-screen.tsx`](../../mobile/screens/home/add-fijo-v2-screen.tsx) + [`fixed-expense-editor-model.ts`](../../mobile/features/fixed-expenses/fixed-expense-editor-model.ts))

Reglas: no pre-seleccionar category-like fields, `missingFields: string[]` derivado, `canSubmit = missingFields.length === 0`, primary CTA con `lookDisabled` (visual disabled tappable), `highlightToken` que se incrementa al tap dimmed → bump `isFlagged` → `warning` glide en los inputs faltantes.

Cambios concretos:
- Add Expense: drop preselect de primera categoría, descripción ahora required
- Add Income: `kind` arranca `null` (sin default `'transfer'`), descripción required
- Add Fijo: `categoryId` arranca `''`, `freqChoice` arranca `null` (sin default `'monthly'`)

### FAB overlay redesign
Con el 5to tile (Importar captura) el abanico radial original quedaba desproporcionado. Iteré:

1. **Fan de 5 pétalos** (rejected): labels solapados, sin jerarquía clara
2. **Card 2×2** (rejected per impeccable): identical card grid anti-pattern
3. **Card jerárquica con lista vertical** (✅): primary tile (Gasto, brand fill) + lista vertical de 4 secundarias con accent-tinted icons + chevron

Cada acción ahora tiene **animación signature al entrar**:
- Gasto (`+`): rota -90°→0° con celebrate spring + ambient pulse ring
- Importar captura: scan bar barre el ícono de arriba a abajo
- Ingreso: arrow nace abajo con overshoot
- Día sin gasto: hoja wiggle (-12°→6°→-3°→0°)
- Gasto fijo: rotación 360°

Color contrast auditado en light + dark themes — accent colors theme-aware con WCAG AA pass.

---

## Cifras

- **Commits totales:** 73 (`main..feature/activity-ocr`)
- **Componentes nuevos:** 9 (sheet, header, row, step-indicator, footer, summary, empty, cycle-date-slider, step indicator, quick-action-icon)
- **Bancos soportados:** 8 (MP, Macro, Francés, Provincia, Santander, Galicia, Naranja X, banco original)
- **Tests nuevos:** ~20 (parser unitarios + cycle-date-math + map-to-rows + reducer)
- **Memorias técnicas guardadas:** 3 (timestamptz off-by-one, transform undefined crash, cache invalidation)
- **Patches/shavados:** 4 packs de idioma ML Kit (~6 MB del IPA)
- **Forms con patrón nuevo:** 4 (wizard + add-expense + add-income + add-fijo)

---

## Decisión: forzar elección consciente

Beta testing mostró que pre-seleccionar la primera categoría hacía que ~70% de los gastos importados quedaran en la categoría #1 del catálogo (típicamente ALQUILER o MERCADO) — incluso cuando el merchant era claramente otra cosa. La fricción de un tap extra **vale menos que la integridad del dato**.

Aplicado en todos los forms: category, kind, frequency arrancan null/empty. El primary CTA stays `lookDisabled` hasta que se completen, y al toparlo dimmed los fields faltantes glide a warning color suavemente (`motionDurations.standard` + iOS-cubic) sin reshape de layout.

---

## Iteración con preview en Settings

Entrada nueva en `Settings → Asistente → Vista previa: wizard de importación` que abre el wizard con 10 movimientos mock sin tocar DB. Razón: cada iteración UX necesitaba un IPA fresco para probarse + cargar una captura real. Con el preview, el ciclo es: cambio el CSS → npm run start → reload → tap → veo el cambio. De ~15 min por iteración a ~30 seg.

El sheet acepta `previewMode={true}` que bypasea `useConfirmImport` con un result sintético (todo el flow de animación + toast + confetti dispara igual). Toast wording "Vista previa: 3 gastos y 1 ingreso (no se cargó nada)" para que el bypass sea obvio.

---

## Lecciones técnicas guardadas en memoria

1. **Off-by-one timezone con `timestamptz`**: pasar `"YYYY-MM-DD"` raw a `expenses.created_at` (timestamptz) lo hace UTC midnight → en AR es 21:00 del día anterior. Anclar a mediodía local con `new Date(y,m-1,d,12,0,0,0).toISOString()`. Memoria: `feedback_timestamptz_off_by_one`.

2. **`transform: undefined` crashea iOS**: usar inline `transform: pressed ? [{scale: 0.97}] : undefined` en style de Pressable hace que el bridge serialice `undefined → null` y `processTransform.forEach()` revienta. Wrap en `Animated.View` con shared value O siempre array completo. Memoria: `feedback_transform_undefined_crash`.

3. **Cache invalidation cross-query**: `useConfirmImport` usa la función `createExpense` raw (no la mutation hook `useCreateExpense`), entonces tenía que invocar `syncAllAfterMutation` explícitamente al final. Bulk-at-tail = 1 pasada × 15 queries en vez de N × 15. Memoria: `feedback_cache_invalidation_multi_query` (ya existía, este package la refuerza).

---

## Cómo expandir a bancos nuevos

Receta completa en el [doc canónico](../sistemas/activity-ocr.md#bancos-soportados-y-cómo-agregar-uno-nuevo). TL;DR:

1. Capturar fixtures reales del banco (vía dev preview)
2. Identificar el patrón distintivo (amount fmt, date fmt, separadores)
3. Agregar regex en [`parser/patterns.ts`](../../mobile/features/activity-ocr/parser/patterns.ts)
4. Ajustar `classify.ts` solo si necesita lógica nueva
5. Sumar tests de regresión con el fixture
6. Documentar en la tabla del [doc canónico](../sistemas/activity-ocr.md)

Tiempo estimado por banco: **~1h con fixture en mano**. El parser está diseñado para escalar — los regex per-banco son aditivos, y la lógica de clasificación generalizada ya cubre los casos comunes.

---

## Próximos pasos no priorizados

- Multi-captura: pickear N imágenes y mergear los rows
- Detección de duplicados contra DB antes de mostrar el wizard
- Auto-categorización por merchant histórico (sugerencia EXPLÍCITA, no preselect implícito)
- QA pass en Android (ML Kit lo soporta, faltan tests reales)
- Sumar más bancos (Reba, Galicia Más, Brubank, Personal Pay, etc.)
