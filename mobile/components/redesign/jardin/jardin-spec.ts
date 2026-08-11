/**
 * Tokens de "Mi jardín" (rediseño 2026-08) — transcripción LITERAL de
 * `design/jardin-2026-08/Jardín Rediseño.dc.html`:
 *
 *   · mockups de teléfono claro/oscuro  HTML:458–620   (fuente de verdad)
 *   · sistema de hero 2a–2f             HTML:333–444
 *   · cierre de semana ×4, claro+oscuro HTML:624–1073
 *   · pantalla Logros claro+oscuro      HTML:1079–1215
 *   · tabla de tokens del handoff       README:115–131
 *
 * Réplica bajo gate de aprobación (`redesign-approval-status: 'jardin'`):
 * mismo criterio que `gastos-spec` / `fijos-spec` / `home-spec` — no se
 * "mejoran" valores, se transcriben. Gradientes como strings CSS (para
 * `cssGradient()` / `experimental_backgroundImage`) y sombras como
 * `boxShadow` literal (multi-sombra + inset).
 *
 * ─────────────────────────────────────────────────────────────────────
 * QUÉ NO VIVE ACÁ
 * ─────────────────────────────────────────────────────────────────────
 * Sólo viven acá los valores PROPIOS del jardín. Lo que el sistema ya
 * define se lee de `@/theme/neo-tokens` (mismo criterio que
 * `garden-spec`) y NO se duplica:
 *
 *   · fondo de pantalla        → `neoTokens(mode).bg`        [OWNER-2]
 *   · card raised y su fill    → `raisedGradientCss` + `shadows.raisedLg`
 *   · botón redondo del header → `shadows.raisedMd`
 *   · hoja del sheet           → `sheet` / `sheetHandle` / `shadows.sheet`
 *   · partículas del hero      → `neoParticlePresets.hero`   [OWNER-5]
 *   · tinta de texto base      → `text` / `textMuted`
 *
 * ─────────────────────────────────────────────────────────────────────
 * DESVÍOS RESPECTO DEL HANDOFF (todos con motivo, ninguno cosmético)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  [OWNER-1] Copy en español latino neutro (tuteo, sin voseo). No afecta
 *      a este módulo (acá no hay copy), pero sí a todo el kit que lo
 *      consume: los copys del handoff vienen en voseo y se neutralizan
 *      YA en la réplica ("Plantá" → "Planta", "volvé" → "vuelve").
 *
 *  [OWNER-2] El fondo es el GLOBAL de la app, no el `#EEEDE9` del
 *      handoff. El jardín se para sobre `neoTokens(mode).bg` (`#DCDFCD`
 *      claro / `#0F1A13` oscuro) como las otras cuatro tabs, así que las
 *      sombras claras del handoff —calculadas sobre `#EEEDE9`, con base
 *      `rgba(166,162,152,…)`— se REBASARON a la base del sistema
 *      `rgba(151,160,136,…)`, conservando offsets, blur y alfas. Sobre el
 *      canvas real esa base es la que produce el mismo relieve; la del
 *      handoff se lee como un material ajeno al lado de Home/Gastos.
 *      Las sombras oscuras no necesitan rebase: el handoff ya usa las
 *      bases del sistema (`rgba(0,0,0,…)` + `rgba(101,152,113,…)`).
 *      Cero cambios en `neo-tokens.ts`.
 *
 *  [OWNER-3] Medallas: mix Brot (4 hitos que SON la metáfora del jardín)
 *      + `FilledAchievementIcon` (los otros 14). Acá viven los tres
 *      discos verdes (`medalShadowAccess/Row/Cierre`) y los tres pozos
 *      (`wellLocked*`, `wellProgress*`, `secretWell*`); el ruteo
 *      code→rama lo decide `parts/medal.tsx`, no este módulo.
 *
 *  [OWNER-4] `calmaRing` / `calmaWell` NO existen en el handoff: son el
 *      token propio del día en calma (día sin gastos), que necesita una
 *      identidad que ningún día de gasto pueda tener. Explícitamente NO
 *      reusa `ringTodayWellBackground` (`#E4F3DC`/`#24402C`): ése es el
 *      tinte de HOY (README:48) y confundiría los dos estados.
 *
 *  [OWNER-5] Partículas = `neoParticlePresets.hero` (count 10), el preset
 *      que ya usan las 4 tabs live. Por eso no hay campo de partículas en
 *      esta interfaz.
 *
 *  [OWNER-6] El aro es CRECIMIENTO, no "riego". Consecuencia para los
 *      tokens: el celeste deja de ser "el color del riego" y pasa a ser
 *      el tono NEUTRO del aro (sin datos de cupo), y aparece el ámbar
 *      `ringAmber` — que el handoff sólo tenía como acento de riesgo del
 *      hero — como tercer tono del aro (cupo excedido). Ver §3.3 del plan.
 *
 *  [A] Los días PASADOS de la fila van LLENOS (`ringGreen` al 100%), no
 *      al porcentaje alcanzado. El backend ya contó ese día entero y
 *      dibujarlo a medias mentiría sobre una racha viva. No cambia ningún
 *      token: cambia quién los consume.
 *
 *  [B] El celeste `#5FB8C9` sirve como STROKE de aro; como tinta de texto
 *      sobre claro no llega a AA (2.4:1 sobre el pozo). Por eso no existe
 *      un `waterInk`: el texto del chip usa `chipInk` y su acento verde
 *      `accentInk`.
 *
 *  [C] Tinta muted en claro. Regla aplicada, para no reintroducir fallas
 *      de contraste que el sistema ya corrigió:
 *        · `#6C7B67` (sub del handoff) → `#54644F` = `neoTokens.textMuted`.
 *          El propio `neo-tokens.ts` documenta que el hex del handoff da
 *          3.32:1 y que volver a él "reintroduce la falla"; `gastos-spec`
 *          ya hace esta sustitución (`movSubInk`, `detailSubInk`).
 *        · Verde `#2E7C39` como TEXTO → `#1F5429` = `neoInk('light').accent`
 *          (el handoff lo usa a 9.5–12px, donde 4.29:1 no alcanza). Como
 *          GRÁFICO (dots, fills de aro) se conserva `#2E7C39`: 4.29:1
 *          supera con margen el 3:1 de no-texto. De ahí el par
 *          `accentInk` / `accentDot`.
 *        · Líneas que hay que LEER pintadas con los grises de relleno del
 *          sistema (`#8FA089` textDim = 2.05:1, `#A6B29B`, `#93A78F`,
 *          `#B4BFA8`) → `#54644F`. Afecta a `historyLabelInk`,
 *          `sectionHeaderInk`, `secretTitleInk`, `secretBodyInk`,
 *          `lockInk` y `sheetChipNeutralInk`.
 *        · Se CONSERVAN literales los grises que etiquetan material y no
 *          contenido: `dayLabelInk` `#9AA694` (= `textTertiary`, mismo
 *          precedente que `gastos-spec.weekdayInk`/`statLabelInk`) y los
 *          números de pozo `#7E9472`, que la fila repite en texto al lado
 *          de la barra.
 *      Los valores oscuros van literales: ahí el handoff ya pasa AA.
 *
 *  [D] Hero por ESTADO, no un forest único. Las otras cuatro tabs
 *      unificaron su hero al "Home forest" (`gastos-spec` [OWNER-F],
 *      `fijos-spec` [D], `garden-spec` [A]). Acá NO: el hero del jardín
 *      tiene seis estados y dos de ellos —2a "empezar" y 2f "cortada"—
 *      cambian de gradiente a propósito (2a es más claro porque todavía
 *      no hay jardín; 2f está desaturado porque la racha se cortó).
 *      Aplanarlos al forest borraría la mitad del sistema de estados. Los
 *      tres gradientes van literales del handoff; el owner los juzga en
 *      el preview.
 *
 *  [E] Derivaciones del tema oscuro. El handoff dibuja en un solo tema:
 *      el hero 2a/2e/2f, el CTA ámbar y el sheet de historial (sólo
 *      claro). Sus contrapartes oscuras están derivadas con el
 *      vocabulario oscuro del sistema y marcadas campo por campo con
 *      "derivado". El gradiente de 2f se usa IDÉNTICO en los dos temas —
 *      ya es oscuro y desaturado, y derivar un gris nuevo sería inventar
 *      color fuera del design system.
 *
 * ─────────────────────────────────────────────────────────────────────
 * INCONSISTENCIAS DEL HANDOFF (informativo — no se "arreglan" acá)
 * ─────────────────────────────────────────────────────────────────────
 *  1. El chip demo dice "65% regado · 3 gastos hoy", pero con la meta de
 *     4 registros que el propio handoff define (25% c/u), 3 gastos son
 *     75%, no 65%. El dato es demo; el modelo real (§3 del plan) manda.
 *  2. La matriz ②7 ("Medianoche") describe que HOY "se congela y encoge
 *     56→40px". No hay NINGÚN aro de 56px en los mockups: la fila es
 *     40/4 en las dos capturas. Se implementa 40 fijo.
 *  3. El sheet de historial (7f) sólo existe en claro. Sus tokens
 *     oscuros están derivados — ver [E].
 *  4. La card de Logros dice "7 de 13 · próximo: 10 semanas florecidas",
 *     pero "10 semanas florecidas" no figura en la lista de 13 logros de
 *     la propia pantalla de Logros del handoff. El catálogo real es de 18
 *     códigos (§4 del plan) y ese logro se descarta.
 *  5. `calmaRing` en oscuro (`#8FCF95`) coincide con `ringGreen` oscuro.
 *     Es el valor que fija el plan; en oscuro la distinción del día en
 *     calma la cargan el ANILLO DOBLE, el pozo `calmaWell` y la pose
 *     `zen`, no el color del stroke.
 */

