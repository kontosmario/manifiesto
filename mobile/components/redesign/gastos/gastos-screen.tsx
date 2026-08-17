// @i18n-ignore-file — kit de rediseño bajo gate; copy literal, i18n en el pase posterior.
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState, type Ref } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import {
  HAZARD_BAND,
  HAZARD_H,
  HAZARD_STEP,
  HAZARD_W,
  buildHazardPath,
} from '@/components/redesign/gastos/hazard-geometry'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import { BrotParticles } from '@/components/brot/brot-particles'
import { CategoryIcon } from '@/components/category/category-icon'
import { HomeNavBar, HomeStatusBar } from '@/components/redesign/home/home-screen'
import {
  GASTOS_RADII,
  GASTOS_SPEC,
  type GastosMode,
  type GastosSpec,
} from '@/components/redesign/gastos/gastos-spec'
import { BackToCalendarButton } from '@/components/redesign/gastos/parts/back-to-calendar'
import {
  GhostChip,
  GhostMovRow,
  GhostOutline,
  GhostWeekBars,
  StatusPill,
} from '@/components/redesign/gastos/parts/ghost'
import { neoParticlePresets } from '@/theme/neo-tokens'
import { RiseView } from '@/components/home/animated/rise-view'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { decorativeDurations, motionDurations, motionEasings } from '@/lib/motion/tokens'
import { startPulseLoop } from '@/lib/motion/pulse-loop'
import { glowSafeTextShadow } from '@/theme/text-glow'
import { nunitoFamily, safeLineHeight } from '@/theme/typography'

// Press-feedback (spring `motionSprings.press`, reduced-motion-aware) sobre
// los Pressables del kit: mismo patrón que home/auth (usePressScale +
// AnimatedPressable a nivel módulo). En reposo (scale 1) el visual queda
// IDÉNTICO al aprobado.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Vista de GASTOS del rediseño — réplica pixel-perfect de
 * design/gastos-2026-07/gastos.dc.html (estático, valores) +
 * gastos-interactivo.dc.html (comportamiento). Bajo gate de aprobación
 * (redesign-approval-status: 'gastos'). Chrome dibujado (status bar / home
 * indicator) como el mockup; al cablear se cambia por insets reales.
 *
 * A DIFERENCIA de la Home (réplica casi estática con variantes por preset),
 * GASTOS es una MÁQUINA DE ESTADOS real: calendario⇄detalle, dropdown de
 * ciclo, navegación de días, filtro. Por eso `GastosFinalScreen` posee un
 * `useReducer` que replica el objeto de estado del mock ({cyc, sel, venc,
 * dayF, cat, dd}; el tema va por el prop `mode`), computa los derivados con
 * `deriveGastos()` (portado de `renderVals()`) y baja VMs a sub-componentes
 * presentacionales. La pantalla es AUTO-CONDUCIDA: los taps del owner
 * funcionan en vivo; el preview solo alterna tema y siembra estado inicial.
 */

// ─── Datos demo del mock (interactivo CY[] / gmap / cats) ────────────

type TileKey = 'pink' | 'merc' | 'rose' | 'mint'
/** [emoji, tile, título, subtítulo, monto]. */
type MovTuple = [string, TileKey, string, string, string]

interface CycleData {
  name: string
  tag: string
  short: string
  total: string
  movs: string
  prom: string
  bads: number[]
  def: number
  c1: string
  w1: number
  c2: string
  w2: number
  c3: string
  w3: number
  g1: [string, string]
  r1: MovTuple
  r2: MovTuple
  g2: [string, string]
  r3: MovTuple
  r4: MovTuple
}

const CY: CycleData[] = [
  {
    name: '20 jun → 19 jul',
    tag: 'CICLO ACTUAL · EN CURSO',
    short: 'HOY',
    total: '$3.008.920',
    movs: '64 mov · Todas',
    prom: '$167.162',
    bads: [24, 2, 4, 5],
    def: 7,
    c1: '$710.352 · 24%',
    w1: 72,
    c2: '$690.000 · 23%',
    w2: 69,
    c3: '$487.406 · 16%',
    w3: 48,
    g1: ['HOY · MARTES 7', '−$73.700'],
    r1: ['🍕', 'pink', 'Delivery', 'Mario · Comida y salidas', '−$61.200'],
    r2: ['🛒', 'merc', 'Verdulería', 'Camila · Mercado', '−$12.500'],
    g2: ['AYER · LUNES 6', '−$54.300'],
    r3: ['🩺', 'rose', 'Farmacia', 'Mario · Salud', '−$8.900'],
    r4: ['🏠', 'mint', 'Ferretería', 'Camila · Hogar', '−$45.400'],
  },
  {
    name: 'Mayo 2026',
    tag: 'EDICIÓN CERRADA · −$1.588.087',
    short: 'MAY',
    total: '$4.612.480',
    movs: '72 mov · cerrado',
    prom: '$148.790',
    bads: [22, 27, 3, 9, 15],
    def: 25,
    c1: '$1.102.300 · 24%',
    w1: 74,
    c2: '$980.000 · 21%',
    w2: 64,
    c3: '$741.220 · 16%',
    w3: 49,
    g1: ['VIE 19 JUN · CIERRE', '−$154.800'],
    r1: ['🛒', 'merc', 'Supermercado', 'Camila · Mercado', '−$98.200'],
    r2: ['🏠', 'mint', 'Expensas', 'Mario · Hogar', '−$56.600'],
    g2: ['JUE 18 JUN', '−$122.400'],
    r3: ['🔀', 'pink', 'Transferencia', 'Mario · Transferencia', '−$90.000'],
    r4: ['🍕', 'rose', 'Delivery', 'Camila · Comida', '−$32.400'],
  },
  {
    name: 'Abril 2026',
    tag: 'EDICIÓN CERRADA · +$1.727.195',
    short: 'ABR',
    total: '$3.981.040',
    movs: '89 mov · cerrado',
    prom: '$132.700',
    bads: [28, 6, 12],
    def: 25,
    c1: '$955.400 · 24%',
    w1: 70,
    c2: '$818.000 · 21%',
    w2: 61,
    c3: '$620.900 · 16%',
    w3: 46,
    g1: ['MAR 19 MAY · CIERRE', '−$118.300'],
    r1: ['🛒', 'merc', 'Supermercado', 'Camila · Mercado', '−$84.100'],
    r2: ['🩺', 'rose', 'Farmacia', 'Mario · Salud', '−$34.200'],
    g2: ['LUN 18 MAY', '−$96.750'],
    r3: ['🏠', 'mint', 'Ferretería', 'Mario · Hogar', '−$61.500'],
    r4: ['🍕', 'pink', 'Delivery', 'Camila · Comida', '−$35.250'],
  },
]

/** día → [gastado, movimientos]. 20.5/21.5 = días FUERA de ciclo (venc). */
const GMAP: Record<number, [string, string]> = {
  2: ['$254.364', '4'],
  24: ['$310.120', '5'],
  4: ['$198.400', '3'],
  5: ['$221.750', '4'],
  7: ['$73.700', '2'],
  20.5: ['$41.900', '1'],
  21.5: ['$18.300', '1'],
}

/** Colores demo por categoría (swatch). Al cablear saldrán de `category.color`
 *  del sistema (theme/category-hues.ts); acá son pasteles que rinden sobre el
 *  hero forest y sobre el bg de los chips. */
const CAT_COLORS = {
  hogar: '#A9D57F', // verde lima
  transf: '#9DB4E8', // azul índigo pastel
  merc: '#F3C29A', // durazno
} as const

/** [label, count, nombre-de-categoría-para-el-ícono | null]. "Todas" sin
 *  ícono. El nombre COMPLETO (no el label abreviado) resuelve el sticker real
 *  vía CategoryIcon (el label "Transf." es solo el texto visible). */
const CATS: [string, string, string | null][] = [
  ['Todas', '64', null],
  ['Hogar', '4', 'Hogar'],
  ['Transf.', '3', 'Transferencia'],
  ['Mercado', '2', 'Mercado'],
]

/** Días reales de la grilla, sin blanks (para navegar ‹ ›). Constante:
 *  la grilla arranca en el día de inicio del ciclo (20) y da la vuelta. */
const ORDER: number[] = [
  ...Array.from({ length: 11 }, (_, i) => 20 + i), // 20..30
  ...Array.from({ length: 19 }, (_, i) => 1 + i), // 1..19
]

/** Alturas + tono del mini-chart de 7 días (constante, no cambia por ciclo). */
const BAR_SPECS: { h: number; tone: 'bright' | 'dim' | 'peak' }[] = [
  { h: 12, tone: 'bright' },
  { h: 18, tone: 'bright' },
  { h: 9, tone: 'dim' },
  { h: 14, tone: 'bright' },
  { h: 22, tone: 'peak' },
  { h: 11, tone: 'bright' },
  { h: 6, tone: 'dim' },
]

// Rango de altura del mini-chart de 7 días (matchea BAR_SPECS: 6..22). El
// cableado real deriva alturas desde `recentDailyBars` [0,1] con este rango.
const BAR_MIN_H = 6
const BAR_MAX_H = 22

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

// ─── Estado + reducer (portado de renderVals()) ──────────────────────

interface GastosState {
  cyc: number
  sel: number
  venc: boolean
  dayF: boolean
  cat: number
  dd: boolean
  /** Usuario nuevo / ciclo actual SIN movimientos → activa los vacíos.
   *  Eje INMUTABLE en sesión (lo siembra el preview; el caso con datos es
   *  `empty:false`, default, e IDÉNTICO al aprobado). */
  empty: boolean
}

const INITIAL_STATE: GastosState = {
  cyc: 0,
  sel: 7,
  venc: false,
  dayF: false,
  cat: 0,
  dd: false,
  empty: false,
}

type GastosAction =
  | { type: 'toggleDropdown' }
  | { type: 'selectCycle'; i: number }
  | { type: 'confirmCobro' }
  | { type: 'prevCycle' }
  | { type: 'nextCycle' }
  | { type: 'moveDay'; dir: number }
  | { type: 'clearDay' }
  | { type: 'selectDay'; n: number }
  | { type: 'selectFilter'; i: number }

function gastosReducer(st: GastosState, a: GastosAction): GastosState {
  switch (a.type) {
    case 'toggleDropdown':
      return { ...st, dd: !st.dd }
    case 'selectCycle':
      return { ...st, cyc: a.i, sel: CY[a.i].def, venc: false, dayF: false, dd: false }
    case 'confirmCobro':
      return { ...st, venc: false }
    case 'prevCycle':
      return st.cyc < 2
        ? { ...st, cyc: st.cyc + 1, sel: CY[st.cyc + 1].def, venc: false, dayF: false }
        : st
    case 'nextCycle':
      return st.cyc > 0 ? { ...st, cyc: st.cyc - 1, sel: CY[st.cyc - 1].def, dayF: false } : st
    case 'moveDay': {
      const i = Math.max(0, ORDER.indexOf(Math.floor(st.sel)))
      const n = ORDER[Math.min(ORDER.length - 1, Math.max(0, i + a.dir))]
      return { ...st, sel: n, dayF: true }
    }
    case 'clearDay':
      return { ...st, dayF: false, sel: CY[st.cyc].def }
    case 'selectDay':
      // Tap de celda normal cierra el dropdown; las celdas FUERA (sel no
      // entero: 20.5/21.5) NO lo tocan (paridad con renderVals del handoff).
      return { ...st, sel: a.n, dayF: true, dd: Number.isInteger(a.n) ? false : st.dd }
    case 'selectFilter':
      return { ...st, cat: a.i }
    default:
      return st
  }
}

// ─── Derivados (VMs) ─────────────────────────────────────────────────

// Exportado: el cableado real (neo-gastos-screen) construye las celdas del
// calendario con VMs reales y necesita el tipo. El render NO cambia.
// 'empty' (decisión owner F1): día PASADO sin gastos → celda NEUTRA (sin fill
// ni sombra de estado, solo el número en ink muted). Se distingue de 'ok' (día
// CON gasto dentro de presupuesto, sí pintado verde) y de 'fut' (futuro, pozo
// inset). El demo del kit nunca produce 'empty' (buildCells → ok/bad/now/fut/
// fuera), así que el render aprobado queda idéntico.
/** `empty` = día pasado sin gastos (celda neutra) · `fut` = día futuro con pozo
 *  apagado · `none` (v2, D-atom "sin datos") = MOLDE PUNTEADO, para el ciclo
 *  recién arrancado donde el punteado promete lo que se va a pintar. */
export type DayKind = 'ok' | 'bad' | 'now' | 'fut' | 'fuera' | 'empty' | 'none'

export interface DayCell {
  key: string
  blank?: boolean
  n?: number
  label?: string
  kind?: DayKind
  selected?: boolean
  sub?: string
  sprout?: boolean
  hoyDot?: boolean
  /** Fecha EXACTA de la celda (`YYYY-MM-DD` local). El `n` es día-de-mes y
   *  se repite cuando la ventana dura más de un mes (ciclo extendido), así
   *  que la identidad real de la celda es ésta. */
  iso?: string
  /** El día cayó DESPUÉS del fin nominal del ciclo: entró de EXTENDIDO
   *  porque el cobro no se confirmó. Ortogonal al `kind` — un día de
   *  extendido sigue siendo ok/bad/empty/now y sigue restando del saldo. */
  ext?: boolean
}

export interface HeroCategory {
  /** Color del swatch (reemplaza el emoji). */
  color: string
  name: string
  value: string
  pct: number
}

// Exportado: el cableado real (neo-gastos-screen) mapea cada expense/income
// del feed a este VM y lo baja a `GastosMovRow` (fila presentacional). El
// render de la fila NO cambia.
export interface MovRowVM {
  emoji: string
  tile: TileKey
  title: string
  sub: string
  amount: string
  /** Nombre de categoría (de "quién · categoría") para el ícono REAL del
   *  sistema (CategoryIcon). null = fila sintética → cae al emoji. */
  catName?: string
  /** 'income' = ingreso intercalado del feed real → monto en verde (`s.green`),
   *  igual que la vieja `IncomeRow`. default/'expense' = tratamiento neutro del
   *  gasto (el demo nunca setea `kind`, así que rinde idéntico al aprobado). */
  kind?: 'expense' | 'income'
  /** v2 · M-3 — nota bajo la fila ("Queda fuera del ciclo hasta confirmar el
   *  cobro."). Solo la llevan los movimientos fuera de ciclo. */
  note?: string
}

interface MovGroupVM {
  label: string
  total: string
  rows: MovRowVM[]
}

// Exportado: el cableado real (neo-gastos-screen) construye la lista de ciclos
// (actual + ediciones cerradas) con este VM y la baja a `CycleDropdown`. El
// render del dropdown NO cambia.
export interface DropdownItemVM {
  name: string
  tag: string
  tone: 'current' | 'closed'
  active: boolean
}

interface GastosDerived {
  empty: boolean
  cur: boolean
  viewingClosed: boolean
  isCurrent: boolean
  showAlert: boolean
  showCal: boolean
  showDay: boolean
  brotPose: BrotPose
  cycTrigLabel: string
  cycleVariant: 'current' | 'closed'
  ddItems: DropdownItemVM[]
  heroTag: string
  heroChip: string
  heroTotal: string
  heroProm: string
  categories: HeroCategory[]
  cells: DayCell[]
  dayNum: string
  daySub: string
  dayBadge: string | null
  dayGastado: string
  dayMovs: string
  isOut: boolean
  /** Strip de Brot del día: reemplaza el copy hardcodeado del caso
   *  fuera-de-ciclo. `{ pose, text }` lo decide el caller — un día de
   *  EXTENDIDO (ciclo extendido) usa el mismo chasis con otra pose y otro
   *  copy, porque su gasto SÍ cuenta para este ciclo. Sin esto, el strip
   *  sólo existía para `isOut`, que en extendido nunca se cumple. */
  brotStrip?: { pose: BrotPose; text: string } | null
  showCtas: boolean
  dayVariant: 'live' | 'future' | 'closed'
  dayNote: string | undefined
  filterChips: { label: string; count: string; active: boolean; catIcon: string | null }[]
  sectionChipLabel: string
  groups: MovGroupVM[]
  showSeeMore: boolean
}

function buildCells(cyc: number, sel: number, venc: boolean, empty = false): DayCell[] {
  const C = CY[cyc]
  const cur = cyc === 0
  const cells: DayCell[] = []
  for (let i = 0; i < 5; i++) cells.push({ key: `b${i}`, blank: true })
  for (const n of ORDER) {
    let kind: DayKind = 'ok'
    if (empty) {
      // v2 · CAL-4/EV2 — sin gastos la grilla va en MOLDE PUNTEADO ('none'),
      // salvo HOY que queda resaltado. v1 la dejaba en 'fut' (30 pozos
      // apagados), que se leía como "roto" y no como "todavía no pasó nada".
      kind = n === 7 ? 'now' : 'none'
    } else if (cur) {
      if (n === 7) kind = 'now'
      else if (n >= 8 && n <= 19) kind = 'fut'
      else if (C.bads.includes(n)) kind = 'bad'
    } else if (C.bads.includes(n)) {
      kind = 'bad'
    }
    cells.push({
      key: `d${n}`,
      n,
      label: String(n),
      kind,
      selected: sel === n,
      // Sin racha en vacío: el brote decorativo solo aparece con historial.
      sprout: !empty && cur && n === 28 && kind === 'ok',
      hoyDot: kind === 'now',
    })
  }
  if (!empty && cur && venc) {
    ;[20.5, 21.5].forEach((v, i) => {
      cells.push({ key: `f${i}`, n: v, label: `+2${i}`, kind: 'fuera', selected: sel === v, sub: 'FUERA' })
    })
  }
  return cells
}

function mk(r: MovTuple): MovRowVM {
  // La categoría es lo que va después del "·" en "quién · categoría".
  const catName = r[3].split('·').pop()?.trim() || undefined
  return { emoji: r[0], tile: r[1], title: r[2], sub: r[3], amount: r[4], catName }
}

