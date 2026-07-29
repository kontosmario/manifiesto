/**
 * Tokens de la vista FIJOS del rediseño — valores LITERALES de
 * design/fijos-2026-07/Fijos Manifiesto.dc.html (teléfono claro + oscuro de
 * la vista principal, fuente de verdad de valores) + README.md (resumen).
 * Réplica bajo gate de aprobación (mismo criterio que gastos-spec /
 * home-spec): no "mejorar" valores, transcripción literal del markup.
 *
 * ALCANCE (F0+F1, plan docs/superpowers/plans/2026-07-29-fijos-f0-f1.md):
 * SOLO la vista principal (header, hero por defecto, Avisos con ticker,
 * Todos tus fijos, FAB). Los 8 estados del hero (E1–E8) y los 6 de Avisos
 * (A1–A6) del canvas de estados del mismo .dc.html son contenido de la
 * Task 3/4 (props/fixtures de pantalla, no tokens de este módulo) — ese
 * canvas está solo en tema claro y varios de sus estados introducen
 * gradientes/CTAs propios (cerrado, fuera de ciclo, vacíos) sin versión
 * oscura confirmada en el handoff; instanciarlos acá habría sido inventar
 * valores. El detalle del ítem y el alta en 2 pasos (otras secciones del
 * mismo archivo) son fases 2/3, fuera de este módulo.
 *
 * DISCREPANCIAS markup vs README/sistema (el markup ganó en las 4):
 *  [A] `raise` (light): el markup usa opacidad 0.40 en la primera sombra
 *      (fila de categoría, ambos temas) — el README cita 0.42 (= el RAISE_L
 *      de gastos-spec/neo-tokens). Puede ser drift del handoff; se transcribió
 *      0.40 tal cual está dibujado.
 *  [B] `ins`: el README cita el inset de 9px/0.4/0.95 (= INS_L de gastos).
 *      Ese valor SÍ existe en este mismo archivo, pero solo en la pill "Fijos"
 *      del nav (línea 137 — nav que no se reconstruye acá, Task 6 monta
 *      `NeoTabBarLive`) y en la sección Agregar-fijo (fuera de alcance). El
 *      único inset "general" dentro del alcance F0+F1 (tab Pendientes/
 *      Pagados) mide 8px de blur con opacidades .38/.92 (claro) — un poco
 *      más suave. Se usó ESE valor por ser el que realmente está en la
 *      vista principal.
 *  [C] Tag VENCIDO (oscuro): el README cita fondo `rgba(217,115,85,0.24)`
 *      (= dayExcesoBackground de gastos-spec, = neoCalendar.dark.excess).
 *      El ticker del teléfono oscuro dibuja 0.26 (confirmado 2 veces). Se
 *      transcribió 0.26.
 *  [D] `heroGradientCss`: el README lo describe como "idéntico al resto
 *      del sistema", pero NO coincide con el forest de Home/Gastos
 *      (`#244235→#1F590D→#297811`, ambos temas). El markup de Fijos dibuja
 *      su propio forest, más claro/saturado: `#2E6B33→#3F8746→#57A05C`
 *      (155deg, ambos temas idéntico entre sí). Se transcribió el de Fijos.
 *      El resto del hero (heroShadow, wellBackground/Shadow salvo una capa
 *      extra) SÍ coincide con gastos-spec — ver docblock de cada campo.
 *
 * ÚNICO valor NO literal de este módulo: `cardBackground`/
 * `headerIconBtnBackground`/`avisosCardBackground`/`rowBackground` en
 * oscuro (`#1A2D21`) — el markup nunca dibuja esa card como fill sólido,
 * solo como `linear-gradient(145deg, #1D3426, #132318)`. `#1A2D21` es el
 * fallback que gastos-spec usa para ESE MISMO gradiente (par idéntico de
 * stops); se reutilizó por consistencia en vez de inventar un tono nuevo.
 * Si eso no es aceptable, reemplazar por `bg` (#16271C) o por el primer
 * stop del gradiente (#1D3426).
 *
 * Partículas: NO hay campo en este módulo. `colors="#C9F3C6,#FBD9BC,#EFF6E2"
 * count="10"` del handoff coincide EXACTO con `neoParticlePresets.hero` en
 * `@/theme/neo-tokens` (ya usado directo por gastos-screen.tsx y
 * home-screen.tsx vía `<BrotParticles {...neoParticlePresets.hero} />`).
 * Ni gastos-spec ni home-spec duplican este preset en su propio archivo —
 * se mantuvo la misma forma acá en lugar de inventar un campo nuevo.
 *
 * Gradientes como strings CSS (experimental_backgroundImage) y sombras como
 * boxShadow literal (multi-sombra + inset). El text-shadow del monto NO va
 * como string (amountShadowColor/Radius/Offset, ver home-spec/gastos-spec).
 */

