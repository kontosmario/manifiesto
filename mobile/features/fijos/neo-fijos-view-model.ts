/**
 * Módulo PURO de derivación para `NeoFijosScreen` (F2, dev-only, cableado de
 * Fijos sobre datos reales). Selección de variante (hero + avisos),
 * construcción de los 3 objetos `*Content` COMPLETOS que consume el kit, y
 * los helpers de formateo/agregación que hacen falta para llenarlos.
 *
 * Cero imports de runtime de React/RN — todo lo que viene del kit
 * (`fijos-screen.tsx`) entra con `import type`, que el compilador borra. Un
 * `import { … }` de VALOR desde ese archivo arrastraría `react-native-svg` +
 * Skia y rompería la suite de vitest (env `node`, sin renderer,
 * `tests/stubs/` no tiene stub de `react-native-svg`).
 *
 * Ver `.superpowers/sdd/2026-07-29-fijos-cableado/wiring-spec.md` §3, §4 y
 * §6 — este archivo es la implementación literal de esas tres secciones.
 */
import { formatMoney } from '@/utils/money'
import { getDateTimeFormat } from '@/lib/i18n/active-locale'
import type {
  FijoItem,
  FijoHikeAlert,
  FijoCategoryGroup,
} from '@/features/fijos/fijos-aggregates.model'
import type {
  FijosHeroVariant,
  FijosAvisosVariant,
  FijosTabKey,
  FijosCategoryKey,
  FijosCategoryGroup,
  FijosRowTone,
  FijosTickerItem,
  FijosTickerTone,
  FijosHikeRow,
  FijosHeroContent,
  FijosAvisosContent,
  FijosCategoriesContent,
} from '@/components/redesign/fijos/fijos-screen'
import type { BrotPose } from '@/components/brot/brot-mascot'

// ---------------------------------------------------------------------------
// 6.16 — plural
// ---------------------------------------------------------------------------

/** `plural(1,'vencida','vencidas') → '1 vencida'`; cualquier otro n (incl. 0)
 *  usa la forma plural: `plural(0,…) → '0 vencidas'`, `plural(2,…) → '2 vencidas'`. */