function deriveGastos(st: GastosState): GastosDerived {
  const { cyc, sel, venc, dayF, cat, empty } = st
  const C = CY[cyc]
  const cur = cyc === 0
  const out = sel === 20.5 || sel === 21.5
  const fut = cur && !out && sel >= 8 && sel <= 19 && sel !== 7
  // Vacío: cualquier día muestra $0 · 0 movimientos (sin GMAP).
  const gg: [string, string] = empty
    ? ['$0', '0']
    : fut
      ? ['—', '0']
      : (GMAP[sel] ?? ['$96.300', '2'])
  const isBad = !empty && C.bads.includes(sel)

  const dayRow: MovRowVM = {
    emoji: '🧾',
    tile: 'mint',
    title: 'Movimientos del día',
    sub: 'filtrado por día seleccionado',
    amount: `−${gg[0]}`,
  }

  const groups: MovGroupVM[] = [
    {
      label: dayF ? `DÍA ${out ? `+${Math.floor(sel)}` : sel} SELECCIONADO` : C.g1[0],
      total: dayF ? `−${gg[0]}` : C.g1[1],
      rows: dayF ? [dayRow] : [mk(C.r1), mk(C.r2)],
    },
  ]
  if (!dayF) groups.push({ label: C.g2[0], total: C.g2[1], rows: [mk(C.r3), mk(C.r4)] })

  return {
    empty,
    cur,
    viewingClosed: !cur,
    isCurrent: cur,
    showAlert: cur && venc,
    showCal: !dayF,
    showDay: dayF,
    brotPose: venc ? 'worried' : cur ? 'wave' : 'think',
    cycTrigLabel: cur ? 'Ciclo 20 jun → 19 jul · día 18' : `${C.name} · cerrada`,
    cycleVariant: cur ? 'current' : 'closed',
    ddItems: CY.map((c, i) => ({
      name: c.name,
      tag: i === 0 ? 'EN CURSO' : c.tag.replace('EDICIÓN CERRADA · ', ''),
      tone: i === 0 ? 'current' : 'closed',
      active: cyc === i,
    })),
    heroTag: cur ? 'TOTAL VISIBLE' : 'TOTAL DE LA EDICIÓN',
    // v2 · H-4 — el chip TAMBIÉN va en cero: el molde tiene que ser el mismo
    // esqueleto que el hero lleno (v1 mostraba "64 mov" sobre un total de $0).
    heroChip: empty ? '0 mov · Todas' : C.movs,
    heroTotal: empty ? '$0' : C.total,
    heroProm: C.prom,
    categories: [
      { color: CAT_COLORS.hogar, name: 'Hogar', value: C.c1, pct: C.w1 },
      { color: CAT_COLORS.transf, name: 'Transferencia', value: C.c2, pct: C.w2 },
      { color: CAT_COLORS.merc, name: 'Mercado', value: C.c3, pct: C.w3 },
    ],
    cells: buildCells(cyc, sel, venc, empty),
    dayNum: out ? `+${Math.floor(sel)}` : String(sel),
    daySub: out
      ? 'FUERA DE CICLO · va al próximo al confirmar'
      : cur
        ? 'ciclo 20 jun → 19 jul'
        : C.name,
    dayBadge: empty ? null : isBad || out ? (out ? 'Fuera de ciclo' : 'Día de exceso') : null,
    dayGastado: gg[0],
    dayMovs: gg[1],
    isOut: out,
    // [OWNER-D] día FUERA de ciclo → sin CTAs (solo strip Brot-sad + nota).
    showCtas: cur && !out,
    // v2 · DS-4/DS-6 — el día no admite acciones y lo DICE. `fut` ya existía
    // como derivado (marca el "— / 0"); v1 igual dibujaba los dos CTAs para un
    // día que no ocurrió, y en una edición cerrada para uno que no se puede
    // tocar. La nota reemplaza a los botones, no se suma.
    dayVariant: fut ? ('future' as const) : cur ? ('live' as const) : ('closed' as const),
    dayNote: fut
      ? 'Sin acciones — día futuro'
      : cur
        ? undefined
        : 'Sin acciones — edición cerrada',
    filterChips: CATS.map((c, i) => ({ label: c[0], count: c[1], active: cat === i, catIcon: c[2] })),
    sectionChipLabel: empty
      ? '0 movimientos'
      : dayF
        ? `✕ Día ${out ? `+${Math.floor(sel)}` : sel} · ver todo`
        : cur
          ? '64 en el ciclo'
          : 'edición cerrada',
    groups,
    showSeeMore: !dayF,
  }
}

// ─── Íconos (transcritos del markup) ─────────────────────────────────

function ChevronLeft({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 6l-6 6 6 6" />
    </Svg>
  )
}

function ChevronRightIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  )
}

function ChevronDown({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 9l6 6 6-6" />
    </Svg>
  )
}

/** Hojita "sin gastos" — el eco-glyph del sistema: MISMO path que el marcador
 *  de día no-spend y el botón "Marcar día sin gastos" de la pantalla vieja
 *  (gastos-month-calendar.tsx). Reemplaza los emojis 🌱/🌿 del kit;
 *  theme-aware por el color que le baja el llamador. */
function LeafGlyph({ color, size = 14, strokeWidth = 2.6 }: { color: string; size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 19c0-7 5-13 14-13-1 9-6 14-14 14M5 19c2-3 5-5 9-7" />
    </Svg>
  )
}

// ─── CTA de estado vacío (pill crema / verde) ────────────────────────

/** Pill de acción de los vacíos — mismo patrón que el CtaPill de la Home
 *  (usePressScale 0.94 + gradiente/sombra por prop). Crema para el hero,
 *  radial verde (ctaPrimary*) para el CTA principal de movimientos. */
function GastosEmptyCta({
  label,
  ink,
  gradientCss,
  shadow,
  onPress,
}: {
  label: string
  ink: string
  gradientCss: string
  shadow: string
  onPress?: () => void
}) {
  const press = usePressScale({ pressedScale: 0.94 })
  const inner = (
    <View style={[styles.emptyCta, { experimental_backgroundImage: gradientCss, boxShadow: shadow }]}>
      <Text style={[styles.emptyCtaText, { color: ink }]}>{label}</Text>
    </View>
  )
  if (!onPress) return inner
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      {inner}
    </AnimatedPressable>
  )
}

// ─── ① Header + trigger de ciclo ─────────────────────────────────────

/** Dot del trigger — el punto EN CURSO late (mfPulse): un glow verde detrás
 *  que respira en loop (2.6s). Parkeado (opacity 0) fuera del ciclo actual,
 *  con reduced-motion o `paused`, así el reposo queda idéntico.
 *
 *  PERF · `paused` lo cablea la pantalla con el MISMO booleano que pausa las
 *  partículas del hero (`!isFocused`). Sin él, `withRepeat(-1)` seguía latiendo
 *  en el UI runtime con Gastos en otra tab: los tabs usan `freezeOnBlur:false`,
 *  así que el header queda montado e invisible pero su loop sigue corriendo. */
function CycleTriggerDot({
  s,
  current,
  paused,
}: {
  s: GastosSpec
  current: boolean
  paused: boolean
}) {
  const reduceMotion = useReducedMotion()
  const pulse = useSharedValue(0)
  useEffect(() => {
    // Sin glow (ciclo cerrado) o con reduced motion: reposo fijo en el extremo
    // apagado, igual que antes.
    if (!current || reduceMotion) {
      cancelAnimation(pulse)
      pulse.value = 0
      return
    }
    // Pausa por foco: sólo cancelar. Escribir el valor contraía el halo de
    // golpe durante el fundido de salida de la tab, que todavía se ve — ver
    // `startPulseLoop`.
    if (paused) {
      cancelAnimation(pulse)
      return
    }
    startPulseLoop(pulse, {
      // `decorativeDurations.pulse` era el MEDIO ciclo acá (el withTiming de
      // ida); el helper toma el ciclo completo.
      duration: decorativeDurations.pulse * 2,
      easing: motionEasings.warm,
    })
    return () => cancelAnimation(pulse)
  }, [current, reduceMotion, paused, pulse])
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.3 + pulse.value * 0.6, transform: [{ scale: 1 + pulse.value * 0.5 }] }))
  const dotColor = current ? s.cycTrigDotCurrent : s.cycTrigDotClosed
  return (
    <View style={styles.cycDotWrap}>
      {current ? (
        <Animated.View pointerEvents="none" style={[styles.cycDotGlow, glowStyle, { backgroundColor: s.cycTrigDotCurrentGlow }]} />
      ) : null}
      <View style={[styles.cycDot, { backgroundColor: dotColor }]} />
    </View>
  )
}

export interface GastosHeaderProps {
  mode: GastosMode
  cycleLabel: string
  cycleVariant: 'current' | 'closed'
  brotPose: BrotPose
  /** Contador del jardín (racha) — badge numérico naranja, oculto en 0. */
  badgeCount?: number
  /** Pausa el latido del dot "EN CURSO". Mismo booleano que pausa las
   *  partículas del hero (la tab no está enfocada): con `freezeOnBlur:false` el
   *  header queda montado e invisible y su `withRepeat(-1)` seguiría corriendo.
   *  Default `false` → el demo/preview aprobado late igual que siempre. */
  paused?: boolean
  /** Anima el Brot del botón del jardín. Default `true` → el demo/preview
   *  aprobado del kit conserva su respiro idle.
   *
   *  PERF · el cableado real lo pasa `false`, igual que el banner VENCIDO y el
   *  strip del day-detail: con `true` el mascota registra un `useFrameCallback`
   *  + un `useDerivedValue` que crea un PictureRecorder y re-ejecuta `drawBrot`
   *  (decenas de paths y gradientes Skia) CADA 16ms en el UI runtime — el MISMO
   *  hilo que mueve el scroll. Este header vive DENTRO del
   *  `ListHeaderComponent` de la SectionList del feed, así que su loop competía
   *  con el gesto. Con `false` el picture se graba UNA vez (STATIC_T) y el nodo
   *  pasa a ser un dibujo estático; es un ícono de 34px, el respiro no se
   *  percibe. Los Brot GRANDES de los vacíos (hero empty / pozo de
   *  movimientos) siguen animados: viven en ScrollViews planos, sin filas. */
  animated?: boolean
  onToggleDropdown?: () => void
  onPressBrot?: () => void
  /** Ref del trigger de ciclo ("Ciclo … ▾"), para que el tour pueda apuntarle
   *  sin que el header tenga que saber del tour. Mismo patrón que el
   *  `calendarButtonRef` del `FijosHeader`. Va sobre la fila VISIBLE (no sobre
   *  el Pressable) para que mida igual con y sin `onToggleDropdown`. */
  cycleTriggerRef?: Ref<View>
  /** Ídem para el botón-ícono del jardín (Brot + badge de racha). El paso del
   *  tour resalta el BOTÓN, no el header entero (owner 2026-08-17). */
  gardenButtonRef?: Ref<View>
}

export function GastosHeader({
  mode,
  cycleLabel,
  cycleVariant,
  brotPose,
  badgeCount = 1,
  paused = false,
  animated = true,
  onToggleDropdown,
  onPressBrot,
  cycleTriggerRef,
  gardenButtonRef,
}: GastosHeaderProps) {
  const s = GASTOS_SPEC[mode]
  const current = cycleVariant === 'current'
  const brotPress = usePressScale({ pressedScale: 0.9 })
  const trigInk = current ? s.cycTrigInkCurrent : s.cycTrigInkClosed

  const trigger = (
    // `collapsable={false}` — el paso del tour mide este nodo con
    // measureInWindow y Android colapsa las View sin props propias.
    <View ref={cycleTriggerRef} collapsable={false} style={styles.cycTrig}>
      <CycleTriggerDot s={s} current={current} paused={paused} />
      <Text style={[styles.cycTrigLabel, { color: trigInk }]}>{cycleLabel}</Text>
      <Text style={[styles.cycCaret, { color: trigInk }]}>▾</Text>
    </View>
  )

  // Acceso al jardín — círculo-ícono con el Brot adentro + badge numérico
  // naranja (mismo lenguaje que los HeaderButton de la Home). Menos peso
  // visual que el disco grande + pill "🌱 1" anterior.
  const brot = (
    <View style={styles.brotCol}>
      <View
        style={[
          styles.brotDisc,
          { backgroundColor: s.brotBtnBackground, boxShadow: s.brotBtnShadow },
          s.brotBtnGradientCss ? { experimental_backgroundImage: s.brotBtnGradientCss } : null,
        ]}
      >
        {/* El apagado del loop Skia se gobierna con el prop `animated` (default
            `true` → el preview aprobado del kit late igual), igual que el
            banner VENCIDO y el strip del day-detail. Lo apaga el CABLEADO, no
            el kit — ver la nota del prop en `GastosHeaderProps`. */}
        <BrotMascot pose={brotPose} size={34} shadow={false} animated={animated} />
      </View>
      {badgeCount > 0 ? (
        <View style={[styles.brotBadge, { backgroundColor: s.brotBadgeBackground, borderColor: s.bg }]}>
          {/* Badge circular de alto fijo: a fontScale grande el número se
              recortaba (la caja no reflowea). Ver nota en dayLabel. */}
          <Text maxFontSizeMultiplier={1.3} style={[styles.brotBadgeText, { color: s.brotBadgeInk }]}>
            {String(badgeCount)}
          </Text>
        </View>
      ) : null}
    </View>
  )

  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        <Text style={[styles.title, { color: s.text }]}>Gastos</Text>
        {onToggleDropdown ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Cambiar de ciclo: ${cycleLabel}`}
            // La fila del trigger mide ~18px (label 13). 8 la dejaba en 34,
            // debajo del mínimo; 14 la lleva a ~46. Arriba solo tiene el título
            // "Gastos" (no accionable) y abajo 16px de aire hasta el bloque
            // siguiente → el slop no le roba el toque a ningún vecino.
            hitSlop={14}
            onPress={onToggleDropdown}
            style={({ pressed }) => (pressed ? styles.pressedDim : null)}
          >
            {trigger}
          </Pressable>
        ) : (
          trigger
        )}
      </View>
      {onPressBrot ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Ir al jardín"
          hitSlop={6}
          onPress={onPressBrot}
          ref={gardenButtonRef}
          onPressIn={brotPress.onPressIn}
          onPressOut={brotPress.onPressOut}
          style={brotPress.animatedStyle}
        >
          {brot}
        </AnimatedPressable>
      ) : (
        brot
      )}
    </View>
  )
}

// ─── ② Dropdown de ciclo ─────────────────────────────────────────────

export interface CycleDropdownProps {
  mode: GastosMode
  items: DropdownItemVM[]
  onSelect?: (i: number) => void
}

export function CycleDropdown({ mode, items, onSelect }: CycleDropdownProps) {
  const s = GASTOS_SPEC[mode]
  return (
    <RiseView translateY={-10} style={styles.ddSpacing}>
      <View
        style={[
          styles.ddContainer,
          { backgroundColor: s.ddBackground, boxShadow: s.ddShadow },
          s.ddGradientCss ? { experimental_backgroundImage: s.ddGradientCss } : null,
        ]}
      >
        {items.map((it, i) => (
          <DropdownRow key={it.name} s={s} item={it} onPress={onSelect ? () => onSelect(i) : undefined} />
        ))}
      </View>
    </RiseView>
  )
}

function DropdownRow({ s, item, onPress }: { s: GastosSpec; item: DropdownItemVM; onPress?: () => void }) {
  const press = usePressScale({ pressedScale: 0.97 })
  const row = (
    <View
      style={[
        styles.ddRow,
        item.active ? { backgroundColor: s.ddActiveBackground ?? 'transparent', boxShadow: s.ddActiveShadow } : null,
      ]}
    >
      <Text style={[styles.ddIcon, { color: item.tone === 'current' ? s.ddIconCurrentInk : s.text }]}>
        {item.tone === 'current' ? '●' : '📁'}
      </Text>
      <Text style={[styles.ddName, { color: s.ddNameInk }]} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={[styles.ddTag, { color: item.tone === 'current' ? s.ddTagCurrentInk : s.ddTagClosedInk }]}>
        {item.tag}
      </Text>
    </View>
  )
  if (!onPress) return row
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.tag}`}
      // A11Y · el ciclo abierto se señalaba SOLO por fill+sombra
      // (`ddActiveBackground`/`ddActiveShadow`): con lector de pantalla las N
      // ediciones se leían como filas idénticas, sin forma de saber cuál está
      // abierta. Mismo tratamiento que FilterChip y DayCellView.
      accessibilityState={{ selected: item.active }}
      // La fila dibuja ~35pt de alto (paddingVertical 9 + label 13). El slop
      // vertical está ACOTADO por el gap de 2 del contenedor (`ddContainer`):
      // 1+1=2 consume el gap exacto y deja las filas CONTIGUAS sin solaparse
      // (con solape el toque en la frontera resolvería por orden de render).
      // Eso la lleva a 37pt: NO llega a 44 y no puede llegar sin cambiar la
      // geometría aprobada del panel (paddingVertical 9→13 en `ddRow`), que es
      // un cambio visual y necesita el OK del owner. Horizontal: la fila ocupa
      // el ancho completo del panel, no hay vecino lateral que robar.
      hitSlop={{ top: 1, bottom: 1, left: 8, right: 8 }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      {row}
    </AnimatedPressable>
  )
}

// ─── Barra ciclo cerrado + banner vencido ────────────────────────────

export function GastosClosedBar({ mode, onBackToCurrent }: { mode: GastosMode; onBackToCurrent?: () => void }) {
  const s = GASTOS_SPEC[mode]
  return (
    <RiseView translateY={12} style={styles.blockSpacing}>
      <View style={[styles.closedBar, { experimental_backgroundImage: s.closedBarGradientCss, boxShadow: s.closedBarShadow }]}>
        <Text style={styles.closedBarEmoji}>📁</Text>
        <Text style={[styles.closedBarLabel, { color: s.closedBarInk }]}>EDICIÓN CERRADA · SOLO LECTURA</Text>
        {onBackToCurrent ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver al ciclo actual"
            hitSlop={8}
            onPress={onBackToCurrent}
            style={({ pressed }) => (pressed ? styles.pressedDim55 : null)}
          >
            <Text style={[styles.closedBtn, { color: s.closedBarInk }]}>Volver al actual ›</Text>
          </Pressable>
        ) : (
          <Text style={[styles.closedBtn, { color: s.closedBarInk }]}>Volver al actual ›</Text>
        )}
      </View>
    </RiseView>
  )
}

export interface GastosOverdueBannerProps {
  mode: GastosMode
  /** Copy real (derivado de `cycleEnd` + días fuera). Sin props se cae a los
   *  literales del handoff → el demo auto-conducido rinde idéntico al aprobado. */
  title?: string
  subtitle?: string
  confirmLabel?: string
  confirmA11yLabel?: string
  /** Owner-only: cuando el usuario NO es dueño del hogar, el cableado real NO
   *  pasa `onConfirm` (RLS: solo el dueño confirma/cierra el ciclo). Sin
   *  handler el banner queda informativo (título + sub, sin botón de acción),
   *  en paridad con la Home (que rutea al no-owner sin ofrecer confirmar). */
  onConfirm?: () => void
  /** v2 · B-1 usa `worried` (el ciclo venció sin confirmar) y B-2 usa `sad`
   *  (los gastos ya quedaron afuera). v1 usaba `wow` para los dos. */
  brotPose?: BrotPose
  /** Anima el Brot del banner. Default `true` → el preview aprobado del
   *  kit queda idéntico. El cableado real lo pasa `false`: este banner se monta
   *  DENTRO del `ListHeaderComponent` de la SectionList del feed, así que su
   *  loop Skia (PictureRecorder + drawBrot cada 16ms en el UI runtime) competía
   *  con el mismo hilo que mueve el scroll de ~105 filas. */
  animated?: boolean
}

export function GastosOverdueBanner({
  mode,
  title = 'Tu ciclo terminó el 19',
  subtitle = '2 días sin confirmar el cobro — quedan fuera del ciclo',
  confirmLabel = '✓ Confirmar',
  confirmA11yLabel = 'Confirmar cobro',
  onConfirm,
  brotPose = 'worried',
  animated = true,
}: GastosOverdueBannerProps) {
  const s = GASTOS_SPEC[mode]
  const press = usePressScale({ pressedScale: 0.93 })
  return (
    <RiseView translateY={12} style={styles.blockSpacing}>
      <View style={[styles.banner, { experimental_backgroundImage: s.alertGradientCss, boxShadow: s.alertShadow }]}>
        <View style={styles.bannerBrot}>
          <BrotMascot pose={brotPose} size={48} shadow={false} animated={animated} />
        </View>
        <View style={styles.bannerTexts}>
          <Text numberOfLines={1} style={[styles.bannerTitle, { color: s.alertTitleInk }]}>{title}</Text>
          <Text style={[styles.bannerSub, { color: s.alertSubInk }]}>{subtitle}</Text>
        </View>
        {onConfirm ? (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={confirmA11yLabel}
            hitSlop={6}
            onPress={onConfirm}
            onPressIn={press.onPressIn}
            onPressOut={press.onPressOut}
            style={press.animatedStyle}
          >
            <View style={[styles.confirmBtn, { backgroundColor: s.confirmBtnBackground, boxShadow: s.confirmBtnShadow }]}>
              <Text style={[styles.confirmBtnText, { color: s.confirmBtnInk }]}>{confirmLabel}</Text>
            </View>
          </AnimatedPressable>
        ) : null}
      </View>
    </RiseView>
  )
}

