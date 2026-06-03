# Activity OCR — Phase A: Parser Library Design

**Fecha:** 2026-06-02
**Scope:** Fase A de la feature "Parser de Actividad de Consumos vía OCR". Esta fase entrega **solo la librería de parsing pura**: dado un `Line[]` (texto + posiciones, formato genérico) y un `imageWidth`, produce un `ParseResult` con `Transaction[]` y líneas sin clasificar. Sin nativo, sin DB, sin UI, sin red.

**Brief original:** mensaje del usuario 2026-06-02 ("Integración: Parser de Actividad de Consumos vía OCR (sin LLM)").

**Próximas fases (separadas, no en este spec):**
- **B:** ML Kit + `expo-image-picker` + dev build verify (Phase B convierte `uri` → `Line[]`).
- **C:** Migración `expenses` (agregar `origin` + `import_metadata`), mapeo `Transaction → CreateExpenseInput`, dedup, manejo de currency vía `family_finance.usd_exchange_rate`.
- **D:** UI de revisión editable + flujo de import + integración con la mutación `createExpense()` existente.
- **E:** Heurística merchant → categoría (diccionario de reglas reusando taxonomía actual).

---

## Goal

Convertir un screenshot de actividad bancaria/wallet, ya extraído a `Line[]` por OCR, en una lista tipada de `Transaction[]` con merchant, fecha, sección, monto principal y monto secundario (para swaps de moneda), usando **reglas posicionales (clustering por Y, columnas por X) + regex** — cero LLM, cero red.

## Non-goals (Fase A)

- No hace OCR — recibe `Line[]` ya extraído. La lectura nativa vive en Fase B.
- No persiste en Supabase — eso es Fase C.
- No mapea moneda → ARS — eso es Fase C.
- No deduplica contra `expenses` — eso es Fase C.
- No tiene UI — eso es Fase D.
- No infiere categoría desde merchant — eso es Fase E.
- No soporta locales != es-AR. Si en el futuro hay que parsear apps en otros locales, parametrizamos `patterns.ts`. Por ahora, hardcodeado a meses en español + separadores `.`/`,`.
- No usa lib de fechas (`date-fns`, `luxon`, etc.). El proyecto hoy no usa ninguna — no introduzcamos una para 3 líneas de string manipulation.

---

## Ubicación

`mobile/features/activity-ocr/`

Sigue la convención del repo (`mobile/features/<feature>/`). Tests viven en `tests/unit/activity-ocr-*.test.ts` para alinear con el patrón vitest del proyecto (env `node`, sin React renderer).

---

## Arquitectura (Fase A)

```
mobile/features/activity-ocr/
├── types.ts                      # Frame, Line, TransactionGroup, Amount, Sign, Transaction, ParseResult
├── parser/
│   ├── patterns.ts               # Regex de fecha, monto, sección + MONTHS_ES
│   ├── normalize.ts              # Blocks crudos (any[]) → Line[] (defensivo, frame shape-agnostic)
│   ├── group-rows.ts             # Line[] → TransactionGroup[] (clustering por Y)
│   └── classify.ts               # TransactionGroup → Transaction | null (columnas + regex)
├── parse-activity-lines.ts       # Orquestador puro: (lines, imageWidth) → ParseResult
└── activity-parser.ts            # Public API: parseActivity(uri) — STUB en Fase A (lanza "Phase B pending")
```

Las exports públicas en `index.ts` (o re-exports inline) exponen: `parseActivityLines`, `parseActivity` (stub), todos los tipos.

## Pipeline (Fase A — sin el wrap de OCR)

```
Line[]   (provisto por el caller — en Phase B vendrá de ML Kit vía normalize)
  → group-rows (clustering por Y con gapFactor)
  → ordenar grupos por top
  → para cada grupo:
       ├─ ¿es un header de sección? → actualizar currentSection, no produce Transaction
       └─ classify (split por X, regex por línea) → Transaction | null
  → ParseResult { transactions, unmatched }
```

