/**
 * Tokens del Wrapped de cierre — "La Edición" (rediseño 2026-08) —
 * transcripción LITERAL de `design/wrapped-2026-08/Wrapped Manifiesto.dc.html`:
 *
 *   · flujo nocturno 7 pantallas (2a)      HTML:40–229   (fuente de verdad)
 *   · flujo claro (3a)                     HTML:330–520 · README:49–50
 *   · estados MARGEN/EXCEDIDO/JUSTO (3b)   HTML:534–605
 *   · animaciones                          README:83–92
 *   · tabla de tokens del handoff          README:94–110
 *
 * Mismo criterio que `jardin-spec` / `gastos-spec` / `fijos-spec`: no se
 * "mejoran" valores, se transcriben. Gradientes como strings CSS (para
 * `cssGradient()` / `experimental_backgroundImage`) y sombras como
 * `boxShadow` literal (multi-sombra + inset). Cada valor lleva su línea
 * del HTML como ancla (`HTML:NNN`).
 *
 * ─────────────────────────────────────────────────────────────────────
 * ALCANCE
 * ─────────────────────────────────────────────────────────────────────
 * Cubre el shell común + pantallas 01, 02, 03, 05, 06 y 07, con los tres
 * estados del veredicto y la variante EXCEDIDO del paso 6 — en LOS DOS
 * temas (`WRAPPED_SPECS.light` / `.dark`).
 *   · La pantalla 04 "Tu jardín" (HTML:112–145) habla el vocabulario del
 *     jardín (aros, dots, pozos) y se arma con `jardin-spec` /
 *     `JARDIN_GEOMETRY`; acá no se re-transcribe.
 *   · El sheet de compartir + tarjeta 9:16 (2b, HTML:234–274) queda fuera
 *     de esta tanda; se transcribe junto con la toma de compartir. (La
 *     tarjeta exportable es SIEMPRE nocturna — README:26 — así que usará
 *     el spec dark aunque el flujo siga el tema.)
 *
 * ─────────────────────────────────────────────────────────────────────
 * QUÉ NO VIVE ACÁ
 * ─────────────────────────────────────────────────────────────────────
 * Sólo viven acá los valores PROPIOS del wrapped. Lo que el sistema ya
 * define se lee de `@/theme/neo-tokens` / `@/theme/neo-ink` y NO se
 * duplica:
 *
 *   · tintas / material por tema          → `neoTokens(mode)`, `neoInk(mode)`
 *   · card raised                         → `raisedGradientCss` [OWNER-6]
 *   · tiles pastel del paso 06            → `neoCategoryPastels` [OWNER-4]
 *   · colores de partículas               → `neoParticlePresets` [OWNER-5]
 *   · CTA claro (radial verde)            → `ctaGradient` + `shadows.cta`
 *     (el `#63B168` del handoff ya fue corregido por contraste EN EL
 *     TOKEN — ver el comentario de `ctaGradient` en neo-tokens.ts)
 *   · tinta sobre CTA crema oscuro        → `#1F3A26`, el `ctaCreamInk`
 *     que ya usan `home-spec`:305 y `jardin-spec`:643
 *
 * ─────────────────────────────────────────────────────────────────────
 * DESVÍOS RESPECTO DEL HANDOFF (todos con motivo, ninguno cosmético)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  [OWNER-1] El wrapped SIGUE EL TEMA DEL SISTEMA (orden del owner,
 *      2026-08-13 — "que impacte el estilo light y dark en relación al
 *      sistema"). El handoff lo preveía: README:25 "existe modo claro
 *      completo si producto decide seguir el tema del sistema". El spec
 *      es un `Record<'light' | 'dark', WrappedSpec>`; el dark transcribe
 *      el flujo nocturno canónico (2a) y el light el flujo claro (3a)
 *      REBASADO al material del sistema — ver [OWNER-7].
 *
 *  [OWNER-2] El fondo oscuro NO es el gradiente propio del handoff
 *      (`165deg, #1E3F2A → #14301E 55% → #0F1E14`, HTML:41). Se rebasa a
 *      la receta forest YA aprobada del cierre del jardín
 *      (`jardin-spec.ts:881 cierrePerfectaBgCss`):
 *      `linear-gradient(160deg, #1E3F2A 0%, #16301F 60%, #0F1E14 100%)`.
 *      Motivo: cero hexes de fondo nuevos — el cierre de semana del
 *      jardín es el mismo ritual nocturno y el owner rechaza colores
 *      fuera del sistema. `#14301E` NO entra al repo.
 *      Consecuencia [A] más abajo (tinta del check).
 *
 *  [OWNER-3] Los copys NO viven en el spec: van a i18n (ES neutro,
 *      tuteo). Acá quedan transcritos LITERALES como comentarios junto a
 *      cada bloque, con marca "⚠ voseo" donde hay que neutralizar
 *      ("pensás" → "piensas", "Decidís" → "Decides", "Tenés" → "Tienes").
 *      Montos y fechas son contenido demo del ciclo "Edición Nº 3"
 *      (README:16 pide respetarlos en previews).
 *
 *  [OWNER-4] Tiles pastel del paso 06 = `neoCategoryPastels` del sistema.
 *      Los hexes del handoff coinciden byte a byte con el catálogo:
 *      `#EDE6D4` = ropa (HTML:174) · `#E6E0F4` = ocio (HTML:179/572) ·
 *      `#D4EBDF` = mascotas (HTML:186) · `#F7E3CF` = comida (HTML:567).
 *      No se re-declaran. Mismos pasteles en ambos temas (el catálogo es
 *      único).
 *
 *  [OWNER-5] Partículas = presets del sistema: oscuro
 *      `neoParticlePresets.celebrationDark` (EXACTAMENTE los 3 hexes del
 *      handoff — `#A4E3A6, #F2A87E, #F1EEDD`, HTML:42/149/206); claro
 *      `neoParticlePresets.authLight` (`#7FB069, #E8A87C, #9BB894`) en
 *      lugar del trío del handoff (`#8FBE77, #E8B48C, #CBD8C0`,
 *      README:50) — misma familia, ya viven en el vocabulario. En el
 *      spec sólo van los COUNTS por pantalla: 12 portada · 22 veredicto
 *      MARGEN · 16 contratapa · 0 en EXCEDIDO y JUSTO (HTML:537/591 no
 *      montan el componente).
 *
 *  [OWNER-6] Card raised = `neoTokens(mode).raisedGradientCss`. El
 *      handoff oscuro usa DOS recetas: la del sistema, byte a byte, en el
 *      sello (HTML:47) y `145deg, #1C3325 → #132318` en burbujas, option
 *      cards y mini-cards (HTML:59/178/215). `#1C3325` está a UN paso RGB
 *      por canal de `#1D3426` — imperceptible — y el propio handoff las
 *      mezcla, así que se unifica al material del sistema y `#1C3325` NO
 *      entra al repo. En claro, ídem con la receta clara del sistema.
 *
 *  [OWNER-7] El MODO CLARO se rebasa al material del sistema (mismo
 *      criterio que el jardín, [OWNER-2] de jardin-spec):
 *      · fondo `#EEEDE9` del handoff → `neoTokens('light').bg` (#DCDFCD),
 *        el canvas de las otras cinco vistas; pozos `#E8E6E0` → `well`
 *        (#E9EBE0); sombras base `rgba(166,162,152,…)` → recetas del
 *        sistema (base `rgba(151,160,136,…)`).
 *      · CTA radial `#63B168→#2E7434` del handoff → `ctaGradient` del
 *        sistema (`#489350→#2E7434`): el foco ya fue corregido por
 *        contraste en el token (2.33:1 → 3.36:1 con la tinta crema).
 *      · Tres tintas del flujo claro NO pasan contraste como glifo y se
 *        sustituyen por el vocabulario de tinta del sistema (`neoInk` /
 *        `textMuted`), mismo criterio documentado en neo-ink.ts:
 *          – texto secundario `#6C7B67` (README:50) → `textMuted #54644F`
 *          – estampa/tag EXCEDIDO `#C96F3F` (README:101; 2.99:1 como
 *            glifo) → `ink.warn #A84A2F` (4.72:1)
 *          – estampa JUSTO `#6C7B67` → `textMuted #54644F`
 *
 *  [A] Tinta del check de selección oscuro: el handoff la pinta `#14301E`
 *      (HTML:183/569) — el stop medio de SU fondo, que por [OWNER-2] no
 *      entra al repo. Va `#1F3A26` (`ctaCreamInk`). En claro el check va
 *      con la tinta del CTA del sistema (`ctaText #F5F2E1`).
 *
 *  [OWNER-8] El HALO del Brot radiant (HTML:153 `filter: drop-shadow(0 0
 *      18px rgba(164,227,166,0.3))`) NO se transcribe. En RN no existe el
 *      drop-shadow por SILUETA, y las dos aproximaciones por View fallaron
 *      en device (QA del owner, 2026-08-13):
 *        · fill semi-transparente + `boxShadow` con spread → iOS calcula
 *          la sombra desde el rect del border-box y pinta un relieve
 *          rectangular flotando al lado de Brot ("botón raro").
 *        · `experimental_backgroundImage` con `radial-gradient` → volvió
 *          a pintar una forma rectangular; el soporte del radial no es
 *          confiable acá (el resto del repo sólo lo usa como fill de
 *          botón, donde la forma llena la View entera y no se nota).
 *      Un halo correcto exigiría un `Canvas` de Skia con `BlurMask`, que
 *      el repo no usa en ningún lado — complejidad y riesgo nuevos por un
 *      decorativo. Se omite: el sprite `radiant` YA dibuja sus propios
 *      destellos, y la celebración del MARGEN la comunican las 22
 *      partículas, el burst de la estampa y el haptic al sellar.
 *
 * ─────────────────────────────────────────────────────────────────────
 * INCONSISTENCIAS DEL HANDOFF (informativo — no se "arreglan" acá)
 * ─────────────────────────────────────────────────────────────────────
 *  1. HTML:47 (sello) usa el raised del sistema `#1D3426→#132318`;
 *     README:105 tabula `#1C3325→#132318`. El handoff mismo alterna —
 *     refuerza [OWNER-6].
 *  2. Las sombras raised del wrapped oscuro usan base clara
 *     `rgba(96,148,110,…)` (HTML:59/61/178/215), un paso corrido del
 *     `rgba(101,152,113,…)` del sistema — que el sello (HTML:47) SÍ usa.
 *     Se transcriben literales: son material propio del wrapped.
 *  3. README:46 abrevia el copy de "Sumarlo al nuevo ciclo" ("…extra.");
 *     el HTML:187 dice "…extra para gastar." — MANDA EL HTML.
 *  4. README:41 dice "logo 48px"; el HTML:49 lo dibuja 48×39 (el logo no
 *     es cuadrado). Se transcribe 48×39.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TIPOGRAFÍA
 * ─────────────────────────────────────────────────────────────────────
 * Nunito 400–900 (README:16/118). El spec da size / weight /
 * letterSpacing como NÚMEROS; la `fontFamily` la resuelve el consumidor
 * (`wrType` en wrapped-primitives). `letterSpacingEm` es el tracking del
 * HTML en `em`: en RN, `letterSpacing = size × letterSpacingEm` (pt).
 * `lineHeight` es el multiplicador unitless del HTML: en RN,
 * `lineHeight = size × mult` (pt). La geometría (sizes, paddings, radii,
 * rotaciones, counts) es IDÉNTICA en ambos temas — sólo cambian tintas,
 * fondos y sombras.
 */

