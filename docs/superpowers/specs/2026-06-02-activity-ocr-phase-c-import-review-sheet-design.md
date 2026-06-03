# Activity OCR — Phase C: Bulk Import Review Sheet Design

**Fecha:** 2026-06-02
**Branch:** `feature/activity-ocr` (off main; sigue sin mergear hasta que las fases restantes shippeen).
**Depende de:** Phase A + Phase B (parser library + ML Kit + `parseActivity(uri): Promise<ParseResult>`).

## Goal

Convertir el ejercicio "parsear una captura" (Phase B) en una **feature productiva de carga masiva**: el user elige una captura desde el FAB de Gastos, ve una sheet con N filas pre-pobladas a partir de las `Transaction[]` parseadas, revisa/edita cada una (decide gasto-o-ingreso, ajusta monto/categoría/descripción/fecha), y al confirmar se insertan vía las mutations EXISTENTES del proyecto (`createExpense`, `useCreateIncomeEvent`) row-by-row. La sheet NO inserta automáticamente nada — el user valida primero.

**Por qué este shape** (vs. lo que originalmente había decompuesto como C + D separados):

1. El user dijo "la idea es que la captura nos POBLE el formulario, no que inserte sola" → Phase C = poblar UI, no DB writes automáticos.
2. Al pasar por revisión humana, MUCHAS preocupaciones de mi propuesta original se evaporan:
   - **Sin dedup en DB** (el user ve y borra duplicados con "Skip esta fila")
   - **Sin notification/achievement flood** (no son 50 inserts atómicos; son 8 a 12 inserts spaceados por la UX)
   - **Sin RPC batch** (per-row insert via mutations existentes; más resiliente — si una falla las otras pasan)
   - **Sin columnas nuevas** `origin`/`import_metadata` (el user validó cada uno; no necesitamos audit del origen para que el flow funcione)
   - **Sin policy ambigua de income vs expense** (el user decide explícitamente por row via toggle)

## Non-goals (Phase C)

- No persiste `origin: 'ocr'` ni `import_metadata` jsonb en `expenses` / `income_events`. Si en el futuro queremos analytics del origen ("X% importado vía Mercado Pago"), lo agregamos en una fase separada.
- No tiene RPC server-side custom. Per-row insert usando hooks/funciones existentes.
- No tiene dedup automático. El user revisa y skipea manualmente.
- No tiene categorización heurística (merchant → categoría). Eso es Phase E.
- No tiene LLM fallback para rows sin clasificar. Eso es Phase E+.
- No tiene share-extension / share-sheet entry. Solo desde el FAB.
- No tiene cache de la imagen procesada. Una vez parseada y confirmada, la captura se descarta (la imagen NO se sube ni se guarda en la app).
- No soporta editar la `usd_exchange_rate` desde la sheet. Si el user quiere otra rate, edita el monto directo en el input. La rate stored se usa solo para popular el valor inicial.

---

## Decisiones de scope confirmadas con el owner

| Decisión | Resultado |
|---|---|
| Income handling | El app ya tiene `income_events` table + `useCreateIncomeEvent` hook. Sheet routea sign=+1 → income_events, sign=-1 → expenses. User puede sobreescribir el toggle per row. |
| Entry point | 5º petal en el FAB de Gastos: "📷 Importar captura" |
| Post-confirm UX | Cerrar sheet → toast "Cargué X gastos + Y ingresos" → volver a la pantalla previa. Si hay errors per-row, toast incluye un "Ver detalles" que abre lista. Confetti opcional si N ≥ 5 (refuerzo positivo del bulk save). |
| Atomicity | Per-row independiente. Si 3 de 10 fallan, las otras 7 se insertan; la sheet muestra los 3 errors con razones. |
| Currency conversion | Stored `family_finance.usd_exchange_rate`. Sheet muestra el valor convertido con nota "USDc 16 @ rate $1000 = ARS $16.000" debajo del input. User puede editar el monto directo. |
| Dedup | Ninguno automático. El user es el dedup ("skip this row"). |
| Notifications/achievements | Pasan por el path normal. Como son 8-12 inserts max (no 50), no hay flood. |
| Schema changes | **CERO.** Toda la feature vive en mobile. Sin migración, sin RPC nueva, sin columnas nuevas. |

