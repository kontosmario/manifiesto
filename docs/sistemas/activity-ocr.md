# Activity OCR + Import Review

> Sistema para cargar gastos e ingresos en bulk desde una captura de pantalla del feed de actividad de un banco/wallet. El usuario saca foto de la lista de movimientos, OCR extrae las líneas, un parser estructurado las convierte a `Transaction[]`, y un wizard revisa cada movimiento uno por uno antes de confirmarlos contra la DB.
>
> **Estado:** ✅ LIVE 2026-06-03 (rama `feature/activity-ocr`, mergeada a `main`).
> **Compatibilidad:** requiere dev-client / EAS build (ML Kit no corre en Expo Go). El módulo `parseActivity` es pura JS y SÍ corre en Expo Go.

---

## Por qué existe

Cargar gastos manualmente uno por uno fricciona cuando se acumulan varios días. La realidad de un usuario es: abre Mercado Pago / banco a fin de semana, ve 8 gastos pendientes de registrar, abandona o copia mal. El flujo de captura → OCR → revisión deja la totalidad del bulk en un wizard con validación per-row y categorías que el usuario asigna deliberadamente.

Diferencia clave con un import bancario clásico (CSV / Plaid):
- **No necesita integración con APIs bancarias** (en AR las APIs abiertas son inexistentes).
- **No es batch silencioso** — cada movimiento pasa por revisión humana, así el usuario edita descripción, monto, fecha, categoría antes de cargarlo.
- **No pre-selecciona categoría** — fuerza decisión consciente. La integridad del dato vale más que el tap ahorrado.

---

## Arquitectura (alto nivel)

```
[Foto del feed]
    ↓ expo-image-picker
[Image URI]
    ↓ ocr.service.recognizeBlocks (ML Kit Text Recognition)
[Line[]]  (text + bounding box)
    ↓ parser/ (pure JS — testeable sin device)
    ├─ normalize     defensive shape
    ├─ groupRows     vertical clustering
    ├─ patterns      regex bank-by-bank
    └─ classify      group → Transaction
[Transaction[]]
    ↓ mapToReviewRows (USD→ARS si aplica + warnings)
[ReviewRow[]]
    ↓ ImportReviewSheet (wizard step-by-step)
    └─ por movimiento: kind toggle + AmountCard + descripción + fecha + categoría + notas
    ↓ useConfirmImport (Promise.allSettled)
[createExpense × N] + [useCreateIncomeEvent × M]
    ↓ syncAllAfterMutation
[Home, Gastos, Control, Streaks, Snapshot caches refetched]
```

### Capas y módulos