`parseActivity(uri)` (Phase B) será simplemente:
```ts
const blocks = await recognizeBlocks(uri)
const lines = normalize(blocks)
const imageWidth = await getImageWidth(uri)
return parseActivityLines(lines, imageWidth)
```

---

## Tipos (contratos)

`mobile/features/activity-ocr/types.ts`:

```ts
/** Caja delimitadora de un fragmento de texto, en px de la imagen original. */
export interface Frame {
  top: number
  left: number
  width: number
  height: number
}

/** Línea de texto reconocida, con su posición en la imagen. */
export interface Line {
  text: string
  frame: Frame
}

/** Grupo de líneas que pertenecen a una misma transacción (o a un header de sección). */
export interface TransactionGroup {
  lines: Line[]
  /** Top del grupo (mínimo top de las líneas), usado para ordenar y heredar secciones. */
  top: number
}

export type Sign = 1 | -1

export interface Amount {
  /** Magnitud, siempre positiva. El signo va en `sign`. */
  value: number
  /** Código de moneda tal como salió del OCR ("ARS", "USDc", "USD", ...). Normalización a Fase C. */
  currency: string
  /** -1 = egreso, +1 = ingreso. */
  sign: Sign
}

export interface Transaction {
  /** Nombre del comercio o concepto. Tal como aparece en la captura. */
  merchant: string
  /** Fecha en formato ISO "YYYY-MM-DD" o null si no se detectó. */
  date: string | null
  /** Header de sección heredado (ej. "Hoy", "Ayer", "Junio 2026") o null. */
  section: string | null
  primaryAmount: Amount
  secondaryAmount: Amount | null
  /** Texto crudo concatenado de las líneas del grupo. Para debug/auditoría. */
  raw: string
}

export interface ParseResult {
  transactions: Transaction[]
  /** Grupos que no se pudieron clasificar como transacción ni como header. Candidatos a fallback LLM (Fase E+). */
  unmatched: TransactionGroup[]
}
```

---

## Módulos

### `parser/patterns.ts`

```ts
/** Fecha tipo "01 jun 2026" / "1 Jun. 2026" (es-AR). Permite punto opcional tras el mes. */
export const RE_DATE = /^(\d{1,2})\s+([a-záéíóú]{3,})\.?\s+(\d{4})$/i

/**
 * Monto con signo y moneda. Soporta:
 *   - Signo ASCII '+', '-' o Unicode minus '−' (U+2212, frecuente en OCR de iOS).
 *   - Espacio opcional entre signo y número.
 *   - Formato es-AR: '.' miles, ',' decimal. Ej: "- 26.000 ARS", "+ 23.697,71 ARS", "- 16 USDc"
 *   - Moneda 2-5 caracteres alfabéticos (cubre ARS, USD, EUR, USDc, USDT, BTC, ETH, BRL).
 */
export const RE_AMOUNT = /([+\-−])\s*([\d.,]+)\s*([A-Za-z]{2,5})/

/**
 * Header de sección sin monto. Matches:
 *   - "Hoy" / "Ayer" (case-insensitive)
 *   - "Junio 2026" / "Marzo 2025" (mes + año)
 */
export const RE_SECTION = /^(hoy|ayer|[a-záéíóú]+\s+\d{4})$/i

/** Mapa de mes abreviado (3 caracteres en minúscula) → número MM. es-AR. */
export const MONTHS_ES: Readonly<Record<string, string>> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
}
```

### `parser/normalize.ts`

Aplana `blocks → Line[]` de forma defensiva contra distintas formas de `frame` que puede devolver ML Kit. Esto se prueba en Fase B contra la versión real instalada; en Fase A escribimos para los dos shapes documentados (`{top,left,width,height}` flat vs `{boundingBox:{top,left,width,height}}` anidado).