---

## Arquitectura

```
User abre FAB en tab Gastos
  ↓ (tap "📷 Importar captura")
expo-image-picker.launchImageLibraryAsync()
  ↓ uri
parseActivity(uri)  ← de Phase B, sin cambios
  ↓ { transactions, unmatched }
mapToReviewRows(transactions, ctx)  ← NUEVO pure mapper
  ↓ ReviewRow[]
ImportReviewSheet abre
  ↓ user edita filas, marca skips
"Confirmar" tap
  ↓
useConfirmImport(): for each non-skipped row, per-row insert
  - row.kind = 'expense' → createExpense(familyId, userId, ...)
  - row.kind = 'income'  → createIncomeEventMutation.mutateAsync(...)
  ↓ Promise.allSettled → result summary
Sheet cierra → toast + navega home (o queda en gastos) + invalidate caches
```

---

## Componentes y archivos

### Estructura nueva

```
mobile/features/import-review/         (NUEVA carpeta)
├── types.ts                              # ReviewRow, ReviewState, ConfirmResult
├── map-to-review-rows.ts                 # PURA: Transaction[] + ctx → ReviewRow[]
├── use-import-review-controller.ts      # State + acciones (init, edit row, skip, confirm)
├── use-confirm-import.ts                # Per-row mutation iteration + summary
└── (sin index.ts si no hace falta)

mobile/components/import-review/        (NUEVA carpeta)
├── import-review-sheet.tsx               # Bottom sheet root
├── import-review-row.tsx                 # Card editable per row
├── import-review-row-fields.tsx          # Sub-componentes form per row
├── import-review-footer.tsx              # Cancelar / Confirmar
└── import-review-empty.tsx               # Para 0 transactions detectadas

tests/unit/
└── import-review-map-to-rows.test.ts    # Tests del pure mapper

# Modificaciones a archivos existentes
mobile/components/navigation/add-expense-tab-button.tsx   # Suma 5º petal 'import'
mobile/components/navigation/add-quick-actions-overlay.tsx # Soporta arc con 5 petals
```

### Files unchanged (Phase A + B intactas)

- `mobile/features/activity-ocr/types.ts`
- `mobile/features/activity-ocr/parse-activity-lines.ts`
- `mobile/features/activity-ocr/activity-parser.ts` (parseActivity sigue siendo `(uri) => Promise<ParseResult>`)
- Todos los parsers + tests del activity-ocr
- `expense-repository.ts` y `useCreateIncomeEvent` (la sheet los CONSUME, no los modifica)

---

## Tipos del dominio

`mobile/features/import-review/types.ts`:

```ts
import type { Transaction } from '@/features/activity-ocr/types'

export type ReviewRowKind = 'expense' | 'income' | 'skip'

/** Razón por la que una row arranca en 'skip' o muestra un warning. */
export type ReviewRowWarning =
  | 'foreign-currency'        // currency ≠ ARS, USD, USDc, USDT (Transaction.primaryAmount.currency)
  | 'swap-ambiguous'          // secondaryAmount no-null con currency distinta
  | 'no-merchant'             // merchant === '' (post-trim)
  | 'no-date'                 // date null (caller tendrá que fill manualmente)
  | 'value-zero'              // value === 0

/**
 * Estado editable de una transaction parseada, lista para que el user
 * la revise antes de confirmar. Una ReviewRow es un draft del input
 * que se le pasaría a `createExpense` o `useCreateIncomeEvent`.
 */
export interface ReviewRow {
  /** ID local estable (no de DB), generado al map. Sirve para keys de React y para edición/skip. */
  id: string

  kind: ReviewRowKind
  amount: number                  // Siempre ARS positivo (post-conversión)
  description: string             // Default: Transaction.merchant; user editable
  date: string                    // ISO YYYY-MM-DD; default: tx.date || today; user editable
  notes: string | null            // Default null; user editable

  // Discriminator-specific fields
  // Cuando kind === 'expense':
  categoryId: string | null       // user picker; default = primera category
  // Cuando kind === 'income':
  incomeKind: 'transfer' | 'bonus' | 'gift' | 'other' // user picker; default = 'other'

  warnings: ReviewRowWarning[]    // Visible bajo la row como hints

  /** Memorial del Transaction original para debugging y mostrar conversión. */
  source: {
    transaction: Transaction
    originalCurrency: string     // 'ARS', 'USDc', etc — para mostrar "16 USDc @ rate $1000"
    appliedRate: number | null   // null si era ARS
  }
}

export interface ReviewState {
  rows: ReviewRow[]
  unmatched: number              // Solo contamos cuántos quedaron sin clasificar; el detalle queda en log dev
  imageUri: string               // Para mostrar el thumbnail (opcional)
}

/** Resumen del confirm — qué se insertó y qué falló. */
export interface ConfirmResult {
  insertedExpenses: number
  insertedIncomes: number
  skipped: number                // Rows con kind === 'skip' al momento de confirmar
  failed: Array<{ rowId: string; description: string; reason: string }>
}
```