// ─── Transiciones de cambio de estado (filtro de categoría) ──────────
//
// Al tocar un chip del filtro, el hero (total, promedio, chip de resumen,
// barras de top-categorías, mini-barras de 7 días) y el calendario (kind de
// cada día) se RECALCULAN enteros. Sin transición eso se lee como un salto.
// Estas dos primitivas suavizan el salto SIN tocar el diseño ni los valores
// finales: solo cómo se llega a ellos.
//
// Presupuesto de motion (tokens, nunca literales):
//   · swap de contenido  → out `micro` (accelerate) + in `quick` (decelerate)
//   · cambio de valor/color continuo → `standard` (standard)
const SWAP_OUT = { duration: motionDurations.micro, easing: motionEasings.accelerate } as const
const SWAP_IN = { duration: motionDurations.quick, easing: motionEasings.decelerate } as const
const VALUE_TWEEN = { duration: motionDurations.standard, easing: motionEasings.standard } as const
const GROW_TWEEN = { duration: decorativeDurations.meterFill, easing: motionEasings.standard } as const

/**
 * Crossfade de CONTENIDO sobre UN solo shared value: baja la opacidad, commitea
 * el contenido nuevo EN EL VALLE (opacidad 0, nadie ve el cambio) y vuelve a
 * subir. Se usa para texto y para bloques enteros cuyo contenido cambia de
 * forma/cantidad (lista de categorías, grilla del calendario) → un único nodo
 * animado por bloque en vez de uno por hijo.
 *
 * `signature` decide CUÁNDO transicionar: hay que excluir de ella lo que debe
 * responder al instante (p.ej. la selección de un día del calendario, que es
 * feedback de tap y ya tiene su press-scale).
 *
 * Reduced-motion: commit inmediato, opacidad parkeada en 1, sin animación.
 */
function useSwapFade<T>(value: T, signature: string, reduceMotion: boolean) {
  const [shown, setShown] = useState<T>(value)
  // Se bumpea en CADA commit del valle. Dispara el fade-in DESPUÉS de que React
  // montó el contenido nuevo (ver el efecto de fade-in). Es un contador y NO
  // `shown` porque un commit que NO cambia `shown` (p.ej. tap A→B→A: en el
  // valle el último valor es A, igual al mostrado) igual tiene que volver a subir
  // la opacidad: si dependiéramos de `shown`, ese commit no re-dispararía el
  // efecto y el bloque quedaría en 0 (invisible).
  const [commitSeq, setCommitSeq] = useState(0)
  const committedRef = useRef(signature)
  // El valor más reciente, leído EN EL VALLE: si llegan dos cambios seguidos
  // (tap rápido entre chips) se commitea el último, no el intermedio.
  const latestRef = useRef(value)
  latestRef.current = value
  const fade = useSharedValue(1)

  // Commit del contenido nuevo EN EL VALLE (opacidad 0). Estable (runOnJS lo
  // captura). NO sube la opacidad acá: `setShown` es un setState del hilo JS que
  // todavía necesita render + commit de React + envío al nodo nativo; subir la
  // opacidad ahora mostraría el contenido VIEJO reapareciendo a mitad de camino
  // (el rebote que queremos eliminar). El fade-in lo dispara el efecto de abajo,
  // ya post-commit del contenido nuevo.
  const commitInValley = useCallback(() => {
    setShown(latestRef.current)
    setCommitSeq((n) => n + 1)
  }, [])

  useEffect(() => {
    if (signature === committedRef.current) return
    committedRef.current = signature
    if (reduceMotion) {
      cancelAnimation(fade)
      fade.value = 1
      setShown(latestRef.current)
      return
    }
    fade.value = withTiming(0, SWAP_OUT, (finished) => {
      'worklet'
      if (!finished) return
      runOnJS(commitInValley)()
    })
  }, [signature, reduceMotion, fade, commitInValley])

  // Fade-IN post-commit: este efecto corre DESPUÉS de que React committeó el
  // contenido nuevo (el bump de `commitSeq` viene de `commitInValley`), así el
  // valle (opacidad 0) se sostiene hasta que lo nuevo está en pantalla — sin el
  // rebote del contenido viejo. `commitSeq === 0` es el mount inicial (fade ya
  // en 1) → no anima. reduced-motion: opacidad parkeada en 1.
  useEffect(() => {
    if (commitSeq === 0) return
    if (reduceMotion) {
      fade.value = 1
      return
    }
    fade.value = withTiming(1, SWAP_IN)
  }, [commitSeq, reduceMotion, fade])

  // Cancelación SOLO al desmontar: cancelar en el cleanup de los efectos de
  // arriba mataría el fundido que acaban de programar.
  useEffect(() => () => cancelAnimation(fade), [fade])

  const style = useAnimatedStyle(() => ({ opacity: fade.value }))
  return { shown, style }
}

/** `useSwapFade` envuelto sobre un <Text>: el string viejo se funde, el nuevo
 *  entra. No usa el count-up del proyecto a propósito — ver la nota en
 *  `GastosHero`.
 *
 *  DOS CAPAS a propósito (no volver a un solo AnimatedText): el estilo del
 *  caller trae material decorativo (el monto del hero lleva `textShadow` —
 *  en dark, un glow verde de radio 26), y material sobre el MISMO nodo que
 *  Reanimated anima se pinta como un RECTÁNGULO fantasma fuera de su forma
 *  (QA del owner en device, dark, 2026-08-17 — mismo mecanismo ya visto con
 *  `cssGradient` sobre nodo animado en el wrapped). La Animated.View de
 *  afuera SOLO anima la opacidad; el <Text> de adentro es estático y su
 *  sombra se dibuja por glifo, como corresponde. */
function SwapText({
  value,
  style,
  reduceMotion,
  numberOfLines,
}: {
  value: string
  style?: StyleProp<TextStyle>
  reduceMotion: boolean
  numberOfLines?: number
}) {
  const swap = useSwapFade(value, value, reduceMotion)
  // A11Y · SIN `accessibilityLabel` a propósito: el label se pinneaba al valor
  // ENTRANTE (`value`) mientras el nodo renderiza el SALIENTE (`swap.shown`)
  // durante el valle del fundido (~120ms), así que el string anunciado quedaba
  // divorciado del renderizado. El <Text> ya expone sus children al lector, que
  // es exactamente lo que se ve en pantalla en todo momento.
  return (
    <Animated.View style={swap.style}>
      <Text numberOfLines={numberOfLines} style={style}>
        {swap.shown}
      </Text>
    </Animated.View>
  )
}

// ─── ③ Hero forest ───────────────────────────────────────────────────

/** Barra de categoría — el fill trepa de 0 → pct, y TWEENEA de pct viejo → pct
 *  nuevo cuando una categoría sobrevive al filtro (antes reseteaba a 0 y volvía
 *  a crecer: se leía como recarga, no como cambio). reduced-motion arranca/queda
 *  lleno.
 *
 *  UN SOLO LENGUAJE DE MOTION (FIX B3). El grow decorativo largo
 *  (`GROW_TWEEN`/meterFill 820ms) es SOLO para el primer reveal de la pantalla
 *  (`initialReveal`). En cualquier cambio POSTERIOR (una filtrada), todas las
 *  barras — sobrevivan (pct→pct) o aparezcan nuevas (0→pct) — usan la duración
 *  corta `VALUE_TWEEN` (240ms). Antes las barras nuevas remontaban con
 *  `grownRef=false` y crecían 820ms mientras la superviviente tweeneaba 240ms:
 *  dos duraciones a la vez y el hero seguía animando ~500ms después de que el
 *  bloque ya había cruzado. La key sigue siendo `c.name` (identidad estable por
 *  categoría → la superviviente conserva su instancia y tweenea de verdad).
 *
 *  B2 · el nombre/valor NO se vuelven a crossfadear acá: el bloque de categorías
 *  entero ya cruza con `catSwap` (una sola transición por filtrada). Los textos
 *  se actualizan en el valle (opacidad 0, invisibles) y reaparecen con el
 *  fade-in del bloque. Antes cada texto tenía su propio SwapText anidado → doble
 *  parpadeo cuando una categoría sobrevivía pero su value cambiaba.
 *
 *  PERF: se anima `transform: [{ scaleX }]` con `transformOrigin:'left'`, NO
 *  `width`. Animar width empuja un layout al shadow tree en cada frame (y por
 *  eso hacía falta medir el track con onLayout — ese estado ya no existe). El
 *  único costo visual es que el radio del extremo derecho del fill se comprime
 *  con la escala; sobre una barra de 7px de alto dentro de un track con
 *  `overflow:hidden` + radio propio, es imperceptible. */
function CategoryBar({
  s,
  category,
  reduceMotion,
  initialReveal,
}: {
  s: GastosSpec
  category: HeroCategory
  reduceMotion: boolean
  /** `true` SOLO en el primer reveal de la pantalla → grow decorativo largo.
   *  `false` (default de cualquier cambio de filtro) → tween corto, un solo
   *  lenguaje con las barras que sobreviven. */
  initialReveal: boolean
}) {
  const pct = Math.min(1, Math.max(0, category.pct / 100))
  const fill = useSharedValue(0)
  const grownRef = useRef(false)
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(fill)
      fill.value = pct
      grownRef.current = true
      return
    }
    if (!grownRef.current) {
      grownRef.current = true
      fill.value = 0
      // Mount de la PANTALLA → grow largo (decorativo). Barra que aparece por
      // un cambio de filtro → tween corto, MISMA duración que las supervivientes
      // (rama de abajo): una sola transición por filtrada.
      fill.value = withTiming(pct, initialReveal ? GROW_TWEEN : VALUE_TWEEN)
      return
    }
    fill.value = withTiming(pct, VALUE_TWEEN)
  }, [pct, reduceMotion, fill, initialReveal])
  useEffect(() => () => cancelAnimation(fill), [fill])
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }))
  // El color de la categoría también cambia con el filtro → tween en vez de
  // salto (mismo token que el resto de los cambios de valor). El color arranca
  // EN la shared value (no `withTiming` dentro del useAnimatedStyle) para que
  // el primer frame tenga un valor definido y no interpole desde undefined.
  const swatch = useSharedValue<string>(category.color)
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(swatch)
      swatch.value = category.color
      return
    }
    swatch.value = withTiming(category.color, VALUE_TWEEN)
  }, [category.color, reduceMotion, swatch])
  useEffect(() => () => cancelAnimation(swatch), [swatch])
  const swatchStyle = useAnimatedStyle(() => ({ backgroundColor: swatch.value }))
  return (
    <View style={styles.catBlock}>
      <View style={styles.catHead}>
        <View style={styles.catNameRow}>
          <Animated.View style={[styles.catSwatch, swatchStyle]} />
          {/* B2: texto plano — la transición la posee el bloque (catSwap). */}
          <Text style={[styles.catName, { color: s.catTextInk }]}>{category.name}</Text>
        </View>
        <Text style={[styles.catValue, { color: s.catTextInk }]}>{category.value}</Text>
      </View>
      <View style={[styles.catTrack, { backgroundColor: s.catTrackBackground, boxShadow: s.catTrackShadow }]}>
        <Animated.View style={[styles.catFill, fillStyle, { experimental_backgroundImage: s.catFillCss }]} />
      </View>
    </View>
  )
}

/**
 * Mini-barra de "ÚLTIMOS 7 DÍAS". El alto y el tono cambian con el filtro.
 *
 * PERF: no se anima `height` (layout por frame). La barra vive a alto FIJO
 * (BAR_MAX_H) dentro de un contenedor recortado, y lo que se anima es un
 * `translateY` — transform puro en el UI thread, cero layout. Elegimos
 * translateY sobre scaleY porque el recorte conserva el radio inferior y el
 * borde superior visible es el radio REAL de la barra: en reposo queda
 * pixel-idéntico al aprobado (un scaleY aplastaría el radio del tope).
 */
function HeroDayBar({
  h,
  color,
  reduceMotion,
}: {
  h: number
  color: string
  reduceMotion: boolean
}) {
  const shift = useSharedValue(BAR_MAX_H - h)
  const tone = useSharedValue<string>(color)
  useEffect(() => {
    const target = BAR_MAX_H - h
    if (reduceMotion) {
      cancelAnimation(shift)
      cancelAnimation(tone)
      shift.value = target
      tone.value = color
      return
    }
    shift.value = withTiming(target, VALUE_TWEEN)
    tone.value = withTiming(color, VALUE_TWEEN)
  }, [h, color, reduceMotion, shift, tone])
  useEffect(
    () => () => {
      cancelAnimation(shift)
      cancelAnimation(tone)
    },
    [shift, tone],
  )
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: shift.value }],
    backgroundColor: tone.value,
  }))
  return (
    <View style={styles.heroBarClip}>
      <Animated.View style={[styles.heroBarFill, barStyle]} />
    </View>
  )
}

export interface GastosHeroProps {
  mode: GastosMode
  tag: string
  chip: string
  total: string
  prom: string
  categories: HeroCategory[]
  /** Barras de "ÚLTIMOS 7 DÍAS" derivadas de datos reales: valores [0,1]
   *  (uno por día). Sin este prop se cae a `BAR_SPECS` (demo, idéntico al
   *  aprobado). El pico se marca con `Math.max`; las alturas mapean [0,1] →
   *  [BAR_MIN_H, BAR_MAX_H] sin cambiar el visual. */
  recentDailyBars?: number[]
  /** Usuario nuevo / ciclo sin movimientos → H-4/EV1: pozo "$0" + sub + Brot
   *  `wave`, promedio "—" con las 7 barras en MOLDE PUNTEADO y, en lugar de las
   *  barras de categoría, la promesa de que van a aparecer.
   *
   *  v2 (2026-08-04) CAMBIA el hero vacío aprobado en v1, que ocultaba promedio
   *  y categorías: el molde punteado le dice al usuario nuevo QUÉ va a ver acá,
   *  cosa que el hueco en blanco no hacía. */
  empty?: boolean
  emptySub?: string
  emptyCtaLabel?: string
  onPressEmptyCta?: () => void
  /** v2 · H-2/H-3 — sublínea dentro del pozo, bajo el monto: "📁 Solo lectura"
   *  (edición cerrada) o "⚠ N días fuera del ciclo" (ciclo vencido). */
  subline?: string
  /** `warn` la tiñe de durazno (H-3). Default neutra (H-2/H-4). */
  sublineTone?: 'neutral' | 'warn'
  /** v2 · Brot dentro del pozo, anclado al dato que comenta: `think` en edición
   *  cerrada, `worried` con días fuera, `wave` en el ciclo vacío. Ausente en
   *  H-1 (ciclo normal: no hay nada que comentar). */
  brotPose?: BrotPose
  /** Anima el Brot del pozo. El cableado real lo pasa `false` — el hero vive en
   *  el `ListHeaderComponent` del feed (ver `GastosOverdueBanner`). */
  animated?: boolean
  /** v2 · EV1 — pie del hero vacío, donde irían las barras de categoría. */
  emptyCategoriesHint?: string
  /** Pausa las partículas del hero. Se mapea a `animated={!paused}` de
   *  `BrotParticles` (el nombre `paused` se conserva porque es el que ya
   *  usan `GastosHeader` y `GastosCalendar` para sus propios loops).
   *  Default false → sin cambio.
   *
   *  Único caso de uso vigente: la tab Gastos NO está enfocada. Con
   *  `freezeOnBlur:false` el hero queda montado y su campo grabaría un
   *  SkPicture por frame para nadie. NO existe pausa por scroll: hubo una y
   *  se revirtió tras un A/B contra la pantalla vieja.
   *
   *  Redundante-pero-explícito: `BrotParticles` ya gatea por foco por su
   *  cuenta (`useOptionalIsFocused`) además de por reduced-motion. Se
   *  mantiene el prop para que el kit no dependa de un detalle interno del
   *  componente y para que el preview de Settings→Dev pueda forzarlo. */
  paused?: boolean
}