| Capa | Path | Responsabilidad |
|---|---|---|
| Tipos puros | [`mobile/features/activity-ocr/types.ts`](../../mobile/features/activity-ocr/types.ts) | `Line`, `TransactionGroup`, `Transaction`, `Amount`, `ParseResult` |
| OCR nativo | [`mobile/features/activity-ocr/ocr.service.ts`](../../mobile/features/activity-ocr/ocr.service.ts) | Wrap de `@react-native-ml-kit/text-recognition` → `Line[]` con bounding boxes |
| Image meta | [`mobile/features/activity-ocr/get-image-width.ts`](../../mobile/features/activity-ocr/get-image-width.ts) | `Image.getSize` promisificado para normalizar coordenadas relativas |
| Parser pure | [`mobile/features/activity-ocr/parser/`](../../mobile/features/activity-ocr/parser/) | normalize · groupRows · patterns · classify (TODO sin React Native, testeable con vitest) |
| Orchestrator | [`mobile/features/activity-ocr/parse-activity-lines.ts`](../../mobile/features/activity-ocr/parse-activity-lines.ts) | `Line[] → ParseResult` |
| Pipeline real | [`mobile/features/activity-ocr/activity-parser.ts`](../../mobile/features/activity-ocr/activity-parser.ts) | `parseActivity(uri) → ParseResult` (combina OCR + parser) |
| Map a UI | [`mobile/features/import-review/map-to-review-rows.ts`](../../mobile/features/import-review/map-to-review-rows.ts) | `Transaction[] → ReviewRow[]` (USD→ARS, warnings, sin categoría pre-seleccionada) |
| State | [`mobile/features/import-review/review-reducer.ts`](../../mobile/features/import-review/review-reducer.ts) | Reducer puro: SET_KIND / PATCH_ROW / SKIP / UNSKIP / REMOVE / REPLACE |
| Controller hook | [`mobile/features/import-review/use-import-review-controller.ts`](../../mobile/features/import-review/use-import-review-controller.ts) | useReducer + derivados (`missingFields`, `canConfirm`, `submittableBreakdown`) |
| Confirm | [`mobile/features/import-review/use-confirm-import.ts`](../../mobile/features/import-review/use-confirm-import.ts) | Promise.allSettled de createExpense/createIncome + bulk `syncAllAfterMutation` |
| Flow | [`mobile/features/import-review/open-import-flow.ts`](../../mobile/features/import-review/open-import-flow.ts) | Permission → picker → parse → state |
| Mocks | [`mobile/features/import-review/preview-mock-state.ts`](../../mobile/features/import-review/preview-mock-state.ts) | 10 movimientos deterministas para iterar UI desde Settings sin OCR real |
| Sheet | [`mobile/components/import-review/import-review-sheet.tsx`](../../mobile/components/import-review/import-review-sheet.tsx) | Wizard orquestador (movement steps + summary final) |
| Wizard pieces | [`mobile/components/import-review/*.tsx`](../../mobile/components/import-review/) | header · row · step-indicator · footer · summary · empty · cycle-date-slider |

---

## Pipeline detallado

### 1. Captura (`open-import-flow.ts`)

`expo-image-picker.launchImageLibraryAsync` con `mediaTypes: ['images']`, `allowsMultipleSelection: false`. Pide permiso `MediaLibrary` antes — si lo niegan, devuelve `kind: 'permission-denied'` al caller.

### 2. OCR (`ocr.service.ts`)

```ts
recognizeBlocks(uri: string) → Promise<Line[]>
```

Wrap de ML Kit Text Recognition v2 (iOS). Devuelve líneas con texto + bounding box absoluto. Coordenadas se normalizan después contra `getImageWidth(uri)` para que el clustering vertical sea resolución-agnóstico.

> ⚠️ ML Kit es nativo. **No corre en Expo Go.** El dev preview de la pantalla `/(app)/dev-ocr-preview` está gated por `Constants.expoConfig?.extra?.ocrPreviewEnabled` para que la sideload build funcione pero el bundle de prod no exponga la ruta.

### 3. Parser puro (`parser/`)

Toda la lógica de extracción es JS puro — sin Reanimated, sin RN Image, sin nada nativo. Testeable con vitest contra fixtures.

**`normalize.ts`** — defensive flattening. ML Kit a veces devuelve bloques anidados con coordenadas relativas; normalizamos a `Line[]` con coordenadas absolutas + texto trimmed.

**`group-rows.ts`** — clusters líneas en `TransactionGroup` por proximidad vertical. La heurística: dos líneas pertenecen al mismo movimiento si su distancia vertical es menor al `median(gap) × 1.4` del documento. Robusta contra slight misalignment de OCR.

