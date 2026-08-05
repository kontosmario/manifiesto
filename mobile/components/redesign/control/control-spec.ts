/**
 * Tokens de la vista CONTROL del rediseño — valores LITERALES del layout
 * final ensamblado de design_handoff_control/Control Manifiesto.dc.html
 * (bloque `<!-- LAYOUT-CONTROL -->`, teléfono claro + oscuro, fuente de
 * verdad) + README.md del handoff (resumen). Mismo criterio que
 * fijos-spec/gastos-spec/home-spec: no "mejorar" valores, transcripción
 * literal del markup.
 *
 * ALCANCE de este módulo: base del tema + lo COMPARTIDO entre secciones
 * (labels de sección, pill de veredicto, pozos, fills de barras, CTA
 * radial, tip durazno, tags PEOR/MEJOR, línea PROM, score ring). Los
 * acentos POR ESTADO de cada componente (hero HC-A/B/C/D, comparativa
 * CV-A/B/C/D, tendencia S1–S6, patrón WP-A/B/C/D, reparto SD-A/B/C/D,
 * alcancía E1–E6) viven COLOCADOS en su part file
 * (`control/parts/control-*.tsx`) — a diferencia de fijos-spec que metió
 * los E-states del hero acá. Razón: Control tiene 6 componentes con 4–6
 * estados cada uno; centralizarlos haría de este archivo un god-module y
 * cada part es la única lectora de sus acentos.
 *
 * DISCREPANCIAS markup layout-final vs tandas de estados (el layout
 * final ganó en todas — las tandas son iteraciones previas del mismo
 * componente a otra escala):
 *  [A] Las tandas dibujan cards de 372–400px con paddings 16–17px y
 *      fuentes 1–3px más grandes que el layout final (15px padding,
 *      title 16.5). Se transcribió el layout final; de las tandas solo
 *      salen acentos de color, poses de Brot y copy por estado.
 *  [B] Inset profundo: el README cita 5px/12px/0.5/0.92 y el layout
 *      final lo usa en pozos de gráficos (tendencia/hábito/reparto) —
 *      NO es el insetLg 4px/9px de neo-tokens; campo propio `insDeep`.
 *  [C] El hero del layout final mide radius 30 (README "hero 30") — no
 *      el 32 de neoRadii.hero.
 *  [D] La barra espejo de la comparativa en el layout final mide 34px
 *      de alto con labels 11.5 (la tanda CV dibuja 38px/12.5). Layout
 *      final ganó.
 *
 * Gradientes como strings CSS (`experimental_backgroundImage` vía
 * cssGradient) y sombras como `boxShadow` literal (multi-sombra +
 * inset), igual que el resto del sistema.
 */

export type ControlMode = 'light' | 'dark'

/** Radios (constantes, no tokens de color). Círculos puros (dots, knob,
 *  score ring, FAB) no van acá. */
export const CONTROL_RADII = {
  phone: 46,
  /** Hero "Hasta cuándo te alcanza" — [C] 30, no 32. */
  hero: 30,
  /** Cards de sección (comparativa/tendencia/hábito/reparto/meta). */
  card: 26,
  /** Pozo del veredicto dentro del hero (`border-radius:20px`). */
  heroWell: 20,
  /** Celdas RITMO/CUPO/QUEDAN dentro del hero. */
  heroCell: 14,
  /** Pill de veredicto del header de cada card (padding 5/10). */
  verdictPill: 12,
  /** Chip "al día 30"/"faltante" junto al monto del hero. */
  heroAmountChip: 9,
  /** CTA chico del pie del hero ("Mover a la meta ›"). */
  heroCta: 12,
  /** Pozo del gráfico de tendencia y del ranking del hábito. */
  chartWell: 20,
  /** Barras del gráfico de 7 días. */
  trendBar: 6,
  /** Barras del ranking semanal. */
  patronBar: 7,
  /** Sello hundido de la comparativa ("GASTÁS MENOS QUE..."). */
  comparativaStamp: 18,
  /** Barra espejo Este mes / ahorrado. */
  mirrorBar: 11,
  /** Fila "Donde más gastaste". */
  topCatRow: 13,
  /** Track del reparto (contenedor con padding 5). */
  repartoTrack: 13,
  /** Segmentos fijos/ahorro/libre dentro del track. */
  repartoSeg: 9,
  /** Pastillas FIJOS/AHORRO/LIBRE del reparto. */
  statTile: 15,
  /** Chip de insight con Brot (tendencia 16 / hábito 16 / reparto 18). */
  brotChip: 16,
  brotChipLg: 18,
  /** Tip durazno accionable del hábito. */
  tipCard: 16,
  /** Tag HOY · DÍA 18 del reparto. */
  hoyTag: 8,
  /** Tags PEOR/MEJOR del ranking. */
  dayTag: 6,
  /** CTAs de la meta ("Sumar ahora"/"Editar meta") y "Definir ›". */
  cta: 14,
  ctaSm: 12,
  /** Chip de la meta ("✈️ Vacaciones · faltan..."). */
  goalChip: 13,
  /** Barra de progreso de la meta. */
  goalBar: 7,
  /** Frasco: tapa (superior/inferior) y cuerpo (arriba/abajo). */
  jarLidTop: 6,
  jarLidBottom: 3,
  jarBodyTop: 14,
  jarBodyBottom: 24,
} as const