```ts
import type { Frame, Line } from '../types'

/**
 * Aplana blocks (output de ML Kit u otro OCR) a Line[].
 * `blocks` es `any[]` por diseño: el tipo concreto varía entre versiones de la lib.
 * La función tolera tanto `frame: {top,left,width,height}` plano como `frame: {boundingBox: {...}}` anidado.
 */
export function normalize(blocks: readonly unknown[]): Line[] {
  const lines: Line[] = []
  for (const block of blocks) {
    const innerLines = readInnerLines(block)
    for (const raw of innerLines) {
      const text = readText(raw)
      const frame = readFrame(raw)
      if (text.length > 0 && frame !== null) {
        lines.push({ text, frame })
      }
    }
  }
  return lines
}

// Helpers privados — todos defensivos contra unknown.
function readInnerLines(block: unknown): unknown[] {
  if (block != null && typeof block === 'object' && 'lines' in block && Array.isArray((block as { lines: unknown[] }).lines)) {
    return (block as { lines: unknown[] }).lines
  }
  return []
}

function readText(raw: unknown): string {
  if (raw != null && typeof raw === 'object' && 'text' in raw && typeof (raw as { text: unknown }).text === 'string') {
    return (raw as { text: string }).text.trim()
  }
  return ''
}

function readFrame(raw: unknown): Frame | null {
  if (raw == null || typeof raw !== 'object' || !('frame' in raw)) return null
  const f = (raw as { frame: unknown }).frame
  if (f == null || typeof f !== 'object') return null
  const flat = f as { top?: unknown; left?: unknown; width?: unknown; height?: unknown; boundingBox?: unknown }
  const source =
    typeof flat.top === 'number' ? flat : (flat.boundingBox && typeof flat.boundingBox === 'object' ? (flat.boundingBox as Record<string, unknown>) : null)
  if (!source) return null
  const top = numOr(source.top, 0)
  const left = numOr(source.left, 0)
  const width = numOr(source.width, 0)
  const height = numOr(source.height, 0)
  if (width <= 0 || height <= 0) return null
  return { top, left, width, height }
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
```

### `parser/group-rows.ts`

Cluster por Y. Un gap vertical grande entre una línea y la anterior marca el inicio de una nueva transacción. Umbral proporcional a la altura de línea para ser robusto a distintas resoluciones.

```ts
import type { Line, TransactionGroup } from '../types'

const DEFAULT_GAP_FACTOR = 1.8

export function groupRows(
  lines: readonly Line[],
  gapFactor: number = DEFAULT_GAP_FACTOR,
): TransactionGroup[] {
  if (lines.length === 0) return []
  const sorted = [...lines].sort((a, b) => a.frame.top - b.frame.top)
  const groups: TransactionGroup[] = []
  let cursorBottom = -Infinity
  let cursorReferenceHeight = 0 // altura de la última línea, para escalar el gap

  for (const line of sorted) {
    const gap = line.frame.top - cursorBottom
    const threshold = (cursorReferenceHeight || line.frame.height) * gapFactor
    const isNewGroup = groups.length === 0 || gap > threshold
    if (isNewGroup) {
      groups.push({ lines: [line], top: line.frame.top })
    } else {
      const last = groups[groups.length - 1]
      last.lines.push(line)
      if (line.frame.top < last.top) last.top = line.frame.top
    }
    cursorBottom = line.frame.top + line.frame.height
    cursorReferenceHeight = line.frame.height
  }
  return groups
}
```

**Calibración del `gapFactor`:** default 1.8 cubre el caso de referencia. Si futuras capturas de otras apps presentan layouts más densos o más espaciados, el caller puede pasar un valor distinto. No hace falta auto-tuning en Fase A.

### `parser/classify.ts`

Divide cada grupo en dos columnas por X (umbral en `imageWidth * 0.5`), asigna merchant + date a la izquierda y montos a la derecha, normaliza valores.