export function GastosHero({
  mode,
  tag,
  chip,
  total,
  prom,
  categories,
  recentDailyBars,
  empty = false,
  emptySub = 'Todavía no registras gastos en este ciclo.',
  emptyCtaLabel = '+ Registrar gasto',
  onPressEmptyCta,
  paused = false,
  subline,
  sublineTone = 'neutral',
  brotPose,
  animated = true,
  emptyCategoriesHint = 'Tus categorías con más peso van a aparecer aquí 🌱',
}: GastosHeroProps) {
  const s = GASTOS_SPEC[mode]
  // Una sola lectura de reduced-motion para todo el hero (context read barato),
  // bajada por VALOR a las sub-partes animadas.
  const reduceMotion = useReducedMotion()

  // Barras 7 días: reales cuando llega `recentDailyBars` (mismo mapeo
  // absoluto que GastosAverageBars — h = clamp(v,0,1)·max, min BAR_MIN_H),
  // con el pico (índice del máximo) marcado 'peak'. Fallback = BAR_SPECS
  // (demo). El fill visual de las barras no cambia.
  const bars = useMemo<{ h: number; tone: 'bright' | 'dim' | 'peak' }[]>(() => {
    if (!recentDailyBars || recentDailyBars.length === 0) return BAR_SPECS
    const peak = Math.max(...recentDailyBars)
    const peakIdx = recentDailyBars.indexOf(peak)
    return recentDailyBars.map((v, i) => {
      const clamped = Math.max(0, Math.min(1, v))
      const h = Math.max(BAR_MIN_H, Math.round(clamped * BAR_MAX_H))
      const tone: 'bright' | 'dim' | 'peak' =
        peak > 0 && i === peakIdx ? 'peak' : clamped < 0.4 ? 'dim' : 'bright'
      return { h, tone }
    })
  }, [recentDailyBars])

  // La lista de top-categorías cambia de CONTENIDO y de CANTIDAD con el filtro
  // (1 categoría al filtrar, hasta 3 sin filtro) → las keys cambian y no hay
  // par viejo↔nuevo que tweenear por hijo. Se cruza el BLOQUE entero con un
  // único shared value (barato) y adentro cada CategoryBar tweenea lo suyo.
  const catSignature = useMemo(
    () => categories.map((c) => `${c.name}|${c.value}|${c.color}|${c.pct}`).join('~'),
    [categories],
  )
  const catSwap = useSwapFade(categories, catSignature, reduceMotion)

  // El grow decorativo largo (meterFill 820ms) de las barras es SOLO para la
  // PRIMERA vez que el bloque de categorías se revela (mount de la pantalla con
  // datos). Cualquier cambio posterior (filtro) usa la duración corta → una sola
  // transición por filtrada (ver CategoryBar / FIX B3). El flag se baja recién
  // cuando el bloque se renderizó con datos, para que el reveal vacío→con-datos
  // conserve el grow decorativo.
  const hasRevealedRef = useRef(false)
  const initialReveal = !hasRevealedRef.current
  useEffect(() => {
    if (!empty && categories.length > 0) hasRevealedRef.current = true
  }, [empty, categories.length])

  // Hero VACÍO (H-4 / EV1) — mantiene contenedor/partículas/forest del hero
  // aprobado y conserva TODA la estructura del hero lleno, pero en molde: chip
  // "0 mov", pozo "$0" + sub + Brot `wave`, `PROMEDIO DÍA —` con las 7 barras
  // punteadas (con sus letras de día, la única pista de que el bloque es una
  // semana) y, cerrando, la promesa de las categorías en vez de sus barras.
  if (empty) {
    return (
      <View style={[styles.hero, { experimental_backgroundImage: s.heroGradientCss, boxShadow: s.heroShadow }]}>
        <View style={styles.heroParticles} pointerEvents="none">
          {/* Mismo campo que el hero lleno — ver la nota larga allá. */}
          <BrotParticles
            {...neoParticlePresets.hero}
            borderRadius={GASTOS_RADII.hero}
            animated={!paused}
          />
        </View>
        <View>
          <View style={styles.heroTopRow}>
            <View style={styles.heroTagRow}>
              <View style={[styles.heroDot, { backgroundColor: s.heroDot }]} />
              <Text style={[styles.heroTag, { color: s.heroTagInk }]}>{tag}</Text>
            </View>
            {chip ? (
              <View style={[styles.heroChip, { backgroundColor: s.heroChipBackground, boxShadow: s.heroChipShadow }]}>
                <Text numberOfLines={1} style={[styles.heroChipText, { color: s.heroChipInk }]}>
                  {chip}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.heroWell, styles.heroWellRow, { backgroundColor: s.wellBackground, boxShadow: s.wellShadow }]}>
            <View style={styles.heroWellTexts}>
              <Text
                style={[
                  styles.heroTotal,
                  { color: s.amountInk },
                  glowSafeTextShadow({
                    color: s.amountShadowColor,
                    offset: s.amountShadowOffset,
                    radius: s.amountShadowRadius,
                  }),
                ]}
              >
                {total}
              </Text>
              <Text style={[styles.heroEmptySub, { color: s.emptyHeroSubInk }]}>{emptySub}</Text>
            </View>
            <View style={styles.heroWellBrot}>
              <BrotMascot pose={brotPose ?? 'wave'} size={58} shadow={false} animated={animated} />
            </View>
          </View>

          <View style={styles.heroStatsRow}>
            <View>
              <Text style={[styles.heroStatLabel, { color: s.heroLabelInk }]}>PROMEDIO DÍA</Text>
              <Text style={[styles.heroStatValue, { color: s.heroValueInk }]}>—</Text>
            </View>
            <GhostWeekBars s={s} />
          </View>

          <View style={[styles.heroEmptyCatFoot, { borderTopColor: s.heroDividerColor }]}>
            <Text style={[styles.heroEmptyCatText, { color: s.heroSublineInk }]}>{emptyCategoriesHint}</Text>
          </View>

          {/* EV1 no dibuja CTA en el hero (el "+ Registrar mi primer gasto"
              vive en el bloque de movimientos, EV6). Se CONSERVA el de v1: es
              la acción principal de un first-run y sacarla sería un cambio de
              comportamiento, no de diseño. Queda hugging a la izquierda para no
              competir con el CTA de abajo. */}
          {onPressEmptyCta ? (
            <View style={styles.heroEmptyCtaRow}>
              <GastosEmptyCta
                label={emptyCtaLabel}
                ink={s.ctaCreamInk}
                gradientCss={s.ctaCreamGradientCss}
                shadow={s.ctaCreamShadow}
                onPress={onPressEmptyCta}
              />
            </View>
          ) : null}
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.hero, { experimental_backgroundImage: s.heroGradientCss, boxShadow: s.heroShadow }]}>
      <View style={styles.heroParticles} pointerEvents="none">
        {/* PARTÍCULAS DEL REDISEÑO — pedido owner 2026-07-28 ("volver a las
            partículas del rediseño"). Vuelve el campo del handoff: el port
            Skia 1:1 de `<brot-particles>` (drift vertical lento con wrap +
            sway sinusoidal + twinkle 0.25–0.8 + halo 2.6×), con la paleta y
            el count EXACTOS del mockup — `neoParticlePresets.hero` =
            `colors="#C9F3C6,#FBD9BC,#EFF6E2" count="10"`, igual que
            `design/gastos-2026-07/gastos.dc.html:39`.
            Esto REVIERTE, solo para Gastos, el swap a `CardParticles` (vuelo
            errático tipo Lissajous) que se hizo a pedido del owner el
            2026-07-21 y que el kit de Gastos había heredado de Home; el hero
            de Home sigue con `CardParticles` (ver `home-screen.tsx`).
            `borderRadius` EXPLÍCITO además del `overflow:'hidden'` del
            wrapper: en Android el clip de esquinas redondeadas sobre un
            <Canvas> de Skia no es confiable, por eso el componente trae su
            propio `clipRRect` (y por eso el preview aprobado lo pasa).
            GATE DE COSTO: `animated` apaga el frame callback (cero trabajo
            por frame, frame estático). Además el componente gatea SOLO por
            su cuenta con foco de navegación + reduced-motion, que colapsa
            `deviceYearClass < 2020` → en gama baja el campo no anima. */}
        <BrotParticles
          {...neoParticlePresets.hero}
          borderRadius={GASTOS_RADII.hero}
          animated={!paused}
        />
      </View>
      <View>
        <View style={styles.heroTopRow}>
          <View style={styles.heroTagRow}>
            <View style={[styles.heroDot, { backgroundColor: s.heroDot }]} />
            <Text style={[styles.heroTag, { color: s.heroTagInk }]}>{tag}</Text>
          </View>
          <View style={[styles.heroChip, { backgroundColor: s.heroChipBackground, boxShadow: s.heroChipShadow }]}>
            <SwapText
              value={chip}
              style={[styles.heroChipText, { color: s.heroChipInk }]}
              reduceMotion={reduceMotion}
              numberOfLines={1}
            />
          </View>
        </View>

        {/* Montos del hero (total / promedio): crossfade corto en vez de salto.
            NO se usa el count-up del proyecto (CountUpText) a propósito:
             · la variante FLUIDA formatea en un worklet con separadores
               es-AR hard-codeados (no puede tocar Intl) → dejaría el monto de
               Gastos fuera del `formatMoney` locale-aware que baja la pantalla;
             · la variante JS sí respeta el formato, pero muestrea cada ~52ms:
               dentro del presupuesto de 150-250ms de esta transición serían
               ~4 fotogramas de dígitos, que se lee como ruido y no como conteo.
            El crossfade cumple el objetivo (que el cambio se sienta suave) sin
            tocar el string final ni el idioma. */}
        {/* v2 · H-2/H-3 — el pozo pasa a fila cuando hay algo que comentar: el
            monto (+ sublínea de contexto) a la izquierda y el Brot a la derecha,
            anclado AL DATO que comenta (nunca decorativo suelto). Sin `subline`
            ni `brotPose` el pozo queda exactamente como el aprobado en v1. */}
        <View
          style={[
            styles.heroWell,
            brotPose ? styles.heroWellRow : null,
            { backgroundColor: s.wellBackground, boxShadow: s.wellShadow },
          ]}
        >
          <View style={brotPose ? styles.heroWellTexts : null}>
            <SwapText
              value={total}
              reduceMotion={reduceMotion}
              style={[
                styles.heroTotal,
                { color: s.amountInk },
                glowSafeTextShadow({
                  color: s.amountShadowColor,
                  offset: s.amountShadowOffset,
                  radius: s.amountShadowRadius,
                }),
              ]}
            />
            {subline ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.heroSubline,
                  { color: sublineTone === 'warn' ? s.heroSublineWarnInk : s.heroSublineInk },
                ]}
              >
                {subline}
              </Text>
            ) : null}
          </View>
          {brotPose ? (
            <View style={styles.heroWellBrot}>
              <BrotMascot pose={brotPose} size={58} shadow={false} animated={animated} />
            </View>
          ) : null}
        </View>

        <View style={styles.heroStatsRow}>
          <View>
            <Text style={[styles.heroStatLabel, { color: s.heroLabelInk }]}>PROMEDIO DÍA</Text>
            <SwapText
              value={prom}
              style={[styles.heroStatValue, { color: s.heroValueInk }]}
              reduceMotion={reduceMotion}
            />
          </View>
          <View style={styles.heroSevenCol}>
            <Text style={[styles.heroStatLabel, styles.heroSevenLabel, { color: s.heroLabelInk }]}>ÚLTIMOS 7 DÍAS</Text>
            <View style={styles.heroBars}>
              {bars.map((bar, i) => (
                <HeroDayBar
                  key={i}
                  h={bar.h}
                  color={bar.tone === 'peak' ? s.bar7Peak : bar.tone === 'dim' ? s.bar7Dim : s.bar7Bright}
                  reduceMotion={reduceMotion}
                />
              ))}
            </View>
          </View>
        </View>

        <Text style={[styles.heroStatLabel, styles.heroCatLabel, { color: s.heroLabelInk }]}>MÁS PESO POR CATEGORÍA</Text>
        <Animated.View style={[styles.catList, catSwap.style]}>
          {catSwap.shown.map((c) => (
            <CategoryBar
              key={c.name}
              s={s}
              category={c}
              reduceMotion={reduceMotion}
              initialReveal={initialReveal}
            />
          ))}
        </Animated.View>
      </View>
    </View>
  )
}

// ─── ④ Calendario ────────────────────────────────────────────────────

// Halo de warning de los días FUERA-DE-CICLO ('fuera'): respira lento (breath
// ~2.4s, mismo patrón/tokens que CycleTriggerDot) para ALERTAR que son días de
// gasto que quedaron FUERA del ciclo por el sueldo sin confirmar. Gateado por
// reduced-motion → en reposo/reduced queda estático (opacity base). El color
// del halo es el ink de fuera (ya en paleta, sin colores nuevos).
//
// PERF (FIX A2): extraído a su PROPIO subcomponente para que solo las celdas
// 'fuera' (normalmente 0) monten el useSharedValue + useEffect + useAnimatedStyle
// del pulse. Antes vivía inline en DayCellView, así que las ~30 celdas normales
// pagaban esos hooks aunque nunca dibujaran el halo. pointerEvents none → no
// tapa el número.
//
// PERF (paused): mismo gate por FOCO que el dot del trigger y las partículas del
// hero — con `freezeOnBlur:false` el calendario queda montado en otra tab y este
// `withRepeat(-1)` seguiría latiendo invisible.
function FueraGlow({ s, paused }: { s: GastosSpec; paused: boolean }) {
  const reduceMotion = useReducedMotion()
  const outPulse = useSharedValue(0)
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(outPulse)
      outPulse.value = 0
      return
    }
    // Igual que `CycleTriggerDot`: la pausa por foco congela en su lugar.
    if (paused) {
      cancelAnimation(outPulse)
      return
    }
    startPulseLoop(outPulse, {
      duration: decorativeDurations.pulse * 2,
      easing: motionEasings.warm,
    })
    return () => cancelAnimation(outPulse)
  }, [reduceMotion, paused, outPulse])
  const outGlowStyle = useAnimatedStyle(() => ({ opacity: 0.15 + outPulse.value * 0.5 }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.dayBadGlow, { boxShadow: `0 0 7px 0 ${s.dayFueraInk}` }, outGlowStyle]}
    />
  )
}

/**
 * Trama diagonal de peligro de los días EXTENDIDOS, en movimiento.
 *
 * Tres decisiones no obvias:
 *
 * 1. **Dos capas.** El gradiente vive en un `View` ESTÁTICO y quien anima es
 *    su `Animated.View` padre. Poner `experimental_backgroundImage` en el
 *    nodo que Reanimated anima pinta un rectángulo fantasma FUERA de su caja
 *    (visible sólo en device, no en el preview web).
 *
 * 2. **El recorte va en un wrapper, no en la celda.** `overflow:'hidden'` en
 *    iOS es `clipsToBounds`, que recorta también la sombra PROPIA del nodo —
 *    ponerlo en `dayCell` borraría el anillo del día. Por eso el clip vive en
 *    este wrapper absoluto, que no lleva sombra.
 *
 * 3. **El desplazamiento es exactamente un período.** La trama repite cada
 *    10px sobre el eje del gradiente (5 pintados + 5 vacíos) y el eje está a
 *    135°, así que un corrimiento en X de 10/cos(45°) ≈ 14.14 devuelve la
 *    misma imagen: el loop cierra sin salto. Con cualquier otro valor la
 *    cinta "pega" un tirón en cada vuelta.
 *
 * Gates iguales a `FueraGlow`: reduced-motion congela la trama (queda quieta,
 * no desaparece — sigue siendo la señal de que el día entró de más) y el
 * `paused` por foco evita que el `withRepeat(-1)` siga corriendo con el
 * calendario montado en otra tab.
 */
/**
 * Las bandas, quietas. `Svg` de tamaño fijo; el recorte lo pone el llamador.
 * La geometría (y el porqué del SVG en vez de un gradiente) vive en
 * `hazard-geometry`, con tests.
 */
const HAZARD_PATH = buildHazardPath()

function HazardStripes({ color }: { color: string }) {
  return (
    <Svg width={HAZARD_W} height={HAZARD_H}>
      <Path d={HAZARD_PATH} stroke={color} strokeWidth={HAZARD_BAND} fill="none" />
    </Svg>
  )
}

function ExtendidoHazard({ s, paused }: { s: GastosSpec; paused: boolean }) {
  const reduceMotion = useReducedMotion()
  const drift = useSharedValue(0)
  useEffect(() => {
    if (reduceMotion || paused) {
      cancelAnimation(drift)
      return
    }
    drift.value = 0
    drift.value = withRepeat(
      withTiming(HAZARD_STEP, {
        duration: decorativeDurations.shimmer,
        easing: Easing.linear,
      }),
      -1,
      false,
    )
    return () => cancelAnimation(drift)
  }, [reduceMotion, paused, drift])
  const driftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.value }],
  }))
  return (
    <View pointerEvents="none" style={styles.hazardClip}>
      <Animated.View pointerEvents="none" style={[styles.hazardLayer, driftStyle]}>
        <HazardStripes color={s.dayExtendidoStripeInk} />
      </Animated.View>
    </View>
  )
}

// PERF (FIX A3/A4): `React.memo` (compara shallow cell/s/onPress/reduceMotion —
// todas ref/valor-estables mientras no recompute el calendario) → los
// re-renders del ListHeader ajenos al calendario (toggle dropdown, filtro, foco
// de día) NO reconcilian las ~30 celdas. `reduceMotion` llega por prop desde
// GastosCalendar (VALOR de una única fuente de verdad, ver la nota allá). Las
// celdas BLANK no llegan acá: se renderizan como <View> plano en el parent
// (FIX A1) → 0 hooks. Por eso NO hay early-return de blank (violaría
// rules-of-hooks al ir antes de usePressScale).
const DayCellView = memo(function DayCellView({
  s,
  cell,
  onPress,
  reduceMotion,
  paused,
  a11y,
}: {
  s: GastosSpec
  cell: DayCell
  onPress?: (n: number, iso?: string) => void
  reduceMotion: boolean
  /** Gate por foco del halo de los días FUERA (ver FueraGlow). */
  paused: boolean
  /** Copy traducida del label del lector (la baja la pantalla). */
  a11y: CalendarA11yStrings
}) {
  const press = usePressScale({ pressedScale: 0.88, reduceMotion })

  const kind = cell.kind ?? 'ok'
  const isFuera = kind === 'fuera'
  let bg: string | undefined
  let ink: string
  let weight: '700' | '800' | '900'
  let stateShadow: string
  if (kind === 'empty') {
    // Día pasado SIN gastos → NEUTRO: sin fill ni sombra de estado, solo el
    // número en ink muted (weekdayInk, ya en paleta). La sombra se OMITE abajo
    // (showStateShadow) salvo que la celda esté seleccionada (anillo). Queda
    // más plano que 'fut' (que lleva pozo inset) → distinguible.
    bg = undefined
    ink = s.dayEmptyInk
    weight = '700'
    stateShadow = '' // no usado: showStateShadow omite la sombra en 'empty'
  } else if (kind === 'bad') {
    bg = s.dayExcesoBackground
    ink = s.dayExcesoInk
    weight = '900'
    stateShadow = s.dayExcesoShadow
  } else if (kind === 'now') {
    bg = s.dayHoyBackground
    ink = s.dayHoyInk
    weight = '900'
    stateShadow = s.dayHoyShadow
  } else if (kind === 'fut') {
    bg = s.dayFuturoBackground
    ink = s.dayFuturoInk
    weight = '700'
    stateShadow = s.dayFuturoShadow
  } else if (kind === 'fuera') {
    // El fondo base es SÓLIDO y las bandas van encima (`HazardStripes`): la
    // trama del handoff es un `repeating-linear-gradient` y RN 0.81 lo
    // descarta sin avisar, así que estas celdas se venían dibujando sin
    // ningún fondo.
    bg = s.dayFueraBackground
    ink = s.dayFueraInk
    weight = '900'
    stateShadow = s.dayFueraShadow
  } else if (kind === 'none') {
    // v2 · D-atom "sin datos" — MOLDE PUNTEADO. Se usa en el calendario recién
    // arrancado (CAL-4/EV2): los días que todavía no llegaron se dibujan como
    // el contorno de lo que se va a pintar, no como un pozo apagado. La copy
    // de EV2 se apoya en esto ("Los punteados son días que todavía no
    // llegaron"), así que el trazo se dibuja con SVG — un `dashed` de RN se
    // rinde sólido en Android sobre borderRadius (ver parts/ghost.tsx).
    bg = undefined
    ink = s.dashInk
    weight = '800'
    stateShadow = '' // no usado: showStateShadow lo omite
  } else {
    bg = s.dayBienBackground
    ink = s.dayBienInk
    weight = '800'
    stateShadow = s.dayBienShadow
  }

  // selRing REEMPLAZA la sombra de estado (spread sin blur → sin layout
  // shift; NO borderWidth). Los días FUERA conservan su anillo+glow propio.
  const selected = kind !== 'fuera' && cell.selected
  // DÍA EXTENDIDO: anillo durazno ADITIVO sobre la sombra de estado + la cinta
  // de peligro animada (`ExtendidoHazard`). El día conserva el fill de su mood
  // porque SÍ cuenta para el saldo de este ciclo — por eso la trama alterna
  // con TRANSPARENTE. Distinto de `fuera`, cuya trama es sustitutiva y borra
  // el mood (ese día está en limbo y no cuenta para ningún saldo).
  // Seleccionado manda `daySelRing`: no se apilan dos anillos en el mismo
  // offset, y el día extendido sigue legible por la cinta, el sublabel y el
  // chip del day-detail.
  const extendido = cell.ext === true && kind !== 'fuera'
  const baseShadow = selected ? s.daySelRing : stateShadow
  const shadow =
    extendido && !selected
      ? baseShadow
        ? `${baseShadow}, ${s.dayExtendidoRing}`
        : s.dayExtendidoRing
      : baseShadow
  // 'empty' (día pasado sin gastos) y 'none' (molde punteado) NO llevan sombra
  // de estado — quedan planos. Salvo seleccionado, donde el anillo
  // (daySelRing) sí se muestra; y salvo extendido, que necesita emitir su
  // anillo aunque el día no tenga gastos.
  // `dayHoyShadow` es '' a propósito (la grilla del handoff no le pone sombra
  // a hoy), así que el token vacío también apaga la capa — si no, RN recibe
  // `boxShadow: ''`.
  const showStateShadow =
    ((kind !== 'empty' && kind !== 'none') || selected || extendido) && shadow !== ''

  const inner = (
    <View
      style={[
        styles.dayCell,
        showStateShadow ? { boxShadow: shadow } : null,
        bg ? { backgroundColor: bg } : null,
      ]}
    >
      {/* Trama de los días FUERA-DE-CICLO. Quieta (a diferencia de la de los
          extendidos): un día fuera no está "pasando", ya quedó afuera. */}
      {isFuera ? (
        <View pointerEvents="none" style={styles.hazardClip}>
          <View style={styles.hazardLayer}>
            <HazardStripes color={s.dayFueraStripeInk} />
          </View>
        </View>
      ) : null}
      {/* v2 · el contorno del molde va DEBAJO del contenido y no come layout
          (absolute), así que la celda mantiene su alto fijo. Se apaga cuando la
          celda está seleccionada: ahí manda el anillo. */}
      {kind === 'none' && !selected ? (
        <GhostOutline stroke={s.dashStroke} radius={GASTOS_RADII.day} />
      ) : null}
      {/* Halo de warning (solo días FUERA-DE-CICLO): subcomponente propio que
          monta el pulse solo para estas celdas (FIX A2). */}
      {isFuera ? <FueraGlow s={s} paused={paused} /> : null}
      {/* Cinta de peligro de los días EXTENDIDOS. Va DEBAJO del número (antes
          en el orden de hermanos) y encima del fill, así que el mood se sigue
          leyendo a través de los tramos vacíos de la trama. Sólo la montan
          estas celdas: los hooks del loop no los paga la grilla entera. */}
      {extendido ? <ExtendidoHazard s={s} paused={paused} /> : null}
      {/* maxFontSizeMultiplier · la celda es una caja de alto FIJO (dayCell):
          a fontScale grande el número se recortaba en vez de reflowear. 1.3
          crece lo suficiente para ayudar sin romper la grilla; a fontScale 1
          (el caso del preview aprobado) no cambia nada. */}
      <Text
        maxFontSizeMultiplier={1.3}
        style={[styles.dayLabel, { color: ink, fontWeight: weight, fontFamily: nunitoFamily(weight) }]}
      >
        {cell.label}
      </Text>
      {cell.sub ? (
        // numberOfLines={1} · la celda es una caja de alto FIJO (40) y el sub
        // vive dentro. Una palabra que no entra a lo ancho hacía wrap a dos
        // líneas y se derramaba fuera de la celda, pisando la fila de abajo
        // ("EXTENDIDO" partido en "PRÓRROG" + "A"). El sub es una MARCA, no
        // copy: si no entra, se corta.
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={[styles.daySub, { color: ink }]}
        >
          {cell.sub}
        </Text>
      ) : null}
      {cell.sprout ? (
        <View style={styles.daySprout}>
          <LeafGlyph color={s.daySproutInk} size={13} strokeWidth={2.8} />
        </View>
      ) : null}
      {cell.hoyDot ? <View style={[styles.dayHoyDot, { backgroundColor: s.dayHoyDot }]} /> : null}
    </View>
  )

  if (!onPress || cell.n == null) return <View style={styles.dayFlex}>{inner}</View>
  const n = cell.n
  return (
    <AnimatedPressable
      accessibilityRole="button"
      // A11Y · el estado del día se comunicaba SOLO por color (verde `ok` vs
      // salmón `bad`), así que con lector de pantalla la grilla se leía como 30
      // números idénticos. El label compuesto agrega el estado en texto sin
      // tocar el fill aprobado. `selected` va por accessibilityState (no dentro
      // del label) para que VoiceOver/TalkBack lo anuncien con su propia voz.
      accessibilityLabel={composeDayCellA11yLabel(cell, a11y)}
      accessibilityState={{ selected: Boolean(cell.selected) }}
      // El 3 NO es arbitrario: los gaps de la grilla son 7 (calRow gap 7 /
      // calRowGap marginTop 7), así que 3+3=6 consume el gap y deja 1px — las
      // áreas táctiles quedan CONTIGUAS pero NO se solapan. Con solape, el
      // toque en la frontera resolvería por orden de render y no por cercanía
      // (mis-taps en una grilla de 30 destinos).
      //
      // NÚMEROS REALES (el ancho de la celda es FLUIDO, `dayFlex: flex 1`):
      //   ancho = (pantalla − 40 padding del list − 32 padding de calCard − 42
      //            de los 6 gaps de 7) / 7 = (pantalla − 114) / 7
      //   · 430pt (iPhone Pro Max) → 45,1 → 51,1 con el slop
      //   · 393pt (iPhone 15/16)   → 39,9 → 45,9  ✔ 44
      //   · 375pt (iPhone SE/mini) → 37,3 → 43,3  ✖ (a 0,7 del mínimo)
      //   · 360dp (Android gama baja, Galaxy A) → 35,1 → 41,1  ✖
      //   · 320pt                   → 29,4 → 35,4  ✖
      // Vertical siempre cumple: 40 de alto + 3+3 = 46. O sea el objetivo de
      // 44×44 se alcanza de 393pt para arriba; por debajo NO, y no puede
      // alcanzarse con más slop (el gap de 7 lo acota). Cerrar esos ~3-9pt
      // exige cambiar la geometría APROBADA de la grilla (gap 7→3 y/o padding
      // de calCard 16→8), que es un cambio visual del handoff y necesita el OK
      // del owner. Queda registrado, no "resuelto por comentario".
      hitSlop={{ top: 3, bottom: 3, left: 3, right: 3 }}
      onPress={() => onPress(n, cell.iso)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[styles.dayFlex, press.animatedStyle]}
    >
      {inner}
    </AnimatedPressable>
  )
})