export type FijosMode = 'light' | 'dark'

/**
 * Radios (constantes, no tokens de color). borderRadius 50%→mitad no
 * incluido (círculos puros: dot del FAB interno, badges circulares chicos).
 */
export const FIJOS_RADII = {
  phone: 46,
  hero: 32,
  card: 28,
  row: 22,
  tile: 16,
  /** Tabs (Vencidos/Pendientes/Pagados) y pill "Fijos" del nav. */
  chip: 18,
  /** Chip individual del ticker "POR PAGAR · ESTE MES". */
  chipSm: 15,
  /** Pozo "TE QUEDA DISPONIBLE" dentro del hero. */
  heroWell: 24,
  /** Pozo hundido que envuelve el ticker (distinto del `chipSm` que viaja adentro). */
  tickerWell: 20,
  /** Chip "HOY · DÍA 18" / "✓ AL DÍA" arriba a la derecha del hero. */
  heroTag: 14,
  /** Chip "⚠ 3 fijos por pagar · 1 vencida" dentro del pozo del hero. */
  alertChip: 12,
  /** Ícono de tendencia en AUMENTOS Y RECORDATORIOS. */
  aumentoTile: 13,
  /** Burbuja de conteo en los tabs (18px de alto). */
  tabBadge: 9,
  /** Burbuja de conteo junto a "Avisos" (20px de alto). */
  avisosBadge: 10,
} as const

export interface FijosSpec {
  // ─── Base del tema ───
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

  // ─── ① Header — título + trigger de ciclo + botón de ícono ───
  // El botón de la derecha del header dibuja un ÍCONO DE CALENDARIO (rect +
  // ticks), NO a Brot con badge de jardín como sugiere el README en prosa —
  // el markup (ambos teléfonos) no dibuja ni Brot ni badge acá. Se modeló
  // lo que está literalmente dibujado.
  headerIconBtnBackground: string
  headerIconBtnGradientCss: string | undefined
  headerIconBtnShadow: string
  headerIconInk: string
  cycTrigInk: string
  cycTrigDot: string
  cycTrigDotGlow: string

  // ─── ② Hero — contenido por defecto ("en curso", el teléfono) ───
  /** [D] Forest PROPIO de Fijos — ver discrepancia en el docblock del módulo. */
  heroGradientCss: string
  /** Coincide EXACTO con gastos-spec.heroShadow en ambos temas. */
  heroShadow: string
  heroDot: string
  heroDotGlow: string
  heroEyebrowInk: string
  heroChipInk: string
  heroChipBackground: string
  heroChipShadow: string
  /** Coincide con gastos-spec.wellBackground. */
  wellBackground: string
  /** Una capa MÁS que gastos-spec.wellShadow (highlight superior adicional). */
  wellShadow: string
  wellLabelInk: string
  amountInk: string
  amountShadowColor: string
  amountShadowRadius: number
  amountShadowOffset: { width: number; height: number }
  /** Chip "⚠ N fijos por pagar · N vencida" dentro del pozo. */
  alertChipInk: string
  alertChipBackground: string
  alertChipShadow: string
  /** "Pagaste 13 de 16 fijos" / "91%". */
  progressLabelInk: string
  progressAccentInk: string
  /** Segmento pagado de la línea de ciclo (16 segmentos). */
  segPaidGradientCss: string
  segPaidShadow: string
  /** Segmento "HOY" (perilla) de la línea de ciclo. */
  segTodayBackground: string
  segTodayShadow: string
  /** Borde de los segmentos futuros (sin rellenar). */
  segFutureBorder: string
  totalPaidInk: string
  totalOfInk: string
  /** Bloque "TE QUEDA DISPONIBLE". */
  availableCardBackground: string
  availableCardShadow: string
  availableLabelInk: string
  availableValueInk: string
  availableOfInk: string
  availablePctInk: string