**`patterns.ts`** — regex por banco. Mira sección [Bancos soportados](#bancos-soportados-y-cómo-agregar-uno-nuevo) abajo.

**`classify.ts`** — toma un `TransactionGroup` (lista de líneas) y emite `Transaction | null`. Lógica:
1. Busca un amount válido (`primaryAmount`).
2. Busca una fecha (`date`). Si no encuentra, hereda de la sección anterior (formato "NN de mes" como sticky header).
3. Filtra: si no hay amount → `null` (descarta).
4. Resto de líneas = `merchant` (multi-line OK).

### 4. Mapeo a UI (`map-to-review-rows.ts`)

```ts
mapToReviewRows(transactions, { today, usdToArsRate, generateRowId }) → ReviewRow[]
```

Convierte `Transaction` (sin UI state) en `ReviewRow` (con kind, categoría, notes, warnings).

Reglas:
- Sign `-1` → `kind: 'expense'`
- Sign `+1` → `kind: 'income'`
- Currency `USD` / `USDc` / `USDT` → multiplica por `usdToArsRate`, registra `appliedRate`
- Currency otra (EUR, BRL, etc.) → kind=`skip` + warning `foreign-currency`
- `secondaryAmount` con currency distinta → warning `swap-ambiguous` + kind=`skip` (típico cambio FX)
- Merchant vacío → warning `no-merchant` **y `description: ''`** (VACÍA, nunca un placeholder: `"(sin descripción)"` como valor satisfacía `description.trim() !== ''` y la fila se insertaba con ese nombre)
- Date `null` → warning `no-date`, fecha cae a `today`
- `categoryId: null` **siempre** en OCR (ver [decisión: no pre-seleccionar](#decisión-no-pre-seleccionar-categoríakind)) + `categorySuggested: false`. Apple Pay SÍ pre-resuelve por historial y lo marca con `categorySuggested: true`, que es lo que rinde el chip "sugerida"
- `incomeKind: 'other'` default (el usuario lo cambia explícitamente)

### 5. Revisión (`ImportReviewSheet`)

> **Rediseño 2026-08-15 (direcciones C + A).** Antes era un wizard lineal de
> N+1 pasos con el resumen al final. Los N movimientos de un import son
> **independientes entre sí**, así que forzar el orden no ayudaba: escondía el
> conjunto y dejaba sin respuesta las tres preguntas del usuario ("cuántos
> son", "en cuál estoy", "cómo me muevo"). Ahora el conjunto va primero y el
> detalle es bajo demanda.

El sheet tiene **tres vistas**, no pasos. La raíz la decide la cantidad de
filas, así que siempre se vuelve al mismo lugar del que se salió:

| Vista | Cuándo es la raíz | Qué es |
|---|---|---|
| `receipt` | `totalRows === 1` | El **recibo**: el dato como hecho consumado, con su procedencia. Se acepta de UN tap. |
| `list` | `totalRows >= 2` | La **bandeja**: conteo, total en plata, estado por fila. Cualquier fila a un tap. |
| `edit` | nunca (siempre bajo demanda) | El formulario de UNA fila. Se entra por tap y se vuelve a la raíz. |

- **Recibo** ([`import-review-receipt.tsx`](../../mobile/components/import-review/import-review-receipt.tsx)):
  procedencia ("Apple Pay · 14:32" + por qué está ahí), monto grande, comercio,
  y filas de hecho (fecha, categoría). Si la categoría vino del historial se
  marca con el chip **"sugerida"** y una línea que explica el motivo. Si falta
  la categoría, el riel aparece inline con "Solo falta esto".
- **Bandeja** ([`import-review-list.tsx`](../../mobile/components/import-review/import-review-list.tsx)):
  hero con **total a cargar** (y "de $X leídos" cuando hay descartes), pista de
  progreso por conteo — los tramos pendientes quedan **vacíos**, que es lo que
  hace legible "cuánto falta" — y chips de listos / sin completar / fallaron /
  sin cargar. Cada fila lleva su estado en un badge y es tappable.
- **Edición** ([`import-review-row.tsx`](../../mobile/components/import-review/import-review-row.tsx)):
  el formulario de siempre (kind toggle + AmountCard + descripción + CycleDateSlider
  + rail de categorías/tipo de ingreso + nota), con
  [`import-review-header.tsx`](../../mobile/components/import-review/import-review-header.tsx)
  arriba, que dice **de dónde salió el dato** y la posición dentro de la bandeja.
- **Footer** ([`import-review-footer.tsx`](../../mobile/components/import-review/import-review-footer.tsx)):
  una forma por vista. `receipt` → [Editar] [Ahora no] + "Registrar gasto".
  `list` → [Completa los N que faltan] [Ahora no] + "Cargar N · $X".
  `edit` → [No cargar este] [Siguiente pendiente | Volver] + "Listo".

#### Aplazar ≠ descartar

Los dos significados compartían el verbo "Saltear", y en Apple Pay ese verbo
**borraba la única copia del pago**. Ahora están separados:

- **"Ahora no"** (footer de la raíz) cierra la hoja dejando pendiente todo lo
  que el usuario no decidió. NUNCA destruye.
- **"No cargar este"** (dentro de la edición) marca la fila `kind: 'skip'`. Es
  reversible mientras la hoja siga abierta ("Sí cargar este") y **no
  auto-avanza**: el estado queda a la vista con su deshacer al lado.

#### Navegación

- `openRow(rowId, flagMissing?)` — abre una fila. Con `flagMissing` **marca sus
  campos faltantes al entrar**: el salto automático aterrizaba en un formulario
  que se veía normal, justo después de un aviso que decía "hay un movimiento
  sin completar".
- `goToRoot()` — vuelve a `receipt` o `list` según la cantidad de filas.
- El CTA primario de la raíz confirma; con filas incompletas salta a la primera.
- "Siguiente pendiente" salta sólo a lo que falta, no a la fila de al lado.

#### Reparación de fallos

Si el confirm falla parcialmente, **la hoja NO se cierra**. Se queda con las
filas caídas (las que sí entraron se sacan del set, así el reintento no
duplica), las marca con el estado `failed`, muestra la cabecera de reparación
con el motivo real y el CTA pasa a **"Reintentar"**. Antes se cerraba con un
toast que decía cuántas fallaron pero no cuáles, sobre una pantalla que ya no
existía y con el trabajo de edición inalcanzable.

#### Categoría: la única decisión obligatoria

Es lo único que el humano tiene que aportar en el camino OCR, y era lo peor
servido (~30 tiles en orden de catálogo). Ahora llega **rankeada por uso del
hogar** (`rankCategoriesByUsage`) y el ancho de tile sale de
[`rail-metrics.ts`](../../mobile/components/import-review/rail-metrics.ts), que
resta el padding del `ModalCard` (22pt) en vez del de `Screen` (40pt) para que
**asome el quinto tile** — el peek es lo que anuncia que hay más.

### 6. Confirm (`use-confirm-import.ts`)

```ts
useConfirmImport({ familyId, userId }) → (rows) => ConfirmResult
```

Filtra `kind !== 'skip'`, ejecuta `Promise.allSettled` con un `insertOne` por row:
- `expense` → `createExpense({ ..., createdAt: isoDateToLocalNoonTimestamp(row.date) })` (mediodía local para evitar [off-by-one timezone](../../.claude/projects/-Users-mario-apps-manifiesto/memory/feedback_timestamptz_off_by_one.md))
- `income` → `createIncomeMut.mutateAsync` (mutation hook canónica)

Al final, **una sola pasada de `syncAllAfterMutation`** con los scopes que tuvieron inserciones (`['expenses', 'income']`). Invalida ~15 query keys que cubren Home, Gastos, Control, Streaks, Achievements, snapshot roots. Un refetch por surface, no N.

---

## Bancos soportados y cómo agregar uno nuevo

### Soportados hoy (formato detectado por `patterns.ts`)

| Origen | Patrón distintivo | Notas |
|---|---|---|
| **Mercado Pago** | `¤` prefix en amount, secciones "NN de mes" | Date inheritance desde sticky section header |
| **Banco Macro** | Amount con `$` + paréntesis para débitos | Multi-line merchant común |
| **BBVA Francés** | Amount inline con descripción | — |
| **Banco Provincia** | Amount al final de línea | Soporta multi-line merchants |
| **Banco Santander** | Header `Movimientos` + amount columna derecha | Soporta multi-line merchants |
| **Banco Galicia** | Description multi-row + amount aislado | Fixtures de regresión en tests |
| **Naranja X** | Similar a Galicia, formato wallet | Fixtures de regresión en tests |
| **Banco original** | Generic fallback | Detecta amount + date sin formato específico |

### Cómo agregar un banco nuevo

> Esta es la sección **importante para futuras expansiones**. El parser está diseñado para que sumar un banco sea editar dos archivos + agregar fixtures.

#### Paso 1 — Capturar fixtures reales

Pedile al usuario una captura del feed del banco/wallet nuevo. Idealmente 2-3 capturas distintas (con diferentes tipos de movimiento: pago, transferencia, devolución, etc).

Procesá la captura UNA vez vía el dev preview (`/(app)/dev-ocr-preview`) y exportá el `Line[]` resultante a un fixture en `tests/fixtures/activity-ocr/`. Convención de nombre: `nuevo-banco-N.json` donde N es el número de muestra.

#### Paso 2 — Identificar el patrón distintivo

Mirá el fixture. Buscá:
- ¿Cómo se ve un **amount**? (símbolo, separadores, signo, paréntesis para débito)
- ¿Cómo se ve una **fecha**? (formato DD/MM, "NN de mes", header de día, sticky)
- ¿Cómo se separan los movimientos? (gap vertical, divider, recuadro)
- ¿Hay **secciones** (headers de día/mes)? Estos se heredan al row si el row no tiene fecha propia.
- ¿Multi-line merchant? (muchos bancos parten el comercio en 2 líneas — ej. "MERPAGO\*MR" + "PROVO PALAC")

#### Paso 3 — Agregar regex en `parser/patterns.ts`

```ts
// patterns.ts — agregá al final
export const NUEVO_BANCO_AMOUNT_RE = /^...$/
export const NUEVO_BANCO_DATE_RE = /^...$/
export const NUEVO_BANCO_SECTION_RE = /^...$/   // si aplica
```

Si el patrón es genérico (ej. `$\d+\.\d{3},\d{2}`), reusá los regexes generales. Los específicos por banco son para edge cases (símbolos raros, formatos exóticos).

#### Paso 4 — Ajustar `classify.ts` si necesita lógica nueva

Casos típicos:
- **Date inheritance** desde sección — ya implementado para MP; revisá si el banco nuevo sigue ese patrón.
- **Multi-line merchant** — el clasificador asume `merchant = restoLinas.join(' ')`; ya funciona out-of-the-box.
- **Caracteres invisibles** — algunos bancos meten `​` (zero-width space). Agregar a `normalize.ts` si aparece.
- **Sign detection** — si el banco no usa paréntesis ni signo explícito, revisá si todo es débito implícito (consumos) o si hay marcadores de columna.

#### Paso 5 — Agregar tests de regresión

```ts
// tests/unit/activity-ocr-nuevo-banco.test.ts
import { parseActivityLines } from '@/features/activity-ocr/parse-activity-lines'
import fixture from '../fixtures/activity-ocr/nuevo-banco-1.json'

it('parsea N movimientos de NuevoBanco', () => {
  const result = parseActivityLines(fixture)
  expect(result.transactions).toHaveLength(N)
  expect(result.unmatched).toHaveLength(0)
  expect(result.transactions[0]).toMatchObject({
    merchant: '...',
    primaryAmount: { value: ..., currency: 'ARS', sign: -1 },
    date: '...',
  })
})
```

Los fixtures preservados garantizan no-regresión: si después tocás `patterns.ts` o `classify.ts` para sumar otro banco, los tests de los previos siguen pasando.

#### Paso 6 — Si el banco emite USD / cripto

`map-to-review-rows.ts` ya convierte USD/USDc/USDT a ARS vía `usdToArsRate` (del settings de la familia). Para crypto/otras monedas exóticas, evaluar si vale la pena agregar más conversiones o si la heurística "kind=skip + warning" es suficiente.

#### Paso 7 — Documentar

Sumar el banco a la tabla [Soportados hoy](#soportados-hoy-formato-detectado-por-patternsts) arriba en este mismo doc. Esa es la única documentación que importa para futuro.

---

## Decisión: no pre-seleccionar categoría/kind

Pre-seleccionar la primera categoría disponible (o un kind default tipo `'transfer'`) ahorra un tap. **Pero hace que el usuario someta movimientos miscategorizados sin darse cuenta**.

Reportes reales con usuarios beta confirmaron: con preselect, el ~70% de gastos importados quedaban en la primera categoría del catálogo (ALQUILER, MERCADO, etc.) — incluso cuando el merchant era un Uber o un Café.

La decisión es **forzar la elección explícita**:
- `categoryId: null` siempre en `mapToReviewRows`
- `kind: null` en add-income (sin default a `'transfer'`)
- `freqChoice: null` en add-fijo (sin default a `'monthly'`)
- Primary CTA `lookDisabled` hasta completar required fields
- Tap en CTA dimmed → bump `highlightToken` → fields warningmark

El mismo patrón se aplicó cross-form (ver siguiente sección).

---

## Cross-form: patrón de validación compartido

El wizard introdujo un patrón que después se rollouteó a [add-expense](../../mobile/screens/home/add-expense-screen.tsx), [add-income](../../mobile/screens/home/add-income-screen.tsx) y [add-fijo](../../mobile/screens/home/add-fijo-v2-screen.tsx).

Doc del patrón aparte: [form-validation-pattern.md](form-validation-pattern.md).

---

## Preview en Settings (dev iteration loop)

`Settings → Asistente → Vista previa: wizard de importación` abre el wizard con un mock determinista de 10 movimientos ([`preview-mock-state.ts`](../../mobile/features/import-review/preview-mock-state.ts)) sin tocar la DB. Sirve para iterar UI del wizard sin esperar build IPA + sin cargar capturas reales.

Cobertura del mock:
- 6 gastos de tamaños mixtos ($4.800 a $185.000)
- 2 ingresos (1 transfer, 1 bonus)
- 1 case MERPAGO* truncated merchant
- 2 pre-skipped (en la franja cuentan como "manejado"/relleno desde el primer render)
- Fechas spanning hoy a -7 días (CycleDateSlider scrollea)

El sheet recibe `previewMode={true}` que cortocircuita `useConfirmImport` con un result sintético — exit animation, confetti, toast disparan igual pero nada toca DB. Toast wording dice "Vista previa: … (no se cargó nada)" para que el bypass sea obvio.

---

## Mounts y entrada del flow

| Entry point | Path | Notas |
|---|---|---|
| FAB tab (+) | [`mobile/components/navigation/add-expense-tab-button.tsx`](../../mobile/components/navigation/add-expense-tab-button.tsx) | Tile "Importar captura" del overlay. Triggea `handleOpenImport` que llama `openImportFlow` y monta `<ImportReviewSheet>` con el state resuelto. |
| Settings preview | [`mobile/screens/settings/settings-screen.tsx`](../../mobile/screens/settings/settings-screen.tsx) | Row "Vista previa: wizard de importación" (grupo Asistente). Genera mock state y monta el mismo sheet con `previewMode={true}`. |
| Dev OCR preview | `/(app)/dev-ocr-preview` (gated) | Pantalla de debugging que ejerce el pipeline crudo (OCR + parser) sin el wizard. Habilitada vía `ocrPreviewEnabled` en app.config. Para iterar sobre el parser sin desplegar todo el flow. |
| **Share sheet (2026-06-12)** | Share Extension → [`pending-share-store`](../../mobile/features/share-import/pending-share-store.ts) → [`ShareImportHost`](../../mobile/components/import-review/share-import-host.tsx) → `openImportFromUri` | `expo-share-intent` (~5.1.1, línea SDK 54 — 6.x=SDK 55). iOS activa solo imágenes ×1; Android configurado (`image/*`) sin QA hasta Play Store. La captura espera en el store hasta auth `ready` + familyId (decisión spec: unlock primero). El host monta SU instancia del sheet — no comparte estado con el FAB. Listener no-op en Expo Go. Spec: [2026-06-12-share-to-import](../superpowers/specs/2026-06-12-share-to-import-design.md). **Requiere build nativa** (no OTA) |

---

## Consideraciones de producción

### Modal-on-Modal en iOS

El wizard se abre dentro de un `<Modal>` nativo (ModalCard). Cuando el row expandido abre el `InAppNumpad` (también Modal), iOS los stackea. El cierre del numpad NO desmonta el wizard porque cada Modal tiene su propio UIViewController. El gotcha: presentar un Modal mientras otro se está cerrando es descartado silenciosamente — manejado vía `InteractionManager.runAfterInteractions` en el FAB antes de abrir el picker.

Memoria: [`feedback_ios_modal_chain_dismiss`](../../.claude/projects/-Users-mario-apps-manifiesto/memory/feedback_ios_modal_chain_dismiss.md)

### Timezone gotcha

`expenses.created_at` es `timestamptz`. Si pasás `"YYYY-MM-DD"` raw, Postgres lo lee como UTC midnight → en AR es 21:00 del día anterior. El helper `isoDateToLocalNoonTimestamp` ancla al mediodía local.

Memoria: [`feedback_timestamptz_off_by_one`](../../.claude/projects/-Users-mario-apps-manifiesto/memory/feedback_timestamptz_off_by_one.md)

### Cache invalidation

Después del confirm, una sola pasada de `syncAllAfterMutation` invalida ~15 query keys. Sin esto, Home/Gastos/Control quedan stale hasta pull-to-refresh.

Memoria: [`feedback_cache_invalidation_multi_query`](../../.claude/projects/-Users-mario-apps-manifiesto/memory/feedback_cache_invalidation_multi_query.md)

### Bundle size

Phase B agregó `@react-native-ml-kit/text-recognition` (~3 MB al hbc) y `expo-image-picker` (~200 KB). Patch local en `patches/` borra 4 packs de idioma no-latinos (chino, japonés, coreano, devanagari) para shavear ~6 MB del IPA final.

### Reduce motion

Todas las animaciones del wizard respetan `useReducedMotion()`:
- Step indicator: fade de opacidad relleno/pendiente → snap inmediato
- Slide transitions: FadeInRight/Left → snap
- Overlay "Leyendo tu captura" (FadeIn/FadeOut + card FadeInDown) → sin animación
- Per-field warning glide: timing → snap a final color

---

## Roadmap de extensiones (no priorizado)

- **Multi-captura**: pickear N imágenes de una vez, mergear los `ReviewRow[]` antes de abrir el wizard.
- **Detección de duplicados contra DB**: antes de mostrar el wizard, marcar como `kind: 'skip'` los rows que ya existen como gasto (mismo amount + merchant + fecha ±1 día).
- **Auto-categorización por merchant histórico**: si el usuario ya cargó "Carrefour" 5 veces y siempre con categoría MERCADO, sugerirla como **preselect explícito con copy "Categoría sugerida: MERCADO ✓"** (no implícito). Mantiene la decisión consciente.
- **OCR Android**: ML Kit funciona en Android. Phase B se concentró en iOS, faltan QA pasos en Android.
- **Más bancos**: ver [recipe arriba](#cómo-agregar-un-banco-nuevo). El parser está diseñado para escalar — sumar uno toma ~1h con fixture en mano.

---

## Specs y plans históricos

| Doc | Cubre |
|---|---|
| [Phase A spec](../superpowers/specs/2026-06-02-activity-ocr-phase-a-parser-design.md) | Parser library puro |
| [Phase A plan](../superpowers/plans/2026-06-02-activity-ocr-phase-a-parser.md) | — |
| [Phase B spec](../superpowers/specs/2026-06-02-activity-ocr-phase-b-mlkit-design.md) | ML Kit + image picker + dev screen |
| [Phase B plan](../superpowers/plans/2026-06-02-activity-ocr-phase-b-mlkit.md) | — |
| [Phase C spec](../superpowers/specs/2026-06-02-activity-ocr-phase-c-import-review-sheet-design.md) | Bulk Import Review Sheet |
| [Phase C plan](../superpowers/plans/2026-06-02-activity-ocr-phase-c-import-review-sheet.md) | — |
| [Phase D spec](../superpowers/specs/2026-06-02-activity-ocr-phase-d-import-review-wow-moment-design.md) | UX wow moment redesign |
| [Phase D plan](../superpowers/plans/2026-06-02-activity-ocr-phase-d-import-review-wow-moment.md) | — |

Estos specs reflejan el estado al momento de planificar. La implementación final evolucionó (especialmente Phase D → wizard refactor → summary step → cross-form pattern). **Este doc canónico es la fuente de verdad sobre cómo funciona el sistema HOY.**