/**
 * Copy de lector de pantalla de las celdas del calendario.
 *
 * i18n · va por PROP, no literal en el kit. Este archivo lleva
 * `@i18n-ignore-file`, así que un string hardcodeado acá NO lo ve
 * `check-i18n-hardcoded.mjs` y un usuario en EN escucharía las ~35 celdas en
 * español. La pantalla la arma con `t()` (memoizada: `DayCellView` es
 * React.memo y este objeto es prop suya). Los defaults reproducen el
 * demo/preview aprobado del kit.
 */
export interface CalendarA11yStrings {
  /** Prefijo del número — "Día" / "Day" → "Día 7". */
  dayPrefix: string
  /** Sufijo cuando el día tiene la hojita de "sin gastos" confirmado. */
  marked: string
  /** Estado del día, por kind (el fill aprobado lo comunica solo por color). */
  kinds: Record<DayKind, string>
}

const DEFAULT_CALENDAR_A11Y: CalendarA11yStrings = {
  dayPrefix: 'Día',
  marked: 'marcado sin gastos',
  kinds: {
    ok: 'con gastos',
    bad: 'día de exceso',
    now: 'hoy',
    fut: 'día futuro',
    fuera: 'fuera del ciclo',
    empty: 'sin gastos registrados',
    none: 'todavía no llegó',
  },
}

/** Label de lector de pantalla de una celda del calendario: "Día 7, hoy,
 *  marcado sin gastos". El estado NO puede quedar solo en el color (WCAG
 *  `color-not-only`) y el fill del diseño está aprobado, así que la
 *  compensación va por acá. `selected` se comunica por `accessibilityState`. */
function composeDayCellA11yLabel(cell: DayCell, a11y: CalendarA11yStrings): string {
  const parts: string[] = [`${a11y.dayPrefix} ${cell.label ?? cell.n ?? ''}`]
  parts.push(a11y.kinds[cell.kind ?? 'ok'])
  if (cell.sprout) parts.push(a11y.marked)
  return parts.join(', ')
}

export interface GastosCalendarProps {
  mode: GastosMode
  cells: DayCell[]
  /** `iso` identifica el día sin ambigüedad: `n` es día-de-mes y se repite
   *  cuando la ventana dura más de un mes (ciclo extendido). */
  onSelectDay?: (n: number, iso?: string) => void
  /** Vacío: la grilla se renderiza neutra y el hint invita a cargar en vez
   *  de "toca un día". */
  empty?: boolean
  /** Override del hint del encabezado. El cableado real lo usa en modo
   *  edición CERRADA (solo lectura, sin `onSelectDay`) para explicar que la
   *  grilla es un resumen y no un selector. Ausente → hint por defecto
   *  (idéntico al aprobado). */
  hint?: string
  /** CAL-2 — el hint pasa al durazno de alerta (`calHintWarnInk`) en vez del
   *  verde de marca. Es la única variante del handoff que lo hace: el aviso
   *  del header ("+2 fuera del ciclo") comparte tono con el anillo de las
   *  celdas que lo motivan. */
  hintWarn?: boolean
  /** v2 · CAL-3 — en una edición cerrada el título nombra el mes
   *  ("MAYO EN UN VISTAZO"): "TU MES" leería como el ciclo en curso. */
  title?: string
  /** v2 · EV2 — strip explicativo bajo la grilla (Brot `think` + copy). Solo
   *  aparece en el calendario recién arrancado, donde el punteado necesita
   *  traducción. */
  footNote?: { text: string; strong?: string; tail?: string }
  /** Anima el Brot del strip de `footNote`. El cableado real lo pasa `false`. */
  animated?: boolean
  /** Pausa el halo que respira de las celdas FUERA-DE-CICLO. Mismo booleano de
   *  foco que usa el hero para sus partículas. Default `false`. */
  paused?: boolean
  /** Copy traducida del label de lector de las celdas (ver
   *  `CalendarA11yStrings`). Ausente → literales del demo aprobado. */
  a11y?: CalendarA11yStrings
}

export function GastosCalendar({
  mode,
  cells,
  onSelectDay,
  empty = false,
  hint,
  hintWarn = false,
  title = 'TU MES EN UN VISTAZO',
  footNote,
  animated = true,
  paused = false,
  a11y = DEFAULT_CALENDAR_A11Y,
}: GastosCalendarProps) {
  const s = GASTOS_SPEC[mode]
  // PERF (FIX A2): 1 sola lectura de reduced-motion para TODA la grilla, bajada
  // por prop a cada celda (usePressScale la consume vía `reduceMotion`) → un
  // VALOR consistente desde una única fuente de verdad, sin el 2º read directo
  // que había acá. Nota de costo: los ~30 reads internos de las celdas
  // (`usePressScale` llama `useReducedMotion()` incondicionalmente por
  // rules-of-hooks) ya NO son listeners nativos — la suscripción única de
  // AccessibilityInfo vive en `ReducedMotionProvider` (app-wide) y
  // `useReducedMotion` es un `useContext` pelado; el prop queda por
  // consistencia de valor, no por ahorro de listeners.
  const reduceMotion = useReducedMotion()

  // TRANSICIÓN DE ESTADO DE LA GRILLA (filtro de categoría). Cada día se
  // re-clasifica (ok/bad/empty/…) porque el RPC del calendario se re-consulta
  // con `p_category_id`, y con eso cambian fill, ink y sombra de ~30 celdas.
  //
  // CÓMO SE MANTIENE BARATO: la grilla entera se cruza con UNA sola shared
  // value a nivel calendario (1 useAnimatedStyle, 1 nodo animado) y el set de
  // celdas se commitea en el valle. Cero hooks nuevos por celda: `DayCellView`
  // sigue siendo el mismo React.memo con su `usePressScale`, y las celdas blank
  // siguen sin hooks. Un tween de color POR celda habría multiplicado por 30 el
  // costo y encima interpolaría hacia/desde `transparent` (kinds 'empty' y
  // 'fuera' no tienen fill) pasando por gris sucio.
  //
  // La firma EXCLUYE `selected`: tocar un día debe responder al instante (ya
  // tiene su press-scale); solo transicionamos cuando cambia la clasificación.
  // Sí incluye `n` y el marcador de blank + separador → un cambio de ciclo o de
  // cantidad de filas también cruza (si no, la grilla vieja quedaría trabada).
  const kindSignature = useMemo(
    () =>
      cells
        .map((c) => (c.blank ? 'b' : `${c.n ?? ''}${c.kind ?? 'ok'}${c.sub ?? ''}${c.sprout ? '*' : ''}`))
        .join('|'),
    [cells],
  )
  const gridSwap = useSwapFade(cells, kindSignature, reduceMotion)

  // El set COMMITEADO congela la clasificación hasta el valle del fundido, pero
  // `selected` tiene que seguir al tap SIN esperar (y sin él la selección
  // quedaría muerta entre cambios de filtro). Se mergea el `selected` vivo
  // sobre las celdas mostradas; el scan es de ~30 y solo copia si difiere.
  const renderCells = useMemo(() => {
    const shown = gridSwap.shown
    if (shown === cells) return shown
    let needsMerge = false
    for (let i = 0; i < shown.length; i++) {
      const live = cells[i]
      if (live && live.key === shown[i].key && live.selected !== shown[i].selected) {
        needsMerge = true
        break
      }
    }
    if (!needsMerge) return shown
    return shown.map((c, i) => {
      const live = cells[i]
      return live && live.key === c.key && live.selected !== c.selected
        ? { ...c, selected: live.selected }
        : c
    })
  }, [gridSwap.shown, cells])

  // Grilla = filas de 7. RN no tiene CSS grid; cada celda flex:1 + gap 7 da
  // 7 columnas iguales sin medir. Las filas incompletas se rellenan con
  // spacers flex:1 para conservar la alineación de columnas.
  const rows = useMemo(() => {
    const chunked: DayCell[][] = []
    for (let i = 0; i < renderCells.length; i += 7) chunked.push(renderCells.slice(i, i + 7))
    return chunked
  }, [renderCells])

  return (
    <RiseView translateY={12} style={styles.calendarSpacing}>
      <View
        style={[
          styles.calCard,
          { backgroundColor: s.calBackground, boxShadow: s.calShadow },
          s.calGradientCss ? { experimental_backgroundImage: s.calGradientCss } : null,
        ]}
      >
        <View style={styles.calHeadRow}>
          <Text numberOfLines={1} style={[styles.calTitle, { color: s.calTitleInk }]}>{title}</Text>
          <Text
            numberOfLines={1}
            style={[styles.calHint, { color: hintWarn ? s.calHintWarnInk : s.calHintInk }]}
          >
            {hint ?? (empty ? 'Carga gastos y tu mes se va pintando' : 'toca un día')}
          </Text>
        </View>
        <View style={styles.calWeekRow}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} style={[styles.weekday, { color: s.weekdayInk }]}>
              {d}
            </Text>
          ))}
        </View>
        {/* UN solo nodo animado para las ~30 celdas (ver `kindSignature`). */}
        <Animated.View style={[styles.calGrid, gridSwap.style]}>
          {rows.map((row, ri) => (
            <View key={ri} style={[styles.calRow, ri > 0 ? styles.calRowGap : null]}>
              {row.map((cell) =>
                // FIX A1: las celdas BLANK se renderizan como <View> plano acá,
                // sin pasar por DayCellView → 0 hooks (antes montaban usePressScale
                // aun siendo huecos de relleno).
                cell.blank ? (
                  <View key={cell.key} style={styles.dayFlex} />
                ) : (
                  // Vacío = grilla inert (como el calendario vivo en modo empty):
                  // sin handler, ninguna celda es tappable → no hay selección
                  // trabada sin day-detail que la limpie.
                  <DayCellView
                    key={cell.key}
                    s={s}
                    cell={cell}
                    onPress={empty ? undefined : onSelectDay}
                    reduceMotion={reduceMotion}
                    paused={paused}
                    a11y={a11y}
                  />
                ),
              )}
              {row.length < 7
                ? Array.from({ length: 7 - row.length }).map((_, i) => <View key={`pad${i}`} style={styles.dayFlex} />)
                : null}
            </View>
          ))}
        </Animated.View>
        {/* v2 · EV2 — el punteado necesita traducción la primera vez que se ve.
            El strip vive DENTRO de la card (no debajo) para que se lea como pie
            de la grilla y no como un aviso suelto. */}
        {footNote ? (
          <View style={[styles.calFootNote, { boxShadow: s.noticeStripShadow }]}>
            <View style={styles.calFootNoteBrot}>
              <BrotMascot pose="think" size={40} shadow={false} animated={animated} />
            </View>
            <Text style={[styles.calFootNoteText, { color: s.noticeBodyInk }]}>
              {footNote.text}
              {footNote.strong ? (
                <Text style={[styles.calFootNoteStrong, { color: s.noticeStrongInk }]}>{footNote.strong}</Text>
              ) : null}
              {footNote.tail ?? ''}
            </Text>
          </View>
        ) : null}
      </View>
    </RiseView>
  )
}

// ─── ⑤ Detalle de día ────────────────────────────────────────────────

function DayArrow({ s, dir, onPress }: { s: GastosSpec; dir: 'prev' | 'next'; onPress?: () => void }) {
  const press = usePressScale({ pressedScale: 0.88 })
  // Sin handler = borde del ciclo (primer día / HOY): la flecha se atenúa y se
  // marca deshabilitada, en paridad con el ChevronBtn de la vista viva
  // (opacity 0.35 + accessibilityState.disabled). El demo siempre pasa handler
  // vía dispatch → se ve a opacidad plena como el aprobado.
  const disabled = !onPress
  const inner = (
    <View
      style={[
        styles.arrow,
        { backgroundColor: s.arrowBackground, boxShadow: s.arrowShadow },
        s.arrowGradientCss ? { experimental_backgroundImage: s.arrowGradientCss } : null,
        disabled ? { opacity: 0.35 } : null,
      ]}
    >
      {dir === 'prev' ? <ChevronLeft color={s.arrowGlyph} /> : <ChevronRightIcon color={s.arrowGlyph} />}
    </View>
  )
  if (disabled) {
    return (
      <View
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessibilityLabel={dir === 'prev' ? 'Día anterior' : 'Día siguiente'}
      >
        {inner}
      </View>
    )
  }
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={dir === 'prev' ? 'Día anterior' : 'Día siguiente'}
      hitSlop={6}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      {inner}
    </AnimatedPressable>
  )
}

/**
 * Tono de un chip del day-detail.
 *  · `warn` — exceso / fuera de ciclo: durazno sólido (el de siempre).
 *  · `ext`  — día extendido: sin fill, con el MISMO anillo durazno que la
 *             celda del calendario, para que se lean como la misma señal.
 *  · `good` — logro (día marcado sin gastos): verde del estado "bien".
 */
export type GastosBadgeTone = 'warn' | 'ext' | 'good'

