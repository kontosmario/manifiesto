/**
 * Tokens de la vista GASTOS del rediseño — valores LITERALES de
 * design/gastos-2026-07/gastos.dc.html (estático claro+oscuro, fuente de
 * verdad de valores) + gastos-interactivo.dc.html (comportamiento). Réplica
 * bajo gate de aprobación (redesign-approval-status: 'gastos'): no "mejorar"
 * valores. Mismo criterio que home-spec / auth-spec / notif-spec.
 *
 * DECISIONES DE OWNER YA RESUELTAS (aplicadas acá, superan al plan donde
 * difieran):
 *  [F] Hero forest = el MISMO de la Home aprobada (home-spec.heroGradientCss,
 *      #244235→#297811) en AMBOS temas — NO el forest del handoff Gastos.
 *  [B] Hero dark = tratamiento dark propio del estático (glow #EFF6E2, labels
 *      #9FB89C, track/fill oscuros).
 *  [C] Badge del detalle en dark → exceso-dark (rgba(217,115,85,0.24)/#F2A87E).
 *  [E] Banner vencido = sombra del estático (8px 8px 18px rgba(160,110,80,0.35),
 *      -8px -8px 18px rgba(255,255,255,0.85)).
 *  [H] Pesos de celda per-estado del estático (bien 800 / exceso 900 / hoy 900
 *      / futuro 700).
 *
 * Gradientes como strings CSS (experimental_backgroundImage) y sombras como
 * boxShadow literal (multi-sombra + inset, rinde con minSdk 29). El text-shadow
 * del monto NO va como string (textShadowColor/Offset/Radius).
 */

export type GastosMode = 'light' | 'dark'

/** Radios (constantes, no tokens de color). borderRadius 50%→mitad. */
export const GASTOS_RADII = {
  phone: 46,
  hero: 32,
  card: 28,
  row: 22,
  well: 24,
  chip: 18,
  navPill: 18,
  day: 13,
  tile: 16,
  badge: 11,
  arrow: 20,
  brotBtn: 22,
} as const

export interface GastosSpec {
  // ─── Base del tema (helpers del interactivo, states int:181-194) ───
  bg: string
  cardGradientCss: string | undefined
  cardBackground: string
  text: string
  sub: string
  faint: string
  d2: string
  green: string
  onDark: string
  shellShadow: string
  statusInk: string
  /** Alias de sombras (definidos una vez, referenciados por campo). */
  raise: string
  raiseSm: string
  raiseLg: string
  ins: string
  insSoft: string
  /** Fill del pozo dark (`background:#142519`); undefined en claro. */
  insBg: string | undefined

  // ─── ① Header + trigger de ciclo (states int:41,283-287; [OWNER-G]) ───
  brotBtnGradientCss: string | undefined
  brotBtnBackground: string
  brotBtnShadow: string
  // Badge numérico del acceso al jardín (estilo home HeaderButton: naranja,
  // oculto en 0). El borde lo pone el componente con `bg` (color del fondo).
  brotBadgeInk: string
  brotBadgeBackground: string
  cycTrigInkCurrent: string
  cycTrigInkClosed: string
  cycTrigDotCurrent: string
  cycTrigDotCurrentGlow: string
  cycTrigDotClosed: string

  // ─── ② Dropdown de ciclo (states int:288-301) ───
  ddBackground: string
  ddGradientCss: string | undefined
  ddShadow: string
  ddIconCurrentInk: string
  ddNameInk: string
  ddTagCurrentInk: string
  ddTagClosedInk: string
  ddActiveBackground: string | undefined
  ddActiveShadow: string

  // ─── ③ Hero forest ([OWNER-F] Home forest ambos temas; [OWNER-B] dark) ───
  heroGradientCss: string
  heroShadow: string
  heroDot: string
  heroTagInk: string
  heroChipInk: string
  heroChipBackground: string
  heroChipShadow: string
  wellBackground: string
  wellShadow: string
  amountInk: string
  /** text-shadow del monto: NO string. Dark = glow ({0,0} radius 26). */
  amountShadowColor: string
  amountShadowRadius: number
  amountShadowOffset: { width: number; height: number }
  heroLabelInk: string
  heroValueInk: string
  bar7Bright: string
  bar7Dim: string
  bar7Peak: string
  catTrackBackground: string
  catTrackShadow: string
  catFillCss: string
  catTextInk: string

