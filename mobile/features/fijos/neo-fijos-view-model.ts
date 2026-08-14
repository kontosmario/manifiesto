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
import i18n from '@/lib/i18n'
import { getDateTimeFormat } from '@/lib/i18n/active-locale'
import { DAY_MS } from '@/utils/time'
import type {
  FijoItem,
  FijoHikeAlert,
} from '@/features/fijos/fijos-aggregates.model'
import type {
  FijosHeroVariant,
  FijosAvisosVariant,
  FijosTabKey,
  FijosCategoryGroup,
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
  // La conjunción sale de i18n: " y " en ES, " and " en EN.
  const and = i18n.t('fijos:neo.namesJoin')
  if (names.length === 2) return `${names[0]}${and}${names[1]}`
  return `${names.slice(0, -1).join(', ')}${and}${names[names.length - 1]}`
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

/**
 * `new Date(2026,6,19) → 'JULIO'`. Mismo patrón que `monthLongCapitalized`
 * de `control-v2-adapter.ts:133-137` pero en mayúsculas (eyebrow del hero).
 *
 * PRECONDICIÓN del caller: `d` tiene que ser una fecha anclada a MEDIANOCHE
 * LOCAL (lo que devuelven `normalizeToStartOfDay`/`buildPayDate`/
 * `parseLocalDateKey`, `utils/pay-cycle.ts`). Un `new Date('2026-08-01')`
 * crudo del data layer (`next_due_on`, `cuotaMonth`) es medianoche **UTC** y
 * en AR (UTC−3) formatea el mes ANTERIOR ("JULIO") — el off-by-one de
 * `feedback_timestamptz_off_by_one`. Usar `parseLocalDateKey` para esos.
 */
export function monthUpperEs(d: Date): string {
  return getDateTimeFormat({ month: 'long' }).format(d).toUpperCase()
}

/** Variante en minúsculas — la usa `outOfCycleSub` de E8 ("cerrar julio y
 *  abrir el próximo ciclo"). No está en la lista de 16 funciones de la spec
 *  (§6) pero `outOfCycleSub` (§3.4 #25) la nombra explícitamente; se agrega
 *  acá por ser el mismo helper con un solo `.toLowerCase()` de diferencia.
 *  Misma precondición de medianoche local que `monthUpperEs`. */
export function monthLowerEs(d: Date): string {
  return getDateTimeFormat({ month: 'long' }).format(d).toLowerCase()
}

/** Día calendario anterior a `d`, construido por componentes (no restando
 *  `DAY_MS`) para ser inmune a saltos de DST. `19 jul → 18 jul`,
 *  `1 ago → 31 jul`. */
function previousCalendarDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
}

// ---------------------------------------------------------------------------
// computeDaysIntoCycle — día DEL CICLO, no del mes calendario
// ---------------------------------------------------------------------------

/**
 * Día 1-indexado dentro del ciclo de pago activo: `1` el día que arranca el
 * ciclo. MISMA fórmula que `computeMonthlyAccountingWindow`
 * (`utils/monthly-accounting.ts:53-54`) — para `cycle_type === 'monthly'` el
 * resultado es idéntico a `monthlyAccounting.daysIntoMonth`.
 *
 * Existe porque para `cycle_type ∈ {weekly, biweekly, custom}` con ingreso
 * `fixed` NO son lo mismo: esa rama de `computeMonthlyAccountingWindow`
 * (`:71`) devuelve `todayNorm.getDate()`, o sea el día del MES CALENDARIO.
 * Pasarle eso al selector hacía que el 1° de cada mes una familia semanal
 * cayera en E4 con el chip "recién cobraste" sin haber cobrado, y que el
 * header dijera "Semana del 6 jul → 12 jul · día 22". El outer DEBE llamar
 * a esta función con `controller.today` + `controller.cycleStart` y NO pasar
 * `monthlyAccounting.daysIntoMonth`.
 *
 * Precondición: las dos fechas ancladas a medianoche local (`today` sale de
 * `usePayCycle` → `normalizeToStartOfDay`; `cycleStart` de `cycle.start`,
 * también normalizado). Clampeado a `≥ 1` para que la copy nunca diga
 * "día 0" si un caller llegara con `today < cycleStart`.
 */
export function computeDaysIntoCycle(input: { today: Date; cycleStart: Date }): number {
  const { today, cycleStart } = input
  return Math.max(1, Math.floor((today.getTime() - cycleStart.getTime()) / DAY_MS) + 1)
}

