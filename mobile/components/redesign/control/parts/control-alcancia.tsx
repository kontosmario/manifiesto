// @i18n-ignore-file — kit de rediseño bajo gate; fixtures literales del markup es-AR, el copy real llega por props (i18n vive en el view-model).
import { memo } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import {
  CardHeaderRow,
  ControlCard,
  GrowView,
  InsetRow,
  RadialCta,
  VerdictPill,
} from '@/components/redesign/control/control-primitives'
import {
  CONTROL_RADII,
  CONTROL_SPEC,
  type ControlMode,
  type ControlSpec,
} from '@/components/redesign/control/control-spec'
import { usePressScale } from '@/hooks/use-press-scale'
import { decorativeDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * ⑦ Alcancía — card "MI META · AHORRO" (el frasco) de la vista CONTROL.
 * Transcripción del layout final (líneas 6301–6358 del handoff pretty,
 * estado 'enMarcha' = COMPOSICIÓN DEFINITIVA a escala teléfono: frasco al
 * 62% + AHORRO ACUMULADO + barra + chip de meta + CTAs Sumar/Editar) +
 * componente mejorado AL2 (1069–1208) + tanda de estados E (claro
 * 1210–1556 / oscuro 1557–1900). Deltas dark del layout final:
 * phone-light-vs-dark.diff 509–568.
 *
 * DECISIÓN DE COMPOSICIÓN (pedida por el plan): las variantes 'inactiva'
 * (E1) / 'cumplida' (E3) / 'arrancando' (E4) / 'vacia' (E5) / 'sinAporte'
 * (E6) portan el CONTENIDO de su card de la tanda a la COMPOSICIÓN del
 * layout final — frasco a la izquierda + columna derecha alineada a la
 * izquierda + fila de CTAs abajo. La tanda dibuja la columna CENTRADA y a
 * otra escala (cards de 372px, discrepancia [A] de control-spec); de ella
 * salen SOLO fills, copy, poses, pills y títulos por estado. En toda
 * medida compartida ganó el layout final: montos 29→26, labels de columna
 * tracking 0.14em→0.08em, gap de columna 8→9 (y centrado→izquierda), dot
 * 7→8 / título 10.5→11 (CardHeaderRow), pill 10px+0.04em→10.5 (VerdictPill),
 * CTAs 13–13.5/padding 12/radius 15–16→12.5/padding 11/radius 14, inset
 * del cuerpo del frasco 4px/9px→insDeep, radios del cuerpo 26→24. Los
 * <br> del copy de la tanda no se portan (el texto fluye en la columna) y
 * el min-height:148px de su fila tampoco (la composición mide por el
 * frasco: 11+3+112). La fila de escala "0 / 1 sueldo" de E1 y el chip 💧
 * "29 de 29 días" de AL2 son iteración previa y no entran en ningún
 * fixture.
 *
 * REGLA CRÍTICA del README: Brot va FUERA del cuerpo del frasco (que
 * recorta con overflow:hidden), como HERMANO absoluto del wrapper
 * (bottom −8 / right −14, z-index 3) — adentro se recorta.
 *
 * Resoluciones locales (valores que el spec base no cubre — ver también
 * los const de abajo):
 *  · La marca META punteada y los ticks laterales 8×2 solo existen en
 *    AL2/tanda E; se portan al frasco de la composición. La línea
 *    `repeating-linear-gradient` se dibuja como segmentos discretos de
 *    4×2 con gap 4 en una fila overflow:hidden. enMarcha NO los lleva
 *    (el frasco del layout final no los dibuja): `jar.metaPos` ausente y
 *    `jar.ticks` false. 'vacia' lleva ticks sin META (así la tanda E5).
 *  · Mojado/seco de ticks y META se deriva de `fillPct`: sumergido si su
 *    top% ≥ 100−fillPct — reproduce exactamente las 6 cards de la tanda
 *    en ambos temas. El label META seco coincide con `s.faint` en ambos.
 *  · El fill verde de la tanda (3 stops #7FC183/#4C9A52/#327E39) se
 *    normaliza a `spec.greenFillVCss` (las tandas no son fuente de
 *    gradientes compartidos); 'full' y 'amber' solo existen en la tanda y
 *    quedan literales acá (idénticos en claro y oscuro en el markup).
 *  · La banda de menisco (5px, rgba blanca) solo existe en el layout
 *    final; es estructura de la composición y se dibuja sobre cualquier
 *    líquido. El brillo/sheen 120deg de AL2/tanda NO existe en el layout
 *    final y no se transcribe.
 *  · Pill/label ámbar: la tanda oscura dibuja #E0A75C pero el spec declara
 *    amber #E8B57C (en claro coinciden exacto con #B0742A) — gana el spec,
 *    el ámbar de la tanda es drift de iteración.
 *  · La CTA radial oscura de la tanda (radial #9FDC9F→#3E7D46, tinta
 *    #0F1E14, glow) difiere del layout final; el spec documenta la CTA
 *    radial como idéntica en ambos temas — gana el spec.
 *  · `GhostCta` de las primitivas no expone textStyle (12.5px del markup
 *    vs 11 fijo): CTA fantasma local con el mismo lenguaje (insMd +
 *    usePressScale + ctaGhostInk).
 *  · Ancho de CTAs: "Editar meta" va flex:none con padding 11/14 y todo
 *    el resto flex:1 con padding 11 — regla derivada del markup: una CTA
 *    fantasma en el segundo slot abraza su contenido; sola o primera,
 *    llena la fila (cumplida dibuja Retirar/Nueva meta mitad y mitad).
 *  · `primaryCta`/`secondaryCta` = ORDEN EN FILA (primera/segunda), no
 *    jerarquía visual: en 'cumplida' la primaria es "Retirar" (ghost) y
 *    la secundaria "Nueva meta" (radial), como los dibuja la tanda.
 *  · `title` y `jar.ticks` no estaban en el sketch de Content del plan:
 *    title porque la tanda cambia el título del header por estado
 *    ("META · VIAJE A BARILOCHE" en cumplida) y ticks porque su presencia
 *    varía entre layout final y tanda.
 */

// ─── Constantes locales (no cubiertas por CONTROL_SPEC) ───────────────

/** Fill del frasco lleno ('cumplida') — literal de la tanda E3, idéntico
 *  en claro y oscuro. Fallback = último stop (criterio del spec). */
const JAR_FILL_FULL_CSS = 'linear-gradient(180deg, #8FD08F 0%, #57A05C 55%, #2E7C39 100%)'
const JAR_FILL_FULL_FALLBACK = '#2E7C39'
/** Fill ámbar ('sinAporte', 6%) — literal de la tanda E6, ambos temas. */
const JAR_FILL_AMBER_CSS = 'linear-gradient(180deg, #E0A75C 0%, #C88A3E 55%, #B0742A 100%)'
const JAR_FILL_AMBER_FALLBACK = '#B0742A'
/** Ticks laterales: sumergido / seco, por tema (tanda E + AL2). */
const TICK_WET_LIGHT = 'rgba(255,255,255,0.5)'
const TICK_DRY_LIGHT = 'rgba(151,160,136,0.4)'
const TICK_WET_DARK = 'rgba(210,245,210,0.55)'
const TICK_DRY_DARK = 'rgba(101,152,113,0.3)'
/** Segmentos de la línea META: sobre líquido / sobre vacío, por tema. */
const META_DASH_WET_LIGHT = 'rgba(247,244,228,0.85)'
const META_DASH_DRY_LIGHT = 'rgba(151,160,136,0.55)'
const META_DASH_WET_DARK = 'rgba(210,245,210,0.85)'
const META_DASH_DRY_DARK = 'rgba(101,152,113,0.35)'
/** Label META sobre líquido — #F7F4E4 en ambos temas (seco = s.faint). */
const META_LABEL_WET_INK = '#F7F4E4'
/** Tops % de los 5 ticks de la tanda E (AL2 dibuja 4; ganó la tanda de
 *  estados, que es la definitiva). */
const JAR_TICK_TOPS = [20, 34, 48, 62, 76] as const
/** Alcanzan para el ancho interior del frasco de 96 (80 − label − gap);
 *  el sobrante lo recorta la fila overflow:hidden. */
const META_DASH_COUNT = 8

// ─── Contenido por variante ───────────────────────────────────────────

export type ControlAlcanciaVariant = 'enMarcha' | 'inactiva' | 'cumplida' | 'arrancando' | 'vacia' | 'sinAporte'

export interface ControlAlcanciaJar {
  /** 0–100 — altura del líquido (62 / 70 / 100 / 14 / 0 / 6). */
  fillPct: number
  /** 'green' → spec.greenFillVCss · 'full'/'amber' → literales de la
   *  tanda · 'none' → sin líquido + texto "vacío" centrado. */
  fill: 'green' | 'full' | 'amber' | 'none'
  /** Top % de la marca META punteada; ausente = sin marca (enMarcha). */
  metaPos?: number
  /** "62%" grande dentro del frasco (solo enMarcha en el markup). */
  pctLabel?: string
  /** Ticks laterales 8×2 de la tanda E (el layout final no los dibuja). */
  ticks?: boolean
  /** Copy del texto "vacío" (fill 'none') — pisable por i18n. */
  emptyLabel?: string
  /** Copy del tag "META" de la marca punteada — pisable por i18n. */
  metaLabel?: string
}

/** Columna derecha — unión discriminada: cada variante lee solo la shape
 *  que le corresponde (a diferencia del tipo plano de comparativa; acá
 *  las 4 shapes no comparten casi campos y el plan pidió la unión). */
export type ControlAlcanciaRight =
  | {
      /** enMarcha — label + monto/de + barra (el chip de meta va aparte
       *  en `goalChip`). */
      kind: 'acumulado'
      label: string
      amount: string
      amountSub: string
      barPct: number
    }
  | {
      /** inactiva / arrancando / sinAporte — label + monto + nota, con
       *  barra y remate opcionales (solo inactiva los trae). */
      kind: 'progreso'
      label: string
      /** 'sinAporte' tiñe el label con spec.amber. */
      labelTone?: 'amber'
      amount: string
      note: string
      barPct?: number
      endnote?: string
    }
  | {
      /** cumplida — título festejo + monto verde + nota. */
      kind: 'celebracion'
      title: string
      amount: string
      note: string
    }
  | {
      /** vacia — título + cuerpo. */
      kind: 'vacio'
      title: string
      body: string
    }

export interface ControlAlcanciaGoalChip {
  emoji: string
  /** Va en 900 y tinta text ("Vacaciones"). */
  name: string
  /** " · faltan $600k · ~3 ciclos". */
  rest: string
}

export interface ControlAlcanciaCta {
  label: string
  kind: 'radial' | 'ghost'
}

/**
 * Campos de contenido. `jar`/`right`/`goalChip`/CTAs son objetos: un
 * override los pisa ENTEROS (mismo trade-off que `outliers` de
 * comparativa) — para cambiar un campo puntual se reconstruye el objeto.
 */
export interface ControlAlcanciaContent {
  title: string
  pillLabel: string
  pillTone: 'green' | 'faint' | 'amber'
  /** Solo el check existe como ícono en este componente ('En marcha'). */
  pillIcon?: 'check'
  jar: ControlAlcanciaJar
  right: ControlAlcanciaRight
  goalChip?: ControlAlcanciaGoalChip
  /** Primera / segunda CTA DE LA FILA (no jerarquía — ver docblock). */
  primaryCta?: ControlAlcanciaCta
  secondaryCta?: ControlAlcanciaCta
  brotPose: BrotPose
}

// Defaults LITERALES por variante:
//  · 'enMarcha' → layout final (fuente de la composición).
//  · 'inactiva'/'cumplida'/'arrancando'/'vacia'/'sinAporte' → tanda
//    E1/E3/E4/E5/E6 (única fuente de sus fills/copy/poses/pills/títulos),
//    portados a la composición del layout final (ver docblock). E2 "meta
//    activa" de la tanda no es variante: 'enMarcha' es su versión final.
export const ALCANCIA_CONTENT: Record<ControlAlcanciaVariant, ControlAlcanciaContent> = {
  enMarcha: {
    title: 'MI META · AHORRO',
    pillLabel: 'En marcha',
    pillTone: 'green',
    pillIcon: 'check',
    jar: { fillPct: 62, fill: 'green', pctLabel: '62%' },
    right: { kind: 'acumulado', label: 'AHORRO ACUMULADO', amount: '$1,0M', amountSub: 'de $1,6M', barPct: 62 },
    goalChip: { emoji: '✈️', name: 'Vacaciones', rest: ' · faltan $600k · ~3 ciclos' },
    primaryCta: { label: 'Sumar ahora', kind: 'radial' },
    secondaryCta: { label: 'Editar meta', kind: 'ghost' },
    brotPose: 'love',
  },
  inactiva: {
    title: 'TU ALCANCÍA · ESTE CICLO',
    pillLabel: '❚❚ INACTIVA',
    pillTone: 'faint',
    jar: { fillPct: 70, fill: 'green', metaPos: 20, ticks: true },
    right: {
      kind: 'progreso',
      label: 'LISTO PARA TU META',
      amount: '+$1.425.518',
      note: '70% de un sueldo 🌱',
      barPct: 70,
      endnote: 'Te faltan $574k para llenarlo',
    },
    primaryCta: { label: '▶ Activar meta · Nueva meta', kind: 'radial' },
    brotPose: 'love',
  },
  cumplida: {
    title: 'META · VIAJE A BARILOCHE',
    pillLabel: '✓ CUMPLIDA',
    pillTone: 'green',
    jar: { fillPct: 100, fill: 'full', metaPos: 2, ticks: true },
    right: { kind: 'celebracion', title: '¡Frasco lleno! 🎉', amount: '$2.000.000', note: 'Meta alcanzada en 4 ciclos' },
    primaryCta: { label: 'Retirar', kind: 'ghost' },
    secondaryCta: { label: 'Nueva meta', kind: 'radial' },
    brotPose: 'cheer',
  },
  arrancando: {
    title: 'TU ALCANCÍA · ESTE CICLO',
    pillLabel: 'DÍA 3 DE 30',
    pillTone: 'faint',
    jar: { fillPct: 14, fill: 'green', metaPos: 20, ticks: true },
    right: {
      kind: 'progreso',
      label: 'GUARDADO HASTA HOY',
      amount: '+$182.400',
      note: 'Recién arrancás — cada día bajo cupo suma una gota 🌱',
    },
    primaryCta: { label: '▶ Activar meta · Nueva meta', kind: 'radial' },
    brotPose: 'wave',
  },
  vacia: {
    title: 'TU ALCANCÍA',
    pillLabel: 'SIN DATOS AÚN',
    pillTone: 'faint',
    jar: { fillPct: 0, fill: 'none', ticks: true },
    right: {
      kind: 'vacio',
      title: 'Tu frasco está vacío',
      body: 'Cuando cierres días bajo tu cupo, se llena solo. Registrá tu primer gasto.',
    },
    primaryCta: { label: 'Registrar mi primer gasto', kind: 'radial' },
    brotPose: 'wave',
  },
  sinAporte: {
    title: 'TU ALCANCÍA · ESTE CICLO',
    pillLabel: '⚠ SIN APORTE',
    pillTone: 'amber',
    jar: { fillPct: 6, fill: 'amber', metaPos: 20, ticks: true },
    right: {
      kind: 'progreso',
      label: 'ESTE CICLO NO SOBRÓ',
      labelTone: 'amber',
      amount: '$0',
      note: 'Gastaste por encima del cupo. Está bien — el próximo volvés a llenar 🌱',
    },
    primaryCta: { label: 'Ver en qué se fue', kind: 'ghost' },
    brotPose: 'worried',
  },
}

/** Mismo criterio que `withComparativaDefaults`: `??` explícito campo por
 *  campo, así un override falsy real no se confunde con "no vino". */
export function withAlcanciaDefaults(
  variant: ControlAlcanciaVariant,
  overrides: Partial<ControlAlcanciaContent>,
): ControlAlcanciaContent {
  const d = ALCANCIA_CONTENT[variant]
  return {
    title: overrides.title ?? d.title,
    pillLabel: overrides.pillLabel ?? d.pillLabel,
    pillTone: overrides.pillTone ?? d.pillTone,
    // OPCIONALES por PRESENCIA, no por ??: el cableado apaga el ícono
    // del pill, el chip de meta o una CTA pasando `undefined` explícito
    // — con ?? el fixture mock resucitaría ("Vacaciones · faltan $600k"
    // fabricado, CTAs muertas).
    pillIcon: 'pillIcon' in overrides ? overrides.pillIcon : d.pillIcon,
    jar: overrides.jar ?? d.jar,
    right: overrides.right ?? d.right,
    goalChip: 'goalChip' in overrides ? overrides.goalChip : d.goalChip,
    primaryCta: 'primaryCta' in overrides ? overrides.primaryCta : d.primaryCta,
    secondaryCta: 'secondaryCta' in overrides ? overrides.secondaryCta : d.secondaryCta,
    brotPose: overrides.brotPose ?? d.brotPose,
  }
}

// ─── Íconos (transcritos del markup) ──────────────────────────────────

/** Check del pill "En marcha" — 11px / stroke 3, path literal del layout
 *  final (mismo glifo que el check de comparativa). */
function CheckGlyph({ color }: { color: string }) {
  return (
    <Svg
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M5 13l4 4L19 7" />
    </Svg>
  )
}

// ─── Frasco ───────────────────────────────────────────────────────────

function jarFillOf(s: ControlSpec, fill: ControlAlcanciaJar['fill']): { css: string; fallback: string } | null {
  switch (fill) {
    case 'green':
      return { css: s.greenFillVCss, fallback: s.greenFillVFallback }
    case 'full':
      return { css: JAR_FILL_FULL_CSS, fallback: JAR_FILL_FULL_FALLBACK }
    case 'amber':
      return { css: JAR_FILL_AMBER_CSS, fallback: JAR_FILL_AMBER_FALLBACK }
    case 'none':
      return null
  }
}

/** Tapa + cuerpo recortado (líquido/ticks/META/%/"vacío") + Brot HERMANO
 *  del cuerpo (ver regla crítica del docblock). */
function AlcanciaJarView({
  mode,
  s,
  jar,
  brotPose,
  animated,
}: {
  mode: ControlMode
  s: ControlSpec
  jar: ControlAlcanciaJar
  brotPose: BrotPose
  animated: boolean
}) {
  const dark = mode === 'dark'
  const fill = jarFillOf(s, jar.fill)
  const fillPct = fill ? jar.fillPct : 0
  /** Top % de la superficie del líquido; un elemento a top ≥ surface está
   *  sumergido (deriva los mojado/seco de la tanda, ver docblock). */
  const surface = 100 - fillPct
  const metaWet = jar.metaPos !== undefined && jar.metaPos >= surface
  return (
    <View style={styles.jarWrap}>
      <View
        style={[
          styles.jarLid,
          { backgroundColor: s.jarLidFallback, experimental_backgroundImage: s.jarLidCss, boxShadow: s.insMd },
        ]}
      />
      <View style={[styles.jarBody, { backgroundColor: s.jarBodyBg, boxShadow: s.insDeep }]}>
        {fill ? (
          <GrowView
            axis="y"
            delay={200}
            duration={decorativeDurations.growBarSlow}
            skipEntering={!animated}
            style={[
              styles.jarLiquid,
              { height: `${fillPct}%`, backgroundColor: fill.fallback, experimental_backgroundImage: fill.css },
            ]}
          >
            <View style={[styles.jarMeniscus, { backgroundColor: s.jarMeniscus }]} />
          </GrowView>
        ) : null}
        {jar.ticks
          ? JAR_TICK_TOPS.map((top) => (
              <View
                key={top}
                style={[
                  styles.jarTick,
                  {
                    top: `${top}%`,
                    backgroundColor:
                      top >= surface ? (dark ? TICK_WET_DARK : TICK_WET_LIGHT) : (dark ? TICK_DRY_DARK : TICK_DRY_LIGHT),
                  },
                ]}
              />
            ))
          : null}
        {jar.metaPos !== undefined ? (
          <View style={[styles.metaRow, { top: `${jar.metaPos}%` }]}>
            <View style={styles.metaDashes}>
              {Array.from({ length: META_DASH_COUNT }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.metaDash,
                    {
                      backgroundColor: metaWet
                        ? dark
                          ? META_DASH_WET_DARK
                          : META_DASH_WET_LIGHT
                        : dark
                          ? META_DASH_DRY_DARK
                          : META_DASH_DRY_LIGHT,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.metaLabel, { color: metaWet ? META_LABEL_WET_INK : s.faint }]}>{jar.metaLabel ?? 'META'}</Text>
          </View>
        ) : null}
        {jar.pctLabel ? <Text style={[styles.jarPct, { color: s.jarPctInk }]}>{jar.pctLabel}</Text> : null}
        {fill ? null : (
          <View style={styles.jarEmptyWrap}>
            <Text style={[styles.jarEmptyLabel, { color: s.faint }]}>{jar.emptyLabel ?? 'vacío'}</Text>
          </View>
        )}
      </View>
      <View pointerEvents="none" style={styles.jarBrot}>
        <BrotMascot pose={brotPose} size={46} shadow={false} animated={animated} />
      </View>
    </View>
  )
}

// ─── Columna derecha + barra de meta ──────────────────────────────────

function GoalBar({ s, pct, animated }: { s: ControlSpec; pct: number; animated: boolean }) {
  return (
    <View style={[styles.goalBar, { boxShadow: s.insMd }]}>
      <GrowView
        axis="x"
        delay={250}
        duration={decorativeDurations.growBar}
        skipEntering={!animated}
        style={[
          styles.goalBarFill,
          { width: `${pct}%`, backgroundColor: s.greenFillVFallback, experimental_backgroundImage: s.greenFillVCss },
        ]}
      />
    </View>
  )
}

function RightColumn({ s, c, animated }: { s: ControlSpec; c: ControlAlcanciaContent; animated: boolean }) {
  const r = c.right
  return (
    <View style={styles.rightCol}>
      {r.kind === 'acumulado' ? (
        <>
          <View>
            <Text style={[styles.rightLabel, { color: s.faint }]}>{r.label}</Text>
            <View style={styles.amountRow}>
              <Text style={[styles.amount, { color: s.text }]}>{r.amount}</Text>
              <Text style={[styles.amountSub, { color: s.sub }]}>{r.amountSub}</Text>
            </View>
          </View>
          <GoalBar s={s} pct={r.barPct} animated={animated} />
        </>
      ) : r.kind === 'progreso' ? (
        <>
          <View>
            <Text style={[styles.rightLabel, { color: r.labelTone === 'amber' ? s.amber : s.faint }]}>{r.label}</Text>
            <Text style={[styles.amount, styles.amountSpacing, { color: s.text }]}>{r.amount}</Text>
          </View>
          <Text style={[styles.note, { color: s.sub }]}>{r.note}</Text>
          {r.barPct !== undefined ? (
            <View>
              <GoalBar s={s} pct={r.barPct} animated={animated} />
              {r.endnote ? <Text style={[styles.endnote, { color: s.sub }]}>{r.endnote}</Text> : null}
            </View>
          ) : null}
        </>
      ) : r.kind === 'celebracion' ? (
        <>
          <Text style={[styles.celebTitle, { color: s.text }]}>{r.title}</Text>
          <Text style={[styles.amount, { color: s.green }]}>{r.amount}</Text>
          <Text style={[styles.note, { color: s.sub }]}>{r.note}</Text>
        </>
      ) : (
        <>
          <Text style={[styles.emptyTitle, { color: s.text }]}>{r.title}</Text>
          <Text style={[styles.note, { color: s.sub }]}>{r.body}</Text>
        </>
      )}
      {c.goalChip ? (
        <InsetRow spec={s} radius={CONTROL_RADII.goalChip} style={styles.goalChip}>
          <Text style={styles.goalChipEmoji}>{c.goalChip.emoji}</Text>
          <Text numberOfLines={1} style={[styles.goalChipText, { color: s.sub }]}>
            <Text style={[styles.goalChipName, { color: s.text }]}>{c.goalChip.name}</Text>
            {c.goalChip.rest}
          </Text>
        </InsetRow>
      ) : null}
    </View>
  )
}

// ─── CTAs ─────────────────────────────────────────────────────────────

/** CTA fantasma local — `GhostCta` de las primitivas fija el label en 11
 *  y el markup de la meta dibuja 12.5 (ver docblock). Mismo lenguaje:
 *  insMd + ctaGhostInk + usePressScale, pressable solo con callback. */
function AlcanciaGhostCta({
  s,
  label,
  hug,
  onPress,
}: {
  s: ControlSpec
  label: string
  hug: boolean
  onPress?: () => void
}) {
  const press = usePressScale({ pressedScale: 0.96 })
  const body = (
    <View style={[styles.ghostCta, hug ? styles.ctaPadHug : styles.ctaPadFill, { boxShadow: s.insMd }]}>
      <Text style={[styles.ghostCtaLabel, { color: s.ctaGhostInk }]}>{label}</Text>
    </View>
  )
  const content = onPress ? (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      {body}
    </AnimatedPressable>
  ) : (
    body
  )
  return hug ? content : <View style={styles.ctaSlotFill}>{content}</View>
}

/** Slot de la fila de CTAs. El wrapper flex:1 va POR FUERA del pressable
 *  de `RadialCta` (que no estira solo dentro de una fila). */
function CtaSlot({
  s,
  cta,
  hug,
  onPress,
}: {
  s: ControlSpec
  cta: ControlAlcanciaCta
  hug: boolean
  onPress?: () => void
}) {
  if (cta.kind === 'radial') {
    return (
      <View style={styles.ctaSlotFill}>
        <RadialCta spec={s} label={cta.label} onPress={onPress} style={styles.ctaPadFill} textStyle={styles.ctaLabelLg} />
      </View>
    )
  }
  return <AlcanciaGhostCta s={s} label={cta.label} hug={hug} onPress={onPress} />
}

// ─── Componente ───────────────────────────────────────────────────────

export interface ControlAlcanciaProps extends Partial<ControlAlcanciaContent> {
  mode: ControlMode
  /** 'enMarcha' (default, layout final) / E1 'inactiva' / E3 'cumplida' /
   *  E4 'arrancando' / E5 'vacia' / E6 'sinAporte'. */
  variant?: ControlAlcanciaVariant
  /** false = sin entering (líquido y barras ya crecidos) y Brot quieto. */
  animated?: boolean
  /** Primera CTA de la fila ("Sumar ahora" / "▶ Activar meta…" /
   *  "Retirar" / "Registrar mi primer gasto" / "Ver en qué se fue"). */
  onPressPrimary?: () => void
  /** Segunda CTA de la fila ("Editar meta" / "Nueva meta"). */
  onPressSecondary?: () => void
  style?: StyleProp<ViewStyle>
}

export const ControlAlcancia = memo(function ControlAlcancia(props: ControlAlcanciaProps) {
  const { mode, animated = true, onPressPrimary, onPressSecondary, style } = props
  const variant = props.variant ?? 'enMarcha'
  const s = CONTROL_SPEC[mode]
  const c = withAlcanciaDefaults(variant, props)

  const pillInk = c.pillTone === 'green' ? s.green : c.pillTone === 'amber' ? s.amber : s.faint

  return (
    <ControlCard spec={s} style={style}>
      <CardHeaderRow
        spec={s}
        dotColor={s.green}
        title={c.title}
        right={
          <VerdictPill
            spec={s}
            ink={pillInk}
            label={c.pillLabel}
            icon={c.pillIcon === 'check' ? <CheckGlyph color={pillInk} /> : undefined}
          />
        }
      />
      <View style={styles.jarRow}>
        <AlcanciaJarView mode={mode} s={s} jar={c.jar} brotPose={c.brotPose} animated={animated} />
        <RightColumn s={s} c={c} animated={animated} />
      </View>
      {c.primaryCta || c.secondaryCta ? (
        <View style={styles.ctaRow}>
          {c.primaryCta ? <CtaSlot s={s} cta={c.primaryCta} hug={false} onPress={onPressPrimary} /> : null}
          {c.secondaryCta ? (
            <CtaSlot s={s} cta={c.secondaryCta} hug={c.secondaryCta.kind === 'ghost'} onPress={onPressSecondary} />
          ) : null}
        </View>
      ) : null}
    </ControlCard>
  )
})

const styles = StyleSheet.create({
  // Fila frasco + columna derecha.
  jarRow: {
    alignItems: 'stretch',
    columnGap: 15,
    flexDirection: 'row',
    marginTop: 13,
  },
  // Frasco.
  jarWrap: {
    position: 'relative',
    width: 96,
  },
  jarLid: {
    alignSelf: 'center',
    borderBottomLeftRadius: CONTROL_RADII.jarLidBottom,
    borderBottomRightRadius: CONTROL_RADII.jarLidBottom,
    borderTopLeftRadius: CONTROL_RADII.jarLidTop,
    borderTopRightRadius: CONTROL_RADII.jarLidTop,
    height: 11,
    width: 56,
  },
  jarBody: {
    borderBottomLeftRadius: CONTROL_RADII.jarBodyBottom,
    borderBottomRightRadius: CONTROL_RADII.jarBodyBottom,
    borderTopLeftRadius: CONTROL_RADII.jarBodyTop,
    borderTopRightRadius: CONTROL_RADII.jarBodyTop,
    height: 112,
    marginTop: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  jarLiquid: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  jarMeniscus: {
    height: 5,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  jarTick: {
    borderRadius: 1,
    height: 2,
    left: 6,
    position: 'absolute',
    width: 8,
  },
  metaRow: {
    alignItems: 'center',
    columnGap: 4,
    flexDirection: 'row',
    left: 0,
    paddingHorizontal: 8,
    position: 'absolute',
    right: 0,
  },
  metaDashes: {
    columnGap: 4,
    flex: 1,
    flexDirection: 'row',
    height: 2,
    overflow: 'hidden',
  },
  metaDash: {
    height: 2,
    width: 4,
  },
  metaLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 7.5,
    fontWeight: '900',
    letterSpacing: 7.5 * 0.06,
  },
  jarPct: {
    fontFamily: nunitoFamily('900'),
    fontSize: 18,
    fontWeight: '900',
    left: 0,
    position: 'absolute',
    right: 0,
    textAlign: 'center',
    top: 8,
    zIndex: 2,
  },
  jarEmptyWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jarEmptyLabel: {
    fontFamily: nunitoFamily('800'),
    fontSize: 10,
    fontWeight: '800',
  },
  jarBrot: {
    bottom: -8,
    position: 'absolute',
    right: -14,
    zIndex: 3,
  },
  // Columna derecha.
  rightCol: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    rowGap: 9,
  },
  rightLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 9.5 * 0.08,
  },
  amountRow: {
    alignItems: 'baseline',
    columnGap: 7,
    flexDirection: 'row',
    marginTop: 3,
  },
  amount: {
    fontFamily: nunitoFamily('900'),
    fontSize: 26,
    fontWeight: '900',
    // Headroom sobre el fontSize (mismo motivo que el `amount` del hero): con
    // `lineHeight == fontSize` iOS rebana el tope del `$` y de las cifras.
    lineHeight: 26 * 1.2,
  },
  amountSpacing: {
    marginTop: 3,
  },
  amountSub: {
    fontFamily: nunitoFamily('800'),
    fontSize: 12,
    fontWeight: '800',
  },
  note: {
    fontFamily: nunitoFamily('800'),
    fontSize: 11.5,
    fontWeight: '800',
    lineHeight: 11.5 * 1.45,
  },
  endnote: {
    fontFamily: nunitoFamily('700'),
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 6,
  },
  celebTitle: {
    fontFamily: nunitoFamily('900'),
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 19 * 1.2,
  },
  emptyTitle: {
    fontFamily: nunitoFamily('900'),
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 18 * 1.25,
  },
  goalBar: {
    borderRadius: CONTROL_RADII.goalBar,
    height: 12,
    overflow: 'hidden',
  },
  goalBarFill: {
    borderRadius: CONTROL_RADII.goalBar,
    height: '100%',
  },
  goalChip: {
    paddingVertical: 8,
  },
  goalChipEmoji: {
    fontSize: 14,
  },
  goalChipText: {
    flexShrink: 1,
    fontFamily: nunitoFamily('800'),
    fontSize: 11.5,
    fontWeight: '800',
  },
  goalChipName: {
    fontFamily: nunitoFamily('900'),
    fontWeight: '900',
  },
  // Fila de CTAs.
  ctaRow: {
    columnGap: 10,
    flexDirection: 'row',
    marginTop: 13,
  },
  ctaSlotFill: {
    flex: 1,
  },
  ctaPadFill: {
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  ctaPadHug: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  ctaLabelLg: {
    fontSize: 12.5,
  },
  ghostCta: {
    alignItems: 'center',
    borderRadius: CONTROL_RADII.cta,
    justifyContent: 'center',
  },
  ghostCtaLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 12.5,
    fontWeight: '900',
  },
})