import type { ResolvedThemeMode } from '@/theme/palette'

// ─────────────────────────────────────────────────────────────────────
// Alias de sombras propias del jardín (las canónicas se leen de
// `neoTokens(mode).shadows`). Claro: base rebasada a `rgba(151,160,136,…)`
// por [OWNER-2]. Oscuro: literal del handoff.
// ─────────────────────────────────────────────────────────────────────

/** Pozo del aro grande (5/12). */
const WELL_FOCUS_L = 'inset 5px 5px 12px rgba(151,160,136,0.45), inset -5px -5px 12px rgba(255,255,255,0.9)'
const WELL_FOCUS_D = 'inset 5px 5px 12px rgba(0,0,0,0.6), inset -5px -5px 12px rgba(101,152,113,0.1)'

/** Pozo del aro de día (2/4). */
const WELL_DAY_L = 'inset 2px 2px 4px rgba(151,160,136,0.45), inset -2px -2px 4px rgba(255,255,255,0.9)'
const WELL_DAY_D = 'inset 2px 2px 4px rgba(0,0,0,0.55), inset -2px -2px 4px rgba(101,152,113,0.1)'

/** Chip inset del aro grande y chip del cierre (3/6 · alfa 0.45). */
const INS_CHIP_L = 'inset 3px 3px 6px rgba(151,160,136,0.45), inset -3px -3px 6px rgba(255,255,255,0.9)'
const INS_CHIP_D = 'inset 3px 3px 6px rgba(0,0,0,0.55), inset -3px -3px 6px rgba(101,152,113,0.1)'

/** Discos chicos hundidos: chevron 30, check 26, medalla bloqueada 34 (3/6 · 0.95). */
const INS_DISC_L = 'inset 3px 3px 6px rgba(151,160,136,0.45), inset -3px -3px 6px rgba(255,255,255,0.95)'
const INS_DISC_D = 'inset 3px 3px 6px rgba(0,0,0,0.55), inset -3px -3px 6px rgba(101,152,113,0.1)'

/** Pozo de medalla en progreso, 54px (4/9). */
const WELL_PROGRESS_L = 'inset 4px 4px 9px rgba(151,160,136,0.5), inset -4px -4px 9px rgba(255,255,255,0.95)'
const WELL_PROGRESS_D = 'inset 4px 4px 9px rgba(0,0,0,0.55), inset -4px -4px 9px rgba(101,152,113,0.1)'

/** Pozo de medalla secreta — un punto MÁS hundido que el de progreso. */
const WELL_SECRET_L = 'inset 4px 4px 9px rgba(151,160,136,0.55), inset -4px -4px 9px rgba(255,255,255,0.9)'
const WELL_SECRET_D = 'inset 4px 4px 9px rgba(0,0,0,0.6), inset -4px -4px 9px rgba(101,152,113,0.08)'

/** Card entera hundida (fila de logro secreto, 5/11). */
const CARD_SUNK_L = 'inset 5px 5px 11px rgba(151,160,136,0.4), inset -5px -5px 11px rgba(255,255,255,0.85)'
const CARD_SUNK_D = 'inset 5px 5px 11px rgba(0,0,0,0.5), inset -5px -5px 11px rgba(101,152,113,0.07)'

/** Track de barra de progreso (2/4 · alfa 0.5). */
const BAR_TRACK_L = 'inset 2px 2px 4px rgba(151,160,136,0.5), inset -2px -2px 4px rgba(255,255,255,0.9)'
const BAR_TRACK_D = 'inset 2px 2px 4px rgba(0,0,0,0.55), inset -2px -2px 4px rgba(101,152,113,0.08)'

/** Tiles y chips hundidos del cierre neutro (3/6 · alfa 0.5). */
const INS_TILE_L = 'inset 3px 3px 6px rgba(151,160,136,0.5), inset -3px -3px 6px rgba(255,255,255,0.9)'
const INS_TILE_D = 'inset 3px 3px 6px rgba(0,0,0,0.55), inset -3px -3px 6px rgba(101,152,113,0.08)'