---

## Pure mapper: `Transaction[] → ReviewRow[]`

`mobile/features/import-review/map-to-review-rows.ts`:

```ts
import type { Transaction } from '@/features/activity-ocr/types'
import type { ReviewRow, ReviewRowKind, ReviewRowWarning } from './types'

export interface MapContext {
  /** Hoy en es-AR ISO (YYYY-MM-DD). Para fallback cuando tx.date es null. */
  today: string
  /** Default category para gastos. Suele ser la primera category de la familia. null si no hay. */
  defaultCategoryId: string | null
  /** Rate USD→ARS de la familia. Default 1000. Mayor a 0. */
  usdToArsRate: number
  /** Para generar IDs locales únicos. */
  generateRowId: () => string
}

/** Currencies que tratamos como USD-equivalentes y convertimos via rate. */
const USD_LIKE = new Set(['USD', 'USDc', 'USDT'])

export function mapToReviewRows(
  transactions: readonly Transaction[],
  ctx: MapContext,
): ReviewRow[] {
  return transactions.map((tx) => mapOne(tx, ctx))
}

function mapOne(tx: Transaction, ctx: MapContext): ReviewRow {
  const currency = tx.primaryAmount.currency
  const isARS = currency === 'ARS'
  const isUsdLike = USD_LIKE.has(currency)
  const isForeign = !isARS && !isUsdLike

  const warnings: ReviewRowWarning[] = []

  // Currency → amount conversion + warning si extranjera
  let amount = tx.primaryAmount.value
  let appliedRate: number | null = null
  if (isUsdLike) {
    amount = Math.round(amount * ctx.usdToArsRate * 100) / 100
    appliedRate = ctx.usdToArsRate
  } else if (isForeign) {
    warnings.push('foreign-currency')
    // No convertimos — dejamos el valor crudo; user decide qué hacer (skip o editar).
  }

  // Swap (secondaryAmount con currency distinta)
  if (tx.secondaryAmount && tx.secondaryAmount.currency !== tx.primaryAmount.currency) {
    warnings.push('swap-ambiguous')
  }

  // Merchant / date / value warnings
  const merchant = tx.merchant.trim()
  if (merchant === '') warnings.push('no-merchant')
  if (tx.date === null) warnings.push('no-date')
  if (tx.primaryAmount.value === 0) warnings.push('value-zero')

  // Kind default
  const kind: ReviewRowKind =
    warnings.includes('foreign-currency') || warnings.includes('swap-ambiguous')
      ? 'skip'                                        // por default skipeamos los ambiguos
      : tx.primaryAmount.sign === 1
      ? 'income'
      : 'expense'

  // incomeKind default — simple por ahora; Phase E puede agregar heurísticas
  // por merchant ("Transferencia recibida" → 'transfer', "Cashback" → 'other').
  const incomeKind: 'transfer' | 'bonus' | 'gift' | 'other' = 'other'

  return {
    id: ctx.generateRowId(),
    kind,
    amount,
    description: merchant || '(sin descripción)',
    date: tx.date ?? ctx.today,
    notes: null,
    categoryId: kind === 'expense' ? ctx.defaultCategoryId : null,
    incomeKind,
    warnings,
    source: {
      transaction: tx,
      originalCurrency: currency,
      appliedRate,
    },
  }
}
```

---

## State management: hook controller

`mobile/features/import-review/use-import-review-controller.ts` mantiene el state de la sheet. Patrón: `useReducer` para garantizar que las acciones queden trackeables.

API resumida:

