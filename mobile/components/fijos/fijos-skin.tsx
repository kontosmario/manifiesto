/**
 * Piel de la lista de fijos — `classic` (la de siempre) o `neo` (rediseño).
 *
 * ── Por qué un contexto y no un prop ────────────────────────────────────
 * La lista son 9 archivos y ~1.800 líneas (`FijoCategoryGroups` → `FijoRow` →
 * `InlinePayButton` / panel expandible / spark / placeholder). Pasar un prop
 * `skin` por esa cadena es prop-drilling de 4 niveles sobre componentes que ya
 * están memoizados por identidad de props — y un prop nuevo por render habría
 * que estabilizarlo en cada eslabón para no derrotar la memo. El contexto lo
 * lee solo quien lo usa, y el valor es estable por `mode`.
 *
 * ── Por qué el default es `classic` ─────────────────────────────────────
 * `fijos-v2-screen.tsx` (la pantalla VIVA, en producción) monta los mismos
 * componentes y NO envuelve nada, así que `useFijosSkin()` le devuelve
 * `{ kind: 'classic' }` y cada componente cae a su rama de siempre. La
 * invariante "la viva no cambia" no depende de acordarse de nada: no hay
 * camino por el que cambie.
 *
 * ── Por qué la variante `classic` está VACÍA ────────────────────────────
 * A propósito no transcribe los valores viejos a tokens. Si los transcribiera,
 * un typo en la transcripción sería un cambio silencioso en producción. Al ser
 * un discriminante pelado, la rama classic de cada componente queda LITERAL —
 * el código que ya estaba, sin tocar.
 *
 * Alcance: SOLO piel. Mismo layout, misma información, mismos handlers.
 * Spec: docs/superpowers/specs/2026-07-30-fijos-listado-neumorfico-design.md
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { FIJOS_RADII, FIJOS_SPEC, type FijosMode } from '@/components/redesign/fijos/fijos-spec'
import { nunitoFamily } from '@/theme/typography'

/** Estado del fijo, en los términos del modelo (no del diseño). */
export type FijoSkinStatus = 'paid' | 'overdue' | 'pending' | 'future'

// ── Sombras chicas, transcritas del handoff ──────────────────────────────
// NO salen de FIJOS_SPEC a propósito: se auditó y el spec NO tiene estos
// valores. Se transcribió de las superficies GRANDES de la pantalla
// principal, así que su `raiseSm` (6/6/14 @0.45) y su `insSoft` (3/3/6 @0.4)
// no son los que el handoff dibuja para tiles y chips. Los de acá salen de
// contar ocurrencias en los dos .dc.html: 5/5/12 aparece 22× (tiles, pills,
// tabs) e inset 3/3/7 aparece 43× (chips y badges de conteo).
const TILE_RAISE_L = '5px 5px 12px rgba(151,160,136,0.42), -5px -5px 12px rgba(255,255,255,0.92)'
const TILE_RAISE_D = '5px 5px 12px rgba(0,0,0,0.5), -4px -4px 11px rgba(101,152,113,0.11)'

// Raise de la fila de ítem ANIDADA. Es el mismo 5/5/12 del handoff pero con
// el término de LUZ (el de arriba-izquierda) reforzado: 0.11 → 0.20 en oscuro
// y 0.92 → 0.98 en claro, y a la misma distancia que la sombra oscura (-5/-5
// en vez de -4/-4).
//
// Por qué: el handoff calibró ese 0.11 para tiles de 44-52px sobre el fondo
// de la pantalla. Sobre una fila de 335px apoyada en una card de categoría
// del mismo ancho, el borde izquierdo quedaba sin definición y las filas se
// leían "pegadas" al padre (fallo del owner). Subir SOLO la luz mantiene la
// dirección del foco (arriba-izquierda) y el peso de la sombra oscura.
const ROW_RAISE_L = '5px 5px 12px rgba(151,160,136,0.42), -5px -5px 12px rgba(255,255,255,0.98)'
const ROW_RAISE_D = '5px 5px 12px rgba(0,0,0,0.5), -5px -5px 12px rgba(101,152,113,0.2)'
const CHIP_INSET_L = 'inset 3px 3px 7px rgba(151,160,136,0.38), inset -3px -3px 7px rgba(255,255,255,0.92)'
const CHIP_INSET_D = 'inset 3px 3px 7px rgba(0,0,0,0.48), inset -3px -3px 7px rgba(101,152,113,0.1)'