export interface JardinSpec {
  // ═══════════════════════════════════════════════════════════════════
  // ① Base — sólo lo que el sistema no da (README:116–131)
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Reemplazo donde Android descarta las sombras inset (API < 29): el
   * pozo del aro se vuelve invisible y el Brot queda flotando. Mismo
   * token y mismo motivo que `garden-spec.hairline`.
   */
  hairline: string
  /** Verde de acento como TEXTO — `neoInk(mode).accent`, ver [C]. */
  accentInk: string
  /** El MISMO verde como gráfico (dots, leyenda): literal del handoff. */
  accentDot: string
  /** Tinta principal sobre card (`neoTokens.text`, transcrita para el kit). */
  cardTitleInk: string
  /** Subtítulos y bodies de card — `#6C7B67` del handoff corregido, ver [C]. */
  cardSubInk: string

  // ═══════════════════════════════════════════════════════════════════
  // ② Aros de crecimiento (README:120–127 · HTML:497–500 claro / 574 oscuro)
  // ═══════════════════════════════════════════════════════════════════
  /** Tono NEUTRO del aro: sin datos de cupo (`tone: 'water'`). [OWNER-6] */
  ringWater: string
  /** Tono dentro del cupo — y relleno de todo día pasado plantado. [A] */
  ringGreen: string
  /** Tono fuera del cupo (§3.3). El handoff sólo lo tenía en el hero 2e. */
  ringAmber: string
  /** Track del aro, siempre visible debajo del progreso. */
  ringTrack: string
  /** Pozo interior del aro (100px en el focus, 28px en la fila). */
  ringWellBackground: string
  /** Pozo del aro grande (5/12). */
  ringWellShadow: string
  /** Pozo del aro de día (2/4). */
  ringDayWellShadow: string
  /** Tinte del pozo de HOY — NO es el día en calma (README:48). */
  ringTodayWellBackground: string
  /** Círculo punteado de los días futuros (2.5px dashed). */
  ringDashed: string
  /**
   * [OWNER-4] Anillo del día en calma: verde profundo. Se dibuja como
   * anillo DOBLE (uno exterior extra) — ver inconsistencia 5 sobre el
   * oscuro.
   */
  calmaRing: string
  /**
   * [OWNER-4] Pozo del día en calma. No se inventa un tinte: es el fill
   * de "día cumplido" del calendario del sistema (`neoCalendar[mode].ok.bg`),
   * inequívocamente distinto del `ringTodayWellBackground` de HOY.
   */
  calmaWell: string
  /** Día recuperado (escudo): coral del cierre. Propio, no está en el handoff. */
  recoveredInk: string
  /** Label "HOY" 9.5/900 debajo de su aro. */
  todayLabelInk: string
  /** Iniciales L·M·M·J·V·S·D 9.5/800 — literal, ver [C]. */
  dayLabelInk: string
  /** Chip inset debajo del aro grande. */
  chipBackground: string
  chipShadow: string
  chipInk: string
  /** Leyenda 10.5/800 debajo de la fila (README:52). */
  legendInk: string

  // ═══════════════════════════════════════════════════════════════════
  // ③ Hero — un gradiente por familia de estado (HTML:333–444) · [D]
  // ═══════════════════════════════════════════════════════════════════
  /** 2a "empezar": más claro, todavía no hay jardín. */
  heroEmpezarGradientCss: string
  heroEmpezarFallback: string
  /** 2b–2e: el forest vivo del handoff (= `neoTokens.heroGradientCss`). */
  heroVivoGradientCss: string
  heroVivoFallback: string
  /** 2f "cortada": desaturado. Idéntico en los dos temas, ver [E]. */
  heroCortadaGradientCss: string
  heroCortadaFallback: string
  /** Sombra del hero del teléfono (HTML:484) — el par canónico del sistema. */
  heroShadow: string
  /** Sombra del hero cortado: sin verde, apagada. */
  heroCortadaShadow: string
  /** 2e: barra ámbar de 4px a la izquierda, sumada a `heroShadow`. */
  heroRiesgoEdge: string
  /** Eyebrow 10.5/800 ls 0.14em. */
  heroLabelInk: string
  heroLabelRiesgoInk: string
  heroLabelCortadaInk: string
  /** Título 21–27/900. */
  heroTitleInk: string
  heroTitleCortadaInk: string
  /** Sub 11.5/700. */
  heroSubInk: string
  heroSubCortadaInk: string
  /** Línea de 1.5px sobre la fila de chip/CTA. */
  heroDivider: string
  heroDividerCortada: string
  /** Chip de estado del hero (2b/2c/2d). */
  heroChipBackground: string
  heroChipInk: string
  heroChipDot: string
  /** Chip de 2e. */
  heroChipRiesgoBackground: string
  heroChipRiesgoInk: string
  heroChipRiesgoDot: string
  /** Chip "✕ Perdida" de 2f. */
  heroChipCortadaBackground: string
  heroChipCortadaInk: string
  /** Pill inset de 2c/2d ("Listo por hoy…", "Ver mi jardín ›"). */
  heroPillBackground: string
  heroPillShadow: string
  heroPillInk: string
  /**
   * Sombra proyectada del Brot del hero. En claro es una `drop-shadow`
   * de tinta; en oscuro el handoff la cambia por un GLOW verde.
   */
  heroBrotShadowColor: string
  heroBrotShadowRadius: number
  heroBrotShadowOffset: { width: number; height: number }
  /** Halo radial de 2d (pulse 3s). */
  heroHaloCss: string

  // ═══════════════════════════════════════════════════════════════════
  // ④ CTAs (HTML:487 · 618 · 428 · 638)
  // ═══════════════════════════════════════════════════════════════════
  ctaGreenGradientCss: string
  ctaGreenFallback: string
  ctaGreenInk: string
  ctaGreenShadow: string
  /** Variante chica del mismo CTA ("Ver cierre ›", radius 15, 9×14). */
  ctaGreenSmShadow: string
  /** CTA ámbar de 2e. En oscuro está derivado — ver [E]. */
  ctaAmberGradientCss: string
  ctaAmberFallback: string
  ctaAmberInk: string
  ctaAmberShadow: string
  /** CTA crema del cierre sobre superficie verde (idéntico a `gastos-spec`). */
  ctaCreamGradientCss: string
  ctaCreamFallback: string
  ctaCreamInk: string
  ctaCreamShadow: string

  // ═══════════════════════════════════════════════════════════════════
  // ⑤ Semana pasada · acceso a Logros · nota educativa (HTML:507–526)
  // ═══════════════════════════════════════════════════════════════════
  /**
   * La card de Semana pasada es la ÚNICA con fill de gradiente propio en
   * claro (`#F3F2ED→#E7E5DF`); las demás usan `raisedGradientCss`.
   */
  semanaCardGradientCss: string
  semanaCardFallback: string
  /** Chevron 30px inset del acceso a Logros. */
  chevronBackground: string | undefined
  chevronShadow: string
  chevronInk: string
  /** Nota educativa: card entera hundida, radius 20. */
  notaBackground: string
  notaShadow: string
  notaInk: string
  /** "×" de descarte de la nota (⑤2) — inset 24px, propio del plan. */
  notaCloseInk: string