export function plural(n: number, singular: string, pluralWord: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${pluralWord}`
}

// ---------------------------------------------------------------------------
// 6.10 — joinNamesEs
// ---------------------------------------------------------------------------

/** `[]→''` · `['A']→'A'` · `['A','B']→'A y B'` · `['A','B','C']→'A, B y C'`
 *  (coma antes de todos menos el último, `' y '` antes del último; sin coma
 *  de Oxford). No escapa comas propias de un nombre (`'Luz, Gas'` no se
 *  distingue de dos nombres) — límite documentado, no corregido. */
export function joinNamesEs(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} y ${names[1]}`
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

// ---------------------------------------------------------------------------
// 6.13 — formatSignedMoneyFijos
// ---------------------------------------------------------------------------

/** `formatMoney` siempre devuelve el valor absoluto (`money.ts:185`) — esta
 *  variante antepone el signo MENOS unicode (U+2212, no el hyphen ASCII de
 *  `formatMoneyWithSign`) cuando `n < 0`, para el único campo del kit que
 *  dibuja negativos (`availableAmount`, E5). `0` y `-0` no llevan signo. */
export function formatSignedMoneyFijos(n: number): string {
  return n < 0 ? `−${formatMoney(n)}` : formatMoney(n)
}

// ---------------------------------------------------------------------------
// 6.14 — monthUpperEs / monthLowerEs
// ---------------------------------------------------------------------------

/** `new Date(2026,6,19) → 'JULIO'`. Mismo patrón que `monthLongCapitalized`
 *  de `control-v2-adapter.ts:133-137` pero en mayúsculas (eyebrow del hero). */
export function monthUpperEs(d: Date): string {
  return getDateTimeFormat({ month: 'long' }).format(d).toUpperCase()
}

/** Variante en minúsculas — la usa `outOfCycleSub` de E8 ("cerrar julio y
 *  abrir el próximo ciclo"). No está en la lista de 16 funciones de la spec
 *  (§6) pero `outOfCycleSub` (§3.4 #25) la nombra explícitamente; se agrega
 *  acá por ser el mismo helper con un solo `.toLowerCase()` de diferencia. */
export function monthLowerEs(d: Date): string {
  return getDateTimeFormat({ month: 'long' }).format(d).toLowerCase()
}

// ---------------------------------------------------------------------------
// 6.15 — buildCycleHeaderLabel
// ---------------------------------------------------------------------------

/** `('20 jun → 19 jul', 18) → '20 jun → 19 jul · día 18'`. `formatCycleLabel`
 *  no agrega el sufijo de día (`format-cycle-label.ts:18`) — este helper lo
 *  suma para el header de `FijosHeader` (§3.3). */
export function buildCycleHeaderLabel(cycleLabel: string, daysIntoMonth: number): string {
  return `${cycleLabel} · día ${daysIntoMonth}`
}

// ---------------------------------------------------------------------------
// 6.11 — mapCategoryToBucket
// ---------------------------------------------------------------------------

function normalizeCategoryLabel(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

const HOUSING_RAW_LABELS = new Set(['vivienda', 'impuestos'])
const SUBSCRIPTIONS_RAW_LABELS = new Set(['suscripciones', 'educacion', 'deporte'])

/** Colapsa las ~11 categorías reales de `category_templates` (scope
 *  `fixed_expense`) a las 3 llaves que el kit soporta hoy (D4/C7 — el kit no
 *  se toca). `services` es el fallback: cualquier categoría custom de la
 *  familia, `'sin-categoria'`, o una de las 6 nombradas ahí caen acá — mismo
 *  criterio que `categoryTileBackground` (`fijos-screen.tsx:1939-1943`), que
 *  ya trata "no housing, no subscriptions" como su propio default. */
export function mapCategoryToBucket(rawLabel: string): FijosCategoryKey {
  const normalized = normalizeCategoryLabel(rawLabel)
  if (HOUSING_RAW_LABELS.has(normalized)) return 'housing'
  if (SUBSCRIPTIONS_RAW_LABELS.has(normalized)) return 'subscriptions'
  return 'services'
}

// ---------------------------------------------------------------------------
// 6.6 — buildStatusChip
// ---------------------------------------------------------------------------

export interface StatusChip {
  label: string
  tone: 'alert' | 'neutral' | 'success'
}

export interface StatusChipInput {
  overdueCount: number
  pendingCount: number
  paidCount: number
  cycleActiveCount: number
  daysIntoMonth: number
}

/** §3.4.1 — reproduce E2/E3/E4/E7 exactos. E5 usa el MISMO builder que E2
 *  (drift documentado del handoff, no un chip distinto — spec §3.4.1). */
export function buildStatusChip(input: StatusChipInput): StatusChip {
  const { overdueCount, pendingCount, paidCount, cycleActiveCount, daysIntoMonth } = input
  if (overdueCount > 0 && pendingCount > 0) {
    return {
      label: `⚠ ${pendingCount + overdueCount} fijos por pagar · ${plural(overdueCount, 'vencida', 'vencidas')}`,
      tone: 'alert',
    }
  }
  if (overdueCount > 0 && pendingCount === 0) {
    return { label: `⚠ ${plural(overdueCount, 'vencida', 'vencidas')}`, tone: 'alert' }
  }
  if (overdueCount === 0 && pendingCount > 0 && daysIntoMonth === 1) {
    return { label: `${cycleActiveCount} fijos este mes · recién cobraste`, tone: 'neutral' }
  }
  if (overdueCount === 0 && pendingCount > 0) {
    return { label: `${pendingCount} por venir · nada vencido`, tone: 'neutral' }
  }
  return { label: `✓ Cerró completo · ${paidCount} de ${cycleActiveCount}`, tone: 'success' }
}

// ---------------------------------------------------------------------------
// Selección de variante — §4. Total, sin default implícito.
// ---------------------------------------------------------------------------

export interface VariantSelection<V extends string> {
  variant: V
  reason: string
}

export interface HeroVariantInput {
  /** Fijos `active`/`paused` en la DB, independiente del ciclo. */
  activeFixedCount: number
  /** Fijos que tocan el ciclo activo (paid+pending+overdue, excluye `future`). */
  cycleActiveCount: number
  paidCount: number
  pendingCount: number
  overdueCount: number
  daysIntoMonth: number
  /** `incomeMode === 'fixed' && monthlyIncome > 0` — gatea E5 (C6). */
  hasIncome: boolean
  /** `monthlyIncome - total`, sin clamp (§3.2/ABIERTA-3). */
  availableRaw: number
  isSalaryPendingConfirmation: boolean
  /** Siempre `false` en esta fase — no existe selector de ediciones pasadas
   *  para Fijos. Se mantiene el parámetro para que el día que exista, solo
   *  haya que pasar el flag (§4.3). */
  viewingClosedEdition: boolean
}

/**
 * §4.1. Procedimiento de orden total — 9 pasos, cada combinación de inputs
 * cae en EXACTAMENTE una rama (ver el argumento de exhaustividad en la spec):
 * pasos 1-5 son guardas independientes; llegado el paso 6, `cycleActiveCount
 * ≥ 1` (así que `paidCount+pendingCount+overdueCount ≥ 1`), y la partición
 * por `(overdueCount, pendingCount)` cubre el resto sin solapes.
 */
export function selectHeroVariant(input: HeroVariantInput): VariantSelection<FijosHeroVariant> {
  const {
    activeFixedCount,
    cycleActiveCount,
    paidCount,
    pendingCount,
    overdueCount,
    daysIntoMonth,
    hasIncome,
    availableRaw,
    isSalaryPendingConfirmation,
    viewingClosedEdition,
  } = input

  // 1) E7 — INALCANZABLE en esta fase (no hay selector de ediciones
  //    pasadas), pero se testea explícito con `viewingClosedEdition: true`
  //    (§4.3): el día que exista el selector, solo cambia el flag.
  if (viewingClosedEdition) return { variant: 'E7', reason: 'edición cerrada (viewingClosedEdition)' }

  // 2) Sin ningún fijo cargado — familia completamente nueva.
  if (activeFixedCount === 0) return { variant: 'E6', reason: 'sin fijos' }

  // 3) E6′ — hay fijos, pero ninguno toca este ciclo (todos `future`, ej. un
  //    anual ya pagado). Sin este paso caería en E1 con "0 de 0" / "0%" y la
  //    barra de segmentos vacía (R-1). Ningún informe de lectura lo vio.
  if (cycleActiveCount === 0) return { variant: 'E6', reason: 'E6′ — sin cuotas este ciclo' }

  // 4) El sueldo del ciclo ya llegó pero no se confirmó — condición
  //    estructural del ciclo (pay-cycle.ts), no una mezcla de pagos.
  if (isSalaryPendingConfirmation) return { variant: 'E8', reason: 'sueldo cobrado sin confirmar' }

  // 5) Riesgo financiero: el sueldo no cubre los fijos. Gatea en `hasIncome`
  //    (C6) — sin el gate, toda familia de ingreso dinámico caería acá
  //    siempre (`effectiveMonthlyIncome` es 0 por diseño).
  if (hasIncome && availableRaw < 0) return { variant: 'E5', reason: 'sueldo no cubre los fijos' }

  // 6) Todo pagado, nada pendiente ni vencido. `paidCount ≥ 1` está
  //    garantizado acá (cycleActiveCount ≥ 1 y overdue+pending === 0).
  if (overdueCount === 0 && pendingCount === 0) return { variant: 'E1', reason: 'todo pagado' }

  // 7) Día 1 del ciclo, todavía no se pagó nada y nada vencido.
  if (daysIntoMonth === 1 && paidCount === 0 && overdueCount === 0) {
    return { variant: 'E4', reason: 'día 1, sin pagos todavía' }
  }

  // 8) Hay pendientes pero nada vencido.
  if (overdueCount === 0) return { variant: 'E3', reason: 'pendientes, sin vencidos' }

  // 9) Resto: hay al menos un vencido (y, por 6/7/8 ya descartados, la
  //    mezcla no calza en ningún caso anterior). Rama final explícita, no
  //    un fallthrough implícito.
  return { variant: 'E2', reason: 'mezcla pendientes y vencidos' }
}

export interface AvisosVariantInput {
  activeFixedCount: number
  cycleActiveCount: number
  overdueCount: number
  /** `tickerItems.length` (post-cap). */
  tickerCount: number
  /** `hikeRows.length` (post-filtro de dismiss). */
  hikeCount: number
}

/**
 * §4.2. Los pasos 1-2 leen las MISMAS dos variables que
 * `selectHeroVariant` (§3.2, calculadas una sola vez en el outer) — es la
 * sincronización E6/A6 que ningún componente del kit fuerza por sí solo.
 * Pasos 3-7: total por partición de `(tickerCount===0, hikeCount===0)`.
 */
export function selectAvisosVariant(input: AvisosVariantInput): VariantSelection<FijosAvisosVariant> {
  const { activeFixedCount, cycleActiveCount, overdueCount, tickerCount, hikeCount } = input

  if (activeFixedCount === 0) return { variant: 'A6', reason: 'sin fijos' }
  if (cycleActiveCount === 0) return { variant: 'A6', reason: 'A6′ — sin cuotas este ciclo' }
  if (overdueCount > 0) return { variant: 'A5', reason: 'hay vencidos' }
  if (tickerCount === 0 && hikeCount === 0) return { variant: 'A4', reason: 'nada por venir, sin aumentos' }
  if (tickerCount === 0) return { variant: 'A3', reason: 'sin ticker, con aumentos' }
  if (hikeCount === 0) return { variant: 'A2', reason: 'con ticker, sin aumentos' }
  return { variant: 'A1', reason: 'ticker y aumentos' }
}

// ---------------------------------------------------------------------------
// 6.7 — buildTickerItems
// ---------------------------------------------------------------------------

export interface BuildTickerItemsInput {
  overdue: FijoItem[]
  dueSoon: FijoItem[]
  cap: number
}

export interface BuildTickerItemsResult {
  items: FijosTickerItem[]
  dropped: number
}

/**
 * §3.8.1. El tag de un `overdue` es SIEMPRE el literal `'VENCIDO'` — nunca
 * derivado de `daysUntilDue`, que para un item vencido envuelve el ciclo
 * (`fijos-aggregates.model.ts:223-226`, puede dar un número grande tipo 27).
 * `dueSoon` se ordena asc por `daysUntilDue` antes de tagear HOY/EN Nd.
 */
export function buildTickerItems(input: BuildTickerItemsInput): BuildTickerItemsResult {
  const { overdue, dueSoon, cap } = input

  const overdueItems: FijosTickerItem[] = overdue.map((item) => ({
    id: item.id,
    name: item.name,
    amount: formatMoney(item.amount),
    tagLabel: 'VENCIDO',
    tone: 'overdue' as FijosTickerTone,
  }))

  const dueSoonItems: FijosTickerItem[] = [...dueSoon]
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    .map((item) => {
      const d = item.daysUntilDue
      return {
        id: item.id,
        name: item.name,
        amount: formatMoney(item.amount),
        tagLabel: d === 0 ? 'HOY' : `EN ${d}D`,
        tone: (d === 0 ? 'today' : 'upcoming') as FijosTickerTone,
      }
    })

  const all = [...overdueItems, ...dueSoonItems]
  return { items: all.slice(0, cap), dropped: Math.max(0, all.length - cap) }
}

// ---------------------------------------------------------------------------
// 6.8 — buildHikeRows
// ---------------------------------------------------------------------------

export interface BuildHikeRowsInput {
  hikes: FijoHikeAlert[]
  /** Snapshot de `useDismissedHikes()`: `{ [fixedExpenseId]: priceAtDismissal }`. */
  dismissed: Record<string, number>
}

/** Misma normalización que `isHikeDismissed` (`use-hike-dismiss-store.ts:59-67`)
 *  reimplementada acá en vez de importada — mantiene el módulo sin ninguna
 *  dependencia de un store con estado, aunque `use-hike-dismiss-store.ts` es
 *  técnicamente importable en el env de test (tiene stub de
 *  `expo-secure-store`). Un cambio de precio (redondeado al peso) invalida
 *  el dismiss. */
function isPriceStillDismissed(
  fixedExpenseId: string,
  currentPrice: number,
  dismissed: Record<string, number>,
): boolean {
  const dismissedAt = dismissed[fixedExpenseId]
  if (dismissedAt == null) return false
  return dismissedAt === Math.round(currentPrice)
}

/** §3.8.2. Filtra por dismiss-store (paridad con Home) y formatea. El check
 *  de la fila del kit es un `View` plano sin `onPress` — desde acá solo se
 *  lee, no se puede descartar (ABIERTA-7 lo documenta). */
export function buildHikeRows(input: BuildHikeRowsInput): FijosHikeRow[] {
  const { hikes, dismissed } = input
  return hikes
    .filter((h) => !isPriceStillDismissed(h.fixedExpenseId, h.currentPrice, dismissed))
    .map((h) => ({
      id: h.fixedExpenseId,
      name: h.name,
      pctLabel: `+${h.deltaPct}%`,
      fromAmount: formatMoney(h.previousPrice),
      toAmount: formatMoney(h.currentPrice),
    }))
}

// ---------------------------------------------------------------------------
// 6.9 — buildReminder
// ---------------------------------------------------------------------------

export interface ReminderContent {
  label: string
  rest: string
  amount: string
  suffix: string
}

export interface BuildReminderInput {
  overdue: FijoItem[]
  dueSoon: FijoItem[]
  /**
   * Hikes CRUDOS (no `FijosHikeRow[]`, que solo trae montos ya formateados
   * como string — sin un número no se puede sumar para R-C). La spec
   * (§6 fila 9) nombra el parámetro "hikeRows" pero R-C necesita
   * `currentPrice` numérico; se resuelve pasando `FijoHikeAlert[]` (el
   * mismo insumo crudo que recibe `buildHikeRows`). Documentado en el
   * reporte de implementación como ambigüedad resuelta.
   */
  hikes: FijoHikeAlert[]
}

const REMINDER_NAME_CAP = 3

/**
 * §3.8.3. Tres shapes que SIEMPRE llenan `rest`/`amount` (el kit dibuja
 * `' · '` incondicional entre `label` y `rest` — un separador colgando si
 * cualquiera queda vacío). R-A gana sobre R-B; R-C solo es alcanzable con
 * `hikeRows.length > 0`, que es la condición de montaje de `ReminderRow` en
 * el kit — nunca se renderiza con las 3 ranuras vacías en la práctica.
 */
export function buildReminder(input: BuildReminderInput): ReminderContent {
  const { overdue, dueSoon, hikes } = input

  if (overdue.length > 0) {
    const n = Math.min(overdue.length, REMINDER_NAME_CAP)
    const named = overdue.slice(0, n)
    return {
      label: `${n} fijo${n > 1 ? 's' : ''} ya venci${n > 1 ? 'eron' : 'ó'}`,
      rest: `${joinNamesEs(named.map((i) => i.name))} suman`,
      amount: formatMoney(named.reduce((s, i) => s + Number(i.amount ?? 0), 0)),
      suffix: '— pagalos para no acumular',
    }
  }

  if (dueSoon.length > 0) {
    const sorted = [...dueSoon].sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    const n = Math.min(sorted.length, REMINDER_NAME_CAP)
    const named = sorted.slice(0, n)
    return {
      label: `${n} pago${n > 1 ? 's' : ''} fijo${n > 1 ? 's' : ''} vence${n > 1 ? 'n' : ''} en 7 días`,
      rest: `${joinNamesEs(named.map((i) => i.name))} suman`,
      amount: formatMoney(named.reduce((s, i) => s + Number(i.amount ?? 0), 0)),
      suffix: '',
    }
  }

  // R-C: sin overdue ni dueSoon, los aumentos SON el sujeto. `s.hikes` ya
  // viene top-3 (`detectHikes`, `fijos-aggregates.model.ts:491`) — sin cap
  // adicional acá.
  const n = hikes.length
  return {
    label: `${n} aumento${n === 1 ? '' : 's'} este mes`,
    rest: `${joinNamesEs(hikes.map((h) => h.name))} suman`,
    amount: formatMoney(hikes.reduce((s, h) => s + Number(h.currentPrice ?? 0), 0)),
    suffix: '',
  }
}

// ---------------------------------------------------------------------------
// 6.3 — buildHeroContent (28/28 campos, TOTAL)
// ---------------------------------------------------------------------------

export interface HeroContentInput {
  variant: FijosHeroVariant
  /** Solo relevante cuando `variant === 'E6'`: distingue "sin fijos"
   *  (`true`) de "E6′ — hay fijos pero ninguno toca este ciclo" (`false`).
   *  Se deriva en el outer como `activeFixedCount === 0` — el mismo valor
   *  que ya decidió el paso 2 vs 3 de `selectHeroVariant`. */
  isEmptyNoFijos: boolean
  /** Último día del ciclo activo (`cycleEnd - 1d`, §3.2) — fuente del
   *  nombre de mes en `eyebrow`/`outOfCycleSub`. */
  cycleLastDay: Date
  daysIntoMonth: number
  salaryPaymentDay: number
  paidCount: number
  pendingCount: number
  overdueCount: number
  cycleActiveCount: number
  paidAmount: number
  pendingAmount: number
  overdueAmount: number
  total: number
  /** `summary.paidPct`, ya redondeado. */
  paidPct: number
  hasIncome: boolean
  monthlyIncome: number
  availableRaw: number
  /** `controller.pctOfIncome`, ya redondeado. */
  pctOfIncome: number
  /** `s.pendingItems.some(i => i.daysUntilDue === 0)` — calculado por el
   *  caller sobre la lista de items (no es una de las 16 funciones puras
   *  con nombre, es un one-liner sobre datos ya derivados). */
  segmentToday: boolean
}

/**
 * Construye el objeto TOTAL de `FijosHeroContent` — las 28 filas SIEMPRE
 * presentes, con `''`/`0`/`false` explícito donde la variante activa no las
 * lee (§3.0/§3.4). Nunca devuelve `Partial<>`: es la barrera de compilación
 * contra el peor modo de falla (D9) — un campo olvidado es un error de tipos,
 * no un número de mockup sobreviviendo en silencio.
 */
export function buildHeroContent(input: HeroContentInput): FijosHeroContent {
  const {
    variant,
    isEmptyNoFijos,
    cycleLastDay,
    daysIntoMonth,
    salaryPaymentDay,
    paidCount,
    pendingCount,
    overdueCount,
    cycleActiveCount,
    paidAmount,
    pendingAmount,
    overdueAmount,
    total,
    paidPct,
    hasIncome,
    monthlyIncome,
    availableRaw,
    pctOfIncome,
    segmentToday,
  } = input

  const statusChip = buildStatusChip({
    overdueCount,
    pendingCount,
    paidCount,
    cycleActiveCount,
    daysIntoMonth,
  })

  const eyebrow =
    variant === 'E8' ? 'FIJOS · CICLO TERMINADO' : `FIJOS DE ${monthUpperEs(cycleLastDay)}`

  let topChipLabel: string
  switch (variant) {
    case 'E1':
      topChipLabel = '✓ AL DÍA'
      break
    case 'E2':
    case 'E3':
    case 'E5':
      topChipLabel = `HOY · DÍA ${daysIntoMonth}`
      break
    case 'E4':
      topChipLabel = `DÍA ${daysIntoMonth}`
      break
    case 'E6':
      topChipLabel = isEmptyNoFijos ? 'NUEVO' : 'SIN CUOTAS'
      break
    case 'E7':
      topChipLabel = '📁 SOLO LECTURA'
      break
    case 'E8':
      topChipLabel = `DÍA ${salaryPaymentDay}+`
      break
  }

  const availableAmount = hasIncome ? formatSignedMoneyFijos(availableRaw) : '—'
  const availableOfLabel = hasIncome ? `de ${formatMoney(monthlyIncome)}` : ''
  const availableNote = !hasIncome
    ? 'sin sueldo fijo'
    : availableRaw < 0
      ? '⚠ te pasás este mes'
      : `${pctOfIncome}% va a fijos`
  const availableWarning = hasIncome && availableRaw < 0

  return {
    eyebrow,
    topChipLabel,
    wellLabel: 'Te falta pagar',
    amount: formatMoney(pendingAmount + overdueAmount),
    statusChipLabel: statusChip.label,
    statusChipTone: statusChip.tone,
    paidOfLabel: `${paidCount} de ${cycleActiveCount}`,
    pctLabel: `${paidPct}%`,
    paidAmountLabel: `${formatMoney(paidAmount)} pagado`,
    totalAmountLabel: `de ${formatMoney(total)} total`,
    segmentsPaid: paidCount,
    segmentToday,
    // El `max(1, …)` es obligatorio (R-1): con `cycleActiveCount === 0` el
    // paso 3 de `selectHeroVariant` ya desvió a E6, pero este cinturón de
    // seguridad evita una barra de 0 segmentos si otra ruta llegara con 0.
    segmentsTotal: Math.max(1, cycleActiveCount),
    availableAmount,
    availableOfLabel,
    availableNote,
    availableWarning,
    zeroBadgeLabel: `✓ ${paidCount} DE ${cycleActiveCount} · SIN VENCIDOS`,
    zeroTitle: 'Cero pendientes',
    zeroSub: 'A disfrutar lo que queda del mes',
    emptyTitle: isEmptyNoFijos ? 'Todavía no cargaste fijos' : 'Nada que pagar este ciclo',
    emptySub: isEmptyNoFijos
      ? 'Sumá alquiler, servicios y suscripciones — te avisamos antes de cada vencimiento para que no se te pase ninguno.'
      : 'Tus fijos vencen en ciclos posteriores — cuando llegue el suyo aparecen acá.',
    emptyCtaLabel: isEmptyNoFijos ? '+ Agregar tu primer fijo' : '+ Agregar otro fijo',
    outOfCycleTitle: `Tu ciclo terminó el ${salaryPaymentDay}`,
    outOfCycleSub: `Confirmá tu cobro para cerrar ${monthLowerEs(cycleLastDay)} y abrir el próximo ciclo.`,
    outOfCycleSummaryLabel:
      overdueCount === 0 ? 'No quedó nada sin pagar' : `Quedaron ${overdueCount} sin pagar`,
    outOfCycleSummaryAmount: formatMoney(overdueAmount),
    outOfCycleCtaLabel: '✓ Confirmar cobro',
  }
}

// ---------------------------------------------------------------------------
// 6.4 — buildAvisosContent (17/17 campos, TOTAL)
// ---------------------------------------------------------------------------

export interface AvisosContentInput {
  variant: FijosAvisosVariant
  /** Igual criterio que `HeroContentInput.isEmptyNoFijos`: solo relevante
   *  cuando `variant === 'A6'`. */
  isEmptyNoFijos: boolean
  overdueCount: number
  tickerItems: FijosTickerItem[]
  hikeRows: FijosHikeRow[]
  reminder: ReminderContent
}

const BROT_POSE_BY_AVISOS_VARIANT: Record<FijosAvisosVariant, BrotPose> = {
  A1: 'worried',
  A2: 'think',
  A3: 'think',
  A4: 'cheer',
  A5: 'sad',
  A6: 'wave',
}

/** Construye el objeto TOTAL de `FijosAvisosContent` — mismo criterio que
 *  `buildHeroContent`: 17 filas siempre presentes. */
export function buildAvisosContent(input: AvisosContentInput): FijosAvisosContent {
  const { variant, isEmptyNoFijos, overdueCount, tickerItems, hikeRows, reminder } = input

  return {
    badgeCount: tickerItems.length + hikeRows.length,
    badgeTone: overdueCount > 0 ? 'urgent' : 'default',
    brotPose: BROT_POSE_BY_AVISOS_VARIANT[variant],
    cardUrgent: variant === 'A5',
    tickerItems,
    staticMessage: '✓ Nada vence en los próximos días',
    hikeRows,
    reminderLabel: reminder.label,
    reminderRest: reminder.rest,
    reminderAmount: reminder.amount,
    reminderSuffix: reminder.suffix,
    calmMessage: 'Sin cambios de precio este mes',
    calmTitle: variant === 'A4' ? 'Todo tranquilo por acá' : '',
    calmSub:
      variant === 'A4'
        ? 'No hay vencimientos próximos ni cambios de precio esta semana. Te avisamos si algo cambia.'
        : '',
    emptyTitle:
      variant === 'A6' ? (isEmptyNoFijos ? 'Todavía no cargaste fijos' : 'Nada que pagar este ciclo') : '',
    emptySub:
      variant === 'A6'
        ? isEmptyNoFijos
          ? 'Cuando agregues alquiler, servicios o suscripciones, acá te vamos a avisar de vencimientos y aumentos.'
          : 'Cuando llegue el ciclo de tus fijos, te avisamos de vencimientos y aumentos.'
        : '',
    emptyCtaLabel:
      variant === 'A6' ? (isEmptyNoFijos ? '+ Agregar tu primer fijo' : '+ Agregar otro fijo') : '',
  }
}

// ---------------------------------------------------------------------------
// 6.12 — buildCategoryBuckets
// ---------------------------------------------------------------------------

export interface CategoryBucketsResult {
  buckets: FijosCategoryGroup[]
  collapsed: Array<{ bucket: FijosCategoryKey; realLabels: string[] }>
}

const CATEGORY_BUCKET_META: Record<FijosCategoryKey, { icon: string; name: string }> = {
  housing: { icon: '🏠', name: 'Vivienda' },
  subscriptions: { icon: '📺', name: 'Suscripciones' },
  services: { icon: '💡', name: 'Servicios' },
}

/**
 * §3.5.2. Colapsa los grupos reales (`groupFijosByCategory`, hasta ~11
 * categorías) a ≤3 buckets — obligatorio porque `FijosCategories` mapea con
 * `key={group.category}` (C7): N grupos con la misma llave son keys
 * duplicadas de React. Orden = primera aparición en `groups` (que ya viene
 * ordenado por vencimiento más próximo). `collapsed` reporta, por bucket,
 * los labels reales que cayeron ahí (D4 — la pérdida de granularidad es el
 * hallazgo, no un bug a esconder).
 */
export function buildCategoryBuckets(input: { groups: FijoCategoryGroup[] }): CategoryBucketsResult {
  const { groups } = input

  const order: FijosCategoryKey[] = []
  const totalByBucket = new Map<FijosCategoryKey, number>()
  const itemsByBucket = new Map<FijosCategoryKey, FijoItem[]>()
  const labelsByBucket = new Map<FijosCategoryKey, string[]>()

  for (const group of groups) {
    const bucket = mapCategoryToBucket(group.rawLabel)
    if (!order.includes(bucket)) order.push(bucket)
    totalByBucket.set(bucket, (totalByBucket.get(bucket) ?? 0) + group.total)
    const items = itemsByBucket.get(bucket) ?? []
    items.push(...group.items)
    itemsByBucket.set(bucket, items)
    const labels = labelsByBucket.get(bucket) ?? []
    labels.push(group.label)
    labelsByBucket.set(bucket, labels)
  }

  const buckets: FijosCategoryGroup[] = order.map((bucket) => {
    const items = itemsByBucket.get(bucket) ?? []
    const n = items.length
    const overdue = items.filter((i) => i.computedStatus === 'overdue').length
    const pending = items.filter((i) => i.computedStatus === 'pending').length
    const paid = items.filter((i) => i.computedStatus === 'paid').length

    let meta: string
    let metaTone: FijosRowTone
    if (overdue > 0) {
      meta = `${n} ítems · ${plural(overdue, 'vencido', 'vencidos')}`
      metaTone = 'overdue'
    } else if (pending === 0) {
      meta = `${n} ítems · al día ✓`
      metaTone = 'ok'
    } else {
      meta = `${n} ítems · ${paid} pagados`
      metaTone = 'neutral'
    }

    return {
      category: bucket,
      icon: CATEGORY_BUCKET_META[bucket].icon,
      name: CATEGORY_BUCKET_META[bucket].name,
      meta,
      metaTone,
      amount: formatMoney(totalByBucket.get(bucket) ?? 0),
    }
  })

  const collapsed = order.map((bucket) => ({
    bucket,
    realLabels: labelsByBucket.get(bucket) ?? [],
  }))

  return { buckets, collapsed }
}

// ---------------------------------------------------------------------------
// 6.5 — buildCategoriesContent (5/5 campos, TOTAL)
// ---------------------------------------------------------------------------

export interface CategoriesContentInput {
  activeTab: FijosTabKey
  vencidosCount: number
  pendientesCount: number
  pagadosCount: number
  groups: FijosCategoryGroup[]
}

export function buildCategoriesContent(input: CategoriesContentInput): FijosCategoriesContent {
  return {
    activeTab: input.activeTab,
    vencidosCount: String(input.vencidosCount),
    pendientesCount: String(input.pendientesCount),
    pagadosCount: String(input.pagadosCount),
    groups: input.groups,
  }
}