// ---------------------------------------------------------------------------
// 6.15 — buildCycleHeaderLabel
// ---------------------------------------------------------------------------

/** `('20 jun → 19 jul', 18) → '20 jun → 19 jul · día 18'`. `formatCycleLabel`
 *  no agrega el sufijo de día (`format-cycle-label.ts:18`) — este helper lo
 *  suma para el header de `FijosHeader` (§3.3). El día tiene que ser el DEL
 *  CICLO (`computeDaysIntoCycle`): `cycleLabel` describe el pay-cycle
 *  rolling, así que un día-del-mes-calendario acá produce "Semana del 6 jul
 *  → 12 jul · día 22". */
export function buildCycleHeaderLabel(cycleLabel: string, daysIntoCycle: number): string {
  return i18n.t('fijos:neo.cycleHeader', { cycle: cycleLabel, day: daysIntoCycle })
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
  /** Día DEL CICLO (`computeDaysIntoCycle`), NO `monthlyAccounting.
   *  daysIntoMonth`: la rama "recién cobraste" afirma que hoy arrancó el
   *  ciclo, y para weekly/biweekly/custom con ingreso fijo el día del mes
   *  calendario no tiene ninguna relación con el cobro. */
  daysIntoCycle: number
}

/** §3.4.1 — reproduce E2/E3/E4/E7 exactos. E5 usa el MISMO builder que E2
 *  (drift documentado del handoff, no un chip distinto — spec §3.4.1). */