// La sombra de card en CLARO se alinea a Home y Gastos (`0.42`), no al 0.40
// que trae el handoff de Fijos y que FIJOS_SPEC transcribió fiel. Es una
// discrepancia entre handoffs, no del porteo: en OSCURO los tres sistemas ya
// son idénticos byte a byte. Decisión del owner (2026-07-30): manda la
// consistencia del sistema.
const CARD_RAISE_L = '8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)'

// Bloque "SE LLEVA AL AÑO" — las 4 variantes del handoff, literales. El fondo
// NO es el mismo tinte que los chips: es más saturado en claro (0.6/0.7) y más
// tenue en oscuro (0.10/0.09), y lleva un anillo interno de 1.5px.
const STATS_BLOCK = {
  light: {
    urgent: { background: 'rgba(246,220,203,0.6)', ring: 'inset 0 0 0 1.5px rgba(194,91,51,0.2)', stripe: '#C25B33' },
    ok: { background: 'rgba(219,235,215,0.7)', ring: 'inset 0 0 0 1.5px rgba(46,116,52,0.18)', stripe: '#2E7C39' },
  },
  dark: {
    urgent: { background: 'rgba(240,164,126,0.1)', ring: 'inset 0 0 0 1.5px rgba(240,164,126,0.2)', stripe: '#F0A47E' },
    ok: { background: 'rgba(164,227,166,0.09)', ring: 'inset 0 0 0 1.5px rgba(164,227,166,0.18)', stripe: '#A4E3A6' },
  },
} as const

// ── Alta de fijo (`Agregar Fijo Manifiesto.dc.html`) ─────────────────────
// El campo de nombre y la card de monto son POZOS (inset), no cards elevadas:
// comunican "acá se escribe". Los tiles de categoría, al revés, están
// elevados, y el SELECCIONADO se hunde con un anillo verde.
const ADD_WELL_L = 'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)'
const ADD_WELL_D = 'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)'
const ADD_TILE_L = '4px 4px 9px rgba(151,160,136,0.32), -4px -4px 9px rgba(255,255,255,0.8)'
const ADD_TILE_D = '4px 4px 9px rgba(0,0,0,0.45), -3px -3px 8px rgba(101,152,113,0.1)'
const ADD_TILE_SEL_L = 'inset 2px 2px 6px rgba(90,110,70,0.2)'
const ADD_TILE_SEL_D = 'inset 2px 2px 6px rgba(0,0,0,0.4)'

/** CTA del panel. Editar es RELLENO tintado; revertir es OUTLINE. */
const DETAIL_CTA = {
  light: { editInk: '#2E7C39', editBackground: 'rgba(219,235,215,0.6)', revertInk: '#C25B33' },
  dark: { editInk: '#A4E3A6', editBackground: 'rgba(164,227,166,0.1)', revertInk: '#F0A47E' },
} as const

const ADD = {
  light: {
    wellBackground: '#F4F5EE',
    quickBackground: '#E9EBE0',
    quickGradient: undefined as string | undefined,
    quickInk: '#C25B33',
    tileIdle: undefined as string | undefined,
    ring: '#2E7C39',
    freqBackground: '#24382A',
    freqInk: '#F5F2E1',
    freqShadow: '0 5px 11px rgba(36,56,42,0.3)',
    ctaGradient: 'linear-gradient(180deg,#6DBC71,#327E39)',
    ctaBackground: '#4E9E52',
    ctaInk: '#F5F2E1',
    ctaShadow: '0 8px 18px rgba(46,116,52,0.4)',
    backBackground: '#E9EBE0',
    backGradient: undefined as string | undefined,
    progressDone: '#2E7C39',
    progressPending: 'rgba(194,91,51,0.22)',
  },
  dark: {
    wellBackground: '#20372A',
    quickBackground: '#1D3426',
    quickGradient: 'linear-gradient(145deg, #1D3426, #132318)' as string | undefined,
    quickInk: '#F0A47E',
    tileIdle: 'rgba(255,255,255,0.06)' as string | undefined,
    ring: '#A4E3A6',
    freqBackground: '#F1EEDD',
    freqInk: '#16271C',
    freqShadow: '0 0 12px rgba(241,238,221,0.2)',
    ctaGradient: 'linear-gradient(180deg,#7ED083,#35793E)',
    ctaBackground: '#5AA45F',
    ctaInk: '#0F1E14',
    ctaShadow: '0 0 18px rgba(140,225,150,0.3)',
    backBackground: '#1D3426',
    backGradient: 'linear-gradient(145deg, #1D3426, #132318)' as string | undefined,
    progressDone: '#A4E3A6',
    progressPending: 'rgba(240,164,126,0.2)',
  },
} as const

