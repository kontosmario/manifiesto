/**
 * Tokens de la HOME FINAL — valores LITERALES de
 * design/home-final-2026-07/home.dc.html ("Home final claro" · "Home final
 * oscuro"). Réplica bajo gate de aprobación: no "mejorar" valores. Mismo
 * criterio que auth-spec / onb-spec / notif-spec.
 *
 * OJO: esta Home SUPERSEDE el mockup 1b/1c del doc viejo (rediseno-2026-07).
 * La nav también cambió (FAB con surco interior; en oscuro va INVERTIDO a
 * disco crema con "+" verde) → NO tocar neo-tab-bar (contrato aprobado del
 * doc viejo); la nav nueva vive en este kit hasta su aprobación.
 *
 * Gradientes como strings CSS (experimental_backgroundImage) y sombras como
 * boxShadow literal (multi-sombra + inset, rinde con minSdk 29).
 */

export type HomeMode = 'light' | 'dark'

/** Momento del día (catálogo "HEADER · SALUDO POR HORARIO"). La Home
 *  del mockup principal usa tarde + pose `wave` (así se aprueba); el
 *  catálogo define mañana=wave·☀️ / tarde=idle·🌤️ / noche=sleep·🌙. */
export type HomeMoment = 'manana' | 'tarde' | 'noche'

export interface HomeSpec {
  bg: string
  shellShadow: string
  statusInk: string

  // ⓿ Header — Brot 46 + saludo + 3 botones circulares 44.
  greetLabel: string
  greetName: string
  iconBtnGradientCss: string | undefined
  iconBtnBackground: string
  iconBtnShadow: string
  iconSparkle: string
  iconInk: string
  menuDotFill: string
  badgeBackground: string
  badgeInk: string

  // Chips: miembros (raised) + sueldo (hundido).
  membersGradientCss: string | undefined
  membersBackground: string
  membersShadow: string
  membersInk: string
  memberAvatarA: string
  memberAvatarB: string
  sueldoBackground: string | undefined
  sueldoShadow: string
  sueldoDot: string
  /** Dot NARANJA del chip "Configurá tu sueldo ›" (catálogo §11). */
  sueldoDotAttention: string
  sueldoInk: string

  // ① Hero saldo (gradiente idéntico en ambos temas; cambia la sombra).
  heroGradientCss: string
  heroShadow: string
  heroDot: string
  heroLabel: string
  dayPillBackground: string
  dayPillShadow: string
  dayPillInk: string
  // Pozo hundido del saldo.
  wellBackground: string
  wellShadow: string
  balanceInk: string
  /** Saldo AJUSTADO/bajo (override del ciclo): durazno (catálogo §3). */
  balanceAdjustedInk: string
  usdInk: string
  // Chips de evento (inset).
  eventChipBackground: string
  eventChipShadow: string
  eventChipGreenInk: string
  eventChipNeutralInk: string
  /** Chip "Reserva $X" (acople del chip gold viejo, decisión owner
   *  2026-07-21): gold AA-safe sobre el hero forest. Igual en ambos temas
   *  (los chips viven en el pozo oscuro del hero). */
  eventChipReservaInk: string
  // Cupo diario (rediseño 2026-07-21, reemplaza el gauge de arco): pastilla
  // "CUPO HOY" hundida a la izquierda + bar GASTADO/DISPONIBLE a la derecha +
  // link de proyección. Colores idénticos en ambos temas (viven sobre el hero
  // verde forest). Reusa gaugeAmountInk (#EAF6DE) para el monto del cupo,
  // gaugeLabelDot/gaugeLabelInk (#C9F3C6) para "PODÉS GASTAR HOY", gaugeLinkInk
  // para la proyección y hairline para el border-top.
  hairline: string
  /** #D97355 — segmento GASTADO cuando el status es 'over' (accent sutil). */
  gaugeProgressOver: string
  gaugeAmountInk: string
  gaugeLabelDot: string
  gaugeLabelInk: string
  gaugeLinkInk: string
  // Pastilla "CUPO HOY" (pozo hundido + 2 knobs + divisor punteado).
  cupoWellBg: string
  cupoWellShadow: string
  /** Notch tipo cupón: el VERDE DEL HERO (forest #297811 en la zona del
   *  cupo), no un verde brillante — así se lee como el fondo asomando por un
   *  recorte del cupón, no como un punto encima (pedido owner 2026-07-21). */
  cupoNotch: string
  cupoDivider: string
  cupoLabelInk: string
  // Bar GASTADO/DISPONIBLE (track hundido + segmentos + leyenda).
  barTrackBg: string
  barTrackShadow: string
  barSpent: string
  barAvailGradientCss: string
  barAvailDot: string
  legendInk: string
  // Hero vacío (usuario nuevo, catálogo §14): fila Brot bebé + CTA crema.
  emptyHeroSubInk: string
  ctaCreamGradientCss: string
  ctaCreamInk: string
  ctaCreamShadow: string