import type { BrotPose } from '@/components/brot'
import { neoCategoryPastels, neoParticlePresets, neoTokens } from '@/theme/neo-tokens'
import { neoInk } from '@/theme/neo-ink'
import { decorativeDurations } from '@/lib/motion/tokens'
import type { ResolvedThemeMode } from '@/theme/palette'

/** Vocabulario del sistema — una llamada por modo, ver encabezado. */
const dark = neoTokens('dark')
const light = neoTokens('light')
const inkLight = neoInk('light')

// ─────────────────────────────────────────────────────────────────────
// Tintas propias del wrapped OSCURO (hexes NUEVOS, justificados)
// ─────────────────────────────────────────────────────────────────────

/**
 * Crema-verde editorial: label "CERRASTE EL CICLO CON" (HTML:154/542/596),
 * chip del rango en portada (HTML:56) y strip de fijos (HTML:101). Vive
 * entre `text` (#F1EEDD) y `textMuted` (#93A78F): tinta de lectura sobre
 * pozo inset que ningún token del sistema cubre. En claro ese rol lo
 * cumple `textMuted` del sistema ([OWNER-7]).
 */
const TINTA_CREMA_VERDE = '#C4D8BE'

/**
 * Nombre de los puestos #2–#3 del top 3 (HTML:98–99): crema desaturada,
 * un escalón bajo el #1 crema pleno. Hex nuevo, propio del ranking.
 * En claro: `textMuted` del sistema.
 */
const TINTA_RANK_SOFT = '#D9DCC8'