/** Tinta + fondo de un acento de estado, ya resueltos. */
export interface FijosAccent {
  ink: string
  chipBackground: string
}

/** Tokens de la piel neo, ya resueltos para el tema. */
export interface FijosNeoSkin {
  kind: 'neo'
  row: {
    background: string
    /** `undefined` en claro — el spec solo define gradiente para oscuro. */
    gradientCss: string | undefined
    shadow: string
    radius: number
  }
  ink: {
    title: string
    amount: string
    meta: string
    chevron: string
  }
  /** Tile del sticker. El fill lo compone el consumidor: el hue sale de la
   *  categoría REAL (~11 en una familia), no de los 3 tokens `categoryTile*`
   *  del spec, que existen porque el mockup dibuja 3 y colapsarían las reales.
   *
   *  `opaqueInLight` es literal del handoff: en CLARO el tile es el pastel
   *  OPACO de la categoría (`#F3C9BC`, `#E6E0F4`), en OSCURO el mismo hue
   *  translúcido al 14%. No es el mismo alpha en los dos temas. */
  tile: { radius: number; alpha: number; opaqueInLight: boolean; shadow: string }
  /** Tile del header de categoría: 44px, radio 16 y SIN sombra (verificado en
   *  el markup — el relieve lo pone la fila, no el tile). */
  groupTile: { radius: number; alpha: number; opaqueInLight: boolean }
  /** Pill "Pagar". Conserva el fill neutro de la app (el owner no usa fills
   *  saturados para acciones); lo único que cambia es que gana profundidad. */
  pay: { radius: number; shadow: string; padH: number; padV: number; size: number }
  /** Raise de la fila anidada — el escalón CHICO de la jerarquía. La card de
   *  categoría que la contiene usa el grande (`row.shadow`). */
  nestedRowShadow: string
  /** Métricas de la card del ítem, transcritas de `Detalle Fijo Manifiesto`. */
  card: {
    radius: number
    padding: number
    gap: number
    tileSize: number
    tileRadius: number
    /** Mini-badge de estado cosida al tile. */
    overlaySize: number
    /** Fondo del anillo de esa badge = fondo de la PANTALLA, no de la card. */
    overlayRing: string
  }
  /** Header colapsable de categoría. */
  group: { tileSize: number; tileRadius: number; nameSize: number; countSize: number; totalSize: number }
  /** Tipografía de la fila. El `fontFamily` viaja con el peso a propósito:
   *  Nunito se carga como faces ESTÁTICOS por peso, así que un `fontWeight`
   *  suelto en un `<Text>` anidado no cambia la face y rinde el peso del
   *  padre. Costó una ronda entera en la fase del kit. */
  type: {
    name: { fontSize: number; fontWeight: '900'; fontFamily: string }
    category: { fontSize: number; fontWeight: '800'; fontFamily: string }
    amount: { fontSize: number; fontWeight: '900'; fontFamily: string }
  }
  /** Chips del pie de la fila (mes · estado). En el handoff son POZOS
   *  (inset), no pills planas — es lo que los ata al material de la card. */
  chip: {
    radius: number
    padH: number
    padV: number
    fontSize: number
    fontWeight: '900'
    fontFamily: string
    shadow: string
  }
  /** Acento por estado. El handoff usa terracota para vencido Y pendiente
   *  (no el rojo del `computeAccent` viejo) y verde para pagado. */
  accent: (status: FijoSkinStatus) => FijosAccent
  /** Panel expandido, transcrito de `Detalle Fijo Manifiesto.dc.html`. */
  detail: FijosDetailSkin
  /** Wizard de alta, transcrito de `Agregar Fijo Manifiesto.dc.html`. */
  add: FijosAddSkin
  /** Header del wizard: botón circular, título y barra de progreso. */
  header: FijosHeaderSkin
  /** Fondo de pantalla del rediseño (`#E9EBE0` / `#16271C`). */
  screenBackground: string
  /**
   * Tintas apagadas del rediseño. NO usar `theme.colors.textMuted` en la piel
   * neo: en OSCURO ese token es `#A6EF8F` (primary-300, verde NEÓN) y
   * `textSoft` es `#77E755`. Sobre las superficies del handoff cantan.
   */
  mutedInk: string
  faintInk: string
  /** Family de Nunito por peso. Sin esto, un `fontWeight` 800/900 suelto cae
   *  a la face del sistema: Nunito se carga como faces ESTÁTICAS por peso. */
  font: (weight: '700' | '800' | '900') => string
}