  // ─── ④ Calendario — card + estados de día (cal §1-2; [OWNER-H] pesos) ───
  calBackground: string
  calGradientCss: string | undefined
  calShadow: string
  calTitleInk: string
  calHintInk: string
  weekdayInk: string
  // bien (800)
  dayBienBackground: string
  dayBienInk: string
  dayBienShadow: string
  // exceso (900)
  dayExcesoBackground: string
  dayExcesoInk: string
  dayExcesoShadow: string
  // hoy (900, elevado/glow, NO inset)
  dayHoyBackground: string
  dayHoyInk: string
  dayHoyShadow: string
  dayHoyDot: string
  // futuro (700)
  dayFuturoBackground: string | undefined
  dayFuturoInk: string
  dayFuturoShadow: string
  // anillo de selección (reemplaza la sombra de estado)
  daySelRing: string
  // fuera-de-ciclo (NO theme-switched)
  dayFueraBackgroundCss: string
  dayFueraShadow: string
  dayFueraInk: string
  // adornos estáticos [OWNER-A]
  daySproutInk: string

  // ─── ⑤ Detalle de día (cal §3, states §d) ───
  dayCardBackground: string
  dayCardGradientCss: string | undefined
  dayCardShadow: string
  detailLabelInk: string
  /** Badge "Día de exceso"/"Fuera de ciclo" — [OWNER-C] exceso-dark en dark. */
  detailBadgeBackground: string
  detailBadgeInk: string
  detailBadgeShadow: string
  backCalInk: string
  backCalBackground: string | undefined
  backCalShadow: string
  arrowBackground: string
  arrowGradientCss: string | undefined
  arrowShadow: string
  arrowGlyph: string
  dayNumInk: string
  detailSubInk: string
  statBorder: string
  statLabelInk: string
  statValGastadoInk: string
  statValMovInk: string
  outStripBackground: string
  outStripShadow: string
  outStripInk: string
  ctaPrimaryInk: string
  ctaPrimaryGradientCss: string
  ctaPrimaryShadow: string
  ghostInk: string
  ghostBackground: string | undefined
  ghostShadow: string

  // ─── ⑥ Filtro (light §5, dark §6) ───
  filterLabelInk: string
  chipActiveInk: string
  chipActiveGradientCss: string
  chipActiveShadow: string
  chipActiveBadgeBackground: string
  chipActiveBadgeInk: string
  chipInactiveInk: string
  chipInactiveBackground: string | undefined
  chipInactiveShadow: string
  chipInactiveBadgeBackground: string
  chipInactiveBadgeInk: string
  fadeGradientCss: string

  // ─── ⑦ Movimientos (light §6, dark §7) ───
  sectionLabelInk: string
  sectionCountInk: string
  dayHeadLabelInk: string
  dayHeadTotalInk: string
  movRowBackground: string
  movRowGradientCss: string | undefined
  movRowShadow: string
  movTitleInk: string
  movSubInk: string
  movAmountInk: string
  tilePink: string
  tileMerc: string
  tileRose: string
  tileMint: string
  seeMoreInk: string
  seeMoreBackground: string | undefined
  seeMoreShadow: string
  movChipInk: string

  // ─── ⑧ Barra cerrada + banner vencido (states §c-d) ───
  closedBarInk: string
  closedBarGradientCss: string
  closedBarShadow: string
  // Banner vencido: paleta peach única; solo la SOMBRA es theme-aware (dark
  // sin el glow blanco, que quedaba feo sobre el canvas oscuro).
  alertGradientCss: string
  alertShadow: string
  alertTitleInk: string
  alertSubInk: string
  confirmBtnInk: string
  confirmBtnBackground: string
  confirmBtnShadow: string

  // ─── Estados vacíos (usuario nuevo / ciclo sin movimientos) ───
  // Innovados para Gastos, con el MISMO lenguaje que los vacíos aprobados de
  // la Home: sub crema muted del hero + CTA crema (linear 145deg #F7F4E6→
  // #E2DEC8, ink #1F3A26), valores literales idénticos a home-spec. El CTA
  // verde del vacío de movimientos reusa `ctaPrimary*`; el pozo inset reusa
  // `insBg`/`ins`. Paleta única (el hero es forest en ambos temas).
  emptyHeroSubInk: string
  ctaCreamGradientCss: string
  ctaCreamInk: string
  ctaCreamShadow: string