// ─────────────────────────────────────────────────────────────────────
// Materiales propios del wrapped OSCURO — pozos inset sobre el fondo
// nocturno. Base `rgba(11,30,15,…)` + sombras `rgba(6,20,10,…)` /
// `rgba(130,190,130,…)`. En claro los pozos son `well` + recetas inset
// del sistema ([OWNER-7]).
// ─────────────────────────────────────────────────────────────────────

/** Interior del sello (162px) y pozo de la estantería. HTML:48/213 */
const POZO_BG_30 = 'rgba(11,30,15,0.3)'
/** Chips, strip de fijos y option cards en reposo. HTML:56/101/173/212 */
const POZO_BG_35 = 'rgba(11,30,15,0.35)'

/** Sombra del interior inset del sello. HTML:48 */
const SELLO_INT_SHADOW =
  'inset 7px 7px 14px rgba(6,20,10,0.5), inset -6px -6px 13px rgba(130,190,130,0.14)'
/** Chip inset chico (portada). HTML:56 */
const CHIP_INSET_SHADOW =
  'inset 5px 5px 10px rgba(6,20,10,0.5), inset -4px -4px 10px rgba(130,190,130,0.14)'
/** Chip inset de la contratapa (blur 12, misma base). HTML:212 */
const CHIP_INSET_SHADOW_12 =
  'inset 5px 5px 12px rgba(6,20,10,0.5), inset -4px -4px 10px rgba(130,190,130,0.14)'
/** Pozo medio: strip de fijos y option cards en reposo. HTML:101/173 */
const POZO_INSET_SHADOW =
  'inset 6px 6px 14px rgba(6,20,10,0.5), inset -5px -5px 12px rgba(130,190,130,0.14)'
/** Pozo de la estantería (luz al 0.12). HTML:213 */
const ESTANTE_INSET_SHADOW =
  'inset 7px 7px 14px rgba(6,20,10,0.5), inset -6px -6px 13px rgba(130,190,130,0.12)'

// Sombras raised del wrapped oscuro — base clara `rgba(96,148,110,…)`
// literal del handoff (ver INCONSISTENCIAS #2).

/** Sello de portada (raised 206px). HTML:47 — base del sistema. */
const SELLO_SHADOW =
  '12px 12px 26px rgba(0,0,0,0.55), -12px -12px 26px rgba(101,152,113,0.14)'
/** Burbuja de Brot. HTML:59/82/104/140/194 */
const BURBUJA_SHADOW =
  '10px 10px 22px rgba(0,0,0,0.55), -10px -10px 22px rgba(96,148,110,0.12)'
/** CTA crema. HTML:61/158/197/224 */
const CTA_CREMA_SHADOW =
  '10px 10px 24px rgba(0,0,0,0.5), -8px -8px 20px rgba(96,148,110,0.14)'
/** Option card seleccionada (raised). HTML:178/566 */
const OPTION_RAISED_SHADOW =
  '10px 10px 22px rgba(0,0,0,0.55), -8px -8px 18px rgba(96,148,110,0.14)'
/** Mini-card de la estantería. HTML:215–216 */
const MINI_CARD_SHADOW =
  '8px 8px 18px rgba(0,0,0,0.5), -6px -6px 14px rgba(96,148,110,0.12)'
/** Mini-card NUEVA (un punto más de presencia). HTML:217 */
const MINI_CARD_NUEVA_SHADOW =
  '8px 8px 18px rgba(0,0,0,0.55), -6px -6px 14px rgba(96,148,110,0.14)'

// ─────────────────────────────────────────────────────────────────────
// Contrato del spec — mismo shape en ambos temas
// ─────────────────────────────────────────────────────────────────────

/** Token tipográfico (consumido por `wrType`). */
export interface WrTypeToken {
  size: number
  weight: number
  letterSpacingEm?: number
  lineHeight?: number
  ink: string
}

/** Chip inset (rango en portada / decisión en contratapa). */
export interface WrChipTokens {
  radius: number
  paddingV: number
  paddingH: number
  size: number
  weight: number
  letterSpacingEm?: number
  ink: string
  bg: string
  boxShadow: string
}

interface WrVeredictoEstado {
  particleCount: number
  brot: { pose: BrotPose; size: number }
  monto: WrTypeToken
  estampaInk: string
  estampaRotateDeg: number
  subMaxWidth?: number
}

export interface WrappedSpec {
  shell: {
    /** Gradiente del fondo — null = fondo sólido (`bgFallback`). */
    bgCss: string | null
    bgFallback: string
    /** El tema del wrapped para assets bimodales (logo del sello). */
    logoPalette: 'light' | 'dark'
    /** StatusBar sobre el fondo del wrapped. */
    statusBarStyle: 'light' | 'dark'
    /** Hairline de los pozos cuando el device no dibuja inset. */
    wellHairline: string
    progress: {
      height: number
      radius: number
      gap: number
      active: string
      rest: string
    }
    marker: WrTypeToken
    burbuja: {
      radius: number
      tailRadius: number
      paddingV: number
      paddingH: number
      size: number
      weight: number
      lineHeight: number
      ink: string
      bgCss: string
      bgFallback: string
      boxShadow: string
    }
    cta: {
      radius: number
      paddingV: number
      size: number
      weight: number
      /** Fill radial (claro). Null = fill sólido `bg` (crema oscuro). */
      bgCss: string | null
      bg: string
      ink: string
      boxShadow: string
    }
    particleColors: readonly string[]
  }
  portada: {
    particleCount: number
    tag: WrTypeToken
    sello: {
      size: number
      bgCss: string
      bgFallback: string
      boxShadow: string
      interior: { size: number; bg: string; boxShadow: string; gap: number }
      logo: { width: number; height: number }
      kicker: WrTypeToken
      numero: WrTypeToken
      rango: WrTypeToken
    }
    titulo: WrTypeToken
    chipRango: WrChipTokens
    brotSize: number
  }
  numeros: {
    titular: WrTypeToken
    fila: {
      paddingV: number
      label: WrTypeToken
      valor: WrTypeToken
      valorAccentInk: string
      dividerWidth: number
      divider: string
    }
    brotSize: number
    burbujaMaxWidth: number
  }
  top3: {
    rank: WrTypeToken
    primero: { nombre: WrTypeToken; monto: WrTypeToken }
    resto: { nombre: WrTypeToken; monto: WrTypeToken }
    stripFijos: {
      radius: number
      paddingV: number
      paddingH: number
      size: number
      weight: number
      lineHeight: number
      ink: string
      strongInk: string
      bg: string
      boxShadow: string
    }
    brotSize: number
    burbujaMaxWidth: number
  }
  veredicto: {
    label: WrTypeToken
    sub: WrTypeToken
    estampa: {
      borderWidth: number
      radius: number
      paddingV: number
      paddingH: number
      size: number
      weight: number
      letterSpacingEm: number
    }
    /** El halo del radiant NO se transcribe — ver [OWNER-8]. */
    margen: WrVeredictoEstado
    excedido: WrVeredictoEstado
    justo: WrVeredictoEstado
  }
  destino: {
    titular: WrTypeToken
    titularAccentInk: string
    titularAccentExcedidoInk: string
    option: {
      radius: number
      paddingV: number
      paddingH: number
      gap: number
      titulo: WrTypeToken
      sub: WrTypeToken
      subStrongInk: string
      subStrongExcedidoInk: string
      reposo: {
        bg: string
        boxShadow: string
        radio: { size: number; borderWidth: number; border: string }
      }
      seleccionada: {
        bgCss: string
        bgFallback: string
        boxShadow: string
        borderWidth: number
        border: string
        check: { size: number; bg: string; ink: string; fontSize: number; weight: number }
      }
      seleccionadaExcedido: { border: string; checkBg: string }
      tile: { size: number; radius: number; emojiSize: number }
    }
    tilePastel: {
      reservar: string
      meta: string
      ciclo: string
      ajustar: string
      revisar: string
    }
    metaBar: {
      height: number
      radius: number
      trackBg: string
      trackShadow: string
      fillActual: string
      fillNuevo: string
    }
    brotSize: number
    burbuja: { paddingV: number; paddingH: number; size: number; weight: number }
  }
  contratapa: {
    particleCount: number
    titulo: WrTypeToken
    chipDecision: WrChipTokens
    estante: {
      radius: number
      paddingTop: number
      paddingH: number
      paddingBottom: number
      bg: string
      boxShadow: string
      gap: number
    }
    miniCard: {
      radius: number
      paddingV: number
      paddingH: number
      bgCss: string
      bgFallback: string
      boxShadow: string
      label: WrTypeToken
      monto: { size: number; weight: number }
      montoPositivoInk: string
      montoNegativoInk: string
    }
    miniCardNueva: {
      borderWidth: number
      border: string
      boxShadow: string
      logo: { width: number; height: number }
      labelInk: string
      montoInk: string
    }
    liston: { height: number; radius: number; bg: string; boxShadow: string }
    saldo: WrTypeToken
    brotSize: number
    despedida: WrTypeToken
    despedidaMaxWidth: number
    link: { size: number; weight: number; ink: string }
  }
}