export interface GastosDayDetailProps {
  mode: GastosMode
  dayNum: string
  sub: string
  /** Chip único. Atajo de `badges` para el caso de siempre. */
  badge: string | null
  /**
   * Chips del día, cuando puede haber más de uno a la vez.
   *
   * Las condiciones NO son excluyentes: un día puede ser extendido Y de
   * exceso, o extendido y estar marcado como día limpio. Con un solo chip
   * había que elegir por prioridad y el resto se perdía — el owner veía "Día
   * de exceso" sin enterarse de que además ese día entró de más.
   *
   * Se apilan en una fila que ENVUELVE, así que dos chips largos bajan a una
   * segunda línea en vez de empujar el botón de volver. Si se pasa `badges`,
   * `badge` se ignora.
   */
  badges?: { label: string; tone?: GastosBadgeTone }[]
  /** Strip de Brot del día. Ver el mismo campo en el VM: un día de
   *  EXTENDIDO reusa el chasis del strip fuera-de-ciclo con otra pose y
   *  otro copy. */
  brotStrip?: { pose: BrotPose; text: string } | null
  gastado: string
  movs: string
  isOut: boolean
  showCtas: boolean
  /** El día ya está marcado como "sin gastos" (brote plantado). Cuando es
   *  `true` el CTA "Marcar" se reemplaza por "Revertir marca" (par inverso).
   *  El cableado real lo deriva de `noSpendMarkedDates`; el demo no lo setea
   *  (undefined → false, muestra el CTA de marcar como el aprobado). */
  isMarked?: boolean
  onPrev?: () => void
  onNext?: () => void
  onBackToMonth?: () => void
  /** Presente solo en días pasados (hoy usa el flujo normal de + gasto). */
  onRegister?: () => void
  /** Presente solo en días de 0 movimientos aún no marcados. */
  onMarkEmpty?: () => void
  /** Revertir la marca "sin gastos" — presente solo cuando `isMarked`. */
  onUnmark?: () => void
  /** v2 · DS-4 / DS-6 — el día no admite acciones (todavía no llegó, o vive en
   *  una edición cerrada). Suprime los CTAs y muestra `noteLine` en su lugar.
   *  Default `'live'` → idéntico al aprobado. */
  variant?: 'live' | 'future' | 'closed'
  /** v2 · Línea muted donde irían los CTAs ("Sin acciones — día futuro"). */
  noteLine?: string
  /** v2 · DS-3 / EV3 — el día está marcado sin gastos: línea de logro entre la
   *  navegación y las stats ("Día sin gastos 🌿 sumaste +1 al jardín"). */
  cleanLine?: string
  /** v2 · EV3 — CTA primario del día limpio. Cuando está presente, "Registrar
   *  gasto olvidado" baja a ghost (el logro manda la jerarquía). */
  onOpenGarden?: () => void
  /** v2 · BK — etiqueta del botón de volver (trunca con elipsis). */
  backLabel?: string
  /** Anima el Brot `sad` del strip fuera-de-ciclo (solo se dibuja con `isOut`).
   *  Default `true` → preview aprobado idéntico. El cableado real lo pasa
   *  `false`: el day-detail REEMPLAZA al calendario dentro del
   *  `ListHeaderComponent` de la SectionList, o sea convive con el scroll del
   *  feed. Ver la nota de `animated` en `GastosOverdueBanner`. */
  animated?: boolean
}

/** Un chip del day-detail. Ver `GastosBadgeTone`. */
function DayDetailChip({
  s,
  label,
  tone,
}: {
  s: GastosSpec
  label: string
  tone: GastosBadgeTone
}) {
  const skin =
    tone === 'ext'
      ? // Sin fill + el anillo de la celda extendida: el chip y el día del
        // calendario son la misma señal. Y así no se confunde con el chip de
        // exceso, que en durazno sólido se le parecía demasiado.
        { backgroundColor: undefined, boxShadow: s.dayExtendidoRing, ink: s.dayFueraInk }
      : tone === 'good'
        ? { backgroundColor: s.dayBienBackground, boxShadow: undefined, ink: s.dayBienInk }
        : {
            backgroundColor: s.detailBadgeBackground,
            boxShadow: s.detailBadgeShadow,
            ink: s.detailBadgeInk,
          }
  return (
    <View
      style={[
        styles.detailBadge,
        styles.detailBadgeCap,
        skin.backgroundColor ? { backgroundColor: skin.backgroundColor } : null,
        skin.boxShadow ? { boxShadow: skin.boxShadow } : null,
      ]}
    >
      <Text numberOfLines={1} style={[styles.detailBadgeText, { color: skin.ink }]}>
        {label}
      </Text>
    </View>
  )
}

export function GastosDayDetail({
  mode,
  dayNum,
  sub,
  badge,
  badges,
  gastado,
  movs,
  isOut,
  brotStrip = null,
  showCtas,
  isMarked = false,
  onPrev,
  onNext,
  onBackToMonth,
  onRegister,
  onMarkEmpty,
  onUnmark,
  animated = true,
  variant = 'live',
  noteLine,
  cleanLine,
  onOpenGarden,
  backLabel,
}: GastosDayDetailProps) {
  const s = GASTOS_SPEC[mode]
  const ctaPress = usePressScale({ pressedScale: 0.97 })
  const ghostPress = usePressScale({ pressedScale: 0.97 })
  const gardenPress = usePressScale({ pressedScale: 0.97 })
  const registerPress = usePressScale({ pressedScale: 0.97 })
  // v2 · DS-4/DS-6: el día no admite mutaciones. `showCtas` sigue existiendo
  // (el llamador puede apagarlas por su cuenta); esto lo refuerza por variante.
  const inert = variant !== 'live'
  // v2 · EV3: en un día ya marcado el logro manda — "Ver mi jardín" pasa a
  // primario y "Registrar gasto olvidado" baja a ghost. "Revertir marca" NO se
  // pierde (EV3 no la dibuja, pero sacarla dejaría la marca sin vuelta atrás
  // fuera de HOY, que es lo único que cubre el FAB de la racha).
  const gardenIsPrimary = Boolean(onOpenGarden)
  // `badges` manda; `badge` se conserva como atajo del caso de un solo chip
  // (lo usa el demo del kit y los llamadores que nunca tienen dos).
  const chips = useMemo(
    () => badges ?? (badge ? [{ label: badge, tone: 'warn' as GastosBadgeTone }] : []),
    [badges, badge],
  )

  return (
    <RiseView translateY={12} style={styles.blockSpacing}>
      <View
        style={[
          styles.dayCard,
          { backgroundColor: s.dayCardBackground, boxShadow: s.dayCardShadow },
          s.dayCardGradientCss ? { experimental_backgroundImage: s.dayCardGradientCss } : null,
        ]}
      >
        {/* v2 · BK — el botón de volver ocupa la fila entera (target 44px) y
            `DÍA SELECCIONADO` baja a la segunda línea. El badge queda a su
            derecha con tope de 40% para que un texto largo no lo empuje. */}
        <View style={styles.dayBackRow}>
          <BackToCalendarButton mode={mode} label={backLabel} onPress={onBackToMonth} />
          {chips.length > 0 ? (
            <View style={styles.detailBadgeRow}>
              {chips.map((c) => (
                <DayDetailChip key={c.label} s={s} label={c.label} tone={c.tone ?? 'warn'} />
              ))}
            </View>
          ) : null}
        </View>
        <Text style={[styles.detailLabel, styles.detailLabelBelowBack, { color: s.detailLabelInk }]}>
          DÍA SELECCIONADO
        </Text>

        <View style={styles.dayNav}>
          <DayArrow s={s} dir="prev" onPress={onPrev} />
          <View style={styles.dayNavCenter}>
            {/* `dayNum` es 42px con lineHeight 48 FIJO: a fontScale grande el
                glifo crece dentro de una caja que no → se cortaba arriba y
                abajo. Ver nota en dayLabel. */}
            <Text maxFontSizeMultiplier={1.3} style={[styles.dayNum, { color: s.dayNumInk }]}>
              {dayNum}
            </Text>
            <Text style={[styles.detailSub, { color: s.detailSubInk }]}>{sub}</Text>
          </View>
          <DayArrow s={s} dir="next" onPress={onNext} />
        </View>

        {/* v2 · DS-3 — el vacío como logro: un día sin gastos no es un hueco,
            suma al jardín. Va entre la navegación y las stats para que se lea
            ANTES del "$0", que si no queda como una carencia. */}
        {cleanLine ? (
          <Text style={[styles.cleanLine, { color: s.statusPillInk }]}>{cleanLine}</Text>
        ) : null}

        <View style={[styles.statRow, { borderTopColor: s.statBorder }]}>
          <View style={styles.statCol}>
            <Text style={[styles.statLabel, { color: s.statLabelInk }]}>GASTADO</Text>
            <Text style={[styles.statValue, { color: s.statValGastadoInk }]}>{gastado}</Text>
          </View>
          <View style={[styles.statColRight, { borderLeftColor: s.statBorder }]}>
            <Text style={[styles.statLabel, { color: s.statLabelInk }]}>MOVIMIENTOS</Text>
            <Text style={[styles.statValue, { color: s.statValMovInk }]}>{movs}</Text>
          </View>
        </View>

        {brotStrip ?? isOut ? (
          <RiseView translateY={12}>
            <View style={[styles.outStrip, { backgroundColor: s.outStripBackground, boxShadow: s.outStripShadow }]}>
              <View style={styles.outStripBrot}>
                <BrotMascot
                  pose={brotStrip?.pose ?? 'sad'}
                  size={42}
                  shadow={false}
                  animated={animated}
                />
              </View>
              <Text style={[styles.outStripText, { color: s.outStripInk }]}>
                {brotStrip?.text ??
                  'Estos gastos quedaron fuera del ciclo — al confirmar el cobro pasan al próximo.'}
              </Text>
            </View>
          </RiseView>
        ) : null}

        {/* v2 · DS-4 / DS-6 — donde irían los CTAs va una línea muted que dice
            POR QUÉ no hay acciones. Sin ella el detalle de un día futuro o de
            una edición cerrada se lee como si la pantalla se hubiera cortado. */}
        {inert && noteLine ? (
          <Text style={[styles.detailNote, { color: s.statLabelInk }]}>{noteLine}</Text>
        ) : null}

        {showCtas && !inert ? (
          <>
            {/* v2 · EV3 — día ya marcado sin gastos: el jardín es el primario. */}
            {onOpenGarden ? (
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel="Ver mi jardín"
                onPress={onOpenGarden}
                onPressIn={gardenPress.onPressIn}
                onPressOut={gardenPress.onPressOut}
                style={[styles.ctaSpacing, gardenPress.animatedStyle]}
              >
                <View style={[styles.cta, { experimental_backgroundImage: s.ctaPrimaryGradientCss, boxShadow: s.ctaPrimaryShadow }]}>
                  <Text style={[styles.ctaText, { color: s.ctaPrimaryInk }]}>🌿 Ver mi jardín</Text>
                </View>
              </AnimatedPressable>
            ) : null}
            {/* Registrar gasto olvidado — el cableado real lo pasa solo en
                días pasados (hoy usa el + normal). El demo lo pasa siempre
                (idéntico al aprobado). Con el jardín presente baja a ghost. */}
            {onRegister ? (
              gardenIsPrimary ? (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel="Registrar gasto olvidado"
                  onPress={onRegister}
                  onPressIn={registerPress.onPressIn}
                  onPressOut={registerPress.onPressOut}
                  style={[styles.ghostSpacing, registerPress.animatedStyle]}
                >
                  <View style={[styles.ghost, { backgroundColor: s.ghostBackground ?? 'transparent', boxShadow: s.ghostShadow }]}>
                    <Text style={[styles.ghostText, { color: s.ghostInk }]}>+ Registrar un gasto olvidado</Text>
                  </View>
                </AnimatedPressable>
              ) : (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel="Registrar gasto olvidado"
                  onPress={onRegister}
                  onPressIn={ctaPress.onPressIn}
                  onPressOut={ctaPress.onPressOut}
                  style={[styles.ctaSpacing, ctaPress.animatedStyle]}
                >
                  <View style={[styles.cta, { experimental_backgroundImage: s.ctaPrimaryGradientCss, boxShadow: s.ctaPrimaryShadow }]}>
                    <Text style={[styles.ctaText, { color: s.ctaPrimaryInk }]}>+ Registrar gasto olvidado</Text>
                  </View>
                </AnimatedPressable>
              )
            ) : null}
            {/* Marcar / Revertir "sin gastos" — mutuamente excluyentes. Marcar
                solo en días de 0 movimientos aún sin marca; revertir cuando ya
                está marcado (brote plantado → el glifo hoja es el sprout). */}
            {isMarked ? (
              onUnmark ? (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel="Revertir marca de día sin gastos"
                  onPress={onUnmark}
                  onPressIn={ghostPress.onPressIn}
                  onPressOut={ghostPress.onPressOut}
                  style={[styles.ghostSpacing, ghostPress.animatedStyle]}
                >
                  <View style={[styles.ghost, { backgroundColor: s.ghostBackground ?? 'transparent', boxShadow: s.ghostShadow }]}>
                    <LeafGlyph color={s.daySproutInk} size={16} strokeWidth={2.4} />
                    <Text style={[styles.ghostText, { color: s.ghostInk }]}>Revertir marca de sin gastos</Text>
                  </View>
                </AnimatedPressable>
              ) : null
            ) : onMarkEmpty ? (
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel="Marcar día sin gastos"
                onPress={onMarkEmpty}
                onPressIn={ghostPress.onPressIn}
                onPressOut={ghostPress.onPressOut}
                style={[styles.ghostSpacing, ghostPress.animatedStyle]}
              >
                <View style={[styles.ghost, { backgroundColor: s.ghostBackground ?? 'transparent', boxShadow: s.ghostShadow }]}>
                  <LeafGlyph color={s.daySproutInk} size={16} strokeWidth={2.4} />
                  <Text style={[styles.ghostText, { color: s.ghostInk }]}>Marcar día sin gastos</Text>
                </View>
              </AnimatedPressable>
            ) : null}
          </>
        ) : null}
      </View>
    </RiseView>
  )
}

// ─── ⑥ Filtro ────────────────────────────────────────────────────────

// PERF: `React.memo` — cada tap de filtro cambia `selectedCategoryId` →
// `filterChips` se reconstruye → GastosFilter re-renderiza. Sin memo, TODOS
// los chips se re-renderizaban; con memo (comparación shallow por defecto:
// s/label/count/active/catIcon/onPress — todos estables por valor salvo
// `onPress`, que GastosFilter memoiza por índice) solo re-renderiza el chip
// cuyo `active` cambió. Mismo patrón que `DayCellView`.
const FilterChip = memo(function FilterChip({
  s,
  label,
  count,
  active,
  catIcon,
  onPress,
}: {
  s: GastosSpec
  label: string
  count: string
  active: boolean
  /** Nombre de categoría para el ícono REAL (CategoryIcon). null en "Todas". */
  catIcon: string | null
  onPress?: () => void
}) {
  const press = usePressScale({ pressedScale: 0.93 })
  const inner = (
    <View
      style={[
        styles.chip,
        active
          ? { experimental_backgroundImage: s.chipActiveGradientCss, boxShadow: s.chipActiveShadow }
          : { backgroundColor: s.chipInactiveBackground ?? 'transparent', boxShadow: s.chipInactiveShadow },
      ]}
    >
      {catIcon ? (
        <View style={styles.chipIcon}>
          <CategoryIcon name={catIcon} scope="expense" size={17} onLightSurface />
        </View>
      ) : null}
      <Text
        style={[
          styles.chipLabel,
          active ? styles.chipLabelActive : null,
          { color: active ? s.chipActiveInk : s.chipInactiveInk },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.chipBadge,
          { backgroundColor: active ? s.chipActiveBadgeBackground : s.chipInactiveBadgeBackground },
        ]}
      >
        <Text
          maxFontSizeMultiplier={1.3}
          style={[styles.chipBadgeText, { color: active ? s.chipActiveBadgeInk : s.chipInactiveBadgeInk }]}
        >
          {count}
        </Text>
      </View>
    </View>
  )
  if (!onPress) return inner
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`Filtrar por ${label}, ${count}`}
      // El chip activo se distinguía SOLO por su gradiente: sin
      // accessibilityState el lector no anunciaba cuál filtro está aplicado.
      accessibilityState={{ selected: active }}
      // Chip dibujado ~35px de alto (paddingVertical 9 + label 12.5). hitSlop lo
      // lleva a ~47. Horizontal 4+4=8 < gap 9 del carrusel → sin solape entre
      // chips vecinos.
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      {inner}
    </AnimatedPressable>
  )
})

export interface GastosFilterProps {
  mode: GastosMode
  chips: { label: string; count: string; active: boolean; catIcon: string | null }[]
  onSelect?: (i: number) => void
  /** v2 · eyebrow. Pasa a "FILTRO ACTIVO" cuando hay una categoría aplicada. */
  eyebrow?: string
  /** v2 · pill de estado a la derecha del eyebrow (F-1…F-4). */
  status?: { label: string; tone?: 'data' | 'muted' | 'alert' }
  /** v2 · F-3 — categorías del catálogo que todavía no tienen movimientos: van
   *  punteadas y SIN contador (un "0" leería como dato; el molde lee como
   *  promesa). No son tappables: filtrar por ellas daría siempre vacío. */
  ghostChips?: string[]
  ghostHint?: string
  /** v2 · F-4 — el filtro dejó el ciclo sin resultados. El vacío vive ACÁ (no
   *  en la lista): así queda pegado al chip que lo causó y el CTA de quitarlo
   *  está a un dedo del filtro. */
  emptyResult?: {
    title: string
    /** Referencia de la edición pasada. Se omite si no hay dato. */
    hint?: string
    hintAmount?: string
    ctaLabel: string
    onClear?: () => void
  }
  /** Anima el Brot `think` del vacío F-4. El cableado real lo pasa `false`
   *  (vive en el ListHeaderComponent, ver la nota de `GastosOverdueBanner`). */
  animated?: boolean
}

export function GastosFilter({
  mode,
  chips,
  onSelect,
  eyebrow = 'FILTRAR POR CATEGORÍA',
  status,
  ghostChips,
  ghostHint,
  emptyResult,
  animated = true,
}: GastosFilterProps) {
  const s = GASTOS_SPEC[mode]
  const clearPress = usePressScale({ pressedScale: 0.97 })
  // Handlers ref-estables por índice. Sin esto, `onPress={() => onSelect(i)}`
  // creaba una closure NUEVA por chip por render → derrotaba el `React.memo`
  // de FilterChip (todos los chips re-renderizaban en cada tap). Al memoizar el
  // array por [onSelect, chips.length], el onPress de cada chip es
  // Object.is-estable entre renders, así que solo re-renderiza el chip cuyo
  // `active` cambió. Depende del COUNT (no de la identidad de `chips`, que es
  // un array nuevo cada render) — rebindear por `chips` rompería la estabilidad.
  const handlers = useMemo(
    () =>
      onSelect ? Array.from({ length: chips.length }, (_, i) => () => onSelect(i)) : undefined,
    [onSelect, chips.length],
  )
  return (
    <>
      <View style={styles.filterHeadRow}>
        <Text style={[styles.filterLabel, { color: s.filterLabelInk }]}>{eyebrow}</Text>
        {status ? <StatusPill mode={mode} label={status.label} tone={status.tone} /> : null}
      </View>
      <View style={styles.filterScrollWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {chips.map((c, i) => (
            <FilterChip
              key={c.label}
              s={s}
              label={c.label}
              count={c.count}
              active={c.active}
              catIcon={c.catIcon}
              onPress={handlers?.[i]}
            />
          ))}
          {/* F-3 · los punteados van DESPUÉS de los activos: el carrusel se lee
              como "esto ya usás / esto te espera". */}
          {ghostChips?.map((label) => (
            <GhostChip key={`ghost-${label}`} s={s} label={label} />
          ))}
        </ScrollView>
        <View style={[styles.filterFade, { experimental_backgroundImage: s.fadeGradientCss }]} pointerEvents="none" />
      </View>
      {ghostHint ? (
        <Text style={[styles.filterGhostHint, { color: s.dashInk }]}>{ghostHint}</Text>
      ) : null}
      {emptyResult ? (
        <RiseView translateY={12}>
          <View style={[styles.filterEmptyWell, { boxShadow: s.noticeWellShadow }]}>
            <View style={styles.filterEmptyBrot}>
              <BrotMascot pose="think" size={48} shadow={false} animated={animated} />
            </View>
            <View style={styles.filterEmptyTexts}>
              <Text numberOfLines={2} style={[styles.filterEmptyTitle, { color: s.noticeTitleInk }]}>
                {emptyResult.title}
              </Text>
              {emptyResult.hint ? (
                <Text style={[styles.filterEmptyHint, { color: s.noticeBodyInk }]}>
                  {emptyResult.hint}
                  {emptyResult.hintAmount ? (
                    <>
                      {' '}
                      <Text style={[styles.filterEmptyHintStrong, { color: s.noticeStrongInk }]}>
                        {emptyResult.hintAmount}
                      </Text>
                    </>
                  ) : null}
                  .
                </Text>
              ) : null}
            </View>
          </View>
          {emptyResult.onClear ? (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={emptyResult.ctaLabel}
              onPress={emptyResult.onClear}
              onPressIn={clearPress.onPressIn}
              onPressOut={clearPress.onPressOut}
              style={[styles.filterClearSpacing, clearPress.animatedStyle]}
            >
              <View style={[styles.filterClear, { backgroundColor: s.ghostBackground ?? 'transparent', boxShadow: s.ghostShadow }]}>
                <Text style={[styles.filterClearText, { color: s.ghostInk }]}>{emptyResult.ctaLabel}</Text>
              </View>
            </AnimatedPressable>
          ) : null}
        </RiseView>
      ) : null}
    </>
  )
}

// ─── ⑦ Movimientos ───────────────────────────────────────────────────

// Sub-componentes presentacionales de la sección de movimientos, extraídos
// del monolito `GastosMovements` para que el cableado real (neo-gastos-screen)
// pueda componerlos como header/renderSectionHeader/renderItem/footer de una
// SectionList virtualizada (paginación + swipe-delete + ingresos intercalados)
// SIN duplicar markup. `GastosMovements` (usado por el demo auto-conducido)
// compone estos mismos pedazos, así que el visual aprobado no cambia.

/** Encabezado de la sección "MOVIMIENTOS" + chip contextual. */
export function GastosMovSectionHead({
  mode,
  chipLabel,
  onClearDay,
}: {
  mode: GastosMode
  chipLabel: string
  onClearDay?: () => void
}) {
  const s = GASTOS_SPEC[mode]
  return (
    <View style={styles.movSectionHead}>
      <Text style={[styles.sectionLabel, { color: s.sectionLabelInk }]}>MOVIMIENTOS</Text>
      {onClearDay ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={chipLabel}
          hitSlop={8}
          onPress={onClearDay}
          style={({ pressed }) => (pressed ? styles.pressedDim55 : null)}
        >
          <Text style={[styles.movChip, { color: s.sectionCountInk }]}>{chipLabel}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.movChip, { color: s.sectionCountInk }]}>{chipLabel}</Text>
      )}
    </View>
  )
}