  // ═══════════════════════════════════════════════════════════════════
  // ⑥ Historial: fila resumen + sheet (HTML:527–536 · 300–329) · [E]
  // ═══════════════════════════════════════════════════════════════════
  /** Divider de 1.5px sobre la fila "Semanas anteriores". */
  historyDivider: string
  /** Label "Semanas anteriores" 10.5/800 — ver [C]. */
  historyLabelInk: string
  historyDotFull: string
  historyDotPartial: string
  historyDotMissed: string
  sheetTitleInk: string
  sheetMonthInk: string
  sheetRangeInk: string
  /** Chip "Florecida". */
  sheetChipOkBackground: string
  sheetChipOkInk: string
  /** Chip "5 de 7". */
  sheetChipNeutralBackground: string
  sheetChipNeutralInk: string
  sheetChipShadow: string

  // ═══════════════════════════════════════════════════════════════════
  // ⑦ Cierre de semana (HTML:624–1073)
  // ═══════════════════════════════════════════════════════════════════
  /** Fondo full-bleed de la variante PERFECTA (las otras 3 usan `neoTokens.bg`). */
  cierrePerfectaBgCss: string
  cierrePerfectaBgFallback: string
  /** Kicker "CIERRE DE SEMANA" 11.5/800 ls 0.22em. */
  cierreKickerInk: string
  cierreKickerOnGreenInk: string
  /** Título 37px (perfecta) / 31px (resto). */
  cierreTitleInk: string
  cierreTitleOnGreenInk: string
  /** Glow del título de la perfecta (NO es string: textShadow* de RN). */
  cierreTitleShadowColor: string
  cierreTitleShadowRadius: number
  cierreTitleShadowOffset: { width: number; height: number }
  /** Chip de resultado bajo el título. */
  cierreChipBackground: string
  cierreChipShadow: string
  cierreChipInk: string
  cierreChipOnGreenBackground: string
  cierreChipOnGreenShadow: string
  cierreChipOnGreenAccentInk: string
  cierreChipOnGreenInk: string
  cierreChipOnGreenDot: string
  /** Dot del chip por variante: buena / floja / cortada. */
  cierreChipDotBuena: string
  cierreChipDotFloja: string
  cierreChipDotCortada: string
  /** Halo detrás del Brot: 196px en perfecta, 180px en el resto. */
  cierreHaloPerfectaCss: string
  cierreHaloCss: string
  /** Card de stats: sobre verde (perfecta) va crema/verde profundo. */
  cierreStatsCardGradientCss: string
  cierreStatsCardFallback: string
  cierreStatsCardShadow: string
  /** Tile de stat DENTRO de la card de la perfecta. */
  cierreStatTileBackground: string
  cierreStatTileShadow: string
  cierreStatValueInk: string
  cierreStatLabelInk: string
  /** Tile de stat de las variantes neutras (radius 16, sobre card raised). */
  cierreStatTileNeutralBackground: string
  cierreStatTileNeutralShadow: string
  /** Tile cuadrado 38px de la fila de 7 días (variantes neutras). */
  cierreDayTileBackground: string
  cierreDayTileShadow: string
  cierreDayLetterInk: string
  cierreDayLetterOnGreenInk: string
  /** Card "¡LOGRO DESBLOQUEADO!" (sólo perfecta). */
  cierreUnlockedCardGradientCss: string
  cierreUnlockedCardFallback: string
  cierreUnlockedCardShadow: string
  cierreUnlockedKickerInk: string
  /** Card "PRÓXIMO LOGRO" (buena) — card raised estándar + estas tintas. */
  cierreNextKickerInk: string
  cierreNextValueInk: string
  /** Coach de Brot (floja / cortada). */
  cierreCoachInk: string
  /** Link secundario debajo del CTA. */
  cierreLinkInk: string
  cierreLinkOnGreenInk: string

  // ═══════════════════════════════════════════════════════════════════
  // ⑧ Pantalla Logros (HTML:1079–1215)
  // ═══════════════════════════════════════════════════════════════════
  /** Section headers "DESBLOQUEADOS · 7" 10.5/900 ls 0.14em — ver [C]. */
  sectionHeaderInk: string
  /** Barra de progreso: track + fill (12px en el resumen, 8px en la fila). */
  progressTrackBackground: string
  progressTrackShadow: string
  progressTrackResumenShadow: string
  progressFillCss: string
  progressFillFallback: string
  /** Disco de check 26px de la fila desbloqueada. */
  checkBackground: string | undefined
  checkShadow: string
  checkInk: string