// ═════════════════════════════════════════════════════════════════════
// TEMA OSCURO — el flujo nocturno canónico (2a), transcripción literal
// ═════════════════════════════════════════════════════════════════════

const WRAPPED_DARK: WrappedSpec = {
  // ① Shell común (HTML:41–44 · 57–62 · README:39)
  shell: {
    /**
     * Fondo nocturno — [OWNER-2]: NO es el del handoff (HTML:41), es el
     * forest aprobado del cierre del jardín, byte a byte
     * (`jardin-spec.ts:881`). Fallback = su stop medio.
     */
    bgCss: 'linear-gradient(160deg, #1E3F2A 0%, #16301F 60%, #0F1E14 100%)',
    bgFallback: '#16301F',
    logoPalette: 'dark',
    statusBarStyle: 'light',
    wellHairline: 'rgba(241,238,221,0.12)',

    /** Barra de progreso story. HTML:44 · README:21 */
    progress: {
      height: 4,
      radius: 2,
      gap: 5,
      /** Segmento activo/recorrido: crema del sistema (`#F1EEDD`). */
      active: dark.text,
      /** Resto: la misma crema al 22%. HTML:44 */
      rest: 'rgba(241,238,221,0.22)',
    },

    /** Marcador "N DE M" al pie. HTML:62 — `#7C917A` = textDim oscuro. */
    marker: { size: 10, weight: 800, letterSpacingEm: 0.2, ink: dark.textDim },

    /**
     * Burbuja de Brot — card raised oscura ([OWNER-6]). Radius
     * `18 18 18 4` con Brot a la IZQUIERDA (HTML:59/140/194) y espejada
     * con Brot a la DERECHA (HTML:82/104).
     */
    burbuja: {
      radius: 18,
      tailRadius: 4,
      paddingV: 11,
      paddingH: 14,
      size: 12.5,
      weight: 700,
      lineHeight: 1.4,
      ink: dark.text,
      bgCss: dark.raisedGradientCss,
      bgFallback: dark.surface,
      boxShadow: BURBUJA_SHADOW,
    },

    /** CTA primario crema — mismo material en todas las páginas.
     *  HTML:61/158/197/224. `#1F3A26` = ctaCreamInk (home-spec:305). */
    cta: {
      radius: 20,
      paddingV: 15,
      size: 15,
      weight: 900,
      bgCss: null,
      bg: dark.text,
      ink: '#1F3A26',
      boxShadow: CTA_CREMA_SHADOW,
    },

    /** Colores de partículas — preset del sistema, [OWNER-5]. */
    particleColors: neoParticlePresets.celebrationDark.colors,
  },

  // ② 01 Portada — sello editorial en la noche (HTML:41–65)
  portada: {
    particleCount: 12, // HTML:42

    /** Tag "CIERRE DE CICLO" — durazno del sistema. HTML:46 */
    tag: { size: 11, weight: 900, letterSpacingEm: 0.26, ink: dark.warm },

    /** Sello: círculo raised 206 + interior inset 162. HTML:47–53 */
    sello: {
      size: 206,
      bgCss: dark.raisedGradientCss, // HTML:47 — byte a byte el del sistema
      bgFallback: dark.surface,
      boxShadow: SELLO_SHADOW,
      interior: { size: 162, bg: POZO_BG_30, boxShadow: SELLO_INT_SHADOW, gap: 3 },
      /** Logo de la app, 48×39 (no cuadrado — INCONSISTENCIAS #4). HTML:49 */
      logo: { width: 48, height: 39 },
      /** "EDICIÓN" — `#93A78F` = textMuted oscuro. HTML:50 */
      kicker: { size: 9, weight: 900, letterSpacingEm: 0.3, ink: dark.textMuted },
      /** "Nº 3". HTML:51 */
      numero: { size: 29, weight: 900, lineHeight: 1, ink: dark.text },
      /** "JUNIO → JULIO 2026" — `#7C917A`. HTML:52 */
      rango: { size: 8.5, weight: 800, letterSpacingEm: 0.18, ink: dark.textDim },
    },

    // Copy (i18n): "Tu ciclo se cerró."  HTML:55
    titulo: { size: 31, weight: 900, lineHeight: 1.12, ink: dark.text },

    /** Chip inset del rango. HTML:56 — demo: "20 JUN → 19 JUL · 30 DÍAS · 64 MOV" */
    chipRango: {
      radius: 16,
      paddingV: 8,
      paddingH: 16,
      size: 11,
      weight: 800,
      letterSpacingEm: 0.08,
      ink: TINTA_CREMA_VERDE,
      bg: POZO_BG_35,
      boxShadow: CHIP_INSET_SHADOW,
    },

    /** Brot `wave` 104 + burbuja "Te preparé la edición…". HTML:58–59 */
    brotSize: 104,
  },

  // ③ 02 Los números — índice editorial (HTML:69–87)
  numeros: {
    // Copy (i18n): "Un mes escrito\na mano."  HTML:74
    titular: { size: 30, weight: 900, lineHeight: 1.15, ink: dark.text },
    /**
     * 3 filas label⇄valor. HTML:76–78 — demo: GASTASTE $3.008.920 ·
     * MOVIMIENTOS 64 (verde) · PROMEDIO POR DÍA $167.162. La última fila
     * no lleva divisor.
     */
    fila: {
      paddingV: 16,
      label: { size: 10.5, weight: 900, letterSpacingEm: 0.14, ink: dark.textMuted },
      valor: { size: 31, weight: 900, ink: dark.text },
      valorAccentInk: dark.green, // HTML:77
      dividerWidth: 2,
      divider: 'rgba(164,227,166,0.16)', // HTML:76 — dark.green al 16%
    },
    /** Brot `think` 92 a la DERECHA, burbuja espejada max 220. HTML:82–83 */
    brotSize: 92,
    burbujaMaxWidth: 220,
  },

  // ④ 03 Top 3 — ranking + fijos cumplidos (HTML:91–109)
  top3: {
    /** Rank fantasma. HTML:97–99 — dark.green al 35%. */
    rank: { size: 58, weight: 900, lineHeight: 1, ink: 'rgba(164,227,166,0.35)' },
    /** #1 — demo: Hogar · $710.352 · 24%. HTML:97 */
    primero: {
      nombre: { size: 30, weight: 900, lineHeight: 1.1, ink: dark.text },
      monto: { size: 15, weight: 800, ink: dark.green },
    },
    /** #2–#3 — demo: Transferencia / Mercado. HTML:98–99 */
    resto: {
      nombre: { size: 24, weight: 900, lineHeight: 1.1, ink: TINTA_RANK_SOFT },
      monto: { size: 14, weight: 800, ink: dark.textMuted },
    },
    /**
     * Strip inset de fijos. HTML:101 — copy: "Y tus fijos cumplieron:
     * <strong>16 de 16 pagados</strong> · $1.350.482." (strong en crema).
     */
    stripFijos: {
      radius: 20,
      paddingV: 14,
      paddingH: 16,
      size: 13,
      weight: 700,
      lineHeight: 1.5,
      ink: TINTA_CREMA_VERDE,
      strongInk: dark.text,
      bg: POZO_BG_35,
      boxShadow: POZO_INSET_SHADOW,
    },
    /** Brot `wow` 98 a la DERECHA. Copy: "La casa primero. Me gusta cómo
     *  pensás." ⚠ voseo → "piensas". HTML:104–105 */
    brotSize: 98,
    burbujaMaxWidth: 200,
  },

  // ⑤ 05 El veredicto — 3 estados (HTML:147–163 · 536–551 · 590–605)
  veredicto: {
    /** "CERRASTE EL CICLO CON". HTML:154/542/596 */
    label: { size: 12, weight: 900, letterSpacingEm: 0.24, ink: TINTA_CREMA_VERDE },
    /** Sub (max 280; EXCEDIDO 290). HTML:157/545/599 */
    sub: { size: 13.5, weight: 700, lineHeight: 1.5, ink: dark.textMuted },
    /** Forma de la estampa — común a los 3 estados. HTML:156/544/598 */
    estampa: {
      borderWidth: 3,
      radius: 10,
      paddingV: 5,
      paddingH: 18,
      size: 13,
      weight: 900,
      letterSpacingEm: 0.24,
    },
    /**
     * MARGEN — la celebración. HTML:147–159 · README:60. Copys: sub
     * "Mejor cierre que mayo…" · estampa "MARGEN" · CTA "¿Y ese
     * sobrante? ›". Demo: +$324.617.
     */
    margen: {
      particleCount: 22, // HTML:149
      brot: { pose: 'radiant', size: 150 }, // HTML:153
      monto: { size: 56, weight: 900, lineHeight: 1, ink: dark.text }, // HTML:155
      estampaInk: dark.green, // HTML:156
      estampaRotateDeg: -5,
    },
    /**
     * EXCEDIDO — sin fiesta. HTML:536–551 · README:61. Copys: sub "Se
     * gastó más de lo que entró…" · estampa "EXCEDIDO" · CTA "¿Cómo lo
     * encaramos? ›". Demo: −$1.588.087.
     */
    excedido: {
      particleCount: 0, // HTML:537
      brot: { pose: 'worried', size: 140 }, // HTML:541 — sin glow
      subMaxWidth: 290, // HTML:545
      monto: { size: 50, weight: 900, lineHeight: 1, ink: dark.warm }, // HTML:543
      estampaInk: dark.warm, // HTML:544
      estampaRotateDeg: 4,
    },
    /**
     * JUSTO — al peso; el paso 6 se salta (README:23/62). HTML:590–604.
     * Copys: sub "Al peso: ni sobra ni falta…" · estampa "JUSTO" · CTA
     * "Cerrar la edición ›". Demo: +$8.412.
     */
    justo: {
      particleCount: 0, // HTML:591
      brot: { pose: 'zen', size: 140 }, // HTML:595
      monto: { size: 56, weight: 900, lineHeight: 1, ink: dark.text }, // HTML:597
      estampaInk: dark.text, // HTML:598
      estampaRotateDeg: -3,
    },
  },

  // ⑥ 06 Destino / Plan de recuperación (HTML:165–201 · 553–588)
  destino: {
    /**
     * Titular con el monto en span acento. HTML:171/559 — copys: "¿Qué
     * hacemos con los +$324.617?" (verde) / "¿Cómo encaramos los
     * −$1.588.087?" (durazno). Tags: "QUEDA UN SOBRANTE" (HTML:170) /
     * "HAY UN ROJO QUE CUBRIR" (HTML:558).
     */
    titular: { size: 27, weight: 900, lineHeight: 1.15, ink: dark.text },
    titularAccentInk: dark.green,
    titularAccentExcedidoInk: dark.warm,

    /** Option cards — lista gap 12. HTML:172 */
    option: {
      radius: 22,
      paddingV: 15,
      paddingH: 16,
      gap: 13,
      titulo: { size: 15, weight: 900, ink: dark.text },
      sub: { size: 11.5, weight: 700, lineHeight: 1.35, ink: dark.textMuted },
      subStrongInk: dark.green, // HTML:180
      subStrongExcedidoInk: dark.warm, // HTML:568
      /** Reposo = pozo inset + radio outline. HTML:173–176 */
      reposo: {
        bg: POZO_BG_35,
        boxShadow: POZO_INSET_SHADOW,
        radio: { size: 22, borderWidth: 2.5, border: 'rgba(241,238,221,0.3)' },
      },
      /** Seleccionada = raised + borde 2px + check relleno. HTML:178/183 */
      seleccionada: {
        bgCss: dark.raisedGradientCss, // [OWNER-6]
        bgFallback: dark.surface,
        boxShadow: OPTION_RAISED_SHADOW,
        borderWidth: 2,
        border: dark.green,
        /** `#14301E` del handoff → `ctaCreamInk`, ver [A]. */
        check: { size: 22, bg: dark.green, ink: '#1F3A26', fontSize: 13, weight: 900 },
      },
      /** Variante EXCEDIDO: borde y check durazno. HTML:566/569 */
      seleccionadaExcedido: { border: dark.warm, checkBg: dark.warm },
      /** Tile de ícono (emoji) — pastel del sistema, [OWNER-4]. HTML:174 */
      tile: { size: 46, radius: 15, emojiSize: 21 },
    },

    /** Pasteles por opción ([OWNER-4]). HTML:174/179/186/562/567/572 */
    tilePastel: {
      reservar: neoCategoryPastels.ropa, //  #EDE6D4
      meta: neoCategoryPastels.ocio, //      #E6E0F4
      ciclo: neoCategoryPastels.mascotas, // #D4EBDF
      ajustar: neoCategoryPastels.comida, // #F7E3CF (EXCEDIDO)
      revisar: neoCategoryPastels.ocio, //   #E6E0F4 (EXCEDIDO)
    },

    /**
     * Barra de la meta — fill de DOS tramos con corte duro (HTML:181):
     * lo ya ahorrado en `#57A05C` (el verde medio de fijos-spec /
     * control-alcancia) y el aporte nuevo en verde claro del sistema.
     */
    metaBar: {
      height: 8,
      radius: 4,
      trackBg: 'rgba(11,30,15,0.5)',
      trackShadow: 'inset 2px 2px 5px rgba(6,20,10,0.6)',
      fillActual: '#57A05C',
      fillNuevo: dark.green,
    },

    /** Brot `coach` 86, burbuja compacta (10×13, 12/700). HTML:193–194 */
    brotSize: 86,
    burbuja: { paddingV: 10, paddingH: 13, size: 12, weight: 700 },
  },

  // ⑦ 07 Contratapa — decisión + estantería (HTML:204–228)
  contratapa: {
    particleCount: 16, // HTML:206
    // Copy (i18n): "Edición Nº 3,\na la estantería."  HTML:211
    titulo: { size: 28, weight: 900, lineHeight: 1.15, ink: dark.text },
    /** Chip de la decisión. HTML:212 — "✓ Sobrante → Meta Vacaciones 2027" */
    chipDecision: {
      radius: 16,
      paddingV: 8,
      paddingH: 16,
      size: 11,
      weight: 800,
      ink: dark.green,
      bg: POZO_BG_35,
      boxShadow: CHIP_INSET_SHADOW_12,
    },
    /** Estantería: pozo inset radius 24; mini-cards flex 1/1/1.2. HTML:213–214 */
    estante: {
      radius: 24,
      paddingTop: 20,
      paddingH: 18,
      paddingBottom: 16,
      bg: POZO_BG_30,
      boxShadow: ESTANTE_INSET_SHADOW,
      gap: 12,
    },
    /** Mini-cards raised — demo: ABRIL +$1,7M · MAYO −$1,6M. HTML:215–216 */
    miniCard: {
      radius: 16,
      paddingV: 14,
      paddingH: 8,
      bgCss: dark.raisedGradientCss, // [OWNER-6]
      bgFallback: dark.surface,
      boxShadow: MINI_CARD_SHADOW,
      label: { size: 9.5, weight: 900, letterSpacingEm: 0.1, ink: dark.textDim },
      monto: { size: 13, weight: 900 },
      montoPositivoInk: dark.green,
      montoNegativoInk: dark.warm,
    },
    /** Mini-card NUEVA — logo 24×19 + borde verde. HTML:217 */
    miniCardNueva: {
      borderWidth: 2,
      border: dark.green,
      boxShadow: MINI_CARD_NUEVA_SHADOW,
      logo: { width: 24, height: 19 },
      labelInk: dark.green,
      montoInk: dark.text,
    },
    /** Listón inset bajo las mini-cards. HTML:219 */
    liston: {
      height: 10,
      radius: 5,
      bg: 'rgba(6,20,10,0.5)',
      boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.5)',
    },
    /** "SALDO ACUMULADO · …". HTML:220 */
    saldo: { size: 10, weight: 800, letterSpacingEm: 0.14, ink: dark.textDim },
    /** Brot `love` 104 + despedida. HTML:222–223 */
    brotSize: 104,
    despedida: { size: 13, weight: 700, lineHeight: 1.5, ink: dark.textMuted },
    despedidaMaxWidth: 280,
    /** Link secundario. HTML:225 */
    link: { size: 12.5, weight: 800, ink: dark.green },
  },
}