export interface ControlSpec {
  // ─── Base del tema ───
  bg: string
  /** Cards: fill sólido en claro; en oscuro el markup dibuja SOLO el
   *  gradiente 145deg — `cardBackground` queda de fallback (primer stop,
   *  criterio de fijos-spec). */
  cardBackground: string
  cardGradientCss: string | undefined
  /** raisedLg canónico (coincide con neo-tokens en ambos temas). */
  cardShadow: string
  text: string
  /** #6C7B67 / #93A78F — texto secundario y labels de sección. */
  sub: string
  /** #9AA694 / #7C917A — apagado (eyebrows chicos, ejes, captions). */
  faint: string
  green: string
  orange: string
  /** Teal del tramo ahorro del reparto (README: teal ahorro). */
  teal: string
  /** Ámbar "ritmo en alza" (S2) — #B0742A / #E8B57C. */
  amber: string
  /** Inset suave (README: 3px/7px). Idéntico a neo insetMd. */
  insMd: string
  /** [B] Inset profundo (README: 5px/12px) — pozos de gráficos. */
  insDeep: string

  // ─── ① Header — título + trigger de ciclo + score ───
  headerTitleInk: string
  cycTrigInk: string
  cycTrigDot: string
  /** Track del anillo del score — #D2D6C6 / #26362B. */
  scoreTrack: string
  /** Stroke del progreso del anillo — #3E8746 / #7FD08A. */
  scoreStroke: string
  scoreInk: string
  /** Caption "SALUD" bajo el número. */
  scoreCaption: string

  // ─── ② Hero (base; los 4 estados HC viven en control-hero) ───
  /** Sombra EXTERIOR del hero: la única parte del hero que cambia por
   *  tema (la card es auto-coloreada). */
  heroShadow: string

  // ─── Compartido entre cards ───
  /** Labels de sección COMPARATIVA/TENDENCIA/HÁBITO/REPARTO/META. */
  sectionLabelInk: string
  /** Barra neutral (sombra de semana previa en ranking, resto de la
   *  barra espejo). */
  neutralBarCss: string
  neutralBarFallback: string
  /** Fill verde de barras (90deg — barras espejo/ranking/timeline). */
  greenBarCss: string
  greenBarFallback: string
  /** Fill naranja de barras (90deg — día peor, overflow comparativa). */
  orangeBarCss: string
  orangeBarFallback: string
  /** Fill verde vertical del frasco/progreso de meta (180deg — en claro
   *  #7FB069→#3E8746, en oscuro #5CA166→#2E7735). */
  greenFillVCss: string
  greenFillVFallback: string
  /** Sombra de la semana previa en el gráfico de 7 días — #D2D6C6 /
   *  rgba(101,152,113,0.2). */
  trendPrevBar: string
  /** Glow de la barra de HOY (`box-shadow:0 0 10px rgba(120,220,130,0.4)`,
   *  ambos temas). */
  trendTodayGlow: string
  /** Línea CUPO punteada del gráfico. */
  cupoLine: string
  /** El label CUPO pisa la línea con el bg de la CARD detrás. */
  cupoLabelBg: string
  /** Divisor horizontal dentro de cards — #D8DCC9 / rgba(101,152,113,0.16). */
  divider: string
  /** Línea PROM vertical del ranking + su anillo de contraste. */
  promLine: string
  promLineRing: string
  /** Tags PEOR / MEJOR del ranking. */
  tagWorstBg: string
  tagWorstInk: string
  tagBestBg: string
  tagBestInk: string
  /** Marca HOY · DÍA N del reparto. */
  hoyTagBg: string
  hoyTagInk: string
  /** Tip durazno accionable (hábito) — gradiente + tinta. */
  tipBgCss: string
  tipBgFallback: string
  tipInk: string
  tipShadow: string
  /** CTA radial verde ("Sumar ahora"/"Definir ›"/"Ver fijos ›" — idéntico
   *  en ambos temas en todo el markup de Control). */
  ctaRadialCss: string
  ctaRadialFallback: string
  ctaInk: string
  ctaShadow: string
  /** CTA secundaria hundida ("Editar meta"). */
  ctaGhostInk: string