```ts
import type { Amount, Line, Sign, Transaction, TransactionGroup } from '../types'
import { MONTHS_ES, RE_AMOUNT, RE_DATE } from './patterns'

const DEFAULT_COLUMN_DIVIDER_RATIO = 0.5

export function classify(
  group: TransactionGroup,
  imageWidth: number,
  columnDividerRatio: number = DEFAULT_COLUMN_DIVIDER_RATIO,
): Transaction | null {
  const mid = imageWidth * columnDividerRatio
  const left: Line[] = []
  const right: Line[] = []
  for (const line of group.lines) {
    ;(line.frame.left < mid ? left : right).push(line)
  }

  // Fecha y merchant — de la columna izquierda.
  const dateLine = left.find((l) => RE_DATE.test(l.text)) ?? null
  const merchantLine = left.find((l) => l !== dateLine && !RE_AMOUNT.test(l.text)) ?? null

  // Montos — de la columna derecha, en orden vertical (top más chico = principal).
  const amounts = right
    .slice()
    .sort((a, b) => a.frame.top - b.frame.top)
    .map((l) => parseAmount(l.text))
    .filter((a): a is Amount => a !== null)

  if (amounts.length === 0) return null // No es transacción; probablemente sea un header o ruido.

  return {
    merchant: merchantLine?.text.trim() ?? '',
    date: dateLine ? toISO(dateLine.text) : null,
    section: null, // El orquestador hereda la sección actual.
    primaryAmount: amounts[0],
    secondaryAmount: amounts[1] ?? null,
    raw: group.lines.map((l) => l.text).join(' '),
  }
}

function parseAmount(text: string): Amount | null {
  const m = text.match(RE_AMOUNT)
  if (!m) return null
  const signChar = m[1]
  const sign: Sign = signChar === '+' ? 1 : -1
  // es-AR: '.' miles, ',' decimal. Removemos todos los '.' y reemplazamos ',' por '.'.
  const numeric = m[2].replace(/\./g, '').replace(',', '.')
  const value = Number.parseFloat(numeric)
  if (!Number.isFinite(value) || value < 0) return null
  return { value, currency: m[3], sign }
}

function toISO(text: string): string | null {
  const m = text.match(RE_DATE)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const monthKey = m[2].toLowerCase().slice(0, 3)
  const month = MONTHS_ES[monthKey]
  if (!month) return null
  return `${m[3]}-${month}-${day}`
}
```

### `parse-activity-lines.ts`

Orquestador puro. **Esta es la función principal de Fase A** — la API que vamos a probar exhaustivamente.

```ts
import type { Line, ParseResult, Transaction, TransactionGroup } from './types'
import { classify } from './parser/classify'
import { groupRows } from './parser/group-rows'
import { RE_SECTION } from './parser/patterns'

export interface ParseLinesOptions {
  /** Multiplicador de "altura de línea" para detectar gaps entre transacciones. Default 1.8. */
  gapFactor?: number
  /** Posición del divisor de columnas (fracción de `imageWidth`). Default 0.5. */
  columnDividerRatio?: number
}

export function parseActivityLines(
  lines: readonly Line[],
  imageWidth: number,
  options: ParseLinesOptions = {},
): ParseResult {
  if (lines.length === 0 || imageWidth <= 0) {
    return { transactions: [], unmatched: [] }
  }

  const groups = groupRows(lines, options.gapFactor)
  groups.sort((a, b) => a.top - b.top)

  const transactions: Transaction[] = []
  const unmatched: TransactionGroup[] = []
  let currentSection: string | null = null

  for (const group of groups) {
    if (group.lines.length === 1 && RE_SECTION.test(group.lines[0].text)) {
      currentSection = group.lines[0].text
      continue
    }
    const tx = classify(group, imageWidth, options.columnDividerRatio)
    if (tx) {
      tx.section = currentSection
      transactions.push(tx)
    } else {
      unmatched.push(group)
    }
  }
  return { transactions, unmatched }
}
```