// ═════════════════════════════════════════════════════════════════════
// TEMA CLARO — flujo claro (3a) REBASADO al material del sistema
// ([OWNER-7]). Misma geometría; sólo cambian tintas, fondos y sombras.
// Refs del handoff: HTML:330–520 · README:49–50.
// ═════════════════════════════════════════════════════════════════════

/** Pozo claro del sistema (`well` #E9EBE0; el handoff pide #E8E6E0). */
const L_WELL = light.well
const L_INSET_LG = light.shadows.insetLg
const L_INSET_MD = light.shadows.insetMd

const WRAPPED_LIGHT: WrappedSpec = {
  shell: {
    /** Fondo claro: PLANO, el canvas del sistema ([OWNER-7] — el
     *  `#EEEDE9` del handoff se rebasa a `bg`). README:49 */
    bgCss: null,
    bgFallback: light.bg,
    logoPalette: 'light',
    statusBarStyle: 'dark',
    wellHairline: 'rgba(36,56,42,0.14)',
    /** Progreso claro: activo `#2E7C39`, resto texto al 15%. README:49 */
    progress: {
      height: 4,
      radius: 2,
      gap: 5,
      active: light.green,
      rest: 'rgba(36,56,42,0.15)',
    },
    /** `#6C7B67` del handoff → textMuted del sistema ([OWNER-7]). */
    marker: { size: 10, weight: 800, letterSpacingEm: 0.2, ink: light.textMuted },
    burbuja: {
      radius: 18,
      tailRadius: 4,
      paddingV: 11,
      paddingH: 14,
      size: 12.5,
      weight: 700,
      lineHeight: 1.4,
      ink: light.text,
      bgCss: light.raisedGradientCss,
      bgFallback: light.surface,
      boxShadow: light.shadows.raisedMd,
    },
    /** CTA claro = botón radial del sistema (README:50 pide el del
     *  jardín; el token ya corrigió el foco por contraste). */
    cta: {
      radius: 20,
      paddingV: 15,
      size: 15,
      weight: 900,
      bgCss: `radial-gradient(circle at 32% 28%, ${light.ctaGradient[0]}, ${light.ctaGradient[1]} 85%)`,
      bg: light.ctaGradient[1],
      ink: light.ctaText,
      boxShadow: light.shadows.cta,
    },
    /** Partículas claras — preset del sistema ([OWNER-5]). */
    particleColors: neoParticlePresets.authLight.colors,
  },

  portada: {
    particleCount: 12,
    /** Tag durazno claro `#C96F3F` = warm del sistema. README:49 */
    tag: { size: 11, weight: 900, letterSpacingEm: 0.26, ink: light.warm },
    sello: {
      size: 206,
      bgCss: light.raisedGradientCss,
      bgFallback: light.surface,
      boxShadow: light.shadows.raisedXl,
      interior: { size: 162, bg: L_WELL, boxShadow: L_INSET_LG, gap: 3 },
      logo: { width: 48, height: 39 },
      kicker: { size: 9, weight: 900, letterSpacingEm: 0.3, ink: light.textMuted },
      numero: { size: 29, weight: 900, lineHeight: 1, ink: light.text },
      rango: { size: 8.5, weight: 800, letterSpacingEm: 0.18, ink: light.textMuted },
    },
    titulo: { size: 31, weight: 900, lineHeight: 1.12, ink: light.text },
    chipRango: {
      radius: 16,
      paddingV: 8,
      paddingH: 16,
      size: 11,
      weight: 800,
      letterSpacingEm: 0.08,
      ink: light.textMuted,
      bg: L_WELL,
      boxShadow: L_INSET_MD,
    },
    brotSize: 104,
  },

  numeros: {
    titular: { size: 30, weight: 900, lineHeight: 1.15, ink: light.text },
    fila: {
      paddingV: 16,
      label: { size: 10.5, weight: 900, letterSpacingEm: 0.14, ink: light.textMuted },
      valor: { size: 31, weight: 900, ink: light.text },
      /** Valor MOVIMIENTOS en verde tinta (AA). */
      valorAccentInk: inkLight.accent,
      dividerWidth: 2,
      /** Divisor claro: alfa del handoff (README:50) sobre la base de
       *  sombra del sistema ([OWNER-7]). */
      divider: 'rgba(151,160,136,0.45)',
    },
    brotSize: 92,
    burbujaMaxWidth: 220,
  },

  top3: {
    /** Rank fantasma claro. README:102 (literal) */
    rank: { size: 58, weight: 900, lineHeight: 1, ink: 'rgba(46,124,57,0.25)' },
    primero: {
      nombre: { size: 30, weight: 900, lineHeight: 1.1, ink: light.text },
      monto: { size: 15, weight: 800, ink: inkLight.accent },
    },
    resto: {
      nombre: { size: 24, weight: 900, lineHeight: 1.1, ink: light.textMuted },
      monto: { size: 14, weight: 800, ink: light.textMuted },
    },
    stripFijos: {
      radius: 20,
      paddingV: 14,
      paddingH: 16,
      size: 13,
      weight: 700,
      lineHeight: 1.5,
      ink: light.textMuted,
      strongInk: light.text,
      bg: L_WELL,
      boxShadow: L_INSET_MD,
    },
    brotSize: 98,
    burbujaMaxWidth: 200,
  },

  veredicto: {
    label: { size: 12, weight: 900, letterSpacingEm: 0.24, ink: light.textMuted },
    sub: { size: 13.5, weight: 700, lineHeight: 1.5, ink: light.textMuted },
    estampa: {
      borderWidth: 3,
      radius: 10,
      paddingV: 5,
      paddingH: 18,
      size: 13,
      weight: 900,
      letterSpacingEm: 0.24,
    },
    margen: {
      particleCount: 22,
      brot: { pose: 'radiant', size: 150 },
      /** Monto héroe claro: verde profundo `#1F5429`. README:100 */
      monto: { size: 56, weight: 900, lineHeight: 1, ink: light.greenDeep },
      /** Estampa MARGEN clara `#2E7C39`. README:101 */
      estampaInk: inkLight.accent,
      estampaRotateDeg: -5,
    },
    excedido: {
      particleCount: 0,
      brot: { pose: 'worried', size: 140 },
      subMaxWidth: 290,
      /** `#C96F3F` del handoff no pasa contraste como glifo (2.99:1) —
       *  va `ink.warn #A84A2F` (4.72:1), [OWNER-7]. */
      monto: { size: 50, weight: 900, lineHeight: 1, ink: inkLight.warn },
      estampaInk: inkLight.warn,
      estampaRotateDeg: 4,
    },
    justo: {
      particleCount: 0,
      brot: { pose: 'zen', size: 140 },
      monto: { size: 56, weight: 900, lineHeight: 1, ink: light.text },
      /** `#6C7B67` del handoff → textMuted ([OWNER-7]). README:101 */
      estampaInk: light.textMuted,
      estampaRotateDeg: -3,
    },
  },

  destino: {
    titular: { size: 27, weight: 900, lineHeight: 1.15, ink: light.text },
    titularAccentInk: inkLight.accent,
    titularAccentExcedidoInk: inkLight.warn,
    option: {
      radius: 22,
      paddingV: 15,
      paddingH: 16,
      gap: 13,
      titulo: { size: 15, weight: 900, ink: light.text },
      sub: { size: 11.5, weight: 700, lineHeight: 1.35, ink: light.textMuted },
      subStrongInk: inkLight.accent,
      subStrongExcedidoInk: inkLight.warn,
      reposo: {
        bg: L_WELL,
        boxShadow: L_INSET_MD,
        radio: { size: 22, borderWidth: 2.5, border: 'rgba(36,56,42,0.3)' },
      },
      seleccionada: {
        bgCss: light.raisedGradientCss,
        bgFallback: light.surface,
        boxShadow: light.shadows.raisedLg,
        borderWidth: 2,
        border: inkLight.accent,
        check: {
          size: 22,
          bg: inkLight.accent,
          ink: light.ctaText,
          fontSize: 13,
          weight: 900,
        },
      },
      seleccionadaExcedido: { border: inkLight.warn, checkBg: inkLight.warn },
      tile: { size: 46, radius: 15, emojiSize: 21 },
    },
    tilePastel: {
      reservar: neoCategoryPastels.ropa,
      meta: neoCategoryPastels.ocio,
      ciclo: neoCategoryPastels.mascotas,
      ajustar: neoCategoryPastels.comida,
      revisar: neoCategoryPastels.ocio,
    },
    metaBar: {
      height: 8,
      radius: 4,
      trackBg: 'rgba(36,56,42,0.12)',
      trackShadow: light.shadows.insetSm,
      /** Claro: lo ahorrado en el verde tinta, el aporte nuevo en el
       *  verde medio compartido con fijos-spec. */
      fillActual: inkLight.accent,
      fillNuevo: '#57A05C',
    },
    brotSize: 86,
    burbuja: { paddingV: 10, paddingH: 13, size: 12, weight: 700 },
  },

  contratapa: {
    particleCount: 16,
    titulo: { size: 28, weight: 900, lineHeight: 1.15, ink: light.text },
    chipDecision: {
      radius: 16,
      paddingV: 8,
      paddingH: 16,
      size: 11,
      weight: 800,
      ink: inkLight.accent,
      bg: L_WELL,
      boxShadow: L_INSET_MD,
    },
    estante: {
      radius: 24,
      paddingTop: 20,
      paddingH: 18,
      paddingBottom: 16,
      bg: L_WELL,
      boxShadow: L_INSET_LG,
      gap: 12,
    },
    miniCard: {
      radius: 16,
      paddingV: 14,
      paddingH: 8,
      bgCss: light.raisedGradientCss,
      bgFallback: light.surface,
      boxShadow: light.shadows.raisedMd,
      label: { size: 9.5, weight: 900, letterSpacingEm: 0.1, ink: light.textMuted },
      monto: { size: 13, weight: 900 },
      montoPositivoInk: inkLight.accent,
      montoNegativoInk: inkLight.warn,
    },
    miniCardNueva: {
      borderWidth: 2,
      border: inkLight.accent,
      boxShadow: light.shadows.raisedMd,
      logo: { width: 24, height: 19 },
      labelInk: inkLight.accent,
      montoInk: light.text,
    },
    liston: {
      height: 10,
      radius: 5,
      bg: 'rgba(151,160,136,0.5)',
      boxShadow: 'inset 3px 3px 6px rgba(124,138,110,0.45)',
    },
    saldo: { size: 10, weight: 800, letterSpacingEm: 0.14, ink: light.textMuted },
    brotSize: 104,
    despedida: { size: 13, weight: 700, lineHeight: 1.5, ink: light.textMuted },
    despedidaMaxWidth: 280,
    link: { size: 12.5, weight: 800, ink: inkLight.accent },
  },
}