  // ─── ⑦ Meta / frasco ───
  /** Tapa del frasco (180deg). */
  jarLidCss: string
  jarLidFallback: string
  /** Fill del cuerpo del frasco — transparente en claro (el inset lo
   *  dibuja), #122015 en oscuro. */
  jarBodyBg: string | undefined
  /** % grande dentro del frasco — #1F3A26 / #DDF3DC. */
  jarPctInk: string
  /** Menisco plano: banda superior del líquido (ambos temas). */
  jarMeniscus: string
}

// Alias locales (definidos una vez, referenciados por campo) — mismo
// mecanismo que fijos-spec/gastos-spec.
const RAISE_L = '8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)'
const RAISE_D = '8px 8px 18px rgba(0,0,0,0.55), -8px -8px 18px rgba(101,152,113,0.1)'
const INS_L = 'inset 3px 3px 7px rgba(151,160,136,0.35), inset -3px -3px 7px rgba(255,255,255,0.9)'
const INS_D = 'inset 3px 3px 7px rgba(0,0,0,0.5), inset -3px -3px 7px rgba(101,152,113,0.08)'
const INS_DEEP_L = 'inset 5px 5px 12px rgba(151,160,136,0.5), inset -5px -5px 12px rgba(255,255,255,0.92)'
const INS_DEEP_D = 'inset 5px 5px 12px rgba(0,0,0,0.55), inset -5px -5px 12px rgba(101,152,113,0.08)'