export interface FijosHeaderSkin {
  backSize: number
  backBackground: string
  backGradientCss: string | undefined
  backShadow: string
  title: TextTokens
  progressGap: number
  progressHeight: number
  progressDone: string
  /** Tramo pendiente: NO es un gris neutro, es terracota tenue. */
  progressPending: string
}

export interface FijosAddSkin {
  /** Eyebrow de sección (NOMBRE / MONTO / CATEGORÍA / FRECUENCIA). */
  sectionLabel: TextTokens
  sectionLabelInk: string
  /** Campo de nombre y card de monto: son POZOS, no cards elevadas. */
  well: { radius: number; background: string; shadow: string }
  /** Chip de monto rápido (+$5k …). */
  quickChip: {
    radius: number
    padH: number
    padV: number
    background: string
    gradientCss: string | undefined
    shadow: string
    ink: string
    fontSize: number
  }
  /** Tile de categoría. Seleccionado = HUNDIDO con anillo, no relleno: es el
   *  recurso de "presionado" del neumorfismo, no un fill de selección. */
  tile: {
    radius: number
    padTop: number
    padH: number
    padBottom: number
    idleBackground: string | undefined
    idleShadow: string
    selectedShadow: string
    selectedRing: string
  }
  /** Chip de frecuencia. */
  freqChip: {
    radius: number
    padH: number
    padV: number
    fontSize: number
    activeBackground: string
    activeInk: string
    activeShadow: string
  }
  /** CTA primario ("Continuar ›" / "Confirmar y crear ✓"). */
  cta: {
    radius: number
    padV: number
    fontSize: number
    gradientCss: string
    ink: string
    background: string
    shadow: string
  }
}

/** Bloque "SE LLEVA AL AÑO" — fondo, anillo y barra, por estado y tema. */
export interface FijosStatsBlock {
  background: string
  ring: string
  stripe: string
}

export interface FijosDetailSkin {
  statsRadius: number
  statsPadV: number
  statsPadH: number
  /** Sangría de los textos dentro del bloque, para no chocar con la barra. */
  statsInnerPadLeft: number
  stripeWidth: number
  eyebrow: TextTokens
  value: TextTokens
  pct: TextTokens
  sectionLabel: TextTokens
  sectionLabelInk: string
  trendWell: { radius: number; padV: number; padH: number; gap: number; shadow: string }
  trendTitle: TextTokens
  trendSub: TextTokens
  trendSubInk: string
  infoText: TextTokens
  infoGap: number
  infoPadV: number
  cta: { radius: number; padV: number } & TextTokens
  ctaEditInk: string
  ctaEditBackground: string
  /** El CTA de revertir es OUTLINE (anillo del mismo color), no relleno. */
  ctaRevertInk: string
  stats: (status: FijoSkinStatus) => FijosStatsBlock
}

interface TextTokens {
  fontSize: number
  fontWeight: '700' | '800' | '900'
  fontFamily: string
  letterSpacing?: number
}

export type FijosSkin = { kind: 'classic' } | FijosNeoSkin

const CLASSIC: FijosSkin = { kind: 'classic' }

const FijosSkinContext = createContext<FijosSkin>(CLASSIC)

export function useFijosSkin(): FijosSkin {
  return useContext(FijosSkinContext)
}