### `activity-parser.ts` (stub Fase A)

```ts
import type { ParseResult } from './types'

/**
 * Public API end-to-end: dado un URI de imagen, devuelve transacciones.
 * STUB en Fase A — la implementación real vive en Fase B (ML Kit + getImageWidth).
 *
 * Para tests aislados del OCR usar `parseActivityLines` directamente.
 */
export async function parseActivity(_uri: string): Promise<ParseResult> {
  throw new Error('parseActivity requires Phase B (ML Kit wiring). Use parseActivityLines for unit tests.')
}
```

Cuando llegue Fase B, el body se vuelve:
```ts
const blocks = await recognizeBlocks(_uri)
const lines = normalize(blocks)
const imageWidth = await getImageWidth(_uri)
return parseActivityLines(lines, imageWidth)
```

---

## Testing (vitest env node)

Patrón del repo (memoria `[[feedback-vitest-no-react-renderer]]`): vitest corre en env `node`, no hay React renderer. Estos módulos son puros — calzan perfecto.

Tests en `tests/unit/`:

1. **`activity-ocr-patterns.test.ts`** — regex aislados.
   - `RE_DATE` matchea "01 jun 2026", "1 Jun. 2026", no matchea "ayer", "01/06/2026".
   - `RE_AMOUNT` matchea "- 26.000 ARS", "+ 23.697,71 ARS", "− 16 USDc" (Unicode minus). No matchea "USDc → ARS".
   - `RE_SECTION` matchea "Hoy", "Ayer", "Junio 2026". No matchea "01 jun 2026".

2. **`activity-ocr-normalize.test.ts`** — defensa contra distintos shapes.
   - Flat `{top,left,width,height}` → Line[].
   - Anidado `{boundingBox:{...}}` → Line[].
   - Block sin `lines` → ignorado.
   - Line sin `text` → ignorada.
   - Frame con `width: 0` → ignorada.

3. **`activity-ocr-group-rows.test.ts`** — clustering.
   - 4 líneas en 2 grupos por gap > 1.8 × altura → 2 grupos.
   - Líneas en orden Y aleatorio → grupos en orden top creciente.
   - Una sola línea → un grupo de una.
   - `gapFactor` custom permite ajustar.

4. **`activity-ocr-classify.test.ts`** — clasificación de un grupo aislado.
   - LA EUROPEA simple: merchant + date + amount.
   - USDc → ARS doble monto: primaryAmount + secondaryAmount.
   - Cashback decimal: signo + valor con coma.
   - 110.000 ARS miles con punto: value 110000, no 110.
   - Grupo sin monto → null.
   - Grupo con 3 montos → primary + secondary; tercero descartado (documentamos).

5. **`activity-ocr-parse-lines.test.ts`** — orquestador end-to-end.
   - Fixture de la captura de referencia (4 transacciones) → 4 transactions correctas.
   - Section header "Hoy" antes de 2 grupos → ambos tx.section === "Hoy".
   - Múltiples secciones consecutivas → cada tx hereda su sección.
   - imageWidth <= 0 → resultado vacío sin throw.
   - Input vacío → `{ transactions: [], unmatched: [] }`.

Criterio de aceptación (espejo del §10 del brief, alcance Fase A): el fixture de la captura de referencia produce **4 transacciones correctas** incluyendo el swap con doble monto.

---

## Decisiones tomadas (no controvertidas)

