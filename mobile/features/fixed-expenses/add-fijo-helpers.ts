// Helpers + constantes del wizard add-fijo. Extraídos de
// `add-fijo-v2-screen.tsx` para que la screen pueda concentrarse en
// orquestación. Cero side effects: todo puro.
import type { FixedExpenseFrequency } from '@/features/fixed-expenses/fixed-expense-types'
import { isPersistedFixedExpenseId } from '@/features/fixed-expenses/fixed-expense-id'

// `cuotas` (UI choice) mappea a `frequency='monthly' + kind='installment'`
// en el backend. El resto mappea 1:1 con la columna `frequency`.
export type FreqChoice = FixedExpenseFrequency | 'cuotas'

// `labelKey` se resuelve con `t()` en el consumidor (los ids son
// identificadores estables; las labels viven en el namespace `fijos`).
// `icon` = key del registry de stickers (frecuencias/*). El FreqTile rendea
// el sticker si la key existe en CATEGORY_ICONS, sino cae al string como emoji
// (back-compat).
export const FREQ_OPTIONS: Array<{ id: FreqChoice; labelKey: string; icon: string }> = [
  { id: 'monthly',    labelKey: 'fijos:frequency.monthly',    icon: 'frecuencias/mensual' },
  { id: 'biweekly',   labelKey: 'fijos:frequency.biweekly',   icon: 'frecuencias/quincenal' },
  { id: 'weekly',     labelKey: 'fijos:frequency.weekly',     icon: 'frecuencias/semanal' },
  { id: 'quarterly',  labelKey: 'fijos:frequency.quarterly',  icon: 'frecuencias/trimestral' },
  { id: 'semiannual', labelKey: 'fijos:frequency.semiannual', icon: 'frecuencias/semestral' },
  { id: 'annual',     labelKey: 'fijos:frequency.annual',     icon: 'frecuencias/anual' },
  { id: 'cuotas',     labelKey: 'fijos:kind.installment',     icon: 'frecuencias/cuotas' },
]

export const CUOTA_OPTIONS = [3, 6, 12, 18, 24, 36] as const

export const QUICK_AMOUNTS = [5000, 15000, 30000, 50000, 100000] as const

/**
 * Convert hex color → rgba string. Usado para tintar surfaces (e.g.
 * el icon container de la summary card o los gradients del calendario)
 * con el color de la categoría sin reventar el contraste del texto.
 */
export function hexAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Cómputa el `next_due_on` inicial para un fijo recién creado.
 *
 * Antes (2026-05-30): siempre devolvía "próximo `day` futuro", lo cual
 * combinado con que el usuario tocara "Registrar pago" enseguida para
 * marcarlo como "ya pagué", causaba que `next_due_on` saltara DOS
 * meses adelante (form puso mayo, RPC avanzó a junio) — la cuota del
 * mes en curso quedaba "skipeada", invisible para el ciclo.
 *
 * Ahora: SIEMPRE devuelve la ocurrencia de ESTE mes (clampada a la
 * cantidad de días reales del mes — ej: day=31 en febrero → 28/29).
 * El form pasa esta fecha al INSERT. Si el toggle "Ya pagué la cuota
 * más reciente" está activo, el caller dispara después
 * `recordFixedExpensePayment` que avanza correctamente al mes siguiente
 * y crea el payment row para esta cuota. Si está inactivo, el fijo
 * queda con `next_due_on = este mes` → status `pending` (todavía no
 * venció) u `overdue` (ya venció y no se pagó) según el día.
 *
 * Esto elimina el "salto de mes" estructuralmente: el form siempre
 * apunta a la cuota más cercana (la del mes actual), y el "Registrar
 * pago" la mueve al siguiente — coincidiendo con la intención del user.
 */
export function buildNextDueOn(day: number): string {
  const today = new Date()
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  // Clamp al último día válido del mes (ej: feb no tiene 31).
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const safeDay = Math.min(day, daysInMonth)
  const due = new Date(Date.UTC(year, month, safeDay))
  return due.toISOString().slice(0, 10)
}