/** Encabezado de un grupo-día (fecha + total del día). */
export function GastosMovDayHeader({
  mode,
  label,
  total,
}: {
  mode: GastosMode
  label: string
  total: string
}) {
  const s = GASTOS_SPEC[mode]
  return (
    <View style={styles.movGroupHead}>
      <Text style={[styles.movGroupLabel, { color: s.dayHeadLabelInk }]}>{label}</Text>
      <Text style={[styles.movGroupTotal, { color: s.dayHeadTotalInk }]}>{total}</Text>
    </View>
  )
}

/**
 * Una fila de movimiento (gasto o ingreso). `flat` quita la sombra propia:
 * el cableado real envuelve la fila en un `SwipeRow` (overflow:hidden clipa la
 * sombra neumórfica), así que la sombra la lleva un wrapper externo NO
 * clippeado — mismo patrón que la actividad de la Home neo. El GRADIENTE, en
 * cambio, NO depende de `flat`: es parte del diseño aprobado de la fila (en
 * dark) y vive en la fila misma, que no lo clipa. En reposo (sin `flat`, como
 * el demo) el visual queda IDÉNTICO al aprobado.
 */
export function GastosMovRow({
  mode,
  row: r,
  flat = false,
}: {
  mode: GastosMode
  row: MovRowVM
  flat?: boolean
}) {
  const s = GASTOS_SPEC[mode]
  const amountInk = r.kind === 'income' ? s.green : s.movAmountInk
  const row = (
    <View
      style={[
        styles.movRow,
        // OVERDRAW · en dark el `experimental_backgroundImage` es un gradiente
        // OPACO que cubre la fila entera, así que el `backgroundColor` de abajo
        // se pinta y se tapa: dos fills a pantalla completa por fila, ×~70 filas
        // montadas. Cuando hay gradiente, el color de fondo no se emite. En
        // light no hay gradiente y el fill sigue igual que en el aprobado.
        s.movRowGradientCss ? null : { backgroundColor: s.movRowBackground },
        flat ? null : { boxShadow: s.movRowShadow },
        s.movRowGradientCss ? { experimental_backgroundImage: s.movRowGradientCss } : null,
      ]}
    >
      <View style={[styles.movTile, { backgroundColor: tileColor(s, r.tile) }]}>
        {/* Ícono REAL de categoría (sticker del sistema, como la vista vieja).
            La fila sintética / de ingreso sin catName cae al emoji. */}
        {r.catName ? (
          <CategoryIcon name={r.catName} scope="expense" size={24} onLightSurface />
        ) : (
          <Text style={styles.movEmoji}>{r.emoji}</Text>
        )}
      </View>
      <View style={styles.movTexts}>
        <Text style={[styles.movTitle, { color: s.movTitleInk }]} numberOfLines={1}>
          {r.title}
        </Text>
        <Text style={[styles.movSub, { color: s.movSubInk }]} numberOfLines={1}>
          {r.sub}
        </Text>
      </View>
      <Text style={[styles.movAmount, { color: amountInk }]}>{r.amount}</Text>
    </View>
  )
  // v2 · M-3 — un gasto cargado después del cierre del ciclo no se explica solo
  // con el sufijo del subtítulo: la nota dice qué le va a pasar.
  //
  // El cableado real NO puede usar esta rama: monta `GastosMovRow` DENTRO del
  // `SwipeRow`, que tiene overflow:hidden con radio 22, así que la nota
  // quedaba clipeada por la esquina redondeada (se comía la primera letra) y
  // pintada dentro de la tarjeta en vez de debajo. Para eso está
  // `GastosMovRowNote`, que la pantalla monta como HERMANA de la tarjeta.
  if (!r.note) return row
  return (
    <View>
      {row}
      <GastosMovRowNote mode={mode} note={r.note} />
    </View>
  )
}

/**
 * Nota M-3 de una fila de movimiento, como pieza suelta.
 *
 * Va SIEMPRE fuera de cualquier contenedor con overflow:hidden. Su sangría
 * horizontal iguala la del contenido de la fila (`movRow.paddingHorizontal`)
 * para que arranque en la misma vertical que el título del gasto, no pegada
 * al borde de la tarjeta.
 */
export function GastosMovRowNote({ mode, note }: { mode: GastosMode; note: string }) {
  const s = GASTOS_SPEC[mode]
  return <Text style={[styles.movRowNote, { color: s.outNoteInk }]}>{note}</Text>
}