| Decisión | Razón |
|---|---|
| Carpeta `mobile/features/activity-ocr/` | Sigue convención del repo (`mobile/features/<feature>/`). |
| Tests en `tests/unit/activity-ocr-*.test.ts` | Patrón vitest del proyecto; archivo plano por módulo para grep rápido. |
| `parseActivityLines(lines, imageWidth, options)` es la API pura. `parseActivity(uri)` queda como stub. | Permite testing 100% aislado sin ML Kit. Fase B reemplaza el stub sin tocar el resto. |
| `Frame.width <= 0` se descarta en normalize | OCR a veces devuelve frames degenerados; filtrarlos evita división por cero downstream. |
| Sin lib de fechas | No hay date-fns/luxon en el repo; agregar una para `String#padStart` + un map es overkill. |
| `currency` queda string crudo ("ARS", "USDc") | Normalización a códigos canónicos / mapeo a moneda interna pasa en Fase C cuando ya conocemos el modelo. |
| Default `gapFactor: 1.8`, `columnDividerRatio: 0.5` | Calibrado para captura de referencia. Si futuras apps difieren, parametrizable sin tocar el código. |
| Tipo `Sign = 1 | -1` literal | Hace el contrato explícito; evita "sign: 0" inválido a nivel tipo. |
| Unicode minus `−` (U+2212) en `RE_AMOUNT` | iOS OCR a veces lo emite en vez de ASCII `-`. Cubrir ambos. |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Layout de otras apps no respeta el split izquierda/derecha al 50%. | `columnDividerRatio` parametrizable. Si una app específica requiere 0.6 o un divisor distinto, se pasa por opción. Documentar en Fase B según las capturas de referencia que aparezcan. |
| `gapFactor` 1.8 falla en apps muy compactas. | Mismo: parametrizable. Sugerir calibración en docs cuando salgan problemas reales. |
| OCR de ML Kit a veces parte un texto en dos líneas (ej. merchant largo). | El grouping por Y lo va a juntar correctamente si el gap es chico. Si una sola transacción tiene 3+ líneas a la izquierda, `merchant` toma la primera no-fecha; el resto se descarta. **Limitación documentada**, no se resuelve en Fase A. |
| Moneda con caracteres raros (ej. "₿" Bitcoin). | `RE_AMOUNT` exige `[A-Za-z]{2,5}` — descarta el símbolo. Limitación documentada; si aparece, se extiende el regex en una fase futura. |
| Decimal con punto en lugar de coma (en-US). | Documentado fuera de scope (es-AR only). Si en el futuro hay que parsear capturas en-US, parametrizar `patterns.ts`. |

---

## Out of scope explícito de Fase A

- Conexión real con ML Kit y `expo-image-picker` (Fase B).
- Verificación del shape exacto de `frame` que devuelve la versión instalada de la lib (Fase B).
- Migración de tabla `expenses` para agregar `origin` + `import_metadata` (Fase C).
- Mapeo `Transaction → CreateExpenseInput` con conversión USD/USDc → ARS vía `family_finance.usd_exchange_rate` (Fase C).
- Decisión sobre qué hacer con cashback (ingresos, signo +), swaps de moneda, y otros movimientos no-expense (Fase C — probablemente filtramos con razón en el metadata).
- Deduplicación contra `expenses` existentes (Fase C).
- UI de revisión + edición + confirmación + entry point (Fase D).
- Heurística merchant → categoría (Fase E).
- Fallback LLM para `unmatched` (Fase E o posterior, flag-gated).

---

## Files summary

```
NEW:
  mobile/features/activity-ocr/types.ts
  mobile/features/activity-ocr/parser/patterns.ts
  mobile/features/activity-ocr/parser/normalize.ts
  mobile/features/activity-ocr/parser/group-rows.ts
  mobile/features/activity-ocr/parser/classify.ts
  mobile/features/activity-ocr/parse-activity-lines.ts
  mobile/features/activity-ocr/activity-parser.ts
  tests/unit/activity-ocr-patterns.test.ts
  tests/unit/activity-ocr-normalize.test.ts
  tests/unit/activity-ocr-group-rows.test.ts
  tests/unit/activity-ocr-classify.test.ts
  tests/unit/activity-ocr-parse-lines.test.ts

MODIFIED: ninguno.
```

Cero migraciones, cero deps nuevas, cero cambios en UI. Esta fase entrega una librería pura testeada exhaustivamente con vitest; el resto se construye encima.