```ts
const {
  state,                        // ReviewState
  setRowKind: (id, kind) => void,
  setRowField: (id, patch: Partial<ReviewRow>) => void,
  skipRow: (id) => void,
  unskipRow: (id) => void,
  removeRow: (id) => void,       // Hard delete (para casos extremos como "no quiero esto en ningún caso")
  isConfirmDisabled: boolean,    // true si no hay ninguna row con kind ≠ 'skip'
  confirm: () => Promise<ConfirmResult>,
  reset: () => void,
} = useImportReviewController(initialState)
```

El controller incluye una validación pre-confirm: si alguna row con `kind ≠ 'skip'` tiene `description === '' || amount <= 0`, devuelve "no se puede confirmar" y la fila muestra error inline.

---

## Confirmation hook: `useConfirmImport`

`mobile/features/import-review/use-confirm-import.ts`. Itera las rows no-skip y dispara per-row mutations. Usa `Promise.allSettled` para que un error individual no aborte el resto.

```ts
export function useConfirmImport() {
  const familyId = useFamilyContext().familyId
  const userId = useAuthSession().user?.id
  const createIncomeMut = useCreateIncomeEvent(userId)
  // Note: createExpense() es función standalone, NO hook — la invocamos directo.

  return async function confirm(rows: ReviewRow[]): Promise<ConfirmResult> {
    const submittable = rows.filter((r) => r.kind !== 'skip')

    const results = await Promise.allSettled(
      submittable.map(async (r) => {
        if (r.kind === 'expense') {
          if (!r.categoryId) throw new Error('Falta categoría')
          return await createExpense(familyId, userId!, {
            categoryId: r.categoryId,
            description: r.description,
            price: r.amount,
            notes: r.notes,
            createdAt: r.date,    // Backdate al ISO date
          })
        } else {
          return await createIncomeMut.mutateAsync({
            familyId,
            amount: r.amount,
            kind: r.incomeKind,
            description: r.description,
            eventDate: r.date,
          })
        }
      }),
    )

    const insertedExpenses = results.filter((res, i) => res.status === 'fulfilled' && submittable[i].kind === 'expense').length
    const insertedIncomes = results.filter((res, i) => res.status === 'fulfilled' && submittable[i].kind === 'income').length
    const failed = results
      .map((res, i) => ({ res, row: submittable[i] }))
      .filter((x): x is { res: PromiseRejectedResult; row: ReviewRow } => x.res.status === 'rejected')
      .map((x) => ({
        rowId: x.row.id,
        description: x.row.description,
        reason: x.res.reason instanceof Error ? x.res.reason.message : String(x.res.reason),
      }))

    return {
      insertedExpenses,
      insertedIncomes,
      skipped: rows.length - submittable.length,
      failed,
    }
  }
}
```

---

## UI components

### `ImportReviewSheet`

Bottom sheet root usando `@gorhom/bottom-sheet` (ya en deps). Snap point: 90% del screen (casi-fullscreen).

Layout:

```
┌─────────────────────────────────────────┐
│  ╴╴╴╴╴ drag handle ╴╴╴╴╴                  │
│                                          │
│  Revisá los gastos detectados      ✕    │
│  Detecté 6 gastos y 2 ingresos.          │  ← summary
│                                          │
│  ┌─ Row 1 ─────────────────────────┐   │
│  │ [⚪ Gasto] [⚫ Ingreso] [⚪ Skip] │   │  ← kind toggle
│  │ Descripción: [Rio Uruguay…]      │   │
│  │ Monto: [$ 65.600]                 │   │
│  │ Fecha: [31/05/2026]               │   │
│  │ Categoría: [Gastos generales ▼]   │   │  ← solo si kind=expense
│  │ Notas (opcional): [_____________] │   │
│  │ ⓘ Detectado de Mercado Pago      │   │
│  └─────────────────────────────────┘   │
│                                          │
│  ┌─ Row 2 (skipped) ─────────────┐     │
│  │ — Esta fila se saltea —         │     │
│  │ [Restaurar]                     │     │
│  └────────────────────────────────┘     │
│                                          │
│  ... más rows ...                        │
│                                          │
│  2 líneas no detectadas (ver detalle)   │  ← footer info de unmatched
│                                          │
│  ┌─────────────────────────────────┐   │
│  │ Confirmar 6 gastos + 2 ingresos │   │  ← CTA
│  └─────────────────────────────────┘   │
│  [ Cancelar ]                            │
└─────────────────────────────────────────┘
```