export function buildStatusChip(input: StatusChipInput): StatusChip {
  const { overdueCount, pendingCount, paidCount, cycleActiveCount, daysIntoCycle } = input
  if (overdueCount > 0 && pendingCount > 0) {
    return {
      label: i18n.t('fijos:neo.status.pendingWithOverdue', {
        total: pendingCount + overdueCount,
        overdue: i18n.t('fijos:neo.overdueF', { count: overdueCount }),
      }),
      tone: 'alert',
    }
  }
  if (overdueCount > 0 && pendingCount === 0) {
    return {
      label: i18n.t('fijos:neo.status.overdueOnly', {
        overdue: i18n.t('fijos:neo.overdueF', { count: overdueCount }),
      }),
      tone: 'alert',
    }
  }
  if (overdueCount === 0 && pendingCount > 0 && daysIntoCycle === 1) {
    return {
      label: i18n.t('fijos:neo.status.justPaid', { count: cycleActiveCount }),
      tone: 'neutral',
    }
  }
  if (overdueCount === 0 && pendingCount > 0) {
    return { label: i18n.t('fijos:neo.status.upcoming', { count: pendingCount }), tone: 'neutral' }
  }
  return {
    label: i18n.t('fijos:neo.status.closed', { paid: paidCount, total: cycleActiveCount }),
    tone: 'success',
  }
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
  /** Día DEL CICLO (`computeDaysIntoCycle`) — ver el docblock de esa función
   *  por qué NO puede ser `monthlyAccounting.daysIntoMonth`. */
  daysIntoCycle: number
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
 *
 * El ORDEN de los pasos 2-5 lo fijó el review de orden total (findings I1/I3
 * de `review-vm-total-order.md`) y cada uno tiene su test de precedencia:
 *   · E6 "sin fijos" (paso 2) le gana a todo lo demás — sin fijos cargados la
 *     pantalla no tiene otra cosa que decir.
 *   · E8 (paso 3) le gana a E6′ (paso 4) y a E5 (paso 5): con el cobro sin
 *     confirmar el ciclo está CONGELADO, y `HeroOutOfCycleBody` es el único
 *     cuerpo del hero que expone el CTA "✓ Confirmar cobro" — la única
 *     escritura habilitada del hero. Un empty-state ahí esconde la acción que
 *     destraba el ciclo.
 *   · E5 (paso 5) exige que quede ALGO por pagar: con todo pagado y el sueldo
 *     corto, E1 ya comunica el riesgo (`HeroZeroBody` monta
 *     `HeroAvailableCard` con `availableWarning`, `fijos-screen.tsx:876-882`,
 *     y ese campo no depende de la variante), mientras E5 mostraría el pozo
 *     "Te falta pagar $0" junto a un chip verde de celebración.
 */
export function selectHeroVariant(input: HeroVariantInput): VariantSelection<FijosHeroVariant> {
  const {
    activeFixedCount,
    cycleActiveCount,
    paidCount,
    pendingCount,
    overdueCount,
    daysIntoCycle,
    hasIncome,
    availableRaw,
    isSalaryPendingConfirmation,
    viewingClosedEdition,
  } = input

  // 1) E7 — INALCANZABLE en esta fase (no hay selector de ediciones
  //    pasadas), pero se testea explícito con `viewingClosedEdition: true`
  //    (§4.3): el día que exista el selector, solo cambia el flag.
  if (viewingClosedEdition) return { variant: 'E7', reason: 'edición cerrada (viewingClosedEdition)' }

  // 2) Sin ningún fijo cargado — familia completamente nueva. Conjuga los DOS
  //    conteos: para inputs consistentes `cycleActiveCount ≤ activeFixedCount`
  //    (los dos salen de la población `active|paused` de `summarizeFijos`),
  //    así que exigir el segundo no cambia ninguna salida real — pero los dos
  //    números llegan de queries DISTINTAS del outer, y si se desincronizan
  //    (una resuelve antes que la otra) el hero mostraría "Todavía no cargaste
  //    fijos" encima de una lista poblada.
  if (activeFixedCount === 0 && cycleActiveCount === 0) return { variant: 'E6', reason: 'sin fijos' }

  // 3) El sueldo del ciclo ya llegó pero no se confirmó — condición
  //    estructural del ciclo (pay-cycle.ts), no una mezcla de pagos. Va
  //    ANTES de E6′ y de E5: ver el docblock.
  if (isSalaryPendingConfirmation) return { variant: 'E8', reason: 'sueldo cobrado sin confirmar' }

  // 4) E6′ — hay fijos, pero ninguno toca este ciclo (todos `future`, ej. un
  //    anual ya pagado). Sin este paso caería en E1 con "0 de 0" / "0%" y la
  //    barra de segmentos vacía (R-1). Ningún informe de lectura lo vio.
  if (cycleActiveCount === 0) return { variant: 'E6', reason: 'E6′ — sin cuotas este ciclo' }

  // 5) Riesgo financiero: el sueldo no cubre los fijos. Dos gates:
  //    · `hasIncome` (C6) — sin él, toda familia de ingreso dinámico caería
  //      acá siempre (`effectiveMonthlyIncome` es 0 por diseño).
  //    · `overdue+pending > 0` — E5 es la shape "todavía te falta pagar y no
  //      te alcanza"; con todo pagado la advertencia la lleva E1 adentro.
  if (hasIncome && availableRaw < 0 && overdueCount + pendingCount > 0) {
    return { variant: 'E5', reason: 'sueldo no cubre los fijos' }
  }

  // 6) Todo pagado, nada pendiente ni vencido. `paidCount ≥ 1` está
  //    garantizado acá (cycleActiveCount ≥ 1 y overdue+pending === 0).
  if (overdueCount === 0 && pendingCount === 0) return { variant: 'E1', reason: 'todo pagado' }

  // 7) Día 1 DEL CICLO, todavía no se pagó nada y nada vencido.
  if (daysIntoCycle === 1 && paidCount === 0 && overdueCount === 0) {
    return { variant: 'E4', reason: 'día 1 del ciclo, sin pagos todavía' }
  }

  // 8) Hay pendientes pero nada vencido.
  if (overdueCount === 0) return { variant: 'E3', reason: 'pendientes, sin vencidos' }

  // 9) Resto: hay al menos un vencido (y, por 6/7/8 ya descartados, la
  //    mezcla no calza en ningún caso anterior). Rama final explícita, no
  //    un fallthrough implícito. El `reason` distingue "solo vencidos" de la
  //    mezcla real — es la prosa que lee el owner en el banner de dev, y
  //    "mezcla pendientes y vencidos" con `pendingCount === 0` lo mandaba a
  //    buscar un pendiente que no existe.
  return {
    variant: 'E2',
    reason: pendingCount === 0 ? 'solo vencidos' : 'mezcla pendientes y vencidos',
  }
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
 * `selectHeroVariant` (§3.2, calculadas una sola vez en el outer), con la
 * MISMA conjunción en el paso 1 — es la sincronización E6/A6 que ningún
 * componente del kit fuerza por sí solo.
 * Pasos 3-7: total por partición de `(tickerCount===0, hikeCount===0)`.
 *
 * La bicondicional `E6 ⟺ A6` vale mientras el hero no esté en un estado
 * ESTRUCTURAL de ciclo, que Avisos no modela: con `viewingClosedEdition`
 * (E7) o `isSalaryPendingConfirmation` (E8) el hero se va a su propia shape
 * y Avisos se queda en A6′ ("Nada que pagar este ciclo"), que sigue siendo
 * cierto — el kit no tiene variante de Avisos para "fuera de ciclo" y no se
 * toca (D3). Fuera de esos dos flags la bicondicional es exacta y está
 * testeada.
 */
export function selectAvisosVariant(input: AvisosVariantInput): VariantSelection<FijosAvisosVariant> {
  const { activeFixedCount, cycleActiveCount, overdueCount, tickerCount, hikeCount } = input

  if (activeFixedCount === 0 && cycleActiveCount === 0) return { variant: 'A6', reason: 'sin fijos' }
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

/**
 * Ventana de "próximo a vencer", en días. Es la MISMA constante que decide
 * qué entra al ticker (`filterDueSoon`) y la que se interpola en la copy de
 * R-B ("vencen en 7 días"): antes la ventana vivía en un `filter` del outer
 * y el `7` estaba hardcodeado en el string, así que cambiar una dejaba a la
 * otra mintiendo sin que fallara ningún test.
 */
export const DUE_SOON_DAYS = 7

/** Los pendientes que vencen dentro de la ventana. Vive acá (y no como un
 *  one-liner del outer) para que el borde `<= DUE_SOON_DAYS` sea testeable:
 *  un `<` en vez de `<=` cambia qué entra al ticker Y puede voltear A2→A4
 *  ("Todo tranquilo por acá" con vencimientos a 7 días). */
export function filterDueSoon(items: FijoItem[], windowDays: number = DUE_SOON_DAYS): FijoItem[] {
  return items.filter((i) => i.daysUntilDue <= windowDays)
}

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
 * §3.8.1. El tag de un `overdue` es el literal `'VENCIDO'` — nunca derivado
 * de `daysUntilDue`, que para un item vencido queda clampeado a 0
 * (`fijos-aggregates.model.ts` — diferencia real de fechas, ya no wrap del
 * ciclo). Cuando `missedCuotas > 1` (más de una cuota acumulada sin pagar)
 * el tag suma el contador (`'VENCIDO · 3'`); con 0 o 1 cuota se mantiene el
 * literal solo. `dueSoon` se ordena asc por `daysUntilDue` antes de tagear
 * HOY/EN Nd.
 */
export function buildTickerItems(input: BuildTickerItemsInput): BuildTickerItemsResult {
  const { overdue, dueSoon, cap } = input

  const overdueItems: FijosTickerItem[] = overdue.map((item) => ({
    id: item.id,
    name: item.name,
    amount: formatMoney(item.amount),
    // Con más de una cuota adeudada el tag suma el contador (`VENCIDO · 3`);
    // con una sola se mantiene el literal de siempre.
    tagLabel:
      item.missedCuotas > 1
        ? i18n.t('fijos:neo.overdueTagMulti', { count: item.missedCuotas })
        : i18n.t('fijos:neo.overdueTag'),
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

/**
 * Los aumentos que el usuario NO descartó. Es el único filtro de dismiss del
 * módulo: lo aplican `buildHikeRows` (la lista) y `buildReminder` (la fila de
 * recordatorio) por separado, así que ninguno de los dos puede quedarse con
 * la lista cruda por descuido del caller. Sin esto, con 3 aumentos y 2
 * descartados en Home la pantalla mostraba 1 fila y el recordatorio de al
 * lado decía "3 aumentos este mes · Netflix, Spotify y Claude AI suman",
 * resucitando textualmente los dos avisos descartados.
 */
export function filterActiveHikes(
  hikes: FijoHikeAlert[],
  dismissed: Record<string, number>,
): FijoHikeAlert[] {
  return hikes.filter((h) => !isPriceStillDismissed(h.fixedExpenseId, h.currentPrice, dismissed))
}

/** §3.8.2. Filtra por dismiss-store (paridad con Home) y formatea. El check
 *  de la fila del kit es un `View` plano sin `onPress` — desde acá solo se
 *  lee, no se puede descartar (ABIERTA-7 lo documenta). */
export function buildHikeRows(input: BuildHikeRowsInput): FijosHikeRow[] {
  const { hikes, dismissed } = input
  return filterActiveHikes(hikes, dismissed)
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
   * mismo insumo crudo que recibe `buildHikeRows`) MÁS el mapa de dismiss,
   * para que R-C cuente/nombre/sume exactamente los mismos aumentos que
   * `buildHikeRows` pone en pantalla.
   */
  hikes: FijoHikeAlert[]
  /** Mismo snapshot de `useDismissedHikes()` que recibe `buildHikeRows`.
   *  Requerido (no opcional) a propósito: olvidarlo tiene que ser un error
   *  de tipos, no una fila de recordatorio que cuenta de más. */
  dismissed: Record<string, number>
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
  const { overdue, dueSoon, hikes, dismissed } = input

  if (overdue.length > 0) {
    const n = Math.min(overdue.length, REMINDER_NAME_CAP)
    const named = overdue.slice(0, n)
    return {
      label: i18n.t('fijos:neo.reminder.overdue', { count: n }),
      rest: i18n.t('fijos:neo.namesSum', { names: joinNamesEs(named.map((i) => i.name)) }),
      amount: formatMoney(named.reduce((s, i) => s + Number(i.amount ?? 0), 0)),
      suffix: i18n.t('fijos:neo.reminder.overdueSuffix'),
    }
  }

  if (dueSoon.length > 0) {
    const sorted = [...dueSoon].sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    const n = Math.min(sorted.length, REMINDER_NAME_CAP)
    const named = sorted.slice(0, n)
    return {
      label: i18n.t('fijos:neo.reminder.dueSoon', { count: n, days: DUE_SOON_DAYS }),
      rest: i18n.t('fijos:neo.namesSum', { names: joinNamesEs(named.map((i) => i.name)) }),
      amount: formatMoney(named.reduce((s, i) => s + Number(i.amount ?? 0), 0)),
      suffix: '',
    }
  }

  // R-C: sin overdue ni dueSoon, los aumentos SON el sujeto. `s.hikes` ya
  // viene top-3 (`detectHikes`, `fijos-aggregates.model.ts:491`) — sin cap
  // adicional acá. Filtrado por dismiss con el MISMO helper que la lista de
  // filas, así el conteo/los nombres/el monto describen lo que se ve.
  const activeHikes = filterActiveHikes(hikes, dismissed)
  const n = activeHikes.length
  return {
    label: i18n.t('fijos:neo.reminder.hikes', { count: n }),
    rest: i18n.t('fijos:neo.namesSum', { names: joinNamesEs(activeHikes.map((h) => h.name)) }),
    amount: formatMoney(activeHikes.reduce((s, h) => s + Number(h.currentPrice ?? 0), 0)),
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
   *  nombre de mes del `eyebrow`. */
  cycleLastDay: Date
  /**
   * Primer día del ciclo activo (`controller.cycleStart`). Fuente del mes del
   * `outOfCycleSub` de E8, que NO es el mes de `cycleLastDay`: E8 dispara con
   * `isSalaryPendingConfirmation`, y el controller pide el ciclo con
   * `freeze: false` (`use-fijos-controller.ts:101`), así que en ese estado el
   * ciclo YA avanzó al período nuevo. Con payday 19 y hoy 20-jul el ciclo
   * vivo es `[19 jul, 19 ago)`: `cycleLastDay` es 18-ago → "agosto", pero el
   * ciclo que TERMINÓ es julio. El mes correcto es el del día anterior a
   * `cycleStart` (18-jul → julio), que reproduce la convención del eyebrow
   * para el ciclo cerrado. Fallaba para todo payday > 1.
   */
  cycleStart: Date
  /** Día DEL CICLO (`computeDaysIntoCycle`) — alimenta `topChipLabel`
   *  ("HOY · DÍA N") y el chip de estado. */
  daysIntoCycle: number
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
    cycleStart,
    daysIntoCycle,
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
    daysIntoCycle,
  })

  const eyebrow =
    variant === 'E8'
      ? i18n.t('fijos:neo.hero.eyebrowClosed')
      : i18n.t('fijos:neo.hero.eyebrowMonth', { month: monthUpperEs(cycleLastDay) })

  let topChipLabel: string
  switch (variant) {
    case 'E1':
      topChipLabel = i18n.t('fijos:neo.hero.chipUpToDate')
      break
    case 'E2':
    case 'E3':
    case 'E5':
      topChipLabel = i18n.t('fijos:neo.hero.chipToday', { day: daysIntoCycle })
      break
    case 'E4':
      topChipLabel = i18n.t('fijos:neo.hero.chipDay', { day: daysIntoCycle })
      break
    case 'E6':
      topChipLabel = i18n.t(
        isEmptyNoFijos ? 'fijos:neo.hero.chipNew' : 'fijos:neo.hero.chipNoInstallments',
      )
      break
    case 'E7':
      topChipLabel = i18n.t('fijos:neo.hero.chipReadOnly')
      break
    case 'E8':
      topChipLabel = i18n.t('fijos:neo.hero.chipDayPlus', { day: salaryPaymentDay })
      break
  }

  const availableAmount = hasIncome ? formatSignedMoneyFijos(availableRaw) : '—'
  const availableOfLabel = hasIncome
    ? i18n.t('fijos:neo.hero.availableOf', { amount: formatMoney(monthlyIncome) })
    : ''
  const availableNote = !hasIncome
    ? i18n.t('fijos:neo.hero.noteNoIncome')
    : availableRaw < 0
      ? i18n.t('fijos:neo.hero.noteOver')
      : i18n.t('fijos:neo.hero.notePct', { pct: pctOfIncome })
  const availableWarning = hasIncome && availableRaw < 0

  return {
    eyebrow,
    topChipLabel,
    wellLabel: i18n.t('fijos:neo.hero.wellLabel'),
    amount: formatMoney(pendingAmount + overdueAmount),
    statusChipLabel: statusChip.label,
    statusChipTone: statusChip.tone,
    paidOfLabel: i18n.t('fijos:neo.hero.paidOf', { paid: paidCount, total: cycleActiveCount }),
    pctLabel: `${paidPct}%`,
    paidAmountLabel: i18n.t('fijos:neo.hero.paidAmount', { amount: formatMoney(paidAmount) }),
    totalAmountLabel: i18n.t('fijos:neo.hero.totalAmount', { amount: formatMoney(total) }),
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
    zeroBadgeLabel: i18n.t('fijos:neo.hero.zeroBadge', {
      paid: paidCount,
      total: cycleActiveCount,
    }),
    zeroTitle: i18n.t('fijos:neo.hero.zeroTitle'),
    zeroSub: i18n.t('fijos:neo.hero.zeroSub'),
    emptyTitle: i18n.t(
      isEmptyNoFijos ? 'fijos:neo.hero.emptyTitleNoFijos' : 'fijos:neo.hero.emptyTitleNothing',
    ),
    emptySub: i18n.t(
      isEmptyNoFijos ? 'fijos:neo.hero.emptySubNoFijos' : 'fijos:neo.hero.emptySubNothing',
    ),
    emptyCtaLabel: i18n.t(
      isEmptyNoFijos ? 'fijos:neo.hero.emptyCtaFirst' : 'fijos:neo.hero.emptyCtaAnother',
    ),
    outOfCycleTitle: i18n.t('fijos:neo.hero.outOfCycleTitle', { day: salaryPaymentDay }),
    // Mes del ciclo CERRADO (día anterior a `cycleStart`), no del ciclo vivo
    // — ver el docblock de `cycleStart` en `HeroContentInput`.
    outOfCycleSub: i18n.t('fijos:neo.hero.outOfCycleSub', {
      month: monthLowerEs(previousCalendarDay(cycleStart)),
    }),
    outOfCycleSummaryLabel:
      overdueCount === 0
        ? i18n.t('fijos:neo.hero.outOfCycleNoneLeft')
        : i18n.t('fijos:neo.hero.outOfCycleLeft', { count: overdueCount }),
    outOfCycleSummaryAmount: formatMoney(overdueAmount),
    outOfCycleCtaLabel: i18n.t('fijos:neo.hero.outOfCycleCta'),
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
    staticMessage: i18n.t('fijos:neo.avisos.staticMessage'),
    hikeRows,
    reminderLabel: reminder.label,
    reminderRest: reminder.rest,
    reminderAmount: reminder.amount,
    reminderSuffix: reminder.suffix,
    calmMessage: i18n.t('fijos:neo.avisos.calmMessage'),
    calmTitle: variant === 'A4' ? i18n.t('fijos:neo.avisos.calmTitle') : '',
    calmSub: variant === 'A4' ? i18n.t('fijos:neo.avisos.calmSub') : '',
    emptyTitle:
      variant === 'A6'
        ? i18n.t(
            isEmptyNoFijos ? 'fijos:neo.hero.emptyTitleNoFijos' : 'fijos:neo.hero.emptyTitleNothing',
          )
        : '',
    emptySub:
      variant === 'A6'
        ? i18n.t(
            isEmptyNoFijos
              ? 'fijos:neo.avisos.emptySubNoFijos'
              : 'fijos:neo.avisos.emptySubNothing',
          )
        : '',
    emptyCtaLabel:
      variant === 'A6'
        ? i18n.t(isEmptyNoFijos ? 'fijos:neo.hero.emptyCtaFirst' : 'fijos:neo.hero.emptyCtaAnother')
        : '',
  }
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