// ─────────────────────────────────────────────────────────────────────
// Export — el wrapped sigue el tema del sistema ([OWNER-1])
// ─────────────────────────────────────────────────────────────────────

export const WRAPPED_SPECS: Record<ResolvedThemeMode, WrappedSpec> = {
  light: WRAPPED_LIGHT,
  dark: WRAPPED_DARK,
}

export function wrappedSpec(mode: ResolvedThemeMode): WrappedSpec {
  return WRAPPED_SPECS[mode]
}

// ═══════════════════════════════════════════════════════════════════
// Animaciones (README:83–92 — el HTML es estático, la fuente es el
// README). Las DURACIONES viven en `decorativeDurations` (familia
// `wrapped*` de mobile/lib/motion/tokens.ts) y acá sólo se referencian;
// los parámetros no-temporales (px, escalas, staggers) son literales.
// Mode-independientes: la animación es la misma de día y de noche.
// ═══════════════════════════════════════════════════════════════════
export const WRAPPED_ANIM = {
  /** Navegación entre páginas: slide 22px + crossfade 250ms. README:83 */
  navSlidePx: 22,
  navCrossfadeMs: decorativeDurations.wrappedNav,
  /** El segmento de progreso se llena en 200ms. README:83 */
  segmentFillMs: decorativeDurations.wrappedSegment,

  /** 01 — el sello entra scale 1.06→1 y asienta en 400ms. README:84 */
  selloScaleFrom: 1.06,
  selloSettleMs: decorativeDurations.wrappedSello,

  /** 02 — filas: stagger 80ms (fade + rise 10px); count-up 800ms ease-out. README:85 */
  filasStaggerMs: 80,
  filasRisePx: 10,
  filasCountUpMs: decorativeDurations.wrappedFilas,

  /** 03 — ranking sube stagger 120ms, #3→#1; el #1 cierra con pop 1.05→1. README:86 */
  rankingStaggerMs: 120,
  rankingPopScale: 1.05,

  /**
   * 05 MARGEN — monto count-up 700ms → la estampa "sella": scale 1.4→1
   * + rotate settle en 350ms, con haptic MEDIO y burst de 12 partículas.
   * (El halo pulsante del radiant NO se implementa — ver [OWNER-8].)
   * README:88
   */
  veredictoCountUpMs: decorativeDurations.wrappedVeredicto,
  estampaScaleFrom: 1.4,
  estampaSettleMs: decorativeDurations.wrappedEstampa,
  estampaBurstCount: 12,
  /** 05 EXCEDIDO — sin burst: la estampa cae en 300ms SIN rebote. README:61 */
  estampaCaeMs: decorativeDurations.wrappedEstampaCae,

  /**
   * 06 — cards con stagger 70ms; al seleccionar, pozo→raised en 150ms +
   * check con pop; la barra de meta anima el tramo nuevo 600ms. README:89
   */
  cardsStaggerMs: 70,
  selectRaiseMs: decorativeDurations.wrappedSelect,
  metaBarMs: decorativeDurations.wrappedMetaBar,

  /**
   * 07 — la mini-card NUEVA baja al estante (translateY −14→0, 450ms) +
   * glow del borde 800ms; saldo acumulado con count-up. README:90
   */
  miniCardDropFromPx: -14,
  miniCardDropMs: decorativeDurations.wrappedMiniDrop,
  miniCardGlowMs: decorativeDurations.wrappedMiniGlow,

  /** Transversal — press neumórfico raised→inset 120/180ms (via
   *  `usePressScale`, que ya consume los tokens). README:92 */
  pressInMs: 120,
  pressOutMs: 180,

  // Reduced motion (README:92): sin count-up (valores directos), fades
  // 150ms, sin partículas, estampa sin spring.
  reducedFadeMs: decorativeDurations.wrappedReducedFade,
} as const