Mientras se está confirmando, el CTA se reemplaza por un loading state. Una vez completo, sheet cierra y dispara el toast result.

### `ImportReviewRow`

Una Card editable. Cuando `kind === 'skip'` muestra estado collapsed con "Restaurar". Cuando `kind ≠ 'skip'`, muestra los campos editables.

Campos editables (varían según `kind`):

| Campo | Type | Default |
|---|---|---|
| `kind` | Toggle 3-state: Gasto / Ingreso / Skip | Del mapper |
| `description` | TextInput multiline-1 | `tx.merchant` |
| `amount` | NumberInput (formato es-AR) | `tx.primaryAmount.value` × rate (si USD) |
| `date` | DateInput | `tx.date` o hoy |
| `categoryId` (gasto) | Picker reusando el de add-expense | First category de la familia |
| `incomeKind` (ingreso) | Picker {transfer, bonus, gift, other} | 'other' |
| `notes` | TextInput optional | null |

Cada warning del mapper se renderiza como info chip bajo los campos:
- `foreign-currency` → "Moneda no soportada (EUR/BTC/etc). Editá el monto en ARS para importar."
- `swap-ambiguous` → "Es un swap de monedas. Verificá si es lo que querés cargar."
- `no-merchant` → "Sin descripción detectada. Completá antes de confirmar."
- `no-date` → "Sin fecha detectada. Default: hoy."
- `value-zero` → "Monto $0. Editá antes de confirmar."

Para conversiones USD/USDc → ARS, debajo del input `amount` se muestra: `"USDc 16 @ rate $1000 = ARS $16.000 — editá el monto si la rate cambió"`.

### `ImportReviewFooter`

CTA dinámico: `"Confirmar X gastos + Y ingresos"` (cuenta sólo no-skipped). Cancelar abre confirm dialog si hay edits no guardados. Loading state durante el confirm.

### `ImportReviewEmpty`

Si `transactions.length === 0` (la captura no tenía nada parseable), la sheet muestra un placeholder amigable: "No detecté gastos en esta captura. Probá con otra imagen o cargá manualmente."

---

## FAB integration

`mobile/components/navigation/add-expense-tab-button.tsx`:

1. Extender `QuickAction.key` para incluir `'import'`.
2. Agregar la 5ª action:

```ts
{
  key: 'import',
  label: 'Importar captura',
  icon: 'document-scanner',         // o 'photo-library'
  onPress: handleOpenImportFlow,
  accentColor: '#B894FA',           // púrpura suave; distinto de los 4 existentes
}
```

3. `handleOpenImportFlow` dispara el image picker → si user no canceló, abre la sheet con `ImportReviewSheet`.

`mobile/components/navigation/add-quick-actions-overlay.tsx`:

- El arc fan hoy distribuye 4 petals en angles `[150, 110, 70, 30]` (commit `c3546f7`). Con 5 petals los angles pasan a `[160, 130, 100, 70, 40]` aproximadamente. Calibrar visualmente con cinco íconos para que se vean equiespaciados y los labels no se solapen.

---

## Currency conversion: política exacta

```ts
const USD_LIKE = new Set(['USD', 'USDc', 'USDT'])

// En mapToReviewRows:
if (currency === 'ARS') {
  amount = tx.primaryAmount.value  // sin conversión
} else if (USD_LIKE.has(currency)) {
  amount = round(tx.primaryAmount.value * usdToArsRate, 2)
  // Mostrar nota: "USDc 16 @ rate $1000 = ARS $16.000"
} else {
  // EUR, BRL, BTC, ETH, etc — warning 'foreign-currency'
  amount = tx.primaryAmount.value  // dejamos el valor crudo
  // User edita manualmente; default a 'skip'
}
```

El rate se obtiene de `family_finance.usd_exchange_rate` mediante un hook existente (a verificar) o un fetch directo. Si no existe el rate (edge case extremo), default a 1000 y agregamos warning.

---

## Error handling