/**
 * Base sobre la que el `OnbNumpad` appendea dígitos (`value*10 + dígito`).
 * Ese modelo es entero: con un monto con decimales (existen en prod —
 * numeric(12,2) cargados con la coma del numpad classic) cada tecla lo
 * corrompía (sobre 1500.5, tipear "3" daba 15008). Un monto que el numpad
 * no puede representar arranca de cero: tipear REEMPLAZA en vez de
 * appendear, y sin tocar el numpad el decimal se conserva intacto.
 */
export function numpadBaseAmount(amount: number): number {
  return Number.isInteger(amount) ? amount : 0
}

/**
 * Normaliza un nombre de fijo para comparar duplicados: trim + minúsculas
 * + sin tildes ni diéresis. "Teléfono", " telefono " y "TELEFONO" cuentan
 * como el mismo nombre — si la comparación fuera literal, el validador se
 * esquivaría sin querer con una mayúscula o un espacio.
 *
 * Se pliegan SOLO el acento agudo (U+0301) y la diéresis (U+0308): la ñ
 * es letra propia del castellano, no una n con tilde — descartar todos
 * los combining marks igualaba "Peña" con "Pena" y bloqueaba nombres
 * legítimamente distintos. El NFC final re-compone la ñ que el NFD abrió.
 * Exportado: el form lo usa para detectar "conservó el nombre original"
 * al editar (colisiones legacy pre-validador no pueden trabar la edición).
 */
export function normalizeFijoName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0301\u0308]/g, '')
    .normalize('NFC')
}

/**
 * Duplicado de nombre contra los fijos existentes de la familia. El alta
 * aceptaba "Alquiler" dos veces sin aviso ni bloqueo; el gate del wizard
 * (`canContinue`) bloquea el avance cuando esto devuelve un match y el
 * paso 1 muestra el error inline. `excludeId` es el fijo en edición:
 * guardar sin renombrar no puede bloquearse contra sí mismo.
 */
export function findDuplicateFijoName(
  name: string,
  existing: ReadonlyArray<{ id: string; name: string }>,
  excludeId?: string,
): { id: string; name: string } | null {
  const target = normalizeFijoName(name)
  if (target.length === 0) return null
  for (const fijo of existing) {
    if (excludeId && fijo.id === excludeId) continue
    if (normalizeFijoName(fijo.name) === target) return fijo
  }
  return null
}

/**
 * Subconjunto de fijos contra el que tiene sentido validar duplicados:
 * persistidos (las filas optimistas `temp-` del alta en vuelo se
 * matchearían a sí mismas durante el round-trip de creación) y VISIBLES
 * en la UI (`active`/`paused` — el mismo filtro de `summarizeFijos`).
 * Un fijo `completed`/`archived` no aparece en ninguna lista: bloquear
 * el alta por su nombre sería un dead-end sin causa visible ni override.
 */
export function selectDuplicateCandidates<
  T extends { id: string; name: string; status: string },
>(fijos: ReadonlyArray<T>): T[] {
  return fijos.filter(
    (f) =>
      isPersistedFixedExpenseId(f.id) &&
      (f.status === 'active' || f.status === 'paused'),
  )
}

/**
 * `next_due_on` para el path de EDICIÓN. A diferencia del alta
 * (`buildNextDueOn`, que apunta al mes actual), editar re-ancla el día
 * DENTRO del período vigente del cursor: mismo año/mes de
 * `existingNextDueOn`, día nuevo clampado a ese mes. Regla de oro:
 * editar no crea ni perdona deuda — si el cursor estaba en el pasado
 * (cuotas vencidas), sigue en el pasado; si ya está en el mes que
 * viene (cuota pagada), no vuelve a este mes. Antes el editor usaba
 * buildNextDueOn también al editar y un fijo pagado reaparecía como
 * pendiente fantasma (CRITICAL del review de Fijos 2026-08-03).
 */
export function rebaseNextDueOn(existingNextDueOn: string, newDay: number): string {
  const m = existingNextDueOn.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return buildNextDueOn(newDay)
  const year = Number(m[1])
  const month = Number(m[2]) // 1..12
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const safeDay = Math.min(Math.max(newDay, 1), daysInMonth)
  return `${m[1]}-${m[2]}-${String(safeDay).padStart(2, '0')}`
}