  // ─── Home indicator (nav se reusa del home-kit) ───
  homeIndicator: string
  homeIndicatorOpacity: number
}

// Alias de sombras — definidos una vez y re-usados (como home-spec inlinea).
const RAISE_L = '8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)'
const RAISE_D = '8px 8px 18px rgba(0,0,0,0.55), -8px -8px 18px rgba(101,152,113,0.1)'
const RAISE_SM_L = '6px 6px 14px rgba(151,160,136,0.42), -6px -6px 14px rgba(255,255,255,0.9)'
const RAISE_SM_D = '6px 6px 14px rgba(0,0,0,0.55), -6px -6px 14px rgba(101,152,113,0.12)'
const RAISE_LG_L = '10px 10px 22px rgba(151,160,136,0.45), -10px -10px 22px rgba(255,255,255,0.95)'
const RAISE_LG_D = '10px 10px 22px rgba(0,0,0,0.55), -10px -10px 22px rgba(101,152,113,0.12)'
// NOTA (2026-07-23): hubo un token propio de fila (`ROW_RAISE_*`, 1 capa +
// blur chico) para abaratar la composición del scroll. Se REVIRTIÓ: el jank
// nunca fue de la fila — se estaba midiendo la pantalla desde la ruta de
// preview de Settings→Dev, montada ENCIMA de las tabs (con la Gastos vieja y
// la Home neo vivas debajo). Montada en su tab real quedó ágil sin ningún
// cambio. La fila usa el RAISE compartido del mockup aprobado.
const INS_L = 'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)'
const INS_D = 'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)'
const INS_SOFT_L = 'inset 2px 2px 5px rgba(151,160,136,0.3), inset -2px -2px 5px rgba(255,255,255,0.8)'
const INS_SOFT_D = 'inset 2px 2px 5px rgba(0,0,0,0.45), inset -2px -2px 5px rgba(101,152,113,0.07)'