| Punto del flow | Failure | Handling |
|---|---|---|
| Image picker cancelado | User cierra el picker | Cerrar el flow sin error visible |
| Image picker permission denied | iOS no dio acceso a galería | Toast: "Necesito acceso a tus fotos para importar capturas. Activá el permiso en Settings." |
| `parseActivity(uri)` throws | ML Kit falló o imagen corrupta | Toast: "No pude leer esa captura. Probá con otra imagen." + cerrar sheet |
| `parseActivity` retorna 0 transactions + N unmatched | Captura no tenía nada parseable | Sheet abre con `ImportReviewEmpty` placeholder |
| Currency lookup falla (no hay family rate) | RLS o net error | Usar default 1000 + warning silencioso (dev log) |
| Confirm row failure (una row específica) | createExpense o createIncome falla | Agrega a `result.failed[]`. Sheet cierra normal; toast: "Cargué X gastos + Y ingresos. Z no pudieron entrar — tap para ver." |
| Confirm con ZERO rows submittables | Todas marked skip | Botón disabled, no se llega al tap |

---

## Testing

### Unit tests (vitest, env node)

**`tests/unit/import-review-map-to-rows.test.ts`**:

Cobertura del pure mapper:
- 1 expense simple ARS → kind='expense', amount=value, categoryId=defaultCategoryId
- 1 income simple ARS (sign=+1) → kind='income', incomeKind='other'
- 1 expense USDc → amount convertido via rate, `source.appliedRate` poblado
- 1 income USD → amount convertido, kind='income'
- 1 foreign currency (EUR) → warning 'foreign-currency', kind='skip' default
- 1 swap (secondaryAmount diff currency) → warning 'swap-ambiguous', kind='skip'
- 1 missing merchant → warning 'no-merchant', kind=expense con description='(sin descripción)'
- 1 missing date → warning 'no-date', date=today
- 1 zero value → warning 'value-zero', kind=expense con amount=0

Total: ~10 tests del mapper.

### Manual smoke en device

- Tap FAB → Importar captura
- Verificar que el image picker abre y vuelve
- Sheet abre con N rows correctas (verificar contra fixture conocido)
- Editar 1 amount en 1 row
- Cambiar 1 row de gasto a ingreso (toggle)
- Skip 1 row
- Confirmar
- Toast con resumen correcto
- Verificar en Home/Gastos que los gastos y ingresos quedaron creados
- Verificar que un error simulado (ej. editar amount a "abc") muestra error inline y bloquea confirm

---

## Edge cases explícitos

| Caso | Comportamiento |
|---|---|
| Row con `amount = 0` y `kind = expense` al confirmar | Confirm validation bloquea: error inline "El monto debe ser mayor a cero." |
| Row con `description = ""` y `kind = expense` al confirmar | Validation bloquea: "La descripción no puede estar vacía." |
| Row con date en el futuro | Permitido (es-AR users a veces back-date desde captura tomada después). Sin warning. |
| Row con date >30 días atrás | Permitido. Posible warning visual "Importando gasto antiguo" pero no bloqueante. |
| Categoría que el user borra desde otra pantalla mientras la sheet está abierta | Picker queda con el id stale. Al confirm, RLS / FK falla → row aparece en failed con razón "categoría no existe". User reabre picker y elige otra. |
| User sale de la sheet con cambios | Confirm dialog: "Tenés ediciones sin confirmar. ¿Salir igual?" Si confirma sí, descartamos el state. |
| User sale, vuelve a entrar | El draft se descarta al cerrar; la sheet empieza con state nuevo. Si quieren persistir el draft, lo agregamos en una iteración futura. |
| `parseActivity` retorna 30+ transactions | La sheet renderiza scrollable. No hay límite hard. Sí podemos agregar virtualización si vemos lag. |
| Misma captura importada por 2 users de la misma familia simultáneamente | Cada uno crea sus propios expenses con su `created_by = uid`. No hay coordinación. Acceptable; el modelo del app ya soporta múltiples members creando expenses. |
| User cambia el `usd_exchange_rate` mientras la sheet está abierta | El amount de la sheet NO se recalcula. El user editó/aceptó el monto con la rate del momento de apertura. Si quiere usar la nueva rate, cierra y reabre. |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| FAB con 5 petals queda apretado visualmente | Calibrar angles iterativamente; eventualmente pasar a un Grid 2x3 con la 5ª en el centro arriba si el arc no escala. |
| Sheet con muchas rows (20+) puede ser lenta en device viejo | Por ahora no virtualizamos. Si en device se ve lag, agregamos FlashList. |
| User confunde "Skip" con "Borrar" | Copy claro: "Skip esta fila — no se cargará" + acción reversible "Restaurar". |
| Un user importa 50 expenses y dispara 50 notifications | Ya discutido: la sheet hace per-row inserts; en práctica el bulk útil es 8-15 por captura. Si esto se vuelve problema, agregamos suppress flag en metadata + trigger update. |
| Categorías de la familia cambian entre abrir el picker y confirmar | Race condition baja-prob; si ocurre, row falla y aparece en failed. Lo aceptamos. |
| El user "abusa" del bulk import y carga 200 expenses sin revisar bien | UX problem, no technical. La sheet diseña para review explícita; si saltea es decisión propia. |