export const CONTROL_SPEC: Record<ControlMode, ControlSpec> = {
  light: {
    bg: '#DCDFCD',
    cardBackground: '#E9EBE0',
    cardGradientCss: undefined,
    cardShadow: RAISE_L,
    text: '#24382A',
    sub: '#6C7B67',
    faint: '#9AA694',
    green: '#2E7C39',
    orange: '#C25B33',
    teal: '#2E9C8E',
    amber: '#B0742A',
    insMd: INS_L,
    insDeep: INS_DEEP_L,

    headerTitleInk: '#24382A',
    cycTrigInk: '#6C7B67',
    cycTrigDot: '#2E7C39',
    scoreTrack: '#D2D6C6',
    scoreStroke: '#3E8746',
    scoreInk: '#24382A',
    scoreCaption: '#9AA694',

    heroShadow:
      '12px 12px 26px rgba(124,138,110,0.55), -8px -8px 20px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.28)',

    sectionLabelInk: '#6C7B67',
    neutralBarCss: 'linear-gradient(90deg, #D9DCCC, #C9CDBB)',
    neutralBarFallback: '#D9DCCC',
    greenBarCss: 'linear-gradient(90deg, #7FB069, #3E8746)',
    greenBarFallback: '#3E8746',
    orangeBarCss: 'linear-gradient(90deg, #E89A6E, #C25B33)',
    orangeBarFallback: '#C25B33',
    greenFillVCss: 'linear-gradient(180deg, #7FB069, #3E8746)',
    greenFillVFallback: '#3E8746',
    trendPrevBar: '#D2D6C6',
    trendTodayGlow: '0 0 10px rgba(120,220,130,0.4)',
    cupoLine: '#9AA694',
    cupoLabelBg: '#E9EBE0',
    divider: '#D8DCC9',
    promLine: 'rgba(36,56,42,0.6)',
    promLineRing: 'rgba(255,255,255,0.7)',
    tagWorstBg: '#C25B33',
    tagWorstInk: '#F5F2E1',
    tagBestBg: '#2E7C39',
    tagBestInk: '#F5F2E1',
    hoyTagBg: '#24382A',
    hoyTagInk: '#F5F2E1',
    tipBgCss: 'linear-gradient(145deg, #F7E9D8, #F1D9C2)',
    tipBgFallback: '#F4E1CD',
    tipInk: '#7A4A2E',
    tipShadow: INS_L,
    ctaRadialCss: 'radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)',
    ctaRadialFallback: '#2E7434',
    ctaInk: '#F5F2E1',
    ctaShadow: '0 6px 12px rgba(46,116,52,0.3)',
    ctaGhostInk: '#2E7C39',

    jarLidCss: 'linear-gradient(180deg, #EFF1E7, #DADECC)',
    jarLidFallback: '#E5E8DA',
    jarBodyBg: undefined,
    jarPctInk: '#1F3A26',
    jarMeniscus: 'rgba(255,255,255,0.28)',
  },
  dark: {
    bg: '#0F1A13',
    cardBackground: '#1D3426',
    cardGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    cardShadow: RAISE_D,
    text: '#F1EEDD',
    sub: '#93A78F',
    faint: '#7C917A',
    green: '#A4E3A6',
    orange: '#F2A87E',
    teal: '#7FD8C6',
    amber: '#E8B57C',
    insMd: INS_D,
    insDeep: INS_DEEP_D,

    headerTitleInk: '#F1EEDD',
    cycTrigInk: '#93A78F',
    cycTrigDot: '#A4E3A6',
    scoreTrack: '#26362B',
    scoreStroke: '#7FD08A',
    scoreInk: '#F1EEDD',
    scoreCaption: '#7C917A',

    heroShadow: '14px 14px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.16)',

    sectionLabelInk: '#93A78F',
    neutralBarCss: 'linear-gradient(90deg, #33463A, #26362B)',
    neutralBarFallback: '#33463A',
    greenBarCss: 'linear-gradient(90deg, #7FB069, #3E8746)',
    greenBarFallback: '#3E8746',
    orangeBarCss: 'linear-gradient(90deg, #E89A6E, #C25B33)',
    orangeBarFallback: '#C25B33',
    greenFillVCss: 'linear-gradient(180deg, #5CA166, #2E7735)',
    greenFillVFallback: '#2E7735',
    trendPrevBar: 'rgba(101,152,113,0.2)',
    trendTodayGlow: '0 0 10px rgba(120,220,130,0.4)',
    cupoLine: '#7C917A',
    cupoLabelBg: '#16271C',
    divider: 'rgba(101,152,113,0.16)',
    promLine: 'rgba(232,242,222,0.55)',
    promLineRing: 'rgba(0,0,0,0.45)',
    tagWorstBg: '#F2A87E',
    tagWorstInk: '#16271C',
    tagBestBg: '#A4E3A6',
    tagBestInk: '#16271C',
    hoyTagBg: '#F1EEDD',
    hoyTagInk: '#16271C',
    tipBgCss: 'linear-gradient(145deg, #3A2A1E, #2A1D13)',
    tipBgFallback: '#32241A',
    tipInk: '#E8B79A',
    tipShadow: INS_D,
    ctaRadialCss: 'radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)',
    ctaRadialFallback: '#2E7434',
    ctaInk: '#F5F2E1',
    ctaShadow: '0 6px 12px rgba(46,116,52,0.3)',
    ctaGhostInk: '#A4E3A6',

    jarLidCss: 'linear-gradient(180deg, #26422F, #16281C)',
    jarLidFallback: '#1E3525',
    jarBodyBg: '#122015',
    jarPctInk: '#DDF3DC',
    jarMeniscus: 'rgba(255,255,255,0.28)',
  },
}