  // ─── ③ Avisos — card, ticker y semántica de estado completa ───
  avisosCardBackground: string
  avisosCardGradientCss: string | undefined
  avisosCardShadow: string
  avisosTitleInk: string
  avisosBadgeBackground: string
  avisosBadgeInk: string
  /** Eyebrow "POR PAGAR · ESTE MES" / "AUMENTOS Y RECORDATORIOS". Distinto
   *  de `sub` en oscuro (#8FA089, no #93A78F) — confirmado en el markup. */
  sectionEyebrowInk: string
  /** Punto "live" pulsante junto al eyebrow del ticker. */
  liveDotBackground: string
  /** Pozo que envuelve el ticker. Nombre exacto: lo consume Task 4. */
  tickerWellBackground: string
  /** Inset más profundo que `ins`. Nombre exacto: lo consume Task 4. */
  tickerWellShadow: string
  tickerChipGradientCss: string
  tickerChipShadow: string
  tickerNameInk: string
  tickerAmountInk: string
  // Semántica de estado (dot del chip del ticker — 3er canal visual además
  // del tag: verde = hoy/al día, apagado = próximo, durazno = vencido).
  tickerDotToday: string
  tickerDotUpcoming: string
  tickerDotOverdue: string
  // Tags del chip del ticker.
  tagTodayBackground: string
  tagTodayInk: string
  tagTodayShadow: string
  tagUpcomingBackground: string
  tagUpcomingInk: string
  tagOverdueBackground: string
  tagOverdueInk: string
  /** undefined en oscuro: el tag VENCIDO oscuro no lleva shadow (confirmado). */
  tagOverdueShadow: string | undefined
  /** Anillo de alerta (card/fila en estado vencido-urgente). Theme-invariant. */
  urgentRing: string
  /** "Hoy" como pill sólida (mismo par de valores que la tab activa "Vencidos"). */
  hoyPillBackground: string
  hoyPillInk: string

  // ─── ④ Aumentos y recordatorios (filas con ícono de tendencia) ───
  aumentoTileGradientCss: string | undefined
  aumentoTileBackground: string | undefined
  aumentoTileShadow: string
  aumentoIconInk: string
  /** Tile de la fila-resumen de calendario ("3 pagos fijos vencen en 7 días"). */
  reminderTileGradientCss: string | undefined
  reminderTileBackground: string | undefined
  aumentoRowInk: string
  /** Nombre del ítem + "%" resaltados dentro de la fila. */
  aumentoNameInk: string
  aumentoArrowInk: string
  aumentoDivider: string
  /** Círculo del check verde (ícono de confirmación por fila). = insSoft. */
  checkCircleShadow: string
  checkGlyphInk: string

  // ─── ⑤ Todos tus fijos — header, tabs y filas de categoría ───
  sectionLabelInk: string
  addFijoInk: string
  tabActiveBackground: string
  tabActiveInk: string
  tabActiveShadow: string
  tabActiveBadgeBackground: string
  tabActiveBadgeInk: string
  tabInactiveInk: string
  tabInactiveBackground: string | undefined
  tabInactiveShadow: string
  tabInactiveBadgeBackground: string
  tabInactiveBadgeInk: string
  rowBackground: string
  rowGradientCss: string | undefined
  rowShadow: string
  rowTitleInk: string
  rowAmountInk: string
  rowChevronInk: string
  /** "4 ítems · 1 vencido". */
  rowMetaOverdueInk: string
  /** "5 ítems · al día ✓". */
  rowMetaOkInk: string
  /** "4 ítems · 3 pagados" (= sub). */
  rowMetaNeutralInk: string
  categoryTileHousing: string
  categoryTileSubs: string
  /** [Nota] El oscuro NO es el mismo hex que el claro a baja opacidad (a
   *  diferencia de Housing/Subs) — posible inconsistencia del handoff, ver
   *  reporte. Transcrito tal cual. */
  categoryTileServices: string