---

## Out of scope explícito (no en Phase C)

- Heurística merchant → categoría (Phase E)
- Reglas auto-classify por merchant ("Cashback" → ingreso/'other')
- Columnas DB `origin` / `import_metadata`
- RPC server-side `import_expenses_batch`
- Notification flood suppression (no hace falta dado el shape de la feature)
- Share extension / share sheet entry (futuro)
- Persistencia del draft (si user sale, el state se pierde)
- Editar `usd_exchange_rate` desde la sheet
- Soporte de monedas distintas a ARS/USD/USDc/USDT en input
- LLM fallback para `unmatched`

---

## Files summary

```
NEW (nuevos):
  mobile/features/import-review/types.ts
  mobile/features/import-review/map-to-review-rows.ts
  mobile/features/import-review/use-import-review-controller.ts
  mobile/features/import-review/use-confirm-import.ts
  mobile/components/import-review/import-review-sheet.tsx
  mobile/components/import-review/import-review-row.tsx
  mobile/components/import-review/import-review-row-fields.tsx
  mobile/components/import-review/import-review-footer.tsx
  mobile/components/import-review/import-review-empty.tsx
  tests/unit/import-review-map-to-rows.test.ts

MODIFIED:
  mobile/components/navigation/add-expense-tab-button.tsx  (5º petal "import")
  mobile/components/navigation/add-quick-actions-overlay.tsx  (arc con 5 petals)

  (Y borrar el TEMPORAL ungate de Phase B en el commit final cuando shippeamos:
  app/(app)/settings/dev/activity-ocr.tsx  → restaurar __DEV__ redirect
  mobile/screens/settings/settings-screen.tsx  → restaurar grupo a __DEV__-only)

UNCHANGED (todo Phase A + B):
  mobile/features/activity-ocr/  (TODA la carpeta intacta)
  tests/unit/activity-ocr-*.test.ts (todos los 78 tests verde)
```

---

## Aceptación

- [ ] FAB de Gastos tiene 5 petals; el 5º es "📷 Importar captura" con accent púrpura.
- [ ] Tap → image picker → user elige captura → `parseActivity` corre → sheet abre.
- [ ] La sheet muestra el merchant, monto, fecha, categoría (gasto) o kind (ingreso), notas. Todos editables.
- [ ] Para expense de USDc/USD, el amount se muestra en ARS con la rate visible debajo.
- [ ] Sign=+1 default → row kind='income'; sign=-1 → 'expense'. User puede sobreescribir per row.
- [ ] Foreign currency / swap rows arrancan en 'skip' con warning visible.
- [ ] Confirmar → per-row insert via `createExpense` o `useCreateIncomeEvent` → toast resumen → sheet cierra.
- [ ] Si N rows fallan, toast incluye "ver detalle" que abre modal con lista de errores.
- [ ] Validación pre-confirm bloquea rows con description vacío o amount ≤ 0.
- [ ] Pantalla dev de Phase B sigue funcionando (el ungate temporal se mantiene mientras Phase C esté en branch; al mergear a main se revierte).
- [ ] 78 tests existentes verdes + nuevos tests del mapper.
- [ ] Bundle pre-flight iOS y Android verde.
- [ ] Smoke test device: importar 1 captura conocida, ver 3 rows pobladas, editar 1, skipear 1, confirmar 2, verificar en Home.