export function buildNeoSkin(mode: FijosMode): FijosNeoSkin {
  const s = FIJOS_SPEC[mode]
  return {
    kind: 'neo',
    row: {
      background: s.rowBackground,
      gradientCss: s.rowGradientCss,
      shadow: mode === 'light' ? CARD_RAISE_L : s.rowShadow,
      radius: FIJOS_RADII.row,
    },
    ink: {
      title: s.rowTitleInk,
      amount: s.rowAmountInk,
      meta: s.rowMetaNeutralInk,
      chevron: s.rowChevronInk,
    },
    // Mismo tratamiento que el tile de fila del kit de Gastos, ya aprobado
    // (`gastos-screen.tsx`): cuadrado redondeado con TINTE translúcido y sin
    // sombra — el relieve lo pone la card, no el tile.
    tile: {
      radius: FIJOS_RADII.tile,
      alpha: 0.14,
      opaqueInLight: mode === 'light',
      shadow: mode === 'light' ? TILE_RAISE_L : TILE_RAISE_D,
    },
    groupTile: { radius: FIJOS_RADII.tile, alpha: 0.14, opaqueInLight: mode === 'light' },
    nestedRowShadow: mode === 'light' ? ROW_RAISE_L : ROW_RAISE_D,
    pay: {
      radius: FIJOS_RADII.chipSm,
      shadow: mode === 'light' ? TILE_RAISE_L : TILE_RAISE_D,
      padH: 16,
      padV: 11,
      size: 14,
    },
    // Números LITERALES del markup de `Detalle Fijo Manifiesto.dc.html`, no de
    // FIJOS_RADII: ese spec se transcribió de la pantalla PRINCIPAL, y la card
    // del ítem es otro artefacto del handoff con sus propias medidas (card 26,
    // no los 28 de `FIJOS_RADII.card`). Se transcribe lo que dibuja el diseño.
    card: {
      radius: 26,
      padding: 16,
      gap: 13,
      tileSize: 52,
      tileRadius: 16,
      overlaySize: 20,
      // El anillo de la badge usa el fondo de la PANTALLA (`#E9EBE0`/`#16271C`),
      // no el de la card — así la badge se lee "recortada" sobre el tile en vez
      // de flotando encima. Literal del markup.
      overlayRing: s.bg,
    },
    // 44px / radio 16 / sin sombra — literal del markup de la pantalla
    // principal, no los 48/15 de la card del Detalle.
    group: { tileSize: 44, tileRadius: 16, nameSize: 19, countSize: 12.5, totalSize: 19 },
    type: {
      name: { fontSize: 19, fontWeight: '900', fontFamily: nunitoFamily('900') },
      category: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
      amount: { fontSize: 21, fontWeight: '900', fontFamily: nunitoFamily('900') },
    },
    chip: {
      radius: 12,
      padH: 11,
      padV: 5,
      fontSize: 12,
      fontWeight: '900',
      fontFamily: nunitoFamily('900'),
      shadow: mode === 'light' ? CHIP_INSET_L : CHIP_INSET_D,
    },
    // El handoff usa DOS acentos, no cuatro: terracota para vencido Y
    // pendiente, verde para pagado. Es una simplificación deliberada respecto
    // del `computeAccent` viejo, que le daba un hue propio a cada estado
    // (rojo/durazno/lima/celeste) — por eso la rama neo no lo consume.
    accent: (status) => {
      if (status === 'paid') {
        return { ink: s.rowMetaOkInk, chipBackground: s.tagUpcomingBackground }
      }
      if (status === 'overdue' || status === 'pending') {
        return { ink: s.tagOverdueInk, chipBackground: s.tagOverdueBackground }
      }
      // `future` — ni urgente ni cerrado: neutro sobre el verde suave.
      return { ink: s.rowMetaNeutralInk, chipBackground: s.tagUpcomingBackground }
    },
    screenBackground: s.bg,
    mutedInk: s.sub,
    faintInk: s.faint,
    font: (weight) => nunitoFamily(weight),
    header: {
      backSize: 44,
      backBackground: ADD[mode].backBackground,
      backGradientCss: ADD[mode].backGradient,
      backShadow: mode === 'light' ? TILE_RAISE_L : TILE_RAISE_D,
      title: { fontSize: 27, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: -0.6 },
      progressGap: 7,
      progressHeight: 4,
      progressDone: ADD[mode].progressDone,
      progressPending: ADD[mode].progressPending,
    },
    detail: {
      statsRadius: 18,
      statsPadV: 14,
      statsPadH: 16,
      statsInnerPadLeft: 6,
      stripeWidth: 5,
      // `letterSpacing` en px: el markup usa em (0.14em sobre 11px = 1.54;
      // 0.16em sobre 11px = 1.76). RN no acepta em.
      eyebrow: { fontSize: 11, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: 1.54 },
      value: { fontSize: 30, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: -0.3 },
      pct: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
      sectionLabel: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.76 },
      sectionLabelInk: s.sub,
      trendWell: {
        radius: 16,
        padV: 11,
        padH: 14,
        gap: 14,
        shadow: mode === 'light' ? CHIP_INSET_L : CHIP_INSET_D,
      },
      trendTitle: { fontSize: 14.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
      trendSub: { fontSize: 12, fontWeight: '800', fontFamily: nunitoFamily('800') },
      trendSubInk: s.sub,
      infoText: { fontSize: 14, fontWeight: '700', fontFamily: nunitoFamily('700') },
      infoGap: 11,
      infoPadV: 7,
      cta: {
        radius: 15,
        padV: 13,
        fontSize: 13.5,
        fontWeight: '900',
        fontFamily: nunitoFamily('900'),
      },
      ctaEditInk: DETAIL_CTA[mode].editInk,
      ctaEditBackground: DETAIL_CTA[mode].editBackground,
      ctaRevertInk: DETAIL_CTA[mode].revertInk,
      stats: (status) =>
        STATS_BLOCK[mode][status === 'paid' ? 'ok' : 'urgent'],
    },
    add: {
      sectionLabel: {
        fontSize: 11,
        fontWeight: '800',
        fontFamily: nunitoFamily('800'),
        // 0.18em sobre 11px. RN no acepta em.
        letterSpacing: 1.98,
      },
      sectionLabelInk: s.sub,
      well: {
        radius: 18,
        background: ADD[mode].wellBackground,
        shadow: mode === 'light' ? ADD_WELL_L : ADD_WELL_D,
      },
      quickChip: {
        radius: 13,
        padH: 13,
        padV: 7,
        background: ADD[mode].quickBackground,
        gradientCss: ADD[mode].quickGradient,
        shadow: mode === 'light' ? TILE_RAISE_L : TILE_RAISE_D,
        ink: ADD[mode].quickInk,
        fontSize: 12,
      },
      tile: {
        radius: 16,
        padTop: 10,
        padH: 4,
        padBottom: 8,
        // En claro el tile usa el pastel de SU categoría (lo pone el consumidor,
        // que es quien conoce el hue); en oscuro, un velo blanco parejo.
        idleBackground: ADD[mode].tileIdle,
        idleShadow: mode === 'light' ? ADD_TILE_L : ADD_TILE_D,
        selectedShadow: mode === 'light' ? ADD_TILE_SEL_L : ADD_TILE_SEL_D,
        selectedRing: ADD[mode].ring,
      },
      freqChip: {
        radius: 15,
        padH: 15,
        padV: 9,
        fontSize: 12.5,
        activeBackground: ADD[mode].freqBackground,
        activeInk: ADD[mode].freqInk,
        activeShadow: ADD[mode].freqShadow,
      },
      cta: {
        radius: 20,
        padV: 16,
        fontSize: 16,
        gradientCss: ADD[mode].ctaGradient,
        // Fallback sólido: el gradiente NO renderiza en react-native-web, así
        // que sin esto el CTA quedaba transparente en el preview. Es el color
        // medio del propio gradiente.
        background: ADD[mode].ctaBackground,
        ink: ADD[mode].ctaInk,
        shadow: ADD[mode].ctaShadow,
      },
    },
  }
}

/**
 * Envuelve la lista para que se dibuje con la piel del rediseño. Solo lo monta
 * `neo-fijos-screen.tsx`; la pantalla viva no lo usa.
 */
export function FijosSkinProvider({ children, mode }: { children: ReactNode; mode: FijosMode }) {
  const skin = useMemo(() => buildNeoSkin(mode), [mode])
  return <FijosSkinContext.Provider value={skin}>{children}</FijosSkinContext.Provider>
}