  // Encabezados de sección + links.
  sectionLabel: string
  sectionLink: string

  // ② Resumen del ciclo (una card, dos filas).
  cardGradientCss: string | undefined
  cardBackground: string
  cardShadow: string
  cycleDotVariables: string
  cycleDotFijos: string
  cycleLabelVariables: string
  cycleLabelFijos: string
  /** Label VARIABLES atenuada del resumen vacío (catálogo §14,
   *  estados.dc.html): #B05E2F claro / #F2A87E oscuro (en oscuro coincide
   *  con la normal). La label FIJOS queda verde aun en muted. */
  cycleLabelVariablesMuted: string
  cycleSub: string
  cycleSubAlert: string
  cycleAmount: string
  /** Monto $0 atenuado (resumen vacío, catálogo §14). */
  cycleAmountMuted: string
  cycleChevron: string
  cycleDividerShadow: string

  // ③ Tu progreso (meta).
  goalTileBackground: string
  goalTileShadow: string
  goalTitle: string
  goalSub: string
  goalPercent: string
  goalBarBackground: string | undefined
  goalBarShadow: string
  goalBarFillCss: string
  // Sin meta (catálogo §7): dashed (usuario nuevo) + CTAs verdes.
  dashedBorder: string
  ctaGreenPillGradientCss: string
  ctaGreenPillInk: string
  ctaGreenRadialGradientCss: string
  ctaGreenRadialInk: string
  /** Literal estados.dc.html:77/:89 (claro) y :121/:133 (oscuro): drop
   *  verde + inset highlight / glow verde + inset highlight. */
  ctaGreenRadialShadow: string

  // ④ Racha (superficie verde tintada).
  streakGradientCss: string
  streakShadow: string
  streakTitle: string
  streakSub: string
  /** Sub-línea gris del estado día-cero (catálogo §8, estados.dc.html):
   *  #6C7B67 claro / #93A78F oscuro. `streakSub` (verde) es para otros
   *  subtítulos; la línea "Registrá tu primer gasto…" va en gris. */
  streakSubMuted: string
  streakDayDone: string
  streakDayToday: string
  streakDayIdle: string
  streakDotDone: string
  streakDotTodayRing: string
  streakDotIdleBackground: string | undefined
  streakDotIdleShadow: string
  // Pips extra del catálogo §9 (idénticos en ambos temas).
  streakDotMissed: string
  streakDotMissedX: string
  streakDotSeedling: string
  streakLink: string
  /** Chevron del link atenuado en el estado día-cero (catálogo §8): el
   *  texto queda verde (`streakLink`) y solo el chevron va #9AA694 claro /
   *  #7C917A oscuro. */
  streakLinkChevronMuted: string