/** Botón "Ver días anteriores" (footer de paginación). */
export function GastosSeeMore({ mode, onPress }: { mode: GastosMode; onPress?: () => void }) {
  const s = GASTOS_SPEC[mode]
  const morePress = usePressScale({ pressedScale: 0.97 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel="Ver días anteriores"
      onPress={onPress}
      onPressIn={morePress.onPressIn}
      onPressOut={morePress.onPressOut}
      style={[styles.seeMoreSpacing, morePress.animatedStyle]}
    >
      <View style={[styles.seeMore, { backgroundColor: s.seeMoreBackground ?? 'transparent', boxShadow: s.seeMoreShadow }]}>
        <Text style={[styles.seeMoreText, { color: s.seeMoreInk }]}>Ver días anteriores </Text>
        <ChevronDown color={s.seeMoreInk} />
      </View>
    </AnimatedPressable>
  )
}

/** Pozo inset del vacío de movimientos (Brot idle + título + sub + CTA verde).
 *  `ctaLabel` opcional: sin él (modo edición CERRADA, donde no hay nada que
 *  registrar) el pozo muestra solo Brot + título + sub, sin pill de acción.
 *
 *  v2 · M-4/EV6 (`ghostRows`): antes del pozo se dibujan filas fantasma
 *  punteadas. El vacío deja de ser un hueco y pasa a ser el MOLDE de la lista
 *  que se va a armar — mismo lenguaje que el hero vacío y el filtro sin usar. */
export function GastosMovementsEmptyWell({
  mode,
  title,
  sub,
  ctaLabel,
  onPressCta,
  ghostRows = 0,
  animated = true,
}: {
  mode: GastosMode
  title: string
  sub: string
  ctaLabel?: string
  onPressCta?: () => void
  /** Cantidad de filas fantasma sobre el pozo. 0 → idéntico al aprobado v1. */
  ghostRows?: number
  animated?: boolean
}) {
  const s = GASTOS_SPEC[mode]
  return (
    <RiseView translateY={12} style={styles.movEmptySpacing}>
      {ghostRows > 0 ? (
        <View style={styles.movGhostStack}>
          {Array.from({ length: ghostRows }, (_, i) => (
            <GhostMovRow key={i} s={s} />
          ))}
        </View>
      ) : null}
      <View
        style={[
          styles.movEmptyWell,
          ghostRows > 0 ? styles.movEmptyWellRow : null,
          { backgroundColor: s.insBg ?? 'transparent', boxShadow: s.ins },
        ]}
      >
        {/* Con molde el vacío es un PIE de la lista fantasma (Brot al lado del
            texto, como EV6); sin molde conserva el bloque centrado aprobado. */}
        {ghostRows > 0 ? (
          <>
            <View style={styles.movEmptyBrotSlot}>
              <BrotMascot pose="wave" size={44} shadow={false} animated={animated} />
            </View>
            <Text style={[styles.movEmptySubInline, { color: s.noticeBodyInk }]}>{sub}</Text>
          </>
        ) : (
          <>
            <BrotMascot pose="idle" size={56} shadow={false} animated={animated} />
            <Text style={[styles.movEmptyTitle, { color: s.text }]}>{title}</Text>
            <Text style={[styles.movEmptySub, { color: s.sub }]}>{sub}</Text>
          </>
        )}
        {ctaLabel && ghostRows === 0 ? (
          <GastosEmptyCta
            label={ctaLabel}
            ink={s.ctaPrimaryInk}
            gradientCss={s.ctaPrimaryGradientCss}
            shadow={s.ctaPrimaryShadow}
            onPress={onPressCta}
          />
        ) : null}
      </View>
      {ctaLabel && ghostRows > 0 ? (
        <View style={styles.movEmptyCtaRow}>
          <GastosEmptyCta
            label={ctaLabel}
            ink={s.ctaPrimaryInk}
            gradientCss={s.ctaPrimaryGradientCss}
            shadow={s.ctaPrimaryShadow}
            onPress={onPressCta}
          />
        </View>
      ) : null}
    </RiseView>
  )
}

export interface GastosMovementsProps {
  mode: GastosMode
  chipLabel: string
  groups: MovGroupVM[]
  showSeeMore: boolean
  /** Vacío: en lugar de grupos por día, un pozo inset con Brot + CTA verde
   *  (mismo lenguaje que el vacío de actividad de la HOME). */
  empty?: boolean
  emptyTitle?: string
  emptySub?: string
  emptyCtaLabel?: string
  /** v2 · M-4/EV6 — filas fantasma punteadas sobre el pozo del vacío. */
  emptyGhostRows?: number
  animated?: boolean
  onClearDay?: () => void
  onSeeMore?: () => void
  onPressEmptyCta?: () => void
}

export function GastosMovements({
  mode,
  chipLabel,
  groups,
  showSeeMore,
  empty = false,
  emptyTitle = 'Todavía no registras gastos',
  emptySub = 'Tus movimientos van a aparecer aquí, agrupados por día',
  emptyCtaLabel = '+ Registrar gasto',
  emptyGhostRows = 0,
  animated = true,
  onClearDay,
  onSeeMore,
  onPressEmptyCta,
}: GastosMovementsProps) {
  // Movimientos VACÍOS — pozo neumórfico inset (insBg/ins, igual que el vacío
  // de actividad de la Home): Brot idle 56 + título + sub + CTA radial verde.
  if (empty) {
    return (
      <>
        <GastosMovSectionHead mode={mode} chipLabel={chipLabel} />
        <GastosMovementsEmptyWell
          mode={mode}
          title={emptyTitle}
          sub={emptySub}
          ctaLabel={emptyCtaLabel}
          onPressCta={onPressEmptyCta}
          ghostRows={emptyGhostRows}
          animated={animated}
        />
      </>
    )
  }

  return (
    <>
      <GastosMovSectionHead mode={mode} chipLabel={chipLabel} onClearDay={onClearDay} />
      <View style={styles.movList}>
        {groups.map((g, gi) => (
          <View key={gi} style={gi > 0 ? styles.movGroupGap : null}>
            <GastosMovDayHeader mode={mode} label={g.label} total={g.total} />
            <View style={styles.movRows}>
              {g.rows.map((r, ri) => (
                <GastosMovRow key={ri} mode={mode} row={r} />
              ))}
            </View>
          </View>
        ))}
        {showSeeMore ? <GastosSeeMore mode={mode} onPress={onSeeMore} /> : null}
      </View>
    </>
  )
}

function tileColor(s: GastosSpec, key: TileKey): string {
  if (key === 'pink') return s.tilePink
  if (key === 'merc') return s.tileMerc
  if (key === 'rose') return s.tileRose
  return s.tileMint
}

// ─── Pantalla completa (auto-conducida) ──────────────────────────────

export interface GastosFinalScreenProps {
  mode: GastosMode
  /** Estado inicial de la máquina (el preview siembra cada seed). */
  initialState?: Partial<GastosState>
}

export function GastosFinalScreen({ mode, initialState }: GastosFinalScreenProps) {
  const s = GASTOS_SPEC[mode]
  const [state, dispatch] = useReducer(gastosReducer, { ...INITIAL_STATE, ...initialState })
  const v = deriveGastos(state)
  // v2 · F-1/F-2 — la pill de estado del filtro sale del chip activo. El índice
  // 0 es "Todas" (sin contador en la pill: "Todas · 64" repetiría el badge del
  // propio chip, que ya está a la vista).
  const activeChipIndex = v.filterChips.findIndex((c) => c.active)
  const activeFilterChip =
    activeChipIndex >= 0
      ? { ...v.filterChips[activeChipIndex], isAll: activeChipIndex === 0 }
      : null

  return (
    <View style={[styles.shell, { backgroundColor: s.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <HomeStatusBar mode={mode} />
        <View style={styles.content}>
          <GastosHeader
            mode={mode}
            cycleLabel={v.cycTrigLabel}
            cycleVariant={v.cycleVariant}
            brotPose={v.brotPose}
            onToggleDropdown={() => dispatch({ type: 'toggleDropdown' })}
            onPressBrot={() => {}}
          />

          {state.dd ? (
            <CycleDropdown mode={mode} items={v.ddItems} onSelect={(i) => dispatch({ type: 'selectCycle', i })} />
          ) : null}

          {v.viewingClosed ? (
            <GastosClosedBar mode={mode} onBackToCurrent={() => dispatch({ type: 'nextCycle' })} />
          ) : null}

          {v.showAlert ? (
            <GastosOverdueBanner mode={mode} onConfirm={() => dispatch({ type: 'confirmCobro' })} />
          ) : null}

          <View style={styles.heroSpacing}>
            <GastosHero
              mode={mode}
              tag={v.heroTag}
              chip={v.heroChip}
              total={v.heroTotal}
              prom={v.heroProm}
              categories={v.categories}
              empty={v.empty}
              onPressEmptyCta={() => {}}
              // v2 · H-2/H-3 — el demo cubre las dos sublíneas del inventario:
              // edición cerrada (📁 Solo lectura, Brot `think`) y ciclo vencido
              // con días fuera (⚠, Brot `worried`).
              subline={
                !v.isCurrent
                  ? '📁 Solo lectura'
                  : v.showAlert
                    ? '⚠ 2 días fuera del ciclo'
                    : undefined
              }
              sublineTone={v.showAlert ? 'warn' : 'neutral'}
              brotPose={!v.isCurrent ? 'think' : v.showAlert ? 'worried' : undefined}
            />
          </View>

          {/* El filtro va ARRIBA del calendario (owner 2026-08-12): gobierna
              hero + calendario + listado, así que se lee antes que todo lo que
              re-escopa. Oculto en vacío: no hay categorías que filtrar. */}
          {v.empty ? null : (
            <GastosFilter
              mode={mode}
              chips={v.filterChips}
              onSelect={(i) => dispatch({ type: 'selectFilter', i })}
              // v2 · F-1/F-2 — la pill de estado a la derecha del eyebrow.
              // F-3/F-4 no tienen estado en el reducer del demo (dependen de
              // datos reales: catálogo sin movimientos / edición anterior), se
              // revisan en el inventario del handoff.
              eyebrow={activeFilterChip && !activeFilterChip.isAll ? 'FILTRO ACTIVO' : undefined}
              status={{
                label: activeFilterChip
                  ? activeFilterChip.isAll
                    ? activeFilterChip.label
                    : `${activeFilterChip.label} · ${activeFilterChip.count}`
                  : CATS[0][0],
              }}
            />
          )}

          {v.showCal ? (
            <GastosCalendar
              mode={mode}
              cells={v.cells}
              onSelectDay={(n) => dispatch({ type: 'selectDay', n })}
              empty={v.empty}
              // v2 · CAL-2/CAL-3/CAL-4 — hint por estado (el resto cae al
              // default "toca un día" del componente).
              title={v.isCurrent ? undefined : 'MAYO EN UN VISTAZO'}
              hint={
                !v.isCurrent ? 'solo lectura' : v.showAlert ? '+2 fuera del ciclo' : undefined
              }
              hintWarn={v.isCurrent && v.showAlert}
              // v2 · EV2 — el strip que traduce el punteado, solo en el vacío.
              footNote={
                v.empty
                  ? {
                      text: 'Se va pintando a medida que registras. Los ',
                      strong: 'punteados',
                      tail: ' son días que todavía no llegaron.',
                    }
                  : undefined
              }
            />
          ) : (
            <GastosDayDetail
              mode={mode}
              dayNum={v.dayNum}
              sub={v.daySub}
              badge={v.dayBadge}
              gastado={v.dayGastado}
              movs={v.dayMovs}
              isOut={v.isOut}
              brotStrip={v.brotStrip}
              showCtas={v.showCtas}
              variant={v.dayVariant}
              noteLine={v.dayNote}
              onPrev={() => dispatch({ type: 'moveDay', dir: -1 })}
              onNext={() => dispatch({ type: 'moveDay', dir: 1 })}
              onBackToMonth={() => dispatch({ type: 'clearDay' })}
              onRegister={() => {}}
              onMarkEmpty={() => {}}
            />
          )}

          <GastosMovements
            mode={mode}
            chipLabel={v.sectionChipLabel}
            groups={v.groups}
            showSeeMore={v.showSeeMore}
            empty={v.empty}
            // v2 · M-4/EV6 — el vacío del listado va en molde: 3 filas fantasma
            // punteadas + Brot al lado del texto + CTA de primer gasto.
            emptyGhostRows={3}
            emptySub="Carga tu primer gasto y esta lista se arma sola, agrupada por día."
            emptyCtaLabel="+ Registrar mi primer gasto"
            onClearDay={() => dispatch({ type: 'clearDay' })}
            onSeeMore={() => {}}
            onPressEmptyCta={() => {}}
          />
        </View>

        <HomeNavBar mode={mode} activeTab="gastos" />
        <View style={[styles.homeIndicator, { backgroundColor: s.homeIndicator, opacity: s.homeIndicatorOpacity }]} />
      </ScrollView>
    </View>
  )
}

/**
 * Sangría horizontal del cuerpo de la pantalla. La misma en la réplica
 * (`styles.content`) y en la vista real (`listContent` de la SectionList en
 * `neo-gastos-screen`). El carrusel del filtro la ANULA para poder sangrar de
 * borde a borde — ver `filterScrollWrap`.
 */
const BODY_PAD = 20

const styles = StyleSheet.create({
  shell: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { paddingHorizontal: BODY_PAD, paddingTop: 10 },

  pressedDim: { opacity: 0.65 },
  pressedDim55: { opacity: 0.55 },
  blockSpacing: { marginTop: 14 },
  heroSpacing: { marginTop: 16 },
  // El calendario aparece en el estático a 18px (blockSpacing 14 es de las
  // variantes que solo viven en el interactivo: closedBar/banner/dayCard).
  calendarSpacing: { marginTop: 18 },

  // ① header
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { flexShrink: 1, minWidth: 0 },
  title: { fontSize: 34, fontWeight: '900', fontFamily: nunitoFamily('900'), lineHeight: 40 },
  cycTrig: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  cycDotWrap: { width: 7, height: 7, alignItems: 'center', justifyContent: 'center' },
  cycDotGlow: { position: 'absolute', width: 13, height: 13, borderRadius: 6.5 },
  cycDot: { width: 7, height: 7, borderRadius: 3.5 },
  cycTrigLabel: { fontSize: 13, fontWeight: '800', fontFamily: nunitoFamily('800') },
  cycCaret: { fontSize: 9, opacity: 0.75 },
  brotCol: { position: 'relative', marginTop: -2 },
  brotDisc: {
    width: 44,
    height: 44,
    borderRadius: GASTOS_RADII.brotBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Badge numérico naranja (estilo home HeaderButton): overlay en la esquina
  // top-right del disco, 19px, borde del color del fondo. Oculto en 0.
  brotBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 19,
    height: 19,
    borderRadius: 9.5,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brotBadgeText: { fontSize: 11, fontWeight: '900', fontFamily: nunitoFamily('900') },

  // ② dropdown
  ddSpacing: { marginTop: 12 },
  ddContainer: { borderRadius: 20, padding: 8, gap: 2 },
  ddRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 13, paddingVertical: 9, paddingHorizontal: 11 },
  ddIcon: { fontSize: 11, fontWeight: '900', fontFamily: nunitoFamily('900') },
  ddName: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  ddTag: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800') },

  // barra cerrada
  closedBar: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 13 },
  closedBarEmoji: { fontSize: 13 },
  closedBarLabel: { flex: 1, fontSize: 11.5, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: 0.69 },
  closedBtn: { fontSize: 11, fontWeight: '900', fontFamily: nunitoFamily('900'), textDecorationLine: 'underline' },

  // banner vencido
  banner: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 20, paddingVertical: 13, paddingHorizontal: 15 },
  bannerBrot: { width: 48, marginVertical: -4, alignItems: 'center' },
  bannerTexts: { flex: 1, minWidth: 0 },
  bannerTitle: { fontSize: 12.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  bannerSub: { fontSize: 10.5, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 1 },
  // v2 · el botón nunca se comprime: con un título largo, sin `flexShrink:0`
  // la etiqueta se partía en dos líneas y el banner crecía de alto.
  confirmBtn: { flexShrink: 0, borderRadius: 13, paddingVertical: 8, paddingHorizontal: 11 },
  confirmBtnText: { fontSize: 11, fontWeight: '900', fontFamily: nunitoFamily('900') },

  // ③ hero
  hero: { position: 'relative', borderRadius: GASTOS_RADII.hero, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18 },
  heroParticles: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: GASTOS_RADII.hero, overflow: 'hidden' },
  // `gap` para que el eyebrow y la pill nunca se toquen cuando la pill crece.
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroDot: { width: 8, height: 8, borderRadius: 4 },
  heroTag: { fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.61 },
  /**
   * La pill CEDE ancho (owner 2026-08-12). Su texto es data —"N mov · categoría
   * · rango"— y con un nombre de categoría largo se pasaba de largo: en RN el
   * `flexShrink` default es 0, así que la fila no la achicaba y la pill se salía
   * de la card. Con `flexShrink` + `minWidth: 0` se queda con el ancho que sobra
   * del eyebrow (que es un literal corto del spec y no encoge) y su texto
   * elide en una línea. Ver el orden de la copy en `gastos:summaryChip.text`:
   * lo que se pierde primero es el rango del ciclo, que ya está en el selector
   * del header.
   */
  heroChip: { flexShrink: 1, minWidth: 0, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  heroChipText: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800') },
  heroWell: { marginTop: 13, borderRadius: GASTOS_RADII.well, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 14 },
  // lineHeight con headroom (~1.16×) sobre el fontSize: en Nunito 900 un
  // lineHeight == fontSize clippea el ascender en RN.
  // `lineHeight` por el piso seguro del charset numérico (1.2): a 46 (=1.15)
  // la caja del párrafo queda por debajo del `$` (umbral 1.182) y RN le corta
  // el asta superior — el mismo recorte que se comía el halo. 48 en vez de 46.
  heroTotal: {
    fontSize: 40,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.8,
    lineHeight: safeLineHeight(40, 1.15, { numeric: true }),
  },
  // hero vacío: sub crema dentro del pozo + fila Brot(40)↔CTA crema.
  heroEmptySub: { fontSize: 11.5, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 6, lineHeight: 16 },
  // ─── v2 · pozo con Brot + sublínea (H-2/H-3/H-4) ───
  heroWellRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  heroWellTexts: { flex: 1, minWidth: 0 },
  heroWellBrot: { flexShrink: 0, alignItems: 'center', justifyContent: 'flex-end' },
  heroSubline: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800'), marginTop: 6 },
  heroEmptyCatFoot: { marginTop: 13, borderTopWidth: 1.5, paddingTop: 11 },
  heroEmptyCatText: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800'), lineHeight: 15 },
  heroEmptyCtaRow: { marginTop: 14, alignItems: 'flex-start' },
  heroStatsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14 },
  heroStatLabel: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.05 },
  heroStatValue: { fontSize: 21, fontWeight: '900', fontFamily: nunitoFamily('900'), marginTop: 3 },
  heroSevenCol: { alignItems: 'flex-end' },
  heroSevenLabel: { textAlign: 'right' },
  heroBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 5 },
  // Ventana de alto FIJO por barra: recorta la barra (que vive a BAR_MAX_H y se
  // desplaza con translateY) conservando el radio INFERIOR. El radio superior
  // visible es el de la barra misma → mismo dibujo que el `height` fijo previo.
  heroBarClip: {
    width: 7,
    height: BAR_MAX_H,
    overflow: 'hidden',
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  heroBarFill: { width: '100%', height: BAR_MAX_H, borderRadius: 3 },
  heroCatLabel: { marginTop: 16 },
  catList: { marginTop: 9, gap: 9 },
  catBlock: {},
  catHead: { flexDirection: 'row', justifyContent: 'space-between' },
  catNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  catSwatch: { width: 14, height: 14, borderRadius: 4 },
  catName: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  catValue: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  catTrack: { height: 7, borderRadius: 4, marginTop: 5, overflow: 'hidden' },
  // Ancho COMPLETO + scaleX desde el borde izquierdo (ver CategoryBar): el
  // relleno se dibuja una vez y solo se escala → sin layout por frame.
  catFill: { width: '100%', height: '100%', borderRadius: 4, transformOrigin: 'left' },

  // ④ calendario
  // Geometría literal del handoff ("cal":152/154, idéntica en las 8
  // variantes): `border-radius:24px; padding:14px 14px 12px`.
  calCard: {
    borderRadius: GASTOS_RADII.calCard,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  calHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  // v2 · el título cede antes que el hint: con un mes largo, el que tiene que
  // truncar es "SEPTIEMBRE EN UN VISTAZO", no el "solo lectura" que explica el
  // modo de la grilla.
  // 10.5/800 · 0.13em y 10.5/900 — literales del handoff en las 8 variantes.
  calTitle: { flexShrink: 1, fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.37 },
  calHint: { flexShrink: 0, fontSize: 10.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  calFootNote: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, marginTop: 12 },
  calFootNoteBrot: { width: 40, alignItems: 'center' },
  calFootNoteText: { flex: 1, fontSize: 11, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 16 },
  calFootNoteStrong: { fontWeight: '900', fontFamily: nunitoFamily('900') },
  // El gap 7 NO es decorativo: sin él las iniciales se reparten el ancho
  // completo mientras la grilla descuenta los 6 gaps, así que la L y la D
  // quedaban corridas respecto de su columna. En el handoff los dos son la
  // misma grilla (`repeat(7,1fr)` con `gap:7px`).
  calWeekRow: { flexDirection: 'row', gap: 7, marginTop: 12 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800') },
  calGrid: { marginTop: 8 },
  calRow: { flexDirection: 'row', gap: 7 },
  calRowGap: { marginTop: 7 },
  dayFlex: { flex: 1 },
  dayCell: { height: 40, borderRadius: GASTOS_RADII.day, alignItems: 'center', justifyContent: 'center' },
  // Clip de la cinta de peligro. Va en un wrapper propio y NO en `dayCell`:
  // en iOS `overflow:'hidden'` recorta también la sombra del propio nodo, así
  // que ahí adentro se perdería el anillo del día.
  hazardClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: GASTOS_RADII.day,
    overflow: 'hidden',
  },
  // Tamaño FIJO y anclada arriba-izquierda con offsets negativos: cubre la
  // celda (≤51×40) incluso después de correrse el período completo (~14px),
  // sin depender del ancho fluido de la columna.
  hazardLayer: { position: 'absolute', left: -28, top: -24, width: HAZARD_W, height: HAZARD_H },
  // Halo de warning de los días de exceso (FIX 3). absoluteFill dentro de la
  // celda; el color/blur lo pone el boxShadow inline (color de exceso).
  dayBadGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: GASTOS_RADII.day,
  },
  dayLabel: { fontSize: 13 },
  daySub: { fontSize: 7, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: 0.56, lineHeight: 8 },
  daySprout: { marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  dayHoyDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },

  // ⑤ detalle de día
  dayCard: { borderRadius: GASTOS_RADII.card, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 16 },
  detailLabel: { fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.61 },
  detailBadge: { borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 },
  detailBadgeText: { fontSize: 10.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  // ─── v2 · encabezado con botón de volver (BK) ───
  dayBackRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  // Fila de chips: ENVUELVE. Con dos condiciones a la vez (extendido + exceso)
  // los chips bajan a una segunda línea en vez de empujar el botón de volver
  // fuera de la fila. `flex:1` + `justifyContent:'flex-end'` los mantiene
  // pegados a la derecha, igual que el chip único de antes.
  detailBadgeRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  /** Un chip nunca come más del 100% de SU fila (la de chips, que envuelve):
   *  con dos, cada uno entra entero o baja de línea. El tope real contra el
   *  botón de volver lo pone `dayBackRow` — sin él un "Fuera de ciclo"
   *  comprimía la etiqueta del botón hasta dejarla en "Volver…". */
  detailBadgeCap: { flexShrink: 1, maxWidth: '100%' },
  detailLabelBelowBack: { marginTop: 14 },
  cleanLine: { fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800'), marginTop: 10, lineHeight: 16 },
  detailNote: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800'), marginTop: 13, textAlign: 'center' },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  dayNavCenter: { alignItems: 'center' },
  arrow: { width: 40, height: 40, borderRadius: GASTOS_RADII.arrow, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 42, fontWeight: '900', fontFamily: nunitoFamily('900'), lineHeight: 48 },
  detailSub: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800'), marginTop: 4 },
  statRow: { flexDirection: 'row', marginTop: 12, borderTopWidth: 1.5, paddingTop: 11 },
  statCol: { flex: 1 },
  statColRight: { flex: 1, borderLeftWidth: 1.5, paddingLeft: 14, alignItems: 'flex-end' },
  statLabel: { fontSize: 9.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 0.95 },
  statValue: { fontSize: 19, fontWeight: '900', fontFamily: nunitoFamily('900'), marginTop: 2 },
  outStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingVertical: 9, paddingHorizontal: 12, marginTop: 13 },
  outStripBrot: { width: 42, alignItems: 'center' },
  outStripText: { flex: 1, fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800'), lineHeight: 16 },
  ctaSpacing: { marginTop: 13 },
  cta: { borderRadius: 20, paddingVertical: 13, alignItems: 'center' },
  ctaText: { fontSize: 13.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  ghostSpacing: { marginTop: 9 },
  ghost: { flexDirection: 'row', borderRadius: 20, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 7 },
  ghostText: { fontSize: 13, fontWeight: '800', fontFamily: nunitoFamily('800') },

  // ⑥ filtro
  // v2 · el eyebrow comparte fila con la pill de estado. El marginTop 20 se
  // muda a la fila para que la pill se alinee con la etiqueta.
  filterHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 20, paddingHorizontal: 4 },
  filterLabel: { flexShrink: 1, fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.84 },
  filterGhostHint: { fontSize: 11, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 16, paddingHorizontal: 4, marginTop: -6 },
  filterEmptyWell: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingVertical: 11, paddingHorizontal: 12, marginTop: 2 },
  filterEmptyBrot: { width: 42, alignItems: 'center' },
  filterEmptyTexts: { flex: 1, minWidth: 0 },
  filterEmptyTitle: { fontSize: 13, fontWeight: '900', fontFamily: nunitoFamily('900') },
  filterEmptyHint: { fontSize: 10.5, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 2, lineHeight: 15 },
  filterEmptyHintStrong: { fontWeight: '900', fontFamily: nunitoFamily('900') },
  filterClearSpacing: { marginTop: 10 },
  filterClear: { borderRadius: 15, paddingVertical: 11, alignItems: 'center' },
  filterClearText: { fontSize: 12, fontWeight: '900', fontFamily: nunitoFamily('900') },
  // filterScrollWrap NO clipea (sin overflow): la sombra elevada del chip
  // activo (~16px hacia abajo) fluye libre. El fade a la derecha es un overlay.
  //
  // SANGRÍA NEGATIVA (owner 2026-08-12): el scroller vivía dentro del padding
  // 20 del cuerpo, así que los chips se cortaban en seco a 20px de cada borde y
  // el carrusel se leía como recortado por los costados. Con el bleed el
  // viewport llega a los bordes reales de la pantalla: los chips entran y salen
  // por el filo, que es como se lee un carrusel.
  filterScrollWrap: { position: 'relative', marginTop: 4, marginHorizontal: -BODY_PAD },
  // El padding compensa el bleed: el primer y el último chip quedan alineados
  // con el resto del cuerpo (BODY_PAD) más los 6 de aire que ya tenían para que
  // la sombra del chip activo no toque el borde del viewport. paddingBottom
  // generoso por lo mismo (el contentContainer crece con el padding).
  filterScrollContent: {
    gap: 9,
    paddingHorizontal: BODY_PAD + 6,
    paddingTop: 8,
    paddingBottom: 18,
  },
  // v2 · el fade se recorta al ALTO DE LOS CHIPS (mismo top/bottom que el
  // padding del contenido del scroller): a bordes 0/0 se comía la sombra
  // proyectada del chip activo y el degradé se leía como un corte. `zIndex:2`
  // es explícito aunque el orden de hermanos ya lo deje arriba. Con el bleed
  // del wrap, `right: 0` ya es el borde REAL de la pantalla — que es donde el
  // degradé tiene sentido: dice "sigue", no "acá se cortó".
  filterFade: { position: 'absolute', top: 8, right: 0, bottom: 18, width: 30, zIndex: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: GASTOS_RADII.chip, paddingVertical: 9, paddingHorizontal: 13 },
  // Swatch de color de categoría (reemplaza el emoji del chip).
  chipIcon: { width: 17, height: 17, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  // Chip activo en 900 (handoff: activo 900 / inactivo 800).
  chipLabelActive: { fontWeight: '900', fontFamily: nunitoFamily('900') },
  chipBadge: { minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  chipBadgeText: { fontSize: 10, fontWeight: '900', fontFamily: nunitoFamily('900') },

  // ⑦ movimientos
  movSectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 20, paddingHorizontal: 4 },
  sectionLabel: { flexShrink: 1, fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.84 },
  movChip: { flexShrink: 0, fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  movList: { marginTop: 12, gap: 10 },
  movGroupGap: { marginTop: 4 },
  // v2 · textos largos — el encabezado del grupo trunca y el TOTAL nunca se
  // comprime ni se empuja fuera ("MIÉRCOLES 12 DE SEPTIEMBRE" contra un total
  // de 7 cifras entraba en conflicto y ganaba el que se dibujara primero).
  movGroupHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 },
  movGroupLabel: { flexShrink: 1, minWidth: 0, fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.32 },
  movGroupTotal: { flexShrink: 0, marginLeft: 10, fontSize: 13, fontWeight: '900', fontFamily: nunitoFamily('900') },
  movRows: { gap: 10, marginTop: 10 },
  movRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: GASTOS_RADII.row, paddingVertical: 12, paddingHorizontal: 14 },
  movTile: { width: 44, height: 44, borderRadius: GASTOS_RADII.tile, alignItems: 'center', justifyContent: 'center' },
  movEmoji: { fontSize: 20 },
  movTexts: { flex: 1, minWidth: 0 },
  movTitle: { fontSize: 14.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  movSub: { fontSize: 11.5, fontWeight: '700', fontFamily: nunitoFamily('700') },
  movAmount: { flexShrink: 0, marginLeft: 8, fontSize: 14.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  // v2 · M-3 — nota bajo una fila fuera de ciclo.
  // paddingHorizontal 14 = `movRow.paddingHorizontal`: la nota arranca en la
  // misma vertical que el título del gasto. Con 4 quedaba desalineada, colgando
  // a la izquierda del contenido de la fila.
  movRowNote: { fontSize: 10.5, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 15, marginTop: 6, paddingHorizontal: 14 },
  // El botón cierra la lista: pegado a la última fila (marginTop 0) se leía
  // como una fila más. 18 lo separa del bloque sin abrir un hueco.
  seeMoreSpacing: { marginTop: 18 },
  seeMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: GASTOS_RADII.chip, paddingVertical: 12 },
  seeMoreText: { fontSize: 12.5, fontWeight: '900', fontFamily: nunitoFamily('900') },

  // estados vacíos: pill de CTA + pozo inset de movimientos
  emptyCta: { borderRadius: 15, paddingVertical: 9, paddingHorizontal: 15 },
  emptyCtaText: { fontSize: 12, fontWeight: '900', fontFamily: nunitoFamily('900') },
  movEmptySpacing: { marginTop: 12 },
  movEmptyWell: { borderRadius: 22, padding: 18, alignItems: 'center', gap: 9 },
  // ─── v2 · M-4/EV6 con molde punteado ───
  movGhostStack: { gap: 9, marginBottom: 13 },
  movEmptyWellRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, paddingVertical: 11, paddingHorizontal: 13 },
  movEmptyBrotSlot: { width: 40, alignItems: 'center' },
  movEmptySubInline: { flex: 1, fontSize: 11.5, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 16 },
  movEmptyCtaRow: { marginTop: 12 },
  movEmptyTitle: { fontSize: 13, fontWeight: '900', fontFamily: nunitoFamily('900') },
  movEmptySub: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: -4,
    lineHeight: 16,
  },

  homeIndicator: { width: 132, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
})