export const GASTOS_SPEC: Record<GastosMode, GastosSpec> = {
  light: {
    bg: '#E9EBE0',
    cardGradientCss: undefined,
    cardBackground: '#E9EBE0',
    text: '#24382A',
    sub: '#6C7B67',
    faint: '#9AA694',
    d2: '#3E5A44',
    green: '#2E7C39',
    onDark: '#F5F2E1',
    shellShadow: '0 34px 80px rgba(8,14,8,0.55)',
    statusInk: '#24382A',
    raise: RAISE_L,
    raiseSm: RAISE_SM_L,
    raiseLg: RAISE_LG_L,
    ins: INS_L,
    insSoft: INS_SOFT_L,
    insBg: undefined,

    brotBtnGradientCss: undefined,
    brotBtnBackground: '#E9EBE0',
    brotBtnShadow: RAISE_SM_L,
    brotBadgeInk: '#FFF7E8',
    brotBadgeBackground: '#D97E4F',
    cycTrigInkCurrent: '#6C7B67',
    cycTrigInkClosed: '#8A5A2E',
    cycTrigDotCurrent: '#2E7C39',
    cycTrigDotCurrentGlow: 'rgba(120,220,130,0.7)',
    cycTrigDotClosed: '#C9A05A',

    ddBackground: '#E9EBE0',
    ddGradientCss: undefined,
    ddShadow: RAISE_L,
    ddIconCurrentInk: '#2E7C39',
    ddNameInk: '#24382A',
    ddTagCurrentInk: '#2E7C39',
    ddTagClosedInk: '#B05E2F',
    ddActiveBackground: undefined,
    ddActiveShadow: INS_L,

    // [OWNER-F] Home forest (home-spec.heroGradientCss) en ambos temas.
    heroGradientCss: 'linear-gradient(155deg, #244235 0%, #1F590D 33%, #297811 67%, #297811 100%)',
    heroShadow: '12px 12px 26px rgba(124,138,110,0.55), -8px -8px 20px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.25)',
    heroDot: '#C9F3C6',
    heroTagInk: 'rgba(240,248,230,0.85)',
    heroChipInk: '#F2F7E6',
    heroChipBackground: 'rgba(255,255,255,0.16)',
    heroChipShadow: 'inset 0 1px 2px rgba(20,45,25,0.25)',
    wellBackground: 'rgba(13,34,18,0.30)',
    wellShadow: 'inset 6px 6px 14px rgba(6,20,10,0.5), inset -5px -5px 12px rgba(130,190,130,0.18)',
    amountInk: '#F7F4E4',
    amountShadowColor: 'rgba(10,30,15,0.35)',
    amountShadowRadius: 8,
    amountShadowOffset: { width: 0, height: 2 },
    heroLabelInk: 'rgba(240,248,230,0.8)',
    heroValueInk: '#F7F4E4',
    bar7Bright: 'rgba(240,248,230,0.75)',
    bar7Dim: 'rgba(240,248,230,0.45)',
    bar7Peak: '#EFF6E2',
    catTrackBackground: 'rgba(15,35,20,0.35)',
    catTrackShadow: 'inset 0 1.5px 3px rgba(10,25,14,0.4)',
    catFillCss: 'linear-gradient(90deg, #C9F3C6, #EFF6E2)',
    catTextInk: '#F2F7E6',

    calBackground: '#E9EBE0',
    calGradientCss: undefined,
    calShadow: RAISE_L,
    calTitleInk: '#6C7B67',
    calHintInk: '#2E7C39',
    weekdayInk: '#9AA694',
    dayBienBackground: '#DCEBD8',
    dayBienInk: '#3E6B44',
    dayBienShadow: 'inset 2px 2px 4px rgba(90,110,70,0.15)',
    dayExcesoBackground: '#F3C9BC',
    dayExcesoInk: '#A84A2F',
    dayExcesoShadow: 'inset 2px 2px 4px rgba(150,80,50,0.2)',
    dayHoyBackground: '#24382A',
    dayHoyInk: '#F5F2E1',
    dayHoyShadow: '0 6px 14px rgba(36,56,42,0.35)',
    dayHoyDot: '#A4E3A6',
    dayFuturoBackground: undefined,
    dayFuturoInk: '#B3BCA8',
    dayFuturoShadow: INS_SOFT_L,
    daySelRing: '0 0 0 3px #2E7C39',
    dayFueraBackgroundCss: 'repeating-linear-gradient(135deg, #F3C9BC 0 6px, #EFB8A6 6px 12px)',
    dayFueraShadow: '0 0 0 2px #D97355, 0 4px 10px rgba(217,115,85,0.35)',
    dayFueraInk: '#8A3A20',
    daySproutInk: '#3E6B44',

    dayCardBackground: '#E9EBE0',
    dayCardGradientCss: undefined,
    dayCardShadow: RAISE_L,
    detailLabelInk: '#6C7B67',
    detailBadgeBackground: '#F3C9BC',
    detailBadgeInk: '#A84A2F',
    detailBadgeShadow: 'inset 2px 2px 4px rgba(150,80,50,0.2)',
    backCalInk: '#2E7C39',
    backCalBackground: undefined,
    backCalShadow: INS_L,
    arrowBackground: '#E9EBE0',
    arrowGradientCss: undefined,
    arrowShadow: RAISE_L,
    arrowGlyph: '#3E5A44',
    dayNumInk: '#24382A',
    detailSubInk: '#6C7B67',
    statBorder: 'rgba(151,160,136,0.35)',
    statLabelInk: '#9AA694',
    statValGastadoInk: '#B05E2F',
    statValMovInk: '#24382A',
    outStripBackground: '#F5DCCE',
    outStripShadow: 'inset 2px 2px 5px rgba(150,80,50,0.2)',
    outStripInk: '#8A4A30',
    ctaPrimaryInk: '#F5F2E1',
    ctaPrimaryGradientCss: 'radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)',
    ctaPrimaryShadow: '0 8px 16px rgba(46,116,52,0.3), inset 0 2px 3px rgba(255,255,255,0.3)',
    ghostInk: '#3E5A44',
    ghostBackground: undefined,
    ghostShadow: INS_L,

    filterLabelInk: '#6C7B67',
    chipActiveInk: '#F5F2E1',
    chipActiveGradientCss: 'radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)',
    chipActiveShadow: '0 8px 16px rgba(46,116,52,0.3), inset 0 2px 3px rgba(255,255,255,0.3)',
    chipActiveBadgeBackground: 'rgba(255,255,255,0.25)',
    chipActiveBadgeInk: '#F5F2E1',
    chipInactiveInk: '#3E5A44',
    chipInactiveBackground: undefined,
    chipInactiveShadow: INS_L,
    chipInactiveBadgeBackground: '#DCEBD8',
    chipInactiveBadgeInk: '#3E6B44',
    fadeGradientCss: 'linear-gradient(90deg, rgba(233,235,224,0), #E9EBE0)',

    sectionLabelInk: '#6C7B67',
    sectionCountInk: '#2E7C39',
    dayHeadLabelInk: '#6C7B67',
    dayHeadTotalInk: '#24382A',
    movRowBackground: '#E9EBE0',
    movRowGradientCss: undefined,
    movRowShadow: RAISE_L,
    movTitleInk: '#24382A',
    movSubInk: '#6C7B67',
    movAmountInk: '#24382A',
    tilePink: '#F6D9D2',
    tileMerc: '#E2EDD2',
    tileRose: '#F5D8DD',
    tileMint: '#DDEBDD',
    seeMoreInk: '#2E7C39',
    seeMoreBackground: undefined,
    seeMoreShadow: INS_L,
    movChipInk: '#2E7C39',

    closedBarInk: '#8A5A2E',
    closedBarGradientCss: 'linear-gradient(145deg, #F0E4C4, #E4D4A8)',
    closedBarShadow: '6px 6px 14px rgba(140,110,60,0.3), -6px -6px 14px rgba(255,255,255,0.8)',
    alertGradientCss: 'linear-gradient(145deg, #F5D9C8, #EFC5AE)',
    alertShadow: '8px 8px 18px rgba(160,110,80,0.35), -8px -8px 18px rgba(255,255,255,0.85)',
    alertTitleInk: '#7A2E17',
    alertSubInk: '#8A4A30',
    confirmBtnInk: '#FFF3E8',
    confirmBtnBackground: '#C25B33',
    confirmBtnShadow: '0 6px 12px rgba(194,91,51,0.4)',

    emptyHeroSubInk: 'rgba(240,248,230,0.75)',
    ctaCreamGradientCss: 'linear-gradient(145deg, #F7F4E6, #E2DEC8)',
    ctaCreamInk: '#1F3A26',
    ctaCreamShadow: '0 8px 16px rgba(20,45,25,0.3), inset 0 2px 3px rgba(255,255,255,0.6)',

    homeIndicator: '#24382A',
    homeIndicatorOpacity: 0.75,
  },
  dark: {
    bg: '#16271C',
    cardGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    cardBackground: '#1A2D21',
    text: '#F1EEDD',
    sub: '#93A78F',
    faint: '#7C917A',
    d2: '#B9CCB2',
    green: '#A4E3A6',
    onDark: '#F5F2E1',
    shellShadow: '0 34px 80px rgba(0,0,0,0.6)',
    statusInk: '#F1EEDD',
    raise: RAISE_D,
    raiseSm: RAISE_SM_D,
    raiseLg: RAISE_LG_D,
    ins: INS_D,
    insSoft: INS_SOFT_D,
    insBg: '#142519',

    brotBtnGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    brotBtnBackground: '#1A2D21',
    brotBtnShadow: RAISE_SM_D,
    brotBadgeInk: '#FFF7E8',
    brotBadgeBackground: '#D97E4F',
    cycTrigInkCurrent: '#93A78F',
    cycTrigInkClosed: '#D9B36A',
    cycTrigDotCurrent: '#A4E3A6',
    cycTrigDotCurrentGlow: 'rgba(120,220,130,0.7)',
    cycTrigDotClosed: '#D9B36A',

    ddBackground: '#1A2D21',
    ddGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    ddShadow: RAISE_D,
    ddIconCurrentInk: '#A4E3A6',
    ddNameInk: '#F1EEDD',
    ddTagCurrentInk: '#A4E3A6',
    ddTagClosedInk: '#D9B36A',
    ddActiveBackground: '#142519',
    ddActiveShadow: INS_D,

    // [OWNER-F] mismo forest de la Home en oscuro (idéntico a claro).
    heroGradientCss: 'linear-gradient(155deg, #244235 0%, #1F590D 33%, #297811 67%, #297811 100%)',
    heroShadow: '14px 14px 30px rgba(0,0,0,0.5), -6px -6px 16px rgba(101,152,113,0.14), inset 0 1px 0 rgba(164,227,166,0.18)',
    heroDot: '#C9F3C6',
    heroTagInk: 'rgba(240,248,230,0.85)',
    heroChipInk: '#F2F7E6',
    heroChipBackground: 'rgba(255,255,255,0.16)',
    heroChipShadow: 'inset 0 1px 2px rgba(20,45,25,0.25)',
    wellBackground: 'rgba(13,34,18,0.30)',
    wellShadow: 'inset 6px 6px 14px rgba(6,20,10,0.5), inset -5px -5px 12px rgba(130,190,130,0.18)',
    // [OWNER-B] dark: #EFF6E2 + glow radius 26.
    amountInk: '#EFF6E2',
    amountShadowColor: 'rgba(150,230,160,0.3)',
    amountShadowRadius: 26,
    amountShadowOffset: { width: 0, height: 0 },
    heroLabelInk: '#9FB89C',
    heroValueInk: '#EFF6E2',
    bar7Bright: 'rgba(240,248,230,0.75)',
    bar7Dim: 'rgba(240,248,230,0.45)',
    bar7Peak: '#EFF6E2',
    catTrackBackground: 'rgba(10,22,13,0.6)',
    catTrackShadow: 'inset 0 1.5px 3px rgba(10,25,14,0.4)',
    catFillCss: 'linear-gradient(90deg, #5F9E66, #A4E3A6)',
    catTextInk: '#F2F7E6',

    calBackground: '#1A2D21',
    calGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    calShadow: RAISE_D,
    calTitleInk: '#93A78F',
    calHintInk: '#A4E3A6',
    weekdayInk: '#7C917A',
    dayBienBackground: 'rgba(164,227,166,0.16)',
    dayBienInk: '#B5DDB4',
    dayBienShadow: 'inset 2px 2px 4px rgba(0,0,0,0.45), inset -2px -2px 4px rgba(164,227,166,0.08)',
    dayExcesoBackground: 'rgba(217,115,85,0.24)',
    dayExcesoInk: '#F2A87E',
    dayExcesoShadow: 'inset 2px 2px 4px rgba(0,0,0,0.45), inset -2px -2px 4px rgba(242,168,126,0.08)',
    dayHoyBackground: '#F1EEDD',
    dayHoyInk: '#16271C',
    dayHoyShadow: '0 0 18px rgba(241,238,221,0.25)',
    dayHoyDot: '#2E7C39',
    dayFuturoBackground: '#142519',
    dayFuturoInk: '#5F7361',
    dayFuturoShadow: 'inset 2px 2px 5px rgba(0,0,0,0.45), inset -2px -2px 5px rgba(101,152,113,0.07)',
    daySelRing: '0 0 0 3px #A4E3A6',
    dayFueraBackgroundCss: 'repeating-linear-gradient(135deg, #F3C9BC 0 6px, #EFB8A6 6px 12px)',
    dayFueraShadow: '0 0 0 2px #D97355, 0 4px 10px rgba(217,115,85,0.35)',
    dayFueraInk: '#8A3A20',
    daySproutInk: '#B5DDB4',

    dayCardBackground: '#1A2D21',
    dayCardGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    dayCardShadow: RAISE_D,
    detailLabelInk: '#93A78F',
    // [OWNER-C] exceso-dark en oscuro.
    detailBadgeBackground: 'rgba(217,115,85,0.24)',
    detailBadgeInk: '#F2A87E',
    detailBadgeShadow: 'inset 2px 2px 4px rgba(0,0,0,0.45), inset -2px -2px 4px rgba(242,168,126,0.08)',
    backCalInk: '#A4E3A6',
    backCalBackground: '#142519',
    backCalShadow: INS_D,
    arrowBackground: '#1A2D21',
    arrowGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    arrowShadow: RAISE_D,
    arrowGlyph: '#B9CCB2',
    dayNumInk: '#F1EEDD',
    detailSubInk: '#93A78F',
    statBorder: 'rgba(151,160,136,0.35)',
    statLabelInk: '#7C917A',
    statValGastadoInk: '#F2A87E',
    statValMovInk: '#F1EEDD',
    outStripBackground: 'rgba(217,115,85,0.14)',
    outStripShadow: 'inset 2px 2px 5px rgba(150,80,50,0.2)',
    outStripInk: '#F2A87E',
    ctaPrimaryInk: '#0F1E14',
    ctaPrimaryGradientCss: 'radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 85%)',
    ctaPrimaryShadow: '0 8px 16px rgba(46,116,52,0.3), inset 0 2px 3px rgba(255,255,255,0.3)',
    ghostInk: '#B9CCB2',
    ghostBackground: '#142519',
    ghostShadow: INS_D,

    filterLabelInk: '#93A78F',
    chipActiveInk: '#0F1E14',
    chipActiveGradientCss: 'radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 85%)',
    chipActiveShadow: '0 0 18px rgba(140,225,150,0.25), inset 0 2px 3px rgba(255,255,255,0.35)',
    chipActiveBadgeBackground: 'rgba(15,30,20,0.25)',
    chipActiveBadgeInk: '#0F1E14',
    chipInactiveInk: '#B9CCB2',
    chipInactiveBackground: '#122015',
    chipInactiveShadow: 'inset 4px 4px 10px rgba(0,0,0,0.62), inset -4px -4px 10px rgba(101,152,113,0.16)',
    chipInactiveBadgeBackground: 'rgba(164,227,166,0.16)',
    chipInactiveBadgeInk: '#A4E3A6',
    fadeGradientCss: 'linear-gradient(90deg, rgba(22,39,28,0), #16271C)',

    sectionLabelInk: '#93A78F',
    sectionCountInk: '#A4E3A6',
    dayHeadLabelInk: '#93A78F',
    dayHeadTotalInk: '#F1EEDD',
    movRowBackground: '#1A2D21',
    movRowGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    movRowShadow: RAISE_D,
    movTitleInk: '#F1EEDD',
    movSubInk: '#93A78F',
    movAmountInk: '#F1EEDD',
    tilePink: 'rgba(246,217,210,0.14)',
    tileMerc: 'rgba(226,237,210,0.13)',
    tileRose: 'rgba(245,216,221,0.14)',
    tileMint: 'rgba(164,227,166,0.14)',
    seeMoreInk: '#A4E3A6',
    seeMoreBackground: '#142519',
    seeMoreShadow: INS_D,
    movChipInk: '#A4E3A6',

    closedBarInk: '#E8C88A',
    closedBarGradientCss: 'linear-gradient(145deg, #3A3322, #2A2416)',
    closedBarShadow: '6px 6px 14px rgba(0,0,0,0.5)',
    // Banner vencido: MISMA paleta peach del claro, pero la sombra dark saca el
    // glow blanco (-8px -8px rgba(255,255,255,0.85)) que quedaba feo sobre el
    // canvas oscuro; usa la sombra dark del sistema (raise dark suave).
    alertGradientCss: 'linear-gradient(145deg, #F5D9C8, #EFC5AE)',
    alertShadow: '8px 8px 18px rgba(0,0,0,0.45), -6px -6px 14px rgba(101,152,113,0.1)',
    alertTitleInk: '#7A2E17',
    alertSubInk: '#8A4A30',
    confirmBtnInk: '#FFF3E8',
    confirmBtnBackground: '#C25B33',
    confirmBtnShadow: '0 6px 12px rgba(194,91,51,0.4)',

    // Paleta única (idéntica a claro): el hero es forest en ambos temas y el
    // CTA crema no cambia entre temas (mismo criterio que home-spec).
    emptyHeroSubInk: 'rgba(240,248,230,0.75)',
    ctaCreamGradientCss: 'linear-gradient(145deg, #F7F4E6, #E2DEC8)',
    ctaCreamInk: '#1F3A26',
    ctaCreamShadow: '0 8px 16px rgba(20,45,25,0.3), inset 0 2px 3px rgba(255,255,255,0.6)',

    homeIndicator: '#F1EEDD',
    homeIndicatorOpacity: 0.7,
  },
}