  // ─── ⑥ FAB — disco del nav (invertido en oscuro) ───
  fabGradientCss: string
  fabShadow: string
  fabInnerShadow: string
  fabGlyphInk: string

  // ─── Home indicator ───
  homeIndicator: string
  homeIndicatorOpacity: number
}

// Alias de sombras — definidos una vez y re-usados (como gastos-spec inlinea).
// Ver discrepancias [A]/[B] en el docblock del módulo: NO son literalmente
// iguales a RAISE_L/INS_L de gastos-spec en todos los casos.
const RAISE_L = '8px 8px 18px rgba(151,160,136,0.4), -8px -8px 18px rgba(255,255,255,0.92)'
const RAISE_D = '8px 8px 18px rgba(0,0,0,0.55), -8px -8px 18px rgba(101,152,113,0.1)'
const RAISE_SM_L = '6px 6px 14px rgba(151,160,136,0.45), -6px -6px 14px rgba(255,255,255,0.95)'
const RAISE_SM_D = '6px 6px 14px rgba(0,0,0,0.55), -5px -5px 13px rgba(101,152,113,0.12)'
const RAISE_LG_L = '10px 10px 22px rgba(151,160,136,0.45), -10px -10px 22px rgba(255,255,255,0.95)'
const RAISE_LG_D = '10px 10px 22px rgba(0,0,0,0.55), -10px -10px 22px rgba(101,152,113,0.12)'
const INS_L = 'inset 4px 4px 8px rgba(151,160,136,0.38), inset -4px -4px 8px rgba(255,255,255,0.92)'
const INS_D = 'inset 4px 4px 8px rgba(0,0,0,0.5), inset -4px -4px 8px rgba(101,152,113,0.1)'
const INS_SOFT_L = 'inset 3px 3px 6px rgba(151,160,136,0.4), inset -3px -3px 6px rgba(255,255,255,0.92)'
const INS_SOFT_D = 'inset 3px 3px 6px rgba(0,0,0,0.45), inset -3px -3px 6px rgba(101,152,113,0.1)'