  // ═══════════════════════════════════════════════════════════════════
  // ⑨ Medallas — las 5 ramas de `MedalVM` [OWNER-3]
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Disco radial verde de la medalla desbloqueada, tamaños 48 y 54. En
   * claro el fill es el mismo para los tres tamaños; en oscuro el handoff
   * cierra el radial más profundo (#3E7D46) en los discos grandes que en
   * el stack de 34 — de ahí el par `medal*` / `medalAccess*`.
   */
  medalGradientCss: string
  medalFallback: string
  /** El mismo disco a 34px (stack del acceso a Logros). */
  medalAccessGradientCss: string
  medalAccessFallback: string
  /** 34px, stack del acceso a Logros. */
  medalShadowAccess: string
  /** 54px, fila de la pantalla Logros. */
  medalShadowRow: string
  /** 48px, card de logro desbloqueado del cierre. */
  medalShadowCierre: string
  /**
   * Borde de 2.5px del stack solapado: no es una tinta, es el color de la
   * SUPERFICIE sobre la que se apilan los discos (la card de acceso a
   * Logros). En el handoff coincidía con el fondo de pantalla sólo porque
   * su card clara era el mismo `#EEEDE9` del canvas; con el fondo global
   * de [OWNER-2] ya no coinciden, así que va la superficie de la card.
   */
  medalBorderColor: string
  /** Número dentro del disco (racha, ediciones). */
  medalNumberInk: string
  /** Pozo con "?" del stack de acceso (34px). */
  wellLockedBackground: string
  wellLockedShadow: string
  wellLockedInk: string
  /** Pozo con el número actual (rama `progress`, 54px). */
  wellProgressBackground: string
  wellProgressShadow: string
  wellProgressInk: string
  /** Fila de logro secreto: card entera hundida. */
  secretCardBackground: string
  secretCardShadow: string
  secretWellBackground: string
  secretWellShadow: string
  secretWellInk: string
  secretTitleInk: string
  secretBodyInk: string
  /** Candado SVG (rect 4,10,16,10 r2.5 + path M8 10V7a4 4 0 0 1 8 0v3). */
  lockInk: string
}

export const JARDIN_SPEC: Record<ResolvedThemeMode, JardinSpec> = {
  light: {
    // ① Base
    hairline: 'rgba(151,160,136,0.25)',
    accentInk: '#1F5429',
    accentDot: '#2E7C39',
    cardTitleInk: '#24382A',
    cardSubInk: '#54644F',

    // ② Aros
    ringWater: '#5FB8C9',
    ringGreen: '#63B168',
    ringAmber: '#C96F3F',
    ringTrack: '#E3E1DA',
    ringWellBackground: '#E8E6E0',
    ringWellShadow: WELL_FOCUS_L,
    ringDayWellShadow: WELL_DAY_L,
    ringTodayWellBackground: '#E4F3DC',
    ringDashed: '#D8D5CC',
    calmaRing: '#2E7434',
    calmaWell: '#DCEBD8',
    recoveredInk: '#F0B488',
    todayLabelInk: '#1F5429',
    dayLabelInk: '#9AA694',
    chipBackground: '#E8E6E0',
    chipShadow: INS_CHIP_L,
    chipInk: '#24382A',
    legendInk: '#54644F',

    // ③ Hero
    heroEmpezarGradientCss: 'linear-gradient(155deg, #4C7A50 0%, #5FA064 55%, #6FB074 100%)',
    heroEmpezarFallback: '#5FA064',
    heroVivoGradientCss: 'linear-gradient(155deg, #337B39 0%, #4C9A52 55%, #5FAC64 100%)',
    heroVivoFallback: '#4C9A52',
    heroCortadaGradientCss: 'linear-gradient(150deg, #3C4A3D 0%, #2E3A2F 100%)',
    heroCortadaFallback: '#354236',
    heroShadow:
      '12px 12px 26px rgba(124,138,110,0.55), -8px -8px 20px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.25)',
    heroCortadaShadow: '10px 10px 24px rgba(90,100,85,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
    heroRiesgoEdge: 'inset 4px 0 0 #E8A664',
    heroLabelInk: 'rgba(240,248,230,0.85)',
    heroLabelRiesgoInk: '#F5CE9A',
    heroLabelCortadaInk: '#D6A98C',
    heroTitleInk: '#F7F4E4',
    heroTitleCortadaInk: '#EDEEE6',
    heroSubInk: 'rgba(240,248,230,0.82)',
    heroSubCortadaInk: 'rgba(237,238,230,0.72)',
    heroDivider: 'rgba(240,248,230,0.2)',
    heroDividerCortada: 'rgba(237,238,230,0.16)',
    heroChipBackground: 'rgba(13,34,18,0.24)',
    heroChipInk: '#C9F3C6',
    heroChipDot: '#C9F3C6',
    heroChipRiesgoBackground: 'rgba(70,45,20,0.4)',
    heroChipRiesgoInk: '#F5CE9A',
    heroChipRiesgoDot: '#F2C48A',
    heroChipCortadaBackground: 'rgba(0,0,0,0.28)',
    heroChipCortadaInk: '#E9A98A',
    heroPillBackground: 'rgba(13,34,18,0.24)',
    heroPillShadow: 'inset 2px 2px 6px rgba(6,20,10,0.4)',
    heroPillInk: 'rgba(240,248,230,0.92)',
    heroBrotShadowColor: 'rgba(20,45,25,0.35)',
    heroBrotShadowRadius: 14,
    heroBrotShadowOffset: { width: 0, height: 8 },
    heroHaloCss: 'radial-gradient(circle, rgba(201,243,198,0.5), rgba(201,243,198,0) 70%)',

    // ④ CTAs
    ctaGreenGradientCss: 'radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)',
    ctaGreenFallback: '#2E7434',
    ctaGreenInk: '#F5F2E1',
    ctaGreenShadow: '0 10px 20px rgba(46,116,52,0.32), inset 0 1.5px 2px rgba(255,255,255,0.3)',
    ctaGreenSmShadow: '0 8px 16px rgba(46,116,52,0.35), inset 0 1.5px 2px rgba(255,255,255,0.3)',
    ctaAmberGradientCss: 'radial-gradient(circle at 32% 28%, #E8A664, #C96F3F 85%)',
    ctaAmberFallback: '#C96F3F',
    ctaAmberInk: '#FFF6EC',
    ctaAmberShadow: '0 10px 20px rgba(176,94,47,0.35), inset 0 1.5px 2px rgba(255,255,255,0.3)',
    ctaCreamGradientCss: 'linear-gradient(145deg, #F7F4E6, #E2DEC8)',
    ctaCreamFallback: '#ECE9D7',
    ctaCreamInk: '#1F3A26',
    ctaCreamShadow: '0 14px 28px rgba(20,45,25,0.35), inset 0 2px 3px rgba(255,255,255,0.6)',

    // ⑤ Semana pasada · Logros · nota
    semanaCardGradientCss: 'linear-gradient(145deg, #F3F2ED, #E7E5DF)',
    semanaCardFallback: '#EDECE6',
    chevronBackground: undefined,
    chevronShadow: INS_DISC_L,
    chevronInk: '#1F5429',
    notaBackground: '#E8E6E0',
    notaShadow: 'inset 3px 3px 7px rgba(151,160,136,0.4), inset -3px -3px 7px rgba(255,255,255,0.9)',
    notaInk: '#54644F',
    notaCloseInk: '#54644F',

    // ⑥ Historial
    historyDivider: '#E0DED6',
    historyLabelInk: '#54644F',
    historyDotFull: '#63B168',
    historyDotPartial: '#A9CE8E',
    historyDotMissed: '#D6C29E',
    sheetTitleInk: '#24382A',
    sheetMonthInk: '#54644F',
    sheetRangeInk: '#54644F',
    sheetChipOkBackground: '#DFEAD6',
    sheetChipOkInk: '#1F5429',
    sheetChipNeutralBackground: '#E8E6E0',
    sheetChipNeutralInk: '#54644F',
    sheetChipShadow:
      'inset 2px 2px 4px rgba(151,160,136,0.35), inset -2px -2px 4px rgba(255,255,255,0.85)',

    // ⑦ Cierre
    cierrePerfectaBgCss: 'linear-gradient(160deg, #337B39 0%, #4C9A52 60%, #5FAC64 100%)',
    cierrePerfectaBgFallback: '#4C9A52',
    cierreKickerInk: '#54644F',
    cierreKickerOnGreenInk: 'rgba(240,248,230,0.8)',
    cierreTitleInk: '#24382A',
    cierreTitleOnGreenInk: '#F7F4E4',
    cierreTitleShadowColor: 'rgba(20,45,25,0.3)',
    cierreTitleShadowRadius: 10,
    cierreTitleShadowOffset: { width: 0, height: 2 },
    cierreChipBackground: '#E8E6E0',
    cierreChipShadow: INS_TILE_L,
    cierreChipInk: '#24382A',
    cierreChipOnGreenBackground: 'rgba(255,255,255,0.16)',
    cierreChipOnGreenShadow: 'inset 0 1px 2px rgba(20,45,25,0.25)',
    cierreChipOnGreenAccentInk: '#C9F3C6',
    cierreChipOnGreenInk: '#F2F7E6',
    cierreChipOnGreenDot: 'rgba(240,248,230,0.6)',
    cierreChipDotBuena: '#2E7C39',
    cierreChipDotFloja: '#C96F3F',
    cierreChipDotCortada: '#B05E2F',
    cierreHaloPerfectaCss: 'radial-gradient(circle, rgba(201,243,198,0.42), rgba(201,243,198,0) 70%)',
    cierreHaloCss: 'radial-gradient(circle, rgba(99,177,104,0.16), rgba(99,177,104,0) 70%)',
    cierreStatsCardGradientCss: 'linear-gradient(145deg, #F7F4E6, #E4E0CB)',
    cierreStatsCardFallback: '#EEEAD9',
    cierreStatsCardShadow:
      '0 14px 28px rgba(20,45,25,0.32), -5px -5px 14px rgba(255,255,255,0.2), inset 0 2px 3px rgba(255,255,255,0.6)',
    cierreStatTileBackground: '#ECE8D6',
    cierreStatTileShadow:
      'inset 3px 3px 7px rgba(151,160,136,0.5), inset -3px -3px 7px rgba(255,255,255,0.9)',
    cierreStatValueInk: '#1F3A26',
    cierreStatLabelInk: '#54644F',
    cierreStatTileNeutralBackground: '#E8E6E0',
    cierreStatTileNeutralShadow:
      'inset 3px 3px 7px rgba(151,160,136,0.5), inset -3px -3px 7px rgba(255,255,255,0.9)',
    cierreDayTileBackground: '#E8E6E0',
    cierreDayTileShadow: INS_TILE_L,
    cierreDayLetterInk: '#54644F',
    cierreDayLetterOnGreenInk: 'rgba(240,248,230,0.8)',
    cierreUnlockedCardGradientCss: 'linear-gradient(145deg, #F7F4E6, #E4E0CB)',
    cierreUnlockedCardFallback: '#EEEAD9',
    cierreUnlockedCardShadow: '0 12px 24px rgba(20,45,25,0.28), inset 0 2px 3px rgba(255,255,255,0.55)',
    cierreUnlockedKickerInk: '#1F5429',
    cierreNextKickerInk: '#1F5429',
    cierreNextValueInk: '#1F5429',
    cierreCoachInk: '#54644F',
    cierreLinkInk: '#1F5429',
    cierreLinkOnGreenInk: 'rgba(240,248,230,0.9)',

    // ⑧ Logros
    sectionHeaderInk: '#54644F',
    progressTrackBackground: '#E3E1DA',
    progressTrackShadow: BAR_TRACK_L,
    progressTrackResumenShadow: INS_TILE_L,
    progressFillCss: 'linear-gradient(90deg, #63B168, #2E7434)',
    progressFillFallback: '#489350',
    checkBackground: undefined,
    checkShadow: INS_DISC_L,
    checkInk: '#1F5429',

    // ⑨ Medallas
    medalGradientCss: 'radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)',
    medalFallback: '#2E7434',
    medalAccessGradientCss: 'radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)',
    medalAccessFallback: '#2E7434',
    medalShadowAccess: '0 4px 9px rgba(46,116,52,0.3), inset 0 1px 1.5px rgba(255,255,255,0.3)',
    medalShadowRow: '0 8px 16px rgba(46,116,52,0.35), inset 0 1.5px 2px rgba(255,255,255,0.3)',
    medalShadowCierre: '0 8px 16px rgba(46,116,52,0.4), inset 0 1.5px 2px rgba(255,255,255,0.3)',
    medalBorderColor: '#E9EBE0',
    medalNumberInk: '#F7F4E4',
    wellLockedBackground: '#E8E6E0',
    wellLockedShadow: 'inset 3px 3px 6px rgba(151,160,136,0.5), inset -3px -3px 6px rgba(255,255,255,0.95)',
    wellLockedInk: '#54644F',
    wellProgressBackground: '#E8E6E0',
    wellProgressShadow: WELL_PROGRESS_L,
    wellProgressInk: '#7E9472',
    secretCardBackground: '#E8E6E0',
    secretCardShadow: CARD_SUNK_L,
    secretWellBackground: '#DFDDD6',
    secretWellShadow: WELL_SECRET_L,
    secretWellInk: '#54644F',
    secretTitleInk: '#54644F',
    secretBodyInk: '#54644F',
    lockInk: '#54644F',
  },

  dark: {
    // ① Base
    hairline: 'rgba(101,152,113,0.18)',
    accentInk: '#A4E3A6',
    accentDot: '#A4E3A6',
    cardTitleInk: '#EFF6E2',
    cardSubInk: '#93A78F',

    // ② Aros
    ringWater: '#7FD0DE',
    ringGreen: '#8FCF95',
    ringAmber: '#F2A87E',
    ringTrack: '#2A4032',
    ringWellBackground: '#142519',
    ringWellShadow: WELL_FOCUS_D,
    ringDayWellShadow: WELL_DAY_D,
    ringTodayWellBackground: '#24402C',
    ringDashed: '#3A5040',
    calmaRing: '#8FCF95',
    calmaWell: 'rgba(164,227,166,0.16)',
    recoveredInk: '#F0B488',
    todayLabelInk: '#A4E3A6',
    dayLabelInk: '#7C917A',
    chipBackground: '#142519',
    chipShadow: INS_CHIP_D,
    chipInk: '#EFF6E2',
    legendInk: '#8FA089',

    // ③ Hero
    // El oscuro no dibuja 2a: se deriva bajando el forest oscuro del
    // handoff un punto (mismo delta relativo que en claro entre 2a y 2b).
    heroEmpezarGradientCss: 'linear-gradient(150deg, #2A5739 0%, #22482D 55%, #1C3D25 100%)',
    heroEmpezarFallback: '#22482D',
    heroVivoGradientCss: 'linear-gradient(150deg, #234931 0%, #1B3A26 55%, #16301F 100%)',
    heroVivoFallback: '#1B3A26',
    // Idéntico a claro: ya es un gris verdoso oscuro — ver [E].
    heroCortadaGradientCss: 'linear-gradient(150deg, #3C4A3D 0%, #2E3A2F 100%)',
    heroCortadaFallback: '#354236',
    heroShadow:
      '12px 12px 26px rgba(0,0,0,0.6), -10px -10px 22px rgba(101,152,113,0.12), inset 0 1px 0 rgba(164,227,166,0.12)',
    heroCortadaShadow: '10px 10px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
    heroRiesgoEdge: 'inset 4px 0 0 #E8A664',
    heroLabelInk: '#9FB89C',
    heroLabelRiesgoInk: '#F5CE9A',
    heroLabelCortadaInk: '#D6A98C',
    heroTitleInk: '#EFF6E2',
    heroTitleCortadaInk: '#EDEEE6',
    heroSubInk: '#93A78F',
    heroSubCortadaInk: 'rgba(237,238,230,0.72)',
    heroDivider: 'rgba(164,227,166,0.18)',
    heroDividerCortada: 'rgba(237,238,230,0.16)',
    heroChipBackground: 'rgba(12,26,16,0.55)',
    heroChipInk: '#A4E3A6',
    heroChipDot: '#A4E3A6',
    heroChipRiesgoBackground: 'rgba(70,45,20,0.5)',
    heroChipRiesgoInk: '#F5CE9A',
    heroChipRiesgoDot: '#F2C48A',
    heroChipCortadaBackground: 'rgba(0,0,0,0.35)',
    heroChipCortadaInk: '#E9A98A',
    heroPillBackground: 'rgba(12,26,16,0.55)',
    heroPillShadow: 'inset 2px 2px 6px rgba(0,0,0,0.5)',
    heroPillInk: '#DCE8D5',
    // En oscuro el handoff cambia la sombra por un glow verde (HTML:564).
    heroBrotShadowColor: 'rgba(150,230,160,0.28)',
    heroBrotShadowRadius: 20,
    heroBrotShadowOffset: { width: 0, height: 0 },
    heroHaloCss: 'radial-gradient(circle, rgba(164,227,166,0.3), rgba(164,227,166,0) 70%)',

    // ④ CTAs
    ctaGreenGradientCss: 'radial-gradient(circle at 32% 28%, #9FDC9F, #5FA968 85%)',
    ctaGreenFallback: '#5FA968',
    ctaGreenInk: '#0F1E14',
    ctaGreenShadow: '0 0 22px rgba(140,225,150,0.28), inset 0 2px 3px rgba(255,255,255,0.4)',
    ctaGreenSmShadow: '0 0 22px rgba(140,225,150,0.28), inset 0 2px 3px rgba(255,255,255,0.4)',
    // Derivado — el handoff sólo dibuja 2e en claro (ver [E]): mismo
    // radial ámbar, con el glow oscuro del vocabulario en vez de la
    // sombra proyectada clara.
    ctaAmberGradientCss: 'radial-gradient(circle at 32% 28%, #E8A664, #C96F3F 85%)',
    ctaAmberFallback: '#C96F3F',
    ctaAmberInk: '#FFF6EC',
    ctaAmberShadow: '0 0 22px rgba(232,166,100,0.28), inset 0 2px 3px rgba(255,255,255,0.35)',
    ctaCreamGradientCss: 'linear-gradient(145deg, #F7F4E6, #E2DEC8)',
    ctaCreamFallback: '#ECE9D7',
    ctaCreamInk: '#1F3A26',
    ctaCreamShadow: '0 14px 28px rgba(0,0,0,0.45), inset 0 2px 3px rgba(255,255,255,0.6)',

    // ⑤ Semana pasada · Logros · nota
    // En oscuro el handoff NO le da fill propio: es la card raised común.
    semanaCardGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    semanaCardFallback: '#1A2D21',
    // El handoff pinta este disco con su fondo de pantalla (`#16271C`), que
    // con [OWNER-2] ya no existe; va el pozo oscuro del sistema, el mismo
    // que el handoff usa para TODOS los demás discos hundidos en oscuro.
    chevronBackground: '#142519',
    chevronShadow: INS_DISC_D,
    chevronInk: '#A4E3A6',
    notaBackground: '#142519',
    notaShadow: 'inset 3px 3px 7px rgba(0,0,0,0.5), inset -3px -3px 7px rgba(101,152,113,0.08)',
    notaInk: '#93A78F',
    notaCloseInk: '#93A78F',

    // ⑥ Historial
    historyDivider: 'rgba(164,227,166,0.14)',
    historyLabelInk: '#8FA089',
    historyDotFull: '#8FCF95',
    historyDotPartial: '#5F8A66',
    historyDotMissed: '#4A3A26',
    // Derivados: el sheet 7f sólo existe en claro (ver [E]).
    sheetTitleInk: '#F1EEDD',
    sheetMonthInk: '#93A78F',
    sheetRangeInk: '#93A78F',
    sheetChipOkBackground: 'rgba(164,227,166,0.16)',
    sheetChipOkInk: '#A4E3A6',
    sheetChipNeutralBackground: '#142519',
    sheetChipNeutralInk: '#93A78F',
    sheetChipShadow: 'inset 2px 2px 4px rgba(0,0,0,0.5), inset -2px -2px 4px rgba(101,152,113,0.07)',

    // ⑦ Cierre
    cierrePerfectaBgCss: 'linear-gradient(160deg, #1E3F2A 0%, #16301F 60%, #0F1E14 100%)',
    cierrePerfectaBgFallback: '#16301F',
    cierreKickerInk: '#8FA089',
    cierreKickerOnGreenInk: '#9FB89C',
    cierreTitleInk: '#F1EEDD',
    cierreTitleOnGreenInk: '#EFF6E2',
    cierreTitleShadowColor: 'rgba(150,230,160,0.35)',
    cierreTitleShadowRadius: 30,
    cierreTitleShadowOffset: { width: 0, height: 0 },
    cierreChipBackground: '#142519',
    cierreChipShadow: INS_TILE_D,
    cierreChipInk: '#F1EEDD',
    cierreChipOnGreenBackground: 'rgba(12,26,16,0.55)',
    cierreChipOnGreenShadow:
      'inset 3px 3px 7px rgba(0,0,0,0.5), inset -3px -3px 7px rgba(101,152,113,0.08)',
    cierreChipOnGreenAccentInk: '#A4E3A6',
    cierreChipOnGreenInk: '#DCE8D5',
    cierreChipOnGreenDot: 'rgba(164,227,166,0.5)',
    cierreChipDotBuena: '#A4E3A6',
    cierreChipDotFloja: '#F2A87E',
    cierreChipDotCortada: '#F2A87E',
    cierreHaloPerfectaCss: 'radial-gradient(circle, rgba(164,227,166,0.26), rgba(164,227,166,0) 70%)',
    cierreHaloCss: 'radial-gradient(circle, rgba(164,227,166,0.18), rgba(164,227,166,0) 70%)',
    cierreStatsCardGradientCss: 'linear-gradient(145deg, #22432D, #16301F)',
    cierreStatsCardFallback: '#1C3A26',
    cierreStatsCardShadow:
      '0 14px 28px rgba(0,0,0,0.5), -5px -5px 14px rgba(101,152,113,0.1), inset 0 1px 0 rgba(164,227,166,0.12)',
    cierreStatTileBackground: '#112318',
    cierreStatTileShadow:
      'inset 3px 3px 8px rgba(0,0,0,0.6), inset -3px -3px 8px rgba(101,152,113,0.1)',
    cierreStatValueInk: '#EFF6E2',
    cierreStatLabelInk: '#7C917A',
    cierreStatTileNeutralBackground: '#142519',
    cierreStatTileNeutralShadow:
      'inset 3px 3px 7px rgba(0,0,0,0.55), inset -3px -3px 7px rgba(101,152,113,0.1)',
    cierreDayTileBackground: '#142519',
    cierreDayTileShadow: INS_TILE_D,
    cierreDayLetterInk: '#93A78F',
    cierreDayLetterOnGreenInk: '#9FB89C',
    cierreUnlockedCardGradientCss: 'linear-gradient(145deg, #22432D, #16301F)',
    cierreUnlockedCardFallback: '#1C3A26',
    cierreUnlockedCardShadow: '0 12px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(164,227,166,0.1)',
    cierreUnlockedKickerInk: '#A4E3A6',
    cierreNextKickerInk: '#A4E3A6',
    cierreNextValueInk: '#A4E3A6',
    cierreCoachInk: '#93A78F',
    cierreLinkInk: '#A4E3A6',
    cierreLinkOnGreenInk: '#A4E3A6',

    // ⑧ Logros
    sectionHeaderInk: '#7C917A',
    progressTrackBackground: '#0F1E14',
    progressTrackShadow: BAR_TRACK_D,
    progressTrackResumenShadow: INS_TILE_D,
    progressFillCss: 'linear-gradient(90deg, #5FA968, #A4E3A6)',
    progressFillFallback: '#7FC584',
    checkBackground: '#142519',
    checkShadow: INS_DISC_D,
    checkInk: '#A4E3A6',

    // ⑨ Medallas
    medalGradientCss: 'radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 85%)',
    medalFallback: '#3E7D46',
    medalAccessGradientCss: 'radial-gradient(circle at 32% 28%, #9FDC9F, #5FA968 85%)',
    medalAccessFallback: '#5FA968',
    medalShadowAccess: '0 0 12px rgba(140,225,150,0.3), inset 0 1px 1.5px rgba(255,255,255,0.35)',
    medalShadowRow: '0 0 16px rgba(140,225,150,0.3), inset 0 1.5px 2px rgba(255,255,255,0.3)',
    medalShadowCierre: '0 0 18px rgba(140,225,150,0.32), inset 0 1.5px 2px rgba(255,255,255,0.35)',
    medalBorderColor: '#1A2D21',
    medalNumberInk: '#0F2A16',
    wellLockedBackground: '#142519',
    wellLockedShadow: 'inset 3px 3px 6px rgba(0,0,0,0.55), inset -3px -3px 6px rgba(101,152,113,0.1)',
    wellLockedInk: '#5F7360',
    wellProgressBackground: '#142519',
    wellProgressShadow: WELL_PROGRESS_D,
    wellProgressInk: '#6E846A',
    secretCardBackground: '#142519',
    secretCardShadow: CARD_SUNK_D,
    secretWellBackground: '#0F1E14',
    secretWellShadow: WELL_SECRET_D,
    secretWellInk: '#4C6152',
    secretTitleInk: '#7C917A',
    secretBodyInk: '#566B58',
    lockInk: '#4C6152',
  },
}

/**
 * Geometría del jardín — idéntica en los dos temas.
 *
 * Los aros salen de la ficha del handoff (README:131) y del mockup del
 * teléfono; el radio del hero es **32** (HTML:483–485, el del mockup),
 * no el 30 del README, que describe las cards sueltas 2a–2f fuera del
 * teléfono.
 */
export const JARDIN_GEOMETRY = {
  /** Aro grande de foco del día. */
  ringFocus: { size: 130, stroke: 10, well: 100, brot: 52 },
  /**
   * Aro de la fila de 7. `brotMin`/`brotMax` acotan el tamaño CONTINUO
   * por horas de crecimiento (§3.2 del plan), no tres escalones.
   */
  ringDay: { size: 40, stroke: 4, well: 28, brotMin: 15, brotMax: 20 },
  radii: {
    hero: 32,
    card: 28,
    cardSm: 24,
    nota: 20,
    /** Hoja del historial: [topLeft, topRight, bottomLeft, bottomRight]. */
    sheet: [30, 30, 34, 34],
    chip: 14,
    /**
     * `medalAccess`/`medalRow` son DIÁMETROS del disco (el markup los
     * declara como `border-radius:50%` sobre esa medida). Viven acá
     * porque así los agrupa el plan.
     */
    medalAccess: 34,
    medalRow: 54,
  },
  /** Dot de la fila resumen de historial. */
  historyDot: 10,
  /** Dot dentro del sheet de historial. */
  sheetDot: 12,
  /** Botón circular de volver del header. */
  backSize: 44,

  // ── Medidas que el kit necesita y el plan no enumera (literales del HTML) ──
  /** Brot del hero: 72 en 2a/2b/2c/2e/2f, 74 en 2d (radiante). */
  heroBrot: 72,
  heroBrotRadiante: 74,
  /** Grosor del círculo punteado de los días futuros. */
  dashedWidth: 2.5,
  /** Brot `wilted` del día perdido: 45% de opacidad (matriz ②6). */
  wiltedOpacity: 0.45,
  /** Dot del chip del aro grande y de los chips del cierre. */
  chipDot: 7,
  /** Dot de la leyenda "verde = día completo · celeste = …". */
  legendDot: 9,
  /** Stack de medallas del acceso a Logros: solape y borde. */
  medalOverlap: -12,
  medalBorderWidth: 2.5,
  /** Chevron del acceso a Logros / disco de check de la fila desbloqueada. */
  chevronDisc: 30,
  checkDisc: 26,
  /** Grabber del sheet de historial. */
  grabber: { width: 44, height: 5 },
  /** Cierre de semana. */
  cierre: {
    /** Brot protagonista: 122 en perfecta, 116 en las otras tres. */
    brotPerfecta: 122,
    brot: 116,
    /** Halo detrás del Brot. */
    haloPerfecta: 196,
    halo: 180,
    /** Mini-Brot de la fila de 7 (perfecta, sin tile). */
    miniBrot: 34,
    /** Tile cuadrado de la fila de 7 (variantes neutras) + su Brot. */
    tile: 38,
    tileRadius: 12,
    tileBrot: 26,
    /** Medalla de la card "¡LOGRO DESBLOQUEADO!". */
    medal: 48,
    medalBrot: 34,
    /** Brot `coach` de la card de nudge (floja / cortada). */
    coachBrot: 46,
  },
  /** Alturas de barra de progreso: resumen de Logros · fila · cierre. */
  progressBar: { resumen: 12, row: 8, cierre: 9 },
  /** Brot `cheer` de la card "Semana pasada" y `zen` del header de Logros. */
  semanaPasadaBrot: 46,
  logrosHeaderBrot: 52,
} as const

/**
 * Geometría del aro SVG (README:131, idéntica para los dos tamaños).
 *
 * El `−1` no es un fudge: separa el trazo del borde del viewBox para que
 * `strokeLinecap: 'round'` no quede recortado en el arranque del arco.
 * El progreso se dibuja con `strokeDasharray = c` y
 * `strokeDashoffset = c × (1 − pct)`, sobre un `rotate(-90)` centrado.
 */
export function ringGeometry(size: number, stroke: number): { r: number; c: number } {
  const r = (size - stroke) / 2 - 1
  return { r, c: 2 * Math.PI * r }
}