  // ⑤ Actividad.
  activityGradientCss: string | undefined
  activityBackground: string
  activityShadow: string
  activityTilePizza: string
  activityTileMercado: string
  activityTitle: string
  activitySub: string
  activityAmount: string
  // Vacíos de actividad (catálogo §10): pozo inset + copy.
  activityEmptyWellBackground: string | undefined
  activityEmptyWellShadow: string
  activityEmptyInk: string
  activityEmptyTitle: string
  activityEmptySub: string

  // Nav (nueva: pastilla inset activa + FAB con surco).
  navGradientCss: string
  navShadow: string
  navActiveBackground: string | undefined
  navActiveShadow: string
  navActiveInk: string
  navIdleInk: string
  /** Dot de notificación en ítem de nav (catálogo §2: 8×8 #D97E4F). */
  navItemDot: string
  fabGradientCss: string
  fabShadow: string
  fabInk: string
  fabWellShadow: string
  // FAB pressed (catálogo §1: ambas capas pasan a inset) + badge.
  fabPressedShadow: string
  fabPressedWellShadow: string
  fabBadgeBorder: string

  homeIndicator: string
  homeIndicatorOpacity: number
}

export const HOME_SPEC: Record<HomeMode, HomeSpec> = {
  light: {
    bg: '#DCDFCD',
    shellShadow: '0 34px 80px rgba(8,14,8,0.55)',
    statusInk: '#24382A',

    greetLabel: '#6C7B67',
    greetName: '#24382A',
    iconBtnGradientCss: undefined,
    iconBtnBackground: '#E9EBE0',
    iconBtnShadow: '6px 6px 14px rgba(151,160,136,0.42), -6px -6px 14px rgba(255,255,255,0.9)',
    iconSparkle: '#2E7C39',
    iconInk: '#24382A',
    menuDotFill: '#E9EBE0',
    badgeBackground: '#D97E4F',
    badgeInk: '#FFF7E8',

    membersGradientCss: undefined,
    membersBackground: '#E9EBE0',
    membersShadow: '6px 6px 14px rgba(151,160,136,0.42), -6px -6px 14px rgba(255,255,255,0.9)',
    membersInk: '#24382A',
    memberAvatarA: '#DDEBDD',
    memberAvatarB: '#F6D9D2',
    sueldoBackground: undefined,
    sueldoShadow: 'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)',
    sueldoDot: '#2E7C39',
    sueldoDotAttention: '#D97E4F',
    sueldoInk: '#3E5A44',

    // DESVÍO owner (2026-07-21, feedback de usuario): el hero usa el TONO
    // FOREST de la hero card vieja (palette.ts heroGradient #244235→#1F590D→
    // #297811→#297811, AA-safe para crema), no el verde claro del mockup
    // (155deg #337B39 0% → #4C9A52 55% → #5FAC64 100% — queda documentado
    // acá para revertir en 1 línea). Ángulo 155deg del lenguaje nuevo.
    heroGradientCss: 'linear-gradient(155deg, #244235 0%, #1F590D 33%, #297811 67%, #297811 100%)',
    heroShadow: '12px 12px 26px rgba(124,138,110,0.55), -8px -8px 20px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.25)',
    heroDot: '#C9F3C6',
    heroLabel: 'rgba(240,248,230,0.85)',
    dayPillBackground: 'rgba(255,255,255,0.16)',
    dayPillShadow: 'inset 0 1px 2px rgba(20,45,25,0.25)',
    dayPillInk: '#F2F7E6',
    wellBackground: 'rgba(13,34,18,0.30)',
    wellShadow: 'inset 6px 6px 14px rgba(6,20,10,0.5), inset -5px -5px 12px rgba(130,190,130,0.18)',
    balanceInk: '#F7F4E4',
    balanceAdjustedInk: '#FBD9BC',
    usdInk: 'rgba(240,248,230,0.75)',
    eventChipBackground: 'rgba(11,30,15,0.32)',
    eventChipShadow: 'inset 3px 3px 7px rgba(6,20,10,0.45), inset -3px -3px 7px rgba(130,190,130,0.14)',
    eventChipGreenInk: '#DFF7DA',
    eventChipNeutralInk: '#F2F7E6',
    eventChipReservaInk: '#FEF0C2',
    hairline: 'rgba(240,248,230,0.22)',
    gaugeProgressOver: '#D97355',
    gaugeAmountInk: '#EAF6DE',
    gaugeLabelDot: '#C9F3C6',
    gaugeLabelInk: '#C9F3C6',
    gaugeLinkInk: 'rgba(240,248,230,0.62)',
    cupoWellBg: 'rgba(13,34,18,0.32)',
    cupoWellShadow: 'inset 4px 4px 10px rgba(6,20,10,0.5), inset -3px -3px 8px rgba(130,190,130,0.15)',
    cupoNotch: '#297811',
    cupoDivider: 'rgba(240,248,230,0.28)',
    cupoLabelInk: 'rgba(240,248,230,0.7)',
    barTrackBg: 'rgba(6,20,10,0.42)',
    barTrackShadow: 'inset 0 2px 4px rgba(6,20,10,0.55)',
    barSpent: '#FBD9BC',
    barAvailGradientCss: 'linear-gradient(90deg, #C9F3C6, #EFF6E2)',
    barAvailDot: '#EFF6E2',
    legendInk: 'rgba(240,248,230,0.7)',
    emptyHeroSubInk: 'rgba(240,248,230,0.75)',
    ctaCreamGradientCss: 'linear-gradient(145deg, #F7F4E6, #E2DEC8)',
    ctaCreamInk: '#1F3A26',
    ctaCreamShadow: '0 8px 16px rgba(20,45,25,0.3), inset 0 2px 3px rgba(255,255,255,0.6)',

    sectionLabel: '#6C7B67',
    sectionLink: '#2E7C39',

    cardGradientCss: undefined,
    cardBackground: '#E9EBE0',
    cardShadow: '8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)',
    cycleDotVariables: '#C96F3F',
    cycleDotFijos: '#2E7C39',
    cycleLabelVariables: '#C96F3F',
    cycleLabelFijos: '#2E7C39',
    cycleLabelVariablesMuted: '#B05E2F',
    cycleSub: '#6C7B67',
    cycleSubAlert: '#B05E2F',
    cycleAmount: '#24382A',
    cycleAmountMuted: '#9AA694',
    cycleChevron: '#9AA694',
    cycleDividerShadow: 'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)',

    goalTileBackground: '#D6E4F0',
    goalTileShadow: '0 2px 5px rgba(40,70,45,0.12)',
    goalTitle: '#24382A',
    goalSub: '#6C7B67',
    goalPercent: '#2E7C39',
    goalBarBackground: undefined,
    goalBarShadow: 'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)',
    goalBarFillCss: 'linear-gradient(90deg, #63B168, #2E7434)',
    dashedBorder: '#C2C8B4',
    ctaGreenPillGradientCss: 'linear-gradient(145deg, #6DBC71, #327E39)',
    ctaGreenPillInk: '#F5F2E1',
    ctaGreenRadialGradientCss: 'radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)',
    ctaGreenRadialInk: '#F5F2E1',
    ctaGreenRadialShadow: '0 8px 16px rgba(46,116,52,0.35), inset 0 1.5px 2px rgba(255,255,255,0.3)',

    streakGradientCss: 'linear-gradient(145deg, #E4EFD8, #D3E2C4)',
    streakShadow: '8px 8px 18px rgba(110,140,100,0.32), -8px -8px 18px rgba(255,255,255,0.9)',
    streakTitle: '#24382A',
    streakSub: '#3E5A44',
    streakSubMuted: '#6C7B67',
    streakDayDone: '#2E7C39',
    streakDayToday: '#D97E4F',
    streakDayIdle: '#9AA694',
    streakDotDone: '#2E7C39',
    streakDotTodayRing: '#D97E4F',
    streakDotIdleBackground: undefined,
    streakDotIdleShadow: 'inset 2px 2px 5px rgba(151,160,136,0.32), inset -2px -2px 5px rgba(255,255,255,0.85)',
    streakDotMissed: '#E8A87C',
    streakDotMissedX: '#7A2E17',
    streakDotSeedling: '#E3CD9A',
    streakLink: '#2E7C39',
    streakLinkChevronMuted: '#9AA694',

    activityGradientCss: undefined,
    activityBackground: '#E9EBE0',
    activityShadow: '8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)',
    activityTilePizza: '#F6D9D2',
    activityTileMercado: '#E2EDD2',
    activityTitle: '#24382A',
    activitySub: '#6C7B67',
    activityAmount: '#24382A',
    activityEmptyWellBackground: undefined,
    activityEmptyWellShadow: 'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)',
    activityEmptyInk: '#3E5A44',
    activityEmptyTitle: '#24382A',
    activityEmptySub: '#6C7B67',

    navGradientCss: 'linear-gradient(145deg, #F0F2E7, #E1E4D6)',
    navShadow: '10px 10px 22px rgba(151,160,136,0.45), -10px -10px 22px rgba(255,255,255,0.95)',
    navActiveBackground: undefined,
    navActiveShadow: 'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)',
    navActiveInk: '#2E7C39',
    navIdleInk: '#6C7B67',
    navItemDot: '#D97E4F',
    fabGradientCss: 'linear-gradient(145deg, #6DBC71, #327E39)',
    fabShadow: '7px 7px 15px rgba(120,140,110,0.55), -6px -6px 13px rgba(255,255,255,0.9)',
    fabInk: '#F5F2E1',
    fabWellShadow: 'inset 4px 4px 8px rgba(18,52,24,0.55), inset -4px -4px 8px rgba(170,225,170,0.4)',
    fabPressedShadow: 'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)',
    fabPressedWellShadow: 'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)',
    fabBadgeBorder: '#EFEDE2',

    homeIndicator: '#24382A',
    homeIndicatorOpacity: 0.75,
  },
  dark: {
    bg: '#0F1A13',
    shellShadow: '0 34px 80px rgba(0,0,0,0.6)',
    statusInk: '#F1EEDD',

    greetLabel: '#93A78F',
    greetName: '#F1EEDD',
    iconBtnGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    iconBtnBackground: '#1A2D21',
    iconBtnShadow: '6px 6px 14px rgba(0,0,0,0.55), -6px -6px 14px rgba(101,152,113,0.12)',
    iconSparkle: '#A4E3A6',
    iconInk: '#F1EEDD',
    menuDotFill: '#182B1F',
    badgeBackground: '#D97E4F',
    badgeInk: '#FFF7E8',

    membersGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    membersBackground: '#1A2D21',
    membersShadow: '6px 6px 14px rgba(0,0,0,0.55), -6px -6px 14px rgba(101,152,113,0.12)',
    membersInk: '#F1EEDD',
    memberAvatarA: 'rgba(164,227,166,0.14)',
    memberAvatarB: 'rgba(246,217,210,0.14)',
    sueldoBackground: '#142519',
    sueldoShadow: 'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)',
    sueldoDot: '#A4E3A6',
    sueldoDotAttention: '#D97E4F',
    sueldoInk: '#B9CCB2',

    // DESVÍO owner (2026-07-21): mismo tono forest de la hero card vieja que
    // en claro (el gradiente era idéntico en ambos temas, acá también).
    heroGradientCss: 'linear-gradient(155deg, #244235 0%, #1F590D 33%, #297811 67%, #297811 100%)',
    heroShadow: '14px 14px 30px rgba(0,0,0,0.5), -6px -6px 16px rgba(101,152,113,0.14), inset 0 1px 0 rgba(164,227,166,0.18)',
    heroDot: '#C9F3C6',
    heroLabel: 'rgba(240,248,230,0.85)',
    dayPillBackground: 'rgba(255,255,255,0.16)',
    dayPillShadow: 'inset 0 1px 2px rgba(20,45,25,0.25)',
    dayPillInk: '#F2F7E6',
    wellBackground: 'rgba(13,34,18,0.30)',
    wellShadow: 'inset 6px 6px 14px rgba(6,20,10,0.5), inset -5px -5px 12px rgba(130,190,130,0.18)',
    balanceInk: '#F7F4E4',
    balanceAdjustedInk: '#FBD9BC',
    usdInk: 'rgba(240,248,230,0.75)',
    eventChipBackground: 'rgba(11,30,15,0.32)',
    eventChipShadow: 'inset 3px 3px 7px rgba(6,20,10,0.45), inset -3px -3px 7px rgba(130,190,130,0.14)',
    eventChipGreenInk: '#DFF7DA',
    eventChipNeutralInk: '#F2F7E6',
    eventChipReservaInk: '#FEF0C2',
    hairline: 'rgba(240,248,230,0.22)',
    gaugeProgressOver: '#D97355',
    gaugeAmountInk: '#EAF6DE',
    gaugeLabelDot: '#C9F3C6',
    gaugeLabelInk: '#C9F3C6',
    gaugeLinkInk: 'rgba(240,248,230,0.62)',
    cupoWellBg: 'rgba(13,34,18,0.32)',
    cupoWellShadow: 'inset 4px 4px 10px rgba(6,20,10,0.5), inset -3px -3px 8px rgba(130,190,130,0.15)',
    cupoNotch: '#297811',
    cupoDivider: 'rgba(240,248,230,0.28)',
    cupoLabelInk: 'rgba(240,248,230,0.7)',
    barTrackBg: 'rgba(6,20,10,0.42)',
    barTrackShadow: 'inset 0 2px 4px rgba(6,20,10,0.55)',
    barSpent: '#FBD9BC',
    barAvailGradientCss: 'linear-gradient(90deg, #C9F3C6, #EFF6E2)',
    barAvailDot: '#EFF6E2',
    legendInk: 'rgba(240,248,230,0.7)',
    emptyHeroSubInk: 'rgba(240,248,230,0.75)',
    ctaCreamGradientCss: 'linear-gradient(145deg, #F7F4E6, #E2DEC8)',
    ctaCreamInk: '#1F3A26',
    ctaCreamShadow: '0 8px 16px rgba(20,45,25,0.3), inset 0 2px 3px rgba(255,255,255,0.6)',

    sectionLabel: '#93A78F',
    sectionLink: '#A4E3A6',

    cardGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    cardBackground: '#1A2D21',
    cardShadow: '8px 8px 18px rgba(0,0,0,0.55), -8px -8px 18px rgba(101,152,113,0.1)',
    cycleDotVariables: '#F2A87E',
    cycleDotFijos: '#A4E3A6',
    cycleLabelVariables: '#F2A87E',
    cycleLabelFijos: '#A4E3A6',
    cycleLabelVariablesMuted: '#F2A87E',
    cycleSub: '#93A78F',
    cycleSubAlert: '#F2A87E',
    cycleAmount: '#F1EEDD',
    cycleAmountMuted: '#7C917A',
    cycleChevron: '#7C917A',
    cycleDividerShadow: 'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)',

    goalTileBackground: 'rgba(214,228,240,0.14)',
    goalTileShadow: '0 2px 5px rgba(0,0,0,0.4)',
    goalTitle: '#F1EEDD',
    goalSub: '#93A78F',
    goalPercent: '#A4E3A6',
    goalBarBackground: '#142519',
    goalBarShadow: 'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)',
    goalBarFillCss: 'linear-gradient(90deg, #63B168, #2E7434)',
    dashedBorder: '#3A5241',
    // "Sin meta" catálogo: en oscuro el pill "Crear" va INVERTIDO a crema.
    ctaGreenPillGradientCss: 'linear-gradient(145deg, #F2F4EA, #DCE0D0)',
    ctaGreenPillInk: '#2E7C39',
    ctaGreenRadialGradientCss: 'radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 85%)',
    ctaGreenRadialInk: '#0F1E14',
    ctaGreenRadialShadow: '0 0 18px rgba(140,225,150,0.3), inset 0 1.5px 2px rgba(255,255,255,0.35)',

    streakGradientCss: 'linear-gradient(145deg, #24422C, #1A3120)',
    streakShadow: '8px 8px 18px rgba(0,0,0,0.55), -8px -8px 18px rgba(101,152,113,0.16), inset 0 1px 0 rgba(164,227,166,0.12)',
    streakTitle: '#F1EEDD',
    streakSub: '#B9CCB2',
    streakSubMuted: '#93A78F',
    streakDayDone: '#A4E3A6',
    streakDayToday: '#D97E4F',
    streakDayIdle: '#5F7361',
    streakDotDone: '#A4E3A6',
    streakDotTodayRing: '#D97E4F',
    streakDotIdleBackground: '#142519',
    streakDotIdleShadow: 'inset 2px 2px 5px rgba(0,0,0,0.45), inset -2px -2px 5px rgba(101,152,113,0.07)',
    streakDotMissed: '#E8A87C',
    streakDotMissedX: '#7A2E17',
    streakDotSeedling: '#E3CD9A',
    streakLink: '#A4E3A6',
    streakLinkChevronMuted: '#7C917A',

    activityGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    activityBackground: '#1A2D21',
    activityShadow: '8px 8px 18px rgba(0,0,0,0.55), -8px -8px 18px rgba(101,152,113,0.1)',
    activityTilePizza: 'rgba(246,217,210,0.14)',
    activityTileMercado: 'rgba(226,237,210,0.13)',
    activityTitle: '#F1EEDD',
    activitySub: '#93A78F',
    activityAmount: '#F1EEDD',
    activityEmptyWellBackground: '#142519',
    activityEmptyWellShadow: 'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)',
    activityEmptyInk: '#B9CCB2',
    activityEmptyTitle: '#F1EEDD',
    activityEmptySub: '#93A78F',

    navGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    navShadow: '10px 10px 22px rgba(0,0,0,0.55), -10px -10px 22px rgba(101,152,113,0.12)',
    navActiveBackground: '#142519',
    navActiveShadow: 'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)',
    navActiveInk: '#A4E3A6',
    navIdleInk: '#93A78F',
    navItemDot: '#D97E4F',
    // FAB INVERTIDO en oscuro: disco crema + "+" verde + halo verde tenue.
    fabGradientCss: 'linear-gradient(145deg, #F2F4EA, #DCE0D0)',
    fabShadow: '0 0 16px rgba(140,225,150,0.22), 7px 7px 15px rgba(0,0,0,0.55), -6px -6px 13px rgba(101,152,113,0.18)',
    fabInk: '#2E7C39',
    fabWellShadow: 'inset 4px 4px 8px rgba(151,160,136,0.4), inset -4px -4px 8px rgba(255,255,255,0.85)',
    fabPressedShadow: 'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)',
    fabPressedWellShadow: 'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)',
    fabBadgeBorder: '#0F1E14',

    homeIndicator: '#F1EEDD',
    homeIndicatorOpacity: 0.7,
  },
}

/** Saludos por horario (catálogo). El mockup principal de la Home usa
 *  tarde + `wave`; el preview arranca ahí y puede recorrer los 3. */
export const HOME_MOMENTS: Record<HomeMoment, { emoji: string; greeting: string; pose: 'wave' | 'idle' | 'sleep' }> = {
  manana: { emoji: '☀️', greeting: 'buen día,', pose: 'wave' },
  tarde: { emoji: '🌤️', greeting: 'buenas tardes,', pose: 'idle' },
  noche: { emoji: '🌙', greeting: 'buenas noches,', pose: 'sleep' },
}