export const FIJOS_SPEC: Record<FijosMode, FijosSpec> = {
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

    headerIconBtnBackground: '#E9EBE0',
    headerIconBtnGradientCss: undefined,
    headerIconBtnShadow: RAISE_SM_L,
    headerIconInk: '#2E7C39',
    cycTrigInk: '#6C7B67',
    cycTrigDot: '#2E7C39',
    cycTrigDotGlow: 'rgba(120,220,130,0.7)',

    heroGradientCss: 'linear-gradient(155deg, #2E6B33 0%, #3F8746 55%, #57A05C 100%)',
    heroShadow: '12px 12px 26px rgba(124,138,110,0.55), -8px -8px 20px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.25)',
    heroDot: '#C9F3C6',
    heroDotGlow: 'rgba(201,243,198,0.7)',
    heroEyebrowInk: 'rgba(240,248,230,0.85)',
    heroChipInk: '#F2F7E6',
    heroChipBackground: 'rgba(255,255,255,0.16)',
    heroChipShadow: 'inset 0 1px 2px rgba(20,45,25,0.25)',
    wellBackground: 'rgba(13,34,18,0.30)',
    wellShadow: 'inset 6px 6px 14px rgba(6,20,10,0.5), inset -5px -5px 12px rgba(130,190,130,0.18), inset 0 1px 0 rgba(255,255,255,0.09)',
    wellLabelInk: 'rgba(240,248,230,0.85)',
    amountInk: '#F7F4E4',
    amountShadowColor: 'rgba(10,30,15,0.35)',
    amountShadowRadius: 8,
    amountShadowOffset: { width: 0, height: 2 },
    alertChipInk: '#FBD9BC',
    alertChipBackground: 'rgba(120,50,25,0.4)',
    alertChipShadow: 'inset 0 1px 2px rgba(60,25,10,0.35)',
    progressLabelInk: '#F7F4E4',
    progressAccentInk: '#C9F3C6',
    segPaidGradientCss: 'linear-gradient(180deg, #DBF8D6, #A9E1A9)',
    segPaidShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
    segTodayBackground: '#F0A47E',
    segTodayShadow: '0 0 8px rgba(240,164,126,0.9)',
    segFutureBorder: 'rgba(240,248,230,0.45)',
    totalPaidInk: '#C9F3C6',
    totalOfInk: 'rgba(240,248,230,0.7)',
    availableCardBackground: 'rgba(255,255,255,0.09)',
    availableCardShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 2px 6px rgba(6,20,10,0.2)',
    availableLabelInk: 'rgba(240,248,230,0.78)',
    availableValueInk: '#F7F4E4',
    availableOfInk: 'rgba(240,248,230,0.72)',
    availablePctInk: '#C9F3C6',

    avisosCardBackground: '#E9EBE0',
    avisosCardGradientCss: undefined,
    avisosCardShadow: '10px 10px 24px rgba(151,160,136,0.42), -10px -10px 24px rgba(255,255,255,0.92)',
    avisosTitleInk: '#24382A',
    avisosBadgeBackground: '#C25B33',
    avisosBadgeInk: '#F5F2E1',
    sectionEyebrowInk: '#6C7B67',
    liveDotBackground: '#C25B33',
    tickerWellBackground: '#E1E3D6',
    tickerWellShadow: 'inset 5px 5px 12px rgba(151,160,136,0.55), inset -5px -5px 12px rgba(255,255,255,0.95)',
    tickerChipGradientCss: 'linear-gradient(145deg, #EFF1E7, #E2E4D6)',
    tickerChipShadow: '4px 4px 10px rgba(151,160,136,0.45), -4px -4px 10px rgba(255,255,255,0.9), inset 0 1px 0 rgba(255,255,255,0.6)',
    tickerNameInk: '#24382A',
    tickerAmountInk: '#24382A',
    tickerDotToday: '#2E7C39',
    tickerDotUpcoming: '#9AA694',
    tickerDotOverdue: '#D97355',
    tagTodayBackground: '#F6DCCB',
    tagTodayInk: '#C25B33',
    tagTodayShadow: 'inset 0 0 0 1.5px rgba(194,91,51,0.4)',
    tagUpcomingBackground: '#DCEBD8',
    tagUpcomingInk: '#3E6B44',
    tagOverdueBackground: '#F3C9BC',
    tagOverdueInk: '#A84A2F',
    tagOverdueShadow: 'inset 1px 1px 2px rgba(150,80,50,0.28)',
    urgentRing: '0 0 0 2px #D97355',
    hoyPillBackground: '#24382A',
    hoyPillInk: '#F5F2E1',

    aumentoTileGradientCss: 'linear-gradient(145deg, #F6E0D2, #EEC9B4)',
    aumentoTileBackground: undefined,
    aumentoTileShadow: '4px 4px 9px rgba(151,160,136,0.42), -4px -4px 9px rgba(255,255,255,0.92), inset 0 1px 0 rgba(255,255,255,0.6)',
    aumentoIconInk: '#C25B33',
    reminderTileGradientCss: 'linear-gradient(145deg, #F3E7CC, #E9D6B0)',
    reminderTileBackground: undefined,
    aumentoRowInk: '#24382A',
    aumentoNameInk: '#C25B33',
    aumentoArrowInk: '#2E7C39',
    aumentoDivider: 'rgba(90,110,70,0.13)',
    checkCircleShadow: INS_SOFT_L,
    checkGlyphInk: '#2E7C39',

    sectionLabelInk: '#6C7B67',
    addFijoInk: '#2E7C39',
    tabActiveBackground: '#24382A',
    tabActiveInk: '#F5F2E1',
    tabActiveShadow: '0 6px 12px rgba(36,56,42,0.3)',
    tabActiveBadgeBackground: '#D97E4F',
    tabActiveBadgeInk: '#FFF7E8',
    tabInactiveInk: '#3E5A44',
    tabInactiveBackground: undefined,
    tabInactiveShadow: INS_L,
    tabInactiveBadgeBackground: '#D2D6C6',
    tabInactiveBadgeInk: '#3E5A44',
    rowBackground: '#E9EBE0',
    rowGradientCss: undefined,
    rowShadow: RAISE_L,
    rowTitleInk: '#24382A',
    rowAmountInk: '#24382A',
    rowChevronInk: '#6C7B67',
    rowMetaOverdueInk: '#B05E2F',
    rowMetaOkInk: '#3E6B44',
    rowMetaNeutralInk: '#6C7B67',
    categoryTileHousing: '#F3C9BC',
    categoryTileSubs: '#E6E0F4',
    categoryTileServices: '#F7E3CF',

    fabGradientCss: 'linear-gradient(145deg, #6DBC71, #327E39)',
    fabShadow: '7px 7px 15px rgba(120,140,110,0.55), -6px -6px 13px rgba(255,255,255,0.9)',
    fabInnerShadow: 'inset 4px 4px 8px rgba(18,52,24,0.55), inset -4px -4px 8px rgba(170,225,170,0.4)',
    fabGlyphInk: '#F5F2E1',

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

    headerIconBtnBackground: '#1A2D21',
    headerIconBtnGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    headerIconBtnShadow: RAISE_SM_D,
    headerIconInk: '#A4E3A6',
    cycTrigInk: '#93A78F',
    cycTrigDot: '#A4E3A6',
    cycTrigDotGlow: 'rgba(120,220,130,0.7)',

    // [D] mismo forest propio de Fijos que en claro (theme-invariant).
    heroGradientCss: 'linear-gradient(155deg, #2E6B33 0%, #3F8746 55%, #57A05C 100%)',
    heroShadow: '14px 14px 30px rgba(0,0,0,0.5), -6px -6px 16px rgba(101,152,113,0.14), inset 0 1px 0 rgba(164,227,166,0.18)',
    heroDot: '#C9F3C6',
    heroDotGlow: 'rgba(201,243,198,0.7)',
    heroEyebrowInk: 'rgba(240,248,230,0.85)',
    heroChipInk: '#F2F7E6',
    heroChipBackground: 'rgba(255,255,255,0.16)',
    heroChipShadow: 'inset 0 1px 2px rgba(20,45,25,0.25)',
    wellBackground: 'rgba(13,34,18,0.30)',
    wellShadow: 'inset 6px 6px 14px rgba(6,20,10,0.5), inset -5px -5px 12px rgba(130,190,130,0.18), inset 0 1px 0 rgba(255,255,255,0.09)',
    wellLabelInk: 'rgba(240,248,230,0.85)',
    amountInk: '#F7F4E4',
    amountShadowColor: 'rgba(10,30,15,0.35)',
    amountShadowRadius: 8,
    amountShadowOffset: { width: 0, height: 2 },
    alertChipInk: '#FBD9BC',
    alertChipBackground: 'rgba(120,50,25,0.4)',
    alertChipShadow: 'inset 0 1px 2px rgba(60,25,10,0.35)',
    progressLabelInk: '#F7F4E4',
    progressAccentInk: '#C9F3C6',
    segPaidGradientCss: 'linear-gradient(180deg, #DBF8D6, #A9E1A9)',
    segPaidShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
    segTodayBackground: '#F0A47E',
    segTodayShadow: '0 0 8px rgba(240,164,126,0.9)',
    segFutureBorder: 'rgba(240,248,230,0.45)',
    totalPaidInk: '#C9F3C6',
    totalOfInk: 'rgba(240,248,230,0.7)',
    availableCardBackground: 'rgba(255,255,255,0.09)',
    availableCardShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 2px 6px rgba(6,20,10,0.2)',
    availableLabelInk: 'rgba(240,248,230,0.78)',
    availableValueInk: '#F7F4E4',
    availableOfInk: 'rgba(240,248,230,0.72)',
    availablePctInk: '#C9F3C6',

    avisosCardBackground: '#1A2D21',
    avisosCardGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    avisosCardShadow: '10px 10px 24px rgba(0,0,0,0.5), -10px -10px 24px rgba(101,152,113,0.1)',
    avisosTitleInk: '#F1EEDD',
    avisosBadgeBackground: '#F0A47E',
    avisosBadgeInk: '#16271C',
    sectionEyebrowInk: '#8FA089',
    liveDotBackground: '#F0A47E',
    tickerWellBackground: '#0F1C13',
    tickerWellShadow: 'inset 5px 5px 12px rgba(0,0,0,0.6), inset -5px -5px 12px rgba(101,152,113,0.1)',
    tickerChipGradientCss: 'linear-gradient(145deg, #22392B, #182A1E)',
    tickerChipShadow: '4px 4px 10px rgba(0,0,0,0.5), -3px -3px 9px rgba(101,152,113,0.12), inset 0 1px 0 rgba(164,227,166,0.08)',
    tickerNameInk: '#F1EEDD',
    tickerAmountInk: '#F1EEDD',
    tickerDotToday: '#A4E3A6',
    tickerDotUpcoming: '#6E8770',
    tickerDotOverdue: '#D97355',
    tagTodayBackground: 'rgba(240,164,126,0.18)',
    tagTodayInk: '#F0A47E',
    tagTodayShadow: 'inset 0 0 0 1.5px rgba(240,164,126,0.4)',
    tagUpcomingBackground: 'rgba(164,227,166,0.16)',
    tagUpcomingInk: '#B5DDB4',
    // [C] markup dibuja 0.26 (README/sistema citan 0.24) — ver docblock.
    tagOverdueBackground: 'rgba(217,115,85,0.26)',
    tagOverdueInk: '#F2A87E',
    tagOverdueShadow: undefined,
    urgentRing: '0 0 0 2px #D97355',
    hoyPillBackground: '#F1EEDD',
    hoyPillInk: '#16271C',

    aumentoTileGradientCss: undefined,
    aumentoTileBackground: 'rgba(242,168,126,0.16)',
    aumentoTileShadow: '4px 4px 9px rgba(0,0,0,0.5), -3px -3px 8px rgba(101,152,113,0.1)',
    aumentoIconInk: '#F0A47E',
    reminderTileGradientCss: undefined,
    reminderTileBackground: 'rgba(226,178,96,0.16)',
    aumentoRowInk: '#F1EEDD',
    aumentoNameInk: '#F0A47E',
    aumentoArrowInk: '#A4E3A6',
    aumentoDivider: 'rgba(164,227,166,0.1)',
    checkCircleShadow: INS_SOFT_D,
    checkGlyphInk: '#A4E3A6',

    sectionLabelInk: '#93A78F',
    addFijoInk: '#A4E3A6',
    tabActiveBackground: '#F1EEDD',
    tabActiveInk: '#16271C',
    tabActiveShadow: '0 0 14px rgba(241,238,221,0.2)',
    tabActiveBadgeBackground: '#D97E4F',
    tabActiveBadgeInk: '#FFF7E8',
    tabInactiveInk: '#B9CCB2',
    tabInactiveBackground: '#142519',
    tabInactiveShadow: INS_D,
    tabInactiveBadgeBackground: 'rgba(164,227,166,0.16)',
    tabInactiveBadgeInk: '#A4E3A6',
    rowBackground: '#1A2D21',
    rowGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    rowShadow: RAISE_D,
    rowTitleInk: '#F1EEDD',
    rowAmountInk: '#F1EEDD',
    rowChevronInk: '#93A78F',
    rowMetaOverdueInk: '#F2A87E',
    rowMetaOkInk: '#B5DDB4',
    rowMetaNeutralInk: '#93A78F',
    categoryTileHousing: 'rgba(243,201,188,0.14)',
    categoryTileSubs: 'rgba(230,224,244,0.14)',
    // [Nota] NO es #F7E3CF a 0.16 (el patrón de sus hermanas) — el markup
    // dibuja literal rgba(242,168,126,0.16), el mismo rgb que #F2A87E.
    categoryTileServices: 'rgba(242,168,126,0.16)',

    fabGradientCss: 'linear-gradient(145deg, #F2F4EA, #DCE0D0)',
    fabShadow: '0 0 16px rgba(140,225,150,0.22), 7px 7px 15px rgba(0,0,0,0.55)',
    fabInnerShadow: 'inset 4px 4px 8px rgba(151,160,136,0.4), inset -4px -4px 8px rgba(255,255,255,0.85)',
    fabGlyphInk: '#2E7C39',

    homeIndicator: '#F1EEDD',
    homeIndicatorOpacity: 0.75,
  },
}
