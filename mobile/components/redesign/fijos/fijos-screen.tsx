// @i18n-ignore-file — kit de rediseño bajo gate; copy literal, i18n en el pase posterior.
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path, Rect } from 'react-native-svg'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import { BrotParticles } from '@/components/brot/brot-particles'
import { FIJOS_RADII, FIJOS_SPEC, type FijosMode, type FijosSpec } from '@/components/redesign/fijos/fijos-spec'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { usePressScale } from '@/hooks/use-press-scale'
import { decorativeDurations, motionEasings } from '@/lib/motion/tokens'
import { neoParticlePresets } from '@/theme/neo-tokens'
import { withAlpha } from '@/theme/color-utils'
import { nunitoFamily } from '@/theme/typography'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Vista de FIJOS del rediseño — kit presentacional bajo gate de aprobación
 * (redesign-approval-status: 'fijos'). Réplica pixel-perfect de
 * design/fijos-2026-07/Fijos Manifiesto.dc.html: teléfono claro + oscuro de
 * la vista principal (header y hero por defecto, estado E2) más el canvas
 * de 8 estados del hero (E1–E8). Chrome dibujado (status bar / home
 * indicator / nav) NO vive acá: lo arma el preview screen (Task 6), igual
 * que en Home/Gastos.
 *
 * Esta primera tanda (Task 3) exporta `FijosHeader` y `FijosHero`. Tareas
 * posteriores del mismo plan AGREGAN a este archivo sin tocar lo de acá:
 * Task 4 suma `FijosAvisos` (ticker + 6 estados), Task 5 suma
 * `FijosTabs`/`FijosCategoryGroup`/`FijosRow` ("Todos tus fijos"). Por eso
 * los bloques de esta tanda están agrupados bajo comentarios numerados (①
 * Header, ② Hero) y el `styles` final queda en UN solo StyleSheet.create al
 * que las próximas tareas le siguen agregando claves.
 *
 * PROPS, NO ESTADO: cada componente es puro, recibe todo por props y no
 * monta hooks de datos ni de red. `FijosHero` es la excepción parcial de
 * siempre en este patrón (como `GastosHero`): el único "estado" que posee
 * es el de sus 8 variantes discriminadas por la prop `variant`, con
 * defaults por variante que reproducen los valores literales del mockup —
 * `<FijosHero mode="light" variant="E5" />` sin ningún otro prop ya
 * reproduce la tarjeta aprobada de ese estado.
 *
 * DECISIONES DEL PLAN (2026-07-29 — detalle completo en task-3-report.md):
 *  · El tercer elemento del header es un BOTÓN DE CALENDARIO (ícono SVG
 *    inline), no Brot con badge de jardín — el README lo describe mal, el
 *    markup (ambos teléfonos) dibuja el calendario. Falló el owner: vale
 *    el markup. `onPressCalendar` queda opcional y sin destino (no
 *    definido todavía en el plan de cableado).
 *  · El dot del trigger de ciclo y el de la eyebrow del hero llevan un
 *    halo ESTÁTICO en este markup (a diferencia del `mfPulse` que sí late
 *    en el propio .dc.html de Gastos) — confirmado: los únicos
 *    `@keyframes` de este archivo son `fijosTicker`/`fijosLive`, los dos
 *    del componente Avisos (Task 4). El halo se porta como un círculo
 *    semitransparente detrás del punto (mismo lenguaje que
 *    `CycleTriggerDot` de Gastos, sin blur real de `boxShadow`), sin loop.
 *  · E1 (al día) y E6 (sin fijos) cambian la FORMA del hero (celebración /
 *    vacío), no solo los números — así lo dice el plan. El canvas dibuja
 *    un CUARTO layout para E8 (fuera de ciclo) que el plan no había
 *    contado como shape-changing: fila Brot+texto, pozo de resumen, CTA
 *    "Confirmar cobro" — sin pozo "Te falta pagar" ni barra de 16
 *    segmentos. Modelado acá como una cuarta forma.
 *  · "Proyección de cierre en Control ›" (mencionado en el brief y en el
 *    README) NO existe en ningún lado del markup — grep exhaustivo de
 *    "Proyec"/"cierre" sobre el .dc.html no da resultados fuera de la
 *    etiqueta de nav "Control". No se transcribe.
 */

// ─── Íconos (transcritos del markup) ──────────────────────────────────

/** Botón del header: calendario inline (rect + 2 ticks superiores + una
 *  marca chica adentro). viewBox y paths tal cual el markup — ambos
 *  teléfonos, idéntico geometría en claro/oscuro (solo cambia el stroke
 *  vía `currentColor`). */
function CalendarGlyph({ color }: { color: string }) {
  return (
    <Svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Rect x={3.5} y={5.5} width={17} height={15} rx={3} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" />
      <Path d="M12 12.5v4M10 14.5h4" />
    </Svg>
  )
}

/** Punto con halo ESTÁTICO (sin pulso — ver nota del módulo). El halo es un
 *  círculo más grande y semitransparente detrás del punto sólido: mismo
 *  lenguaje visual que `CycleTriggerDot` de Gastos (evita depender de blur
 *  real de `boxShadow` sobre un View de pocos px), sin la parte animada
 *  porque este markup no la tiene. */
function GlowDot({
  wrapStyle,
  glowStyle,
  dotStyle,
  color,
  glowColor,
}: {
  wrapStyle: StyleProp<ViewStyle>
  glowStyle: StyleProp<ViewStyle>
  dotStyle: StyleProp<ViewStyle>
  color: string
  glowColor: string
}) {
  return (
    <View style={wrapStyle}>
      <View pointerEvents="none" style={[glowStyle, { backgroundColor: glowColor }]} />
      <View style={[dotStyle, { backgroundColor: color }]} />
    </View>
  )
}

// ─── ① Header — título + trigger de ciclo + botón de calendario ───────

export interface FijosHeaderProps {
  mode: FijosMode
  /** "Ciclo 20 jun → 19 jul · día 18". */
  cycleLabel: string
  onToggleDropdown?: () => void
  /** A dónde navega el botón de calendario TODAVÍA no está definido (ver
   *  docblock del módulo) — el preview lo deja en no-op. */
  onPressCalendar?: () => void
}

export function FijosHeader({ mode, cycleLabel, onToggleDropdown, onPressCalendar }: FijosHeaderProps) {
  const s = FIJOS_SPEC[mode]
  const calendarPress = usePressScale({ pressedScale: 0.9 })

  const trigger = (
    <View style={styles.cycTrig}>
      <GlowDot
        wrapStyle={styles.cycDotWrap}
        glowStyle={styles.cycDotGlow}
        dotStyle={styles.cycDot}
        color={s.cycTrigDot}
        glowColor={s.cycTrigDotGlow}
      />
      <Text style={[styles.cycTrigLabel, { color: s.cycTrigInk }]}>{cycleLabel}</Text>
      <Text style={[styles.cycCaret, { color: s.cycTrigInk }]}>▾</Text>
    </View>
  )

  const calendarButton = (
    <View
      style={[
        styles.headerIconBtn,
        { backgroundColor: s.headerIconBtnBackground, boxShadow: s.headerIconBtnShadow },
        s.headerIconBtnGradientCss ? { experimental_backgroundImage: s.headerIconBtnGradientCss } : null,
      ]}
    >
      <CalendarGlyph color={s.headerIconInk} />
    </View>
  )

  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        <Text style={[styles.title, { color: s.text }]}>Fijos</Text>
        {onToggleDropdown ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Cambiar de ciclo: ${cycleLabel}`}
            // La fila del trigger mide ~18px (label 13 + margin). Mismo
            // cálculo que GastosHeader: 14 la lleva a ~46, el mínimo a11y;
            // arriba solo el título (no accionable), abajo aire hasta el
            // hero, así que el slop no le roba el toque a ningún vecino.
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
      {onPressCalendar ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Abrir calendario"
          hitSlop={6}
          onPress={onPressCalendar}
          onPressIn={calendarPress.onPressIn}
          onPressOut={calendarPress.onPressOut}
          style={calendarPress.animatedStyle}
        >
          {calendarButton}
        </AnimatedPressable>
      ) : (
        calendarButton
      )}
    </View>
  )
}

/**
 * Espacio entre `FijosHeader` y `FijosHero` — `margin-top:14px` en el
 * markup (líneas 52/165, entre el botón de calendario y el hero, ambos
 * teléfonos). Gastos resuelve el mismo salto con su propio
 * `styles.heroSpacing` (`gastos-screen.tsx:2571`, usado en
 * `gastos-screen.tsx:2501`), pero ese vive DENTRO de gastos-screen.tsx
 * porque ese mismo archivo arma su propia pantalla compuesta. Acá la
 * pantalla compuesta la arma un archivo aparte (Task 6), así que el valor
 * sale EXPORTADO en vez de quedar enterrado en el `styles` privado de este
 * módulo, que ese archivo no puede ver — sin esto, Task 6 tendría que
 * volver a levantar el valor del .dc.html a mano.
 */
export const fijosHeaderHeroSpacing: ViewStyle = { marginTop: 14 }

// ─── ② Hero — contenido por defecto (E2) + sus 8 estados ──────────────

export type FijosHeroVariant = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'E7' | 'E8'

/**
 * Campos de contenido del hero. Ninguno es válido para las 8 variantes al
 * mismo tiempo — cada shape (pozo default / celebración E1 / vacío E6 /
 * fuera-de-ciclo E8) lee solo el subconjunto que le corresponde, el resto
 * queda en `''`/`0`/`false` sin uso (ver `HERO_CONTENT`). Modelarlo como un
 * único tipo plano (en vez de una unión discriminada por shape) es lo que
 * permite que `FijosHeroProps` extienda `Partial<FijosHeroContent>` y un
 * caller pise UN campo puntual sin tener que reconstruir todo el objeto de
 * la variante.
 */
interface FijosHeroContent {
  // Compartido por las 8 variantes (fila superior del hero).
  eyebrow: string
  topChipLabel: string
  // Pozo "Te falta pagar" / "Total de la edición" — shape default
  // (E2/E3/E4/E5/E7).
  wellLabel: string
  amount: string
  statusChipLabel: string
  statusChipTone: 'alert' | 'neutral' | 'success'
  // "Pagaste X de Y fijos" + barra de segmentos + "$paid/de $total" —
  // shape default Y celebración (E1: mismo bloque, otros valores).
  paidOfLabel: string
  pctLabel: string
  paidAmountLabel: string
  totalAmountLabel: string
  segmentsPaid: number
  segmentToday: boolean
  segmentsTotal: number
  // "TE QUEDA DISPONIBLE" — shape default y E1.
  availableAmount: string
  availableOfLabel: string
  availableNote: string
  /** E5: monto negativo + nota en tono de alerta (mismo `alertChipInk`). */
  availableWarning: boolean
  // E1 — bloque centrado de celebración.
  zeroBadgeLabel: string
  zeroTitle: string
  zeroSub: string
  // E6 — vacío de usuario nuevo.
  emptyTitle: string
  emptySub: string
  emptyCtaLabel: string
  // E8 — fuera de ciclo.
  outOfCycleTitle: string
  outOfCycleSub: string
  outOfCycleSummaryLabel: string
  outOfCycleSummaryAmount: string
  outOfCycleCtaLabel: string
}

// Defaults LITERALES por variante — transcritos de:
//  · E2 → el teléfono claro/oscuro (fuente de la Step 1, "el default").
//  · E1,E3–E8 → el canvas "ESTADOS DE LA TARJETA · HERO FIJOS" (solo claro).
//
// ESCALA — FALLO DEL OWNER (2026-07-29): para las 5 variantes de shape
// "default" (E2/E3/E4/E5/E7) se usa la escala del TELÉFONO, no la del
// canvas de estados. Verificado medida por medida contra el markup, en
// las 7 (canvas primero, teléfono después): monto 40 vs 42px, "Pagaste…"
// 13 vs 13.5px, "91%" 13.5 vs 14px, "$… pagado" 11 vs 11.5px, "de $… total"
// 11 vs 11.5px y disponible 25 vs 27px van en el MISMO sentido — el canvas
// las dibuja más chicas. El padding inferior del contenedor es la
// EXCEPCIÓN, va AL REVÉS de las otras seis: canvas 18 vs teléfono 16 (el
// canvas lo dibuja parejo en los 4 lados — `padding:18px` — mientras el
// teléfono lo recorta abajo a 16, `padding:18px 18px 16px`). Ninguna de
// las 7 es un dato de diseño por estado — es un artefacto de layout de la
// grilla comparativa de 8 tarjetas (el canvas encoge/pareja el set entero
// para que entre lado a lado) — y el owner ratificó la escala del teléfono
// para los 8 estados por ser la que se ve de verdad en la app.
// Consecuencia visible e INTENCIONAL: E1/E3/E4/E5/E7 se ven un toque más
// grandes que su propia tarjeta del canvas. No "corregir" achicándolos de
// vuelta a la escala del canvas.
const HERO_CONTENT: Record<FijosHeroVariant, FijosHeroContent> = {
  E1: {
    eyebrow: 'FIJOS DE JULIO',
    topChipLabel: '✓ AL DÍA',
    wellLabel: '',
    amount: '',
    statusChipLabel: '',
    statusChipTone: 'success',
    paidOfLabel: '16 de 16',
    pctLabel: '100%',
    paidAmountLabel: '$1.350.482 pagado',
    totalAmountLabel: 'de $1.350.482 total',
    segmentsPaid: 16,
    segmentToday: false,
    segmentsTotal: 16,
    availableAmount: '$5.049.518',
    availableOfLabel: 'de $6.400.000',
    availableNote: '21% va a fijos',
    availableWarning: false,
    zeroBadgeLabel: '✓ 16 DE 16 · SIN VENCIDOS',
    zeroTitle: 'Cero pendientes',
    zeroSub: 'A disfrutar lo que queda del mes',
    emptyTitle: '',
    emptySub: '',
    emptyCtaLabel: '',
    outOfCycleTitle: '',
    outOfCycleSub: '',
    outOfCycleSummaryLabel: '',
    outOfCycleSummaryAmount: '',
    outOfCycleCtaLabel: '',
  },
  E2: {
    eyebrow: 'FIJOS DE JULIO',
    topChipLabel: 'HOY · DÍA 18',
    wellLabel: 'Te falta pagar',
    amount: '$122.831',
    statusChipLabel: '⚠ 3 fijos por pagar · 1 vencida',
    statusChipTone: 'alert',
    paidOfLabel: '13 de 16',
    pctLabel: '91%',
    paidAmountLabel: '$1.227.651 pagado',
    totalAmountLabel: 'de $1.350.482 total',
    segmentsPaid: 13,
    segmentToday: true,
    segmentsTotal: 16,
    availableAmount: '$5.049.518',
    availableOfLabel: 'de $6.400.000',
    availableNote: '21% va a fijos',
    availableWarning: false,
    zeroBadgeLabel: '',
    zeroTitle: '',
    zeroSub: '',
    emptyTitle: '',
    emptySub: '',
    emptyCtaLabel: '',
    outOfCycleTitle: '',
    outOfCycleSub: '',
    outOfCycleSummaryLabel: '',
    outOfCycleSummaryAmount: '',
    outOfCycleCtaLabel: '',
  },
  E3: {
    eyebrow: 'FIJOS DE JULIO',
    topChipLabel: 'HOY · DÍA 18',
    wellLabel: 'Te falta pagar',
    amount: '$116.000',
    statusChipLabel: '2 por venir · nada vencido',
    statusChipTone: 'neutral',
    paidOfLabel: '14 de 16',
    pctLabel: '88%',
    paidAmountLabel: '$1.234.482 pagado',
    totalAmountLabel: 'de $1.350.482 total',
    segmentsPaid: 14,
    segmentToday: false,
    segmentsTotal: 16,
    availableAmount: '$5.049.518',
    availableOfLabel: 'de $6.400.000',
    availableNote: '21% va a fijos',
    availableWarning: false,
    zeroBadgeLabel: '',
    zeroTitle: '',
    zeroSub: '',
    emptyTitle: '',
    emptySub: '',
    emptyCtaLabel: '',
    outOfCycleTitle: '',
    outOfCycleSub: '',
    outOfCycleSummaryLabel: '',
    outOfCycleSummaryAmount: '',
    outOfCycleCtaLabel: '',
  },
  E4: {
    eyebrow: 'FIJOS DE JULIO',
    topChipLabel: 'DÍA 1',
    wellLabel: 'Te falta pagar',
    amount: '$1.350.482',
    statusChipLabel: '16 fijos este mes · recién cobraste',
    statusChipTone: 'neutral',
    paidOfLabel: '0 de 16',
    pctLabel: '0%',
    paidAmountLabel: '$0 pagado',
    totalAmountLabel: 'de $1.350.482 total',
    segmentsPaid: 0,
    segmentToday: false,
    segmentsTotal: 16,
    availableAmount: '$5.049.518',
    availableOfLabel: 'de $6.400.000',
    availableNote: '21% va a fijos',
    availableWarning: false,
    zeroBadgeLabel: '',
    zeroTitle: '',
    zeroSub: '',
    emptyTitle: '',
    emptySub: '',
    emptyCtaLabel: '',
    outOfCycleTitle: '',
    outOfCycleSub: '',
    outOfCycleSummaryLabel: '',
    outOfCycleSummaryAmount: '',
    outOfCycleCtaLabel: '',
  },
  E5: {
    eyebrow: 'FIJOS DE JULIO',
    topChipLabel: 'HOY · DÍA 18',
    wellLabel: 'Te falta pagar',
    amount: '$122.831',
    statusChipLabel: '⚠ 1 vencida',
    statusChipTone: 'alert',
    paidOfLabel: '13 de 16',
    pctLabel: '91%',
    paidAmountLabel: '$1.227.651 pagado',
    totalAmountLabel: 'de $1.350.482 total',
    segmentsPaid: 13,
    segmentToday: true,
    segmentsTotal: 16,
    // Disponible NEGATIVO (te pasás este mes) — ink de alerta, ver
    // `availableWarning` y `HeroAvailableCard`. El signo es MENOS
    // matemático (U+2212), no un guion; el markup lo dibuja así.
    availableAmount: '−$48.200',
    availableOfLabel: 'de $1.300.000',
    availableNote: '⚠ te pasás este mes',
    availableWarning: true,
    zeroBadgeLabel: '',
    zeroTitle: '',
    zeroSub: '',
    emptyTitle: '',
    emptySub: '',
    emptyCtaLabel: '',
    outOfCycleTitle: '',
    outOfCycleSub: '',
    outOfCycleSummaryLabel: '',
    outOfCycleSummaryAmount: '',
    outOfCycleCtaLabel: '',
  },
  E6: {
    eyebrow: 'FIJOS DE JULIO',
    topChipLabel: 'NUEVO',
    wellLabel: '',
    amount: '',
    statusChipLabel: '',
    statusChipTone: 'neutral',
    paidOfLabel: '',
    pctLabel: '',
    paidAmountLabel: '',
    totalAmountLabel: '',
    segmentsPaid: 0,
    segmentToday: false,
    segmentsTotal: 16,
    availableAmount: '',
    availableOfLabel: '',
    availableNote: '',
    availableWarning: false,
    zeroBadgeLabel: '',
    zeroTitle: '',
    zeroSub: '',
    emptyTitle: 'Todavía no cargaste fijos',
    emptySub:
      'Sumá alquiler, servicios y suscripciones — te avisamos antes de cada vencimiento para que no se te pase ninguno.',
    emptyCtaLabel: '+ Agregar tu primer fijo',
    outOfCycleTitle: '',
    outOfCycleSub: '',
    outOfCycleSummaryLabel: '',
    outOfCycleSummaryAmount: '',
    outOfCycleCtaLabel: '',
  },
  E7: {
    eyebrow: 'MAYO 2026 · CERRADA',
    topChipLabel: '📁 SOLO LECTURA',
    wellLabel: 'Total de la edición',
    amount: '$1.588.087',
    statusChipLabel: '✓ Cerró completo · 18 de 18',
    statusChipTone: 'success',
    // Literales del handoff tal cual — "18 de 16" y un total de "$1.350.482"
    // que no coincide con los "$1.588.087 pagado" de arriba. Casi seguro
    // residuo de copiar la tarjeta de otro estado sin actualizar estos dos
    // campos (ver reporte de Task 3); se transcribió sin corregir.
    paidOfLabel: '18 de 16',
    pctLabel: '100%',
    paidAmountLabel: '$1.588.087 pagado',
    totalAmountLabel: 'de $1.350.482 total',
    segmentsPaid: 16,
    segmentToday: false,
    segmentsTotal: 16,
    availableAmount: '$4.811.913',
    availableOfLabel: 'de $6.400.000',
    availableNote: '25% fue a fijos',
    availableWarning: false,
    zeroBadgeLabel: '',
    zeroTitle: '',
    zeroSub: '',
    emptyTitle: '',
    emptySub: '',
    emptyCtaLabel: '',
    outOfCycleTitle: '',
    outOfCycleSub: '',
    outOfCycleSummaryLabel: '',
    outOfCycleSummaryAmount: '',
    outOfCycleCtaLabel: '',
  },
  E8: {
    eyebrow: 'FIJOS · CICLO TERMINADO',
    topChipLabel: 'DÍA 19+',
    wellLabel: '',
    amount: '',
    statusChipLabel: '',
    statusChipTone: 'neutral',
    paidOfLabel: '',
    pctLabel: '',
    paidAmountLabel: '',
    totalAmountLabel: '',
    segmentsPaid: 0,
    segmentToday: false,
    segmentsTotal: 16,
    availableAmount: '',
    availableOfLabel: '',
    availableNote: '',
    availableWarning: false,
    zeroBadgeLabel: '',
    zeroTitle: '',
    zeroSub: '',
    emptyTitle: '',
    emptySub: '',
    emptyCtaLabel: '',
    outOfCycleTitle: 'Tu ciclo terminó el 19',
    outOfCycleSub: 'Confirmá tu cobro para cerrar julio y abrir el próximo ciclo.',
    outOfCycleSummaryLabel: 'Quedaron 3 sin pagar',
    outOfCycleSummaryAmount: '$122.831',
    outOfCycleCtaLabel: '✓ Confirmar cobro',
  },
}

/** Combina los defaults literales de la variante con los overrides que
 *  llegan por props — un campo solo se pisa si el caller lo definió
 *  explícitamente (`??`, no `||`: así un override `false`/`0`/`''` real no
 *  se confunde con "no vino"). Explícito campo por campo (sin loop
 *  genérico) para no necesitar ningún cast: cada línea es su propio chequeo
 *  de tipos. */
function withHeroDefaults(d: FijosHeroContent, p: Partial<FijosHeroContent>): FijosHeroContent {
  return {
    eyebrow: p.eyebrow ?? d.eyebrow,
    topChipLabel: p.topChipLabel ?? d.topChipLabel,
    wellLabel: p.wellLabel ?? d.wellLabel,
    amount: p.amount ?? d.amount,
    statusChipLabel: p.statusChipLabel ?? d.statusChipLabel,
    statusChipTone: p.statusChipTone ?? d.statusChipTone,
    paidOfLabel: p.paidOfLabel ?? d.paidOfLabel,
    pctLabel: p.pctLabel ?? d.pctLabel,
    paidAmountLabel: p.paidAmountLabel ?? d.paidAmountLabel,
    totalAmountLabel: p.totalAmountLabel ?? d.totalAmountLabel,
    segmentsPaid: p.segmentsPaid ?? d.segmentsPaid,
    segmentToday: p.segmentToday ?? d.segmentToday,
    segmentsTotal: p.segmentsTotal ?? d.segmentsTotal,
    availableAmount: p.availableAmount ?? d.availableAmount,
    availableOfLabel: p.availableOfLabel ?? d.availableOfLabel,
    availableNote: p.availableNote ?? d.availableNote,
    availableWarning: p.availableWarning ?? d.availableWarning,
    zeroBadgeLabel: p.zeroBadgeLabel ?? d.zeroBadgeLabel,
    zeroTitle: p.zeroTitle ?? d.zeroTitle,
    zeroSub: p.zeroSub ?? d.zeroSub,
    emptyTitle: p.emptyTitle ?? d.emptyTitle,
    emptySub: p.emptySub ?? d.emptySub,
    emptyCtaLabel: p.emptyCtaLabel ?? d.emptyCtaLabel,
    outOfCycleTitle: p.outOfCycleTitle ?? d.outOfCycleTitle,
    outOfCycleSub: p.outOfCycleSub ?? d.outOfCycleSub,
    outOfCycleSummaryLabel: p.outOfCycleSummaryLabel ?? d.outOfCycleSummaryLabel,
    outOfCycleSummaryAmount: p.outOfCycleSummaryAmount ?? d.outOfCycleSummaryAmount,
    outOfCycleCtaLabel: p.outOfCycleCtaLabel ?? d.outOfCycleCtaLabel,
  }
}

export interface FijosHeroProps extends Partial<FijosHeroContent> {
  mode: FijosMode
  /** E1 al día · E2 en curso (default) · E3 sin vencidas · E4 arranque de
   *  ciclo · E5 disponible ajustado · E6 sin fijos · E7 cerrado · E8 fuera
   *  de ciclo. Cada variante trae sus propios defaults (idénticos al
   *  mockup) para los campos de `FijosHeroContent` — pasalos solo para
   *  pisar un valor puntual (dato real, copy traducida, etc.). */
  variant?: FijosHeroVariant
  /** Pausa las partículas del hero. Mismo convenio que Gastos/Home: la tab
   *  no está enfocada y `freezeOnBlur:false` lo deja montado e invisible. */
  paused?: boolean
  /** Anima los Brot de E1/E6/E8 (cool/wave/worried). Default `true` → el
   *  preview aprobado late igual que siempre; el cableado real lo apaga
   *  por perf en los mismos casos que ya documentan el header y el banner
   *  de Gastos (loop Skia compitiendo con el hilo del scroll). */
  animated?: boolean
  /** CTA "+ Agregar tu primer fijo" (E6). */
  onPressEmptyCta?: () => void
  /** CTA "✓ Confirmar cobro" (E8). */
  onPressConfirm?: () => void
}

function HeroTopRow({
  s,
  dotColor,
  eyebrow,
  chipLabel,
}: {
  s: FijosSpec
  dotColor: string
  eyebrow: string
  chipLabel: string
}) {
  return (
    <View style={styles.heroTopRow}>
      <View style={styles.heroTagRow}>
        <GlowDot
          wrapStyle={styles.heroDotWrap}
          glowStyle={styles.heroDotGlowCircle}
          dotStyle={styles.heroDot}
          color={dotColor}
          glowColor={s.heroDotGlow}
        />
        <Text style={[styles.heroTag, { color: s.heroEyebrowInk }]}>{eyebrow}</Text>
      </View>
      <View style={[styles.heroChip, { backgroundColor: s.heroChipBackground, boxShadow: s.heroChipShadow }]}>
        <Text style={[styles.heroChipText, { color: s.heroChipInk }]}>{chipLabel}</Text>
      </View>
    </View>
  )
}

/** Chip de estado debajo del monto del pozo — 3 tonos: `alert` (naranja,
 *  con ícono ⚠ incluido en el label), `neutral` (blanco translúcido, sin
 *  ícono) y `success` (verde menta, el badge "cerrado completo" de E7).
 *  El badge centrado de E1 NO pasa por acá — tiene su propia tipografía
 *  (10.5px + letter-spacing), ver `zeroBadge*` en los estilos. */
function HeroStatusChip({ s, label, tone }: { s: FijosSpec; label: string; tone: 'alert' | 'neutral' | 'success' }) {
  const background =
    tone === 'alert' ? s.alertChipBackground : tone === 'success' ? s.celebrationChipBackground : s.neutralChipBackground
  const ink = tone === 'alert' ? s.alertChipInk : tone === 'success' ? s.celebrationChipInk : s.neutralChipInk
  const shadow = tone === 'alert' ? s.alertChipShadow : undefined
  return (
    <View style={[styles.statusChip, { backgroundColor: background }, shadow ? { boxShadow: shadow } : null]}>
      <Text style={[styles.statusChipText, { color: ink }]}>{label}</Text>
    </View>
  )
}

/**
 * Línea de ciclo — 16 segmentos: `paid` primero (verde), como mucho UNO
 * `today` (perilla naranja urgente), el resto `future` (borde sin relleno).
 * Estático (sin grow-in): el kit no anima nada más allá del feedback de
 * press de los botones — ver nota de alcance en el reporte de Task 3.
 */
function HeroSegmentBar({ s, paid, today, total }: { s: FijosSpec; paid: number; today: boolean; total: number }) {
  const cells: Array<'paid' | 'today' | 'future'> = []
  for (let i = 0; i < paid && cells.length < total; i++) cells.push('paid')
  if (today && cells.length < total) cells.push('today')
  while (cells.length < total) cells.push('future')
  return (
    <View style={styles.segRow}>
      {cells.map((kind, i) => (
        <View
          key={i}
          style={[
            styles.segCell,
            kind === 'paid' ? { experimental_backgroundImage: s.segPaidGradientCss, boxShadow: s.segPaidShadow } : null,
            kind === 'today' ? { backgroundColor: s.segTodayBackground, boxShadow: s.segTodayShadow } : null,
            kind === 'future' ? { borderWidth: 1.5, borderColor: s.segFutureBorder } : null,
          ]}
        />
      ))}
    </View>
  )
}

/** Bloque "TE QUEDA DISPONIBLE". `warning` (E5) pisa el ink del monto y de
 *  la nota derecha por `alertChipInk` (mismo tono que el chip de alerta del
 *  pozo) y engorda la nota a weight 900 — así lo dibuja el markup de E5. */
function HeroAvailableCard({
  s,
  amount,
  ofLabel,
  note,
  warning,
}: {
  s: FijosSpec
  amount: string
  ofLabel: string
  note: string
  warning: boolean
}) {
  const valueInk = warning ? s.alertChipInk : s.availableValueInk
  const noteInk = warning ? s.alertChipInk : s.availablePctInk
  return (
    <View style={[styles.availableCard, { backgroundColor: s.availableCardBackground, boxShadow: s.availableCardShadow }]}>
      <View>
        <Text style={[styles.availableLabel, { color: s.availableLabelInk }]}>TE QUEDA DISPONIBLE</Text>
        <Text
          style={[
            styles.availableValue,
            {
              color: valueInk,
              textShadowColor: s.amountShadowColor,
              textShadowOffset: s.amountShadowOffset,
              textShadowRadius: s.amountShadowRadius,
            },
          ]}
        >
          {amount}
        </Text>
      </View>
      <View style={styles.availableRight}>
        <Text style={[styles.availableOf, { color: s.availableOfInk }]}>{ofLabel}</Text>
        <Text style={[styles.availableNote, warning ? styles.availableNoteWarning : null, { color: noteInk }]}>
          {note}
        </Text>
      </View>
    </View>
  )
}

/** Pill de acción genérica (Hero E6 "+ Agregar tu primer fijo", E8 "✓
 *  Confirmar cobro"; Avisos A6 reusa esta misma función — ver `AvisosEmptyBody`
 *  más abajo) — mismo patrón que `GastosEmptyCta`: usePressScale 0.94 +
 *  gradiente/sombra por prop, sin Pressable si no hay `onPress` (el kit no
 *  inventa handlers; el destino de ninguno de los dos está definido todavía).
 *  Renombrado de `HeroCtaPill` (Task 3) a `CtaPill` cuando Task 4 empezó a
 *  reusarla fuera del hero — mismo criterio de nombre que `GlowDot` (genérico,
 *  sin prefijo de sección) más arriba en este archivo. Sin cambio de firma ni
 *  de comportamiento. */
function CtaPill({
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
    <View style={[styles.ctaPill, { experimental_backgroundImage: gradientCss, boxShadow: shadow }]}>
      <Text style={[styles.ctaPillText, { color: ink }]}>{label}</Text>
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

/** Cuerpo "default": pozo + "Pagaste…" + barra + paid/total + disponible.
 *  Cubre E2/E3/E4/E5/E7 (mismo layout, distintos valores/tonos). */
function HeroDefaultBody({ s, c }: { s: FijosSpec; c: FijosHeroContent }) {
  return (
    <>
      <View style={[styles.well, { backgroundColor: s.wellBackground, boxShadow: s.wellShadow }]}>
        <Text style={[styles.wellLabel, { color: s.wellLabelInk }]}>{c.wellLabel}</Text>
        <Text
          style={[
            styles.wellAmount,
            {
              color: s.amountInk,
              textShadowColor: s.amountShadowColor,
              textShadowOffset: s.amountShadowOffset,
              textShadowRadius: s.amountShadowRadius,
            },
          ]}
        >
          {c.amount}
        </Text>
        <HeroStatusChip s={s} label={c.statusChipLabel} tone={c.statusChipTone} />
      </View>

      <PaidProgress s={s} c={c} />
      <HeroAvailableCard
        s={s}
        amount={c.availableAmount}
        ofLabel={c.availableOfLabel}
        note={c.availableNote}
        warning={c.availableWarning}
      />
    </>
  )
}

/** "Pagaste X de Y fijos" + barra de 16 segmentos + "$paid / de $total" —
 *  compartido por el cuerpo default (E2/E3/E4/E5/E7) y por E1 (que lo
 *  conserva debajo de su bloque de celebración, ver `HeroZeroBody`). */
function PaidProgress({ s, c }: { s: FijosSpec; c: FijosHeroContent }) {
  return (
    <>
      <View style={styles.paidRow}>
        <Text style={[styles.paidLabel, { color: s.progressLabelInk }]}>
          Pagaste <Text style={{ color: s.progressAccentInk }}>{c.paidOfLabel}</Text> fijos
        </Text>
        <Text style={[styles.pctLabel, { color: s.progressAccentInk }]}>{c.pctLabel}</Text>
      </View>
      <HeroSegmentBar s={s} paid={c.segmentsPaid} today={c.segmentToday} total={c.segmentsTotal} />
      <View style={styles.paidTotalRow}>
        <Text style={[styles.paidAmount, { color: s.totalPaidInk }]}>{c.paidAmountLabel}</Text>
        <Text style={[styles.totalAmount, { color: s.totalOfInk }]}>{c.totalAmountLabel}</Text>
      </View>
    </>
  )
}

/** E1 — celebración: Brot `cool` centrado + badge + titular + bajada,
 *  seguido del MISMO bloque "Pagaste…/barra/disponible" que el resto (con
 *  los valores de un ciclo 100% pagado). El markup (línea 361) envuelve
 *  este Brot en `filter:drop-shadow(0 4px 10px rgba(6,20,10,0.4))` — NO se
 *  porta, mismo criterio que `onb-5c-hogar.tsx` (RN no soporta ese filtro
 *  en ambas plataformas; la ausencia solo quita brillo, no cambia el
 *  dibujo). El resto de la pose (`shadow={false}`) es el mismo patrón que
 *  usan todos los demás Brot del kit. */
function HeroZeroBody({ s, c, animated }: { s: FijosSpec; c: FijosHeroContent; animated: boolean }) {
  return (
    <>
      <View style={styles.zeroBlock}>
        <BrotMascot pose="cool" size={96} shadow={false} animated={animated} />
        <View style={[styles.zeroBadge, { backgroundColor: s.celebrationChipBackground }]}>
          <Text style={[styles.zeroBadgeText, { color: s.celebrationChipInk }]}>{c.zeroBadgeLabel}</Text>
        </View>
        <Text
          style={[
            styles.zeroTitle,
            {
              color: s.amountInk,
              textShadowColor: s.amountShadowColor,
              textShadowOffset: s.amountShadowOffset,
              textShadowRadius: s.amountShadowRadius,
            },
          ]}
        >
          {c.zeroTitle}
        </Text>
        <Text style={[styles.zeroSub, { color: s.zeroStateSubInk }]}>{c.zeroSub}</Text>
      </View>
      <PaidProgress s={s} c={c} />
      <HeroAvailableCard
        s={s}
        amount={c.availableAmount}
        ofLabel={c.availableOfLabel}
        note={c.availableNote}
        warning={c.availableWarning}
      />
    </>
  )
}

/** E6 — vacío de usuario nuevo: Brot `wave` + título + bajada + CTA. */
function HeroEmptyBody({
  s,
  c,
  animated,
  onPressEmptyCta,
}: {
  s: FijosSpec
  c: FijosHeroContent
  animated: boolean
  onPressEmptyCta?: () => void
}) {
  return (
    <View style={styles.emptyBlock}>
      <BrotMascot pose="wave" size={70} shadow={false} animated={animated} />
      <Text style={[styles.emptyTitle, { color: s.emptyHeroTitleInk }]}>{c.emptyTitle}</Text>
      <Text style={[styles.emptySub, { color: s.emptyHeroSubInk }]}>{c.emptySub}</Text>
      <View style={styles.ctaSpacing}>
        <CtaPill
          label={c.emptyCtaLabel}
          ink={s.emptyHeroCtaInk}
          gradientCss={s.emptyHeroCtaGradientCss}
          shadow={s.emptyHeroCtaShadow}
          onPress={onPressEmptyCta}
        />
      </View>
    </View>
  )
}

/** E8 — fuera de ciclo: fila Brot `worried` + texto, pozo de resumen
 *  ("Quedaron N sin pagar" / monto), CTA "Confirmar cobro". Shape propia,
 *  sin pozo "Te falta pagar" ni barra de 16 segmentos (ver docblock del
 *  módulo — el plan solo contaba E1/E6 como shape-changing). */
function HeroOutOfCycleBody({
  s,
  c,
  animated,
  onPressConfirm,
}: {
  s: FijosSpec
  c: FijosHeroContent
  animated: boolean
  onPressConfirm?: () => void
}) {
  return (
    <>
      <View style={styles.outOfCycleRow}>
        <View style={styles.outOfCycleBrotSlot}>
          <BrotMascot pose="worried" size={52} shadow={false} animated={animated} />
        </View>
        <View style={styles.outOfCycleTexts}>
          <Text style={[styles.outOfCycleTitle, { color: s.outOfCycleTitleInk }]}>{c.outOfCycleTitle}</Text>
          <Text style={[styles.outOfCycleSub, { color: s.outOfCycleSubInk }]}>{c.outOfCycleSub}</Text>
        </View>
      </View>
      <View style={[styles.outOfCycleWell, { backgroundColor: s.outOfCycleWellBackground, boxShadow: s.outOfCycleWellShadow }]}>
        <Text style={[styles.outOfCycleWellLabel, { color: s.outOfCycleTitleInk }]}>{c.outOfCycleSummaryLabel}</Text>
        <Text style={[styles.outOfCycleWellAmount, { color: s.outOfCycleTitleInk }]}>{c.outOfCycleSummaryAmount}</Text>
      </View>
      <View style={styles.ctaSpacingSm}>
        <CtaPill
          label={c.outOfCycleCtaLabel}
          ink={s.outOfCycleCtaInk}
          gradientCss={s.outOfCycleCtaGradientCss}
          shadow={s.outOfCycleCtaShadow}
          onPress={onPressConfirm}
        />
      </View>
    </>
  )
}

export function FijosHero(props: FijosHeroProps) {
  const { mode, paused = false, animated = true, onPressEmptyCta, onPressConfirm } = props
  const variant = props.variant ?? 'E2'
  const s = FIJOS_SPEC[mode]
  const c = withHeroDefaults(HERO_CONTENT[variant], props)

  // E5 (disponible ajustado) y E8 (fuera de ciclo) prenden el dot de la
  // eyebrow en naranja (= `segTodayBackground`, mismo hex que dibuja el
  // markup) — el halo detrás se queda en el verde de siempre (`heroDotGlow`)
  // en las DOS, así lo dibuja el markup (probable drift de handoff: copiar
  // el punto sin actualizar el color del halo — se transcribió tal cual).
  const dotColor = variant === 'E5' || variant === 'E8' ? s.segTodayBackground : s.heroDot
  // E7 (cerrado) y E8 (fuera de ciclo) llevan su propio forest — ver
  // docblock de `heroGradientCssClosed`/`heroGradientCssOutOfCycle` en
  // fijos-spec.ts para la nota de derivación oscura.
  const gradient =
    variant === 'E7' ? s.heroGradientCssClosed : variant === 'E8' ? s.heroGradientCssOutOfCycle : s.heroGradientCss

  return (
    <View style={[styles.hero, { experimental_backgroundImage: gradient, boxShadow: s.heroShadow }]}>
      <View style={styles.heroParticles} pointerEvents="none">
        {/* Presente en las 8 variantes por consistencia visual del "cartel"
            del hero — el canvas de estados NO la dibuja en NINGUNA de las 8
            tarjetas (es una grilla comparativa estática, particles serían
            ruido ahí), pero los dos teléfonos reales sí la llevan y es una
            dependencia explícita de esta tarea (ver docblock del módulo). */}
        <BrotParticles {...neoParticlePresets.hero} borderRadius={FIJOS_RADII.hero} animated={!paused} />
      </View>
      <View>
        <HeroTopRow s={s} dotColor={dotColor} eyebrow={c.eyebrow} chipLabel={c.topChipLabel} />
        {variant === 'E6' ? (
          <HeroEmptyBody s={s} c={c} animated={animated} onPressEmptyCta={onPressEmptyCta} />
        ) : variant === 'E8' ? (
          <HeroOutOfCycleBody s={s} c={c} animated={animated} onPressConfirm={onPressConfirm} />
        ) : variant === 'E1' ? (
          <HeroZeroBody s={s} c={c} animated={animated} />
        ) : (
          <HeroDefaultBody s={s} c={c} />
        )}
      </View>
    </View>
  )
}

/** Espacio entre `FijosHero` y `FijosAvisos` — `margin-top:20px` en el
 *  markup (líneas 84/197, en el propio div de la card de Avisos, ambos
 *  teléfonos). Exportado en vez de hornearlo en `FijosAvisos` por el mismo
 *  motivo que `fijosHeaderHeroSpacing`: la pantalla compuesta que decide qué
 *  va antes de qué vive en Task 6, un archivo aparte. */
export const fijosHeroAvisosSpacing: ViewStyle = { marginTop: 20 }

// ─── ③ Avisos — card, ticker y sus 6 estados ───────────────────────────

export type FijosAvisosVariant = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6'

/** Tercer canal visual del chip del ticker (junto con el tag): el color del
 *  dot. `today` = vence hoy (verde) · `upcoming` = próximo, sin apuro (tono
 *  apagado) · `overdue` = vencido (durazno/alerta). */
export type FijosTickerTone = 'today' | 'upcoming' | 'overdue'

export interface FijosTickerItem {
  id: string
  name: string
  amount: string
  /** "HOY" / "EN 3D" / "VENCIDO" — texto del tag, literal (fixture). */
  tagLabel: string
  tone: FijosTickerTone
}

export interface FijosHikeRow {
  id: string
  name: string
  /** "+37%". */
  pctLabel: string
  fromAmount: string
  toAmount: string
}

/**
 * Campos de contenido de Avisos. Igual que `FijosHeroContent`: un único tipo
 * plano — cada shape (default con ticker+aumentos / calmo A4 / vacío A6) lee
 * solo el subconjunto que le corresponde, el resto queda en `''`/`[]`/`false`
 * sin uso. Así `FijosAvisosProps` puede extender `Partial<FijosAvisosContent>`
 * y un caller pisa un campo puntual sin reconstruir todo el objeto.
 */
export interface FijosAvisosContent {
  badgeCount: number
  /** `urgent` (A5): rojo one-off que NO está en fijos-spec.ts — ver
   *  `AVISOS_URGENT_BADGE_*` más abajo. */
  badgeTone: 'default' | 'urgent'
  brotPose: BrotPose
  /** A5: agrega `urgentRing` al `boxShadow` de la card. */
  cardUrgent: boolean
  // "POR PAGAR · ESTE MES" — ticker (A1/A2/A5, con punto live) o mensaje
  // estático dentro del mismo pozo cuando no hay items (A3, sin punto live:
  // el punto se deriva de `tickerItems.length > 0`, los 4 estados
  // observados en el markup correlacionan 1:1).
  tickerItems: FijosTickerItem[]
  staticMessage: string
  // "AUMENTOS Y RECORDATORIOS" — filas de aumento + fila-resumen (A1/A3/A5)
  // o mensaje calmo centrado cuando no hay aumentos (A2). Igual que arriba,
  // la fila-resumen se deriva de `hikeRows.length > 0` (siempre viene junto).
  hikeRows: FijosHikeRow[]
  reminderLabel: string
  reminderRest: string
  reminderAmount: string
  /** "— pagalos para no acumular" (A5). Vacío en A1/A3. */
  reminderSuffix: string
  calmMessage: string
  // A4 — todo tranquilo (reemplaza las 2 sub-secciones de arriba).
  calmTitle: string
  calmSub: string
  // A6 — sin fijos (reemplaza las 2 sub-secciones de arriba).
  emptyTitle: string
  emptySub: string
  emptyCtaLabel: string
}

// Rojo de alerta del badge "Avisos" en A5 — NO existe en fijos-spec.ts (el
// único badge del módulo es el tono default `avisosBadgeBackground`/Ink);
// literal del canvas de estados (light-only, sin confirmar en oscuro) — se
// transcribe theme-invariant, mismo criterio que los 20 campos especiales
// del hero (E1/E6/E8) documentados en fijos-spec.ts; a validar en el gate.
const AVISOS_URGENT_BADGE_BACKGROUND = '#C0392B'
const AVISOS_URGENT_BADGE_INK = '#FFF7E8'

// Gradiente propio del CTA "+ Agregar tu primer fijo" de A6 — mismas dos
// paradas que `fabGradientCss` pero a 180deg (no 145deg) y con su propia
// sombra; NO coincide con `emptyHeroCtaGradientCss` del hero (ese es
// crema/menta, transcrito en fijos-spec.ts). Tampoco vive en fijos-spec.ts
// porque es privativo de este único botón. Sin confirmar en oscuro — A6 no
// aparece en ninguno de los 2 teléfonos (el canvas de estados es light-only)
// — se transcribe theme-invariant, mismo criterio que arriba; a validar en
// el gate visual.
const AVISOS_EMPTY_CTA_GRADIENT = 'linear-gradient(180deg, #6DBC71, #327E39)'
const AVISOS_EMPTY_CTA_SHADOW = '0 6px 12px rgba(46,116,52,0.35)'
const AVISOS_EMPTY_CTA_INK = '#F5F2E1'

// Defaults LITERALES por variante — transcritos del canvas "ESTADOS DEL
// COMPONENTE · AVISOS" (light-only). A1 es el estado "(ACTUAL)": coincide
// con lo que dibujan los dos teléfonos (badge 6, Brot worried, mismos 6
// items del ticker) — es el default de `FijosAvisos` sin `variant`.
//
// [Discrepancia fixture, transcrita tal cual — ver reporte] La fila-resumen
// de A1/A3 dice "Disney +, Ecogas y Fútbol Otti suman $96.400", pero
// 8.900+12.300+6.500 = 27.700, no 96.400. Es texto de fixture del handoff;
// no se corrige (mismo criterio que el total que no cierra de E7 en
// HERO_CONTENT, Task 3).
const AVISOS_CONTENT: Record<FijosAvisosVariant, FijosAvisosContent> = {
  A1: {
    badgeCount: 6,
    badgeTone: 'default',
    brotPose: 'worried',
    cardUrgent: false,
    tickerItems: [
      { id: 'apple', name: 'Apple', amount: '$22.600', tagLabel: 'HOY', tone: 'today' },
      { id: 'disney', name: 'Disney +', amount: '$8.900', tagLabel: 'EN 3D', tone: 'upcoming' },
      { id: 'ecogas', name: 'Ecogas', amount: '$12.300', tagLabel: 'EN 5D', tone: 'upcoming' },
      { id: 'futbol-otti', name: 'Fútbol Otti', amount: '$6.500', tagLabel: 'EN 7D', tone: 'upcoming' },
      { id: 'luz-edenor', name: 'Luz Edenor', amount: '$6.831', tagLabel: 'VENCIDO', tone: 'overdue' },
      { id: 'spotify', name: 'Spotify', amount: '$6.000', tagLabel: 'HOY', tone: 'today' },
    ],
    staticMessage: '',
    hikeRows: [
      { id: 'expensas', name: 'Expensas', pctLabel: '+37%', fromAmount: '$284.400', toAmount: '$389.580' },
      { id: 'claude-ai', name: 'Claude AI', pctLabel: '+8%', fromAmount: '$279.000', toAmount: '$300.000' },
      { id: 'gym', name: 'Gym', pctLabel: '+8%', fromAmount: '$139.500', toAmount: '$150.000' },
    ],
    reminderLabel: '3 pagos fijos vencen en 7 días',
    reminderRest: 'Disney +, Ecogas y Fútbol Otti suman',
    reminderAmount: '$96.400',
    reminderSuffix: '',
    calmMessage: '',
    calmTitle: '',
    calmSub: '',
    emptyTitle: '',
    emptySub: '',
    emptyCtaLabel: '',
  },
  A2: {
    badgeCount: 5,
    badgeTone: 'default',
    brotPose: 'think',
    cardUrgent: false,
    tickerItems: [
      { id: 'apple', name: 'Apple', amount: '$22.600', tagLabel: 'HOY', tone: 'today' },
      { id: 'disney', name: 'Disney +', amount: '$8.900', tagLabel: 'EN 3D', tone: 'upcoming' },
      { id: 'ecogas', name: 'Ecogas', amount: '$12.300', tagLabel: 'EN 5D', tone: 'upcoming' },
      { id: 'futbol-otti', name: 'Fútbol Otti', amount: '$6.500', tagLabel: 'EN 7D', tone: 'upcoming' },
      { id: 'luz-edenor', name: 'Luz Edenor', amount: '$6.831', tagLabel: 'VENCIDO', tone: 'overdue' },
      { id: 'spotify', name: 'Spotify', amount: '$6.000', tagLabel: 'HOY', tone: 'today' },
    ],
    staticMessage: '',
    hikeRows: [],
    reminderLabel: '',
    reminderRest: '',
    reminderAmount: '',
    reminderSuffix: '',
    calmMessage: 'Sin cambios de precio este mes',
    calmTitle: '',
    calmSub: '',
    emptyTitle: '',
    emptySub: '',
    emptyCtaLabel: '',
  },
  A3: {
    badgeCount: 3,
    badgeTone: 'default',
    brotPose: 'think',
    cardUrgent: false,
    tickerItems: [],
    staticMessage: '✓ Nada vence en los próximos días',
    hikeRows: [
      { id: 'expensas', name: 'Expensas', pctLabel: '+37%', fromAmount: '$284.400', toAmount: '$389.580' },
      { id: 'claude-ai', name: 'Claude AI', pctLabel: '+8%', fromAmount: '$279.000', toAmount: '$300.000' },
      { id: 'gym', name: 'Gym', pctLabel: '+8%', fromAmount: '$139.500', toAmount: '$150.000' },
    ],
    reminderLabel: '3 pagos fijos vencen en 7 días',
    reminderRest: 'Disney +, Ecogas y Fútbol Otti suman',
    reminderAmount: '$96.400',
    reminderSuffix: '',
    calmMessage: '',
    calmTitle: '',
    calmSub: '',
    emptyTitle: '',
    emptySub: '',
    emptyCtaLabel: '',
  },
  A4: {
    badgeCount: 0,
    badgeTone: 'default',
    brotPose: 'cheer',
    cardUrgent: false,
    tickerItems: [],
    staticMessage: '',
    hikeRows: [],
    reminderLabel: '',
    reminderRest: '',
    reminderAmount: '',
    reminderSuffix: '',
    calmMessage: '',
    calmTitle: 'Todo tranquilo por acá',
    calmSub: 'No hay vencimientos próximos ni cambios de precio esta semana. Te avisamos si algo cambia.',
    emptyTitle: '',
    emptySub: '',
    emptyCtaLabel: '',
  },
  A5: {
    badgeCount: 8,
    badgeTone: 'urgent',
    brotPose: 'sad',
    cardUrgent: true,
    tickerItems: [
      { id: 'luz-edenor', name: 'Luz Edenor', amount: '$6.831', tagLabel: 'VENCIDO', tone: 'overdue' },
      { id: 'ecogas', name: 'Ecogas', amount: '$12.300', tagLabel: 'VENCIDO', tone: 'overdue' },
      { id: 'expensas', name: 'Expensas', amount: '$389.580', tagLabel: 'VENCIDO', tone: 'overdue' },
      { id: 'apple', name: 'Apple', amount: '$22.600', tagLabel: 'HOY', tone: 'today' },
      { id: 'futbol-otti', name: 'Fútbol Otti', amount: '$6.500', tagLabel: 'EN 2D', tone: 'upcoming' },
    ],
    staticMessage: '',
    hikeRows: [
      { id: 'expensas', name: 'Expensas', pctLabel: '+37%', fromAmount: '$284.400', toAmount: '$389.580' },
      { id: 'claude-ai', name: 'Claude AI', pctLabel: '+8%', fromAmount: '$279.000', toAmount: '$300.000' },
      { id: 'gym', name: 'Gym', pctLabel: '+8%', fromAmount: '$139.500', toAmount: '$150.000' },
    ],
    reminderLabel: '3 fijos ya vencieron',
    reminderRest: 'Luz, Ecogas y Expensas suman',
    reminderAmount: '$408.711',
    reminderSuffix: '— pagalos para no acumular',
    calmMessage: '',
    calmTitle: '',
    calmSub: '',
    emptyTitle: '',
    emptySub: '',
    emptyCtaLabel: '',
  },
  A6: {
    badgeCount: 0,
    badgeTone: 'default',
    brotPose: 'wave',
    cardUrgent: false,
    tickerItems: [],
    staticMessage: '',
    hikeRows: [],
    reminderLabel: '',
    reminderRest: '',
    reminderAmount: '',
    reminderSuffix: '',
    calmMessage: '',
    calmTitle: '',
    calmSub: '',
    emptyTitle: 'Todavía no cargaste fijos',
    emptySub: 'Cuando agregues alquiler, servicios o suscripciones, acá te vamos a avisar de vencimientos y aumentos.',
    emptyCtaLabel: '+ Agregar tu primer fijo',
  },
}

/** Mismo criterio que `withHeroDefaults`: `??` explícito campo por campo (no
 *  `||`, para que un override `false`/`0`/`''`/`[]` real no se confunda con
 *  "no vino"), sin loop genérico para que cada línea sea su propio chequeo de
 *  tipos. */
function withAvisosDefaults(d: FijosAvisosContent, p: Partial<FijosAvisosContent>): FijosAvisosContent {
  return {
    badgeCount: p.badgeCount ?? d.badgeCount,
    badgeTone: p.badgeTone ?? d.badgeTone,
    brotPose: p.brotPose ?? d.brotPose,
    cardUrgent: p.cardUrgent ?? d.cardUrgent,
    tickerItems: p.tickerItems ?? d.tickerItems,
    staticMessage: p.staticMessage ?? d.staticMessage,
    hikeRows: p.hikeRows ?? d.hikeRows,
    reminderLabel: p.reminderLabel ?? d.reminderLabel,
    reminderRest: p.reminderRest ?? d.reminderRest,
    reminderAmount: p.reminderAmount ?? d.reminderAmount,
    reminderSuffix: p.reminderSuffix ?? d.reminderSuffix,
    calmMessage: p.calmMessage ?? d.calmMessage,
    calmTitle: p.calmTitle ?? d.calmTitle,
    calmSub: p.calmSub ?? d.calmSub,
    emptyTitle: p.emptyTitle ?? d.emptyTitle,
    emptySub: p.emptySub ?? d.emptySub,
    emptyCtaLabel: p.emptyCtaLabel ?? d.emptyCtaLabel,
  }
}

// ─── Íconos propios de Avisos (transcritos del markup) ─────────────────

/** Ícono de tendencia (filas de aumento) — flecha ascendente con vértice,
 *  17×17, stroke 2.6. Distinto de `ReminderGlyph` (calendario). */
function TrendUpGlyph({ color }: { color: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 15l5-5 3.5 3.5L20 6" />
      <Path d="M15.5 6H20v4.5" />
    </Svg>
  )
}

/** Ícono de calendario de la fila-resumen — rect + ticks + marca en X abajo,
 *  17×17, stroke 2.4. NO es `CalendarGlyph` del header: mismo espíritu
 *  (calendario), geometría distinta (rx 2.5 no 3, marca inferior en X no en
 *  "+") — confirmado contra el markup, no es el mismo glyph reescalado. */
function ReminderGlyph({ color }: { color: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={4} y={5.5} width={16} height={15} rx={2.5} />
      <Path d="M4 9.5h16M8 3.5v3M16 3.5v3" />
      <Path d="M10 14l4 3.5M14 14l-4 3.5" />
    </Svg>
  )
}

/** Checkmark — reusado por el círculo de confirmación de cada fila de
 *  aumento (25px, `size=16`) y por la fila calma "Sin cambios..." (22px,
 *  mismo `size=16`: solo el círculo que lo envuelve cambia de tamaño). */
function CheckGlyph({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12.5l4.5 4.5L19 7" />
    </Svg>
  )
}

/** Punto "live" pulsante junto al eyebrow "POR PAGAR · ESTE MES" — ÚNICO dot
 *  animado de toda la vista (a diferencia de `GlowDot`, que es estático: ver
 *  nota del módulo). Transcribe `@keyframes fijosLive` (0%/100% opacity 0.4
 *  scale 0.85 → 50% opacity 1 scale 1.15, `1.6s ease-in-out infinite`) como
 *  un `withRepeat(withTiming(1, ...), -1, true)`: la ida (0→1) más la vuelta
 *  (1→0, por `reverse:true`) suman el ciclo completo, así que cada leg usa
 *  `decorativeDurations.liveDotPulse / 2`. El resplandor (`0 0 6px color`) es
 *  un `boxShadow` ESTÁTICO en la misma vista animada: como solo `opacity` y
 *  `transform` cambian por frame, la opacidad de la vista atenúa el dot Y su
 *  sombra juntos sin animar `boxShadow` en sí (prohibido).
 *  Reduced motion: `pulse` se fija en `0` (el extremo apagado/chico del
 *  rango) — mismo criterio que `UrgentHeaderDot`
 *  (fijos-proximos-parts/urgent-header-dot.tsx), que resuelve exactamente
 *  este mismo patrón de respiración. */
function LiveDot({ s }: { s: FijosSpec }) {
  const reduced = useReducedMotion()
  const pulse = useSharedValue(0)

  useEffect(() => {
    if (reduced) {
      cancelAnimation(pulse)
      pulse.value = 0
      return
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: decorativeDurations.liveDotPulse / 2, easing: motionEasings.warm }),
      -1,
      true,
    )
    return () => cancelAnimation(pulse)
  }, [reduced, pulse])

  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + pulse.value * 0.6,
    transform: [{ scale: 0.85 + pulse.value * 0.3 }],
  }))

  return (
    <Animated.View
      style={[styles.liveDot, { backgroundColor: s.liveDotBackground, boxShadow: `0 0 6px ${s.liveDotBackground}` }, style]}
    />
  )
}

/** Resuelve el 3er canal visual del chip (dot + tag) por tono. `upcoming` no
 *  lleva `tagShadow` (no existe ese campo en `FijosSpec` — confirmado en el
 *  markup, esos tags no dibujan box-shadow). */
function tickerToneStyle(
  s: FijosSpec,
  tone: FijosTickerTone,
): { dot: string; tagBackground: string; tagInk: string; tagShadow: string | undefined } {
  if (tone === 'today') {
    return { dot: s.tickerDotToday, tagBackground: s.tagTodayBackground, tagInk: s.tagTodayInk, tagShadow: s.tagTodayShadow }
  }
  if (tone === 'overdue') {
    return { dot: s.tickerDotOverdue, tagBackground: s.tagOverdueBackground, tagInk: s.tagOverdueInk, tagShadow: s.tagOverdueShadow }
  }
  return { dot: s.tickerDotUpcoming, tagBackground: s.tagUpcomingBackground, tagInk: s.tagUpcomingInk, tagShadow: undefined }
}

function TickerChip({ s, item }: { s: FijosSpec; item: FijosTickerItem }) {
  const tone = tickerToneStyle(s, item.tone)
  return (
    <View style={[styles.tickerChip, { experimental_backgroundImage: s.tickerChipGradientCss, boxShadow: s.tickerChipShadow }]}>
      <View style={[styles.tickerDot, { backgroundColor: tone.dot }]} />
      <Text style={[styles.tickerName, { color: s.tickerNameInk }]} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={[styles.tickerAmount, { color: s.tickerAmountInk }]} numberOfLines={1}>
        {item.amount}
      </Text>
      <View style={[styles.tickerTag, { backgroundColor: tone.tagBackground }, tone.tagShadow ? { boxShadow: tone.tagShadow } : null]}>
        <Text style={[styles.tickerTagText, { color: tone.tagInk }]} numberOfLines={1}>
          {item.tagLabel}
        </Text>
      </View>
    </View>
  )
}

/** Distancia horizontal EXACTA entre chips consecutivos (`gap:10px` en el
 *  markup) — también la distancia entre la última copia y la primera del
 *  loop, así que el desplazamiento seamless necesita "ancho de una copia +
 *  este gap" (ver `FijosTicker`). No es un token de motion (es una medida de
 *  layout, no una duración), pero sí es una constante compartida por 2
 *  lugares del cálculo — nombrada en vez de repetir el literal. */
const TICKER_GAP = 10
/** Ancho del fade de cada borde del pozo del ticker — aproximación en px del
 *  7%/93% del `mask-image` original (que es un porcentaje del ancho del
 *  propio pozo, ~321px en el teléfono ⇒ ~22px; 24 es el redondeo más cercano
 *  ya usado en este repo para este mismo efecto, ver `GastosFilter.filterFade`
 *  en gastos-screen.tsx, que también fija un ancho en vez de un %). */
const TICKER_FADE_WIDTH = 24

/**
 * Ticker horizontal de chips "POR PAGAR · ESTE MES" — transcribe
 * `@keyframes fijosTicker` (`from{translateX(-50%)} to{translateX(0)}`,
 * `30s linear infinite` sobre una lista duplicada).
 *
 * Loop sin costura: se mide el ancho de UNA copia (`onLayout` en el wrapper
 * de la primera copia) y se anima `translateX` de `-(copyWidth+TICKER_GAP)`
 * a `0` con `withRepeat(..., -1, false)` — sin `reverse`, cada repetición
 * REINICIA en el valor de arranque (confirmado contra
 * `node_modules/react-native-reanimated/src/animation/repeat.ts`: con
 * `reverse:false`, `startValue` es el valor que tenía el shared value al
 * arrancar el `withRepeat`, no el valor final del leg anterior), igual que
 * `animation-direction:normal` de CSS. Antes de medir (`copyWidth===0`) no
 * se anima nada — `translateX` queda en `0` (un array de transform con
 * `translateX:0`, nunca `undefined`).
 *
 * El fade de bordes: RN no tiene `mask-image`. Se porta con DOS vistas
 * `experimental_backgroundImage` superpuestas en los bordes del pozo (mismo
 * color sólido→transparente vía `withAlpha`), la misma técnica que ya usa
 * `GastosFilter` (`gastos-screen.tsx`, `styles.filterFade`) para el fade de
 * su fila de chips — acá se necesitan las DOS mitades (izquierda Y derecha)
 * en vez de una sola porque el mockup fadea ambos bordes.
 *
 * Reduced motion: sin animación, `translateX` en `0` — la lista se ve
 * arrancando desde la primera copia completa, nunca cortada a la mitad.
 */
function FijosTicker({ s, items }: { s: FijosSpec; items: FijosTickerItem[] }) {
  const reduced = useReducedMotion()
  const translateX = useSharedValue(0)
  const [copyWidth, setCopyWidth] = useState(0)

  const onLayoutCopy = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (w > 0 && w !== copyWidth) setCopyWidth(w)
  }

  const shiftWidth = copyWidth > 0 ? copyWidth + TICKER_GAP : 0

  useEffect(() => {
    if (reduced || shiftWidth <= 0) {
      cancelAnimation(translateX)
      translateX.value = 0
      return
    }
    translateX.value = -shiftWidth
    translateX.value = withRepeat(withTiming(0, { duration: decorativeDurations.tickerLoop, easing: Easing.linear }), -1, false)
    return () => cancelAnimation(translateX)
  }, [reduced, shiftWidth, translateX])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  const fadeLeftCss = `linear-gradient(90deg, ${s.tickerWellBackground}, ${withAlpha(s.tickerWellBackground, 0)})`
  const fadeRightCss = `linear-gradient(90deg, ${withAlpha(s.tickerWellBackground, 0)}, ${s.tickerWellBackground})`

  return (
    <View style={[styles.tickerWell, { backgroundColor: s.tickerWellBackground, boxShadow: s.tickerWellShadow }]}>
      <Animated.View style={[styles.tickerRow, animStyle]}>
        <View style={styles.tickerCopy} onLayout={onLayoutCopy}>
          {items.map((item) => (
            <TickerChip key={`a-${item.id}`} s={s} item={item} />
          ))}
        </View>
        <View style={styles.tickerCopy}>
          {items.map((item) => (
            <TickerChip key={`b-${item.id}`} s={s} item={item} />
          ))}
        </View>
      </Animated.View>
      <View pointerEvents="none" style={[styles.tickerFade, styles.tickerFadeLeft, { experimental_backgroundImage: fadeLeftCss }]} />
      <View pointerEvents="none" style={[styles.tickerFade, styles.tickerFadeRight, { experimental_backgroundImage: fadeRightCss }]} />
    </View>
  )
}

/** Fila de aumento — ícono de tendencia + párrafo con spans anidados (mismo
 *  patrón que `PaidProgress` del hero: `<Text>` anidado para pisar color/peso
 *  de un tramo puntual) + círculo de check. `$fromAmount` NO lleva su propio
 *  peso/color (hereda el 700/`aumentoRowInk` del párrafo) — confirmado en el
 *  markup, a diferencia del resto de los tramos que sí van en 900. */
function HikeRow({ s, row }: { s: FijosSpec; row: FijosHikeRow }) {
  return (
    <View style={[styles.hikeRow, { borderBottomColor: s.aumentoDivider }]}>
      <View
        style={[
          styles.hikeIconTile,
          { backgroundColor: s.aumentoTileBackground ?? 'transparent', boxShadow: s.aumentoTileShadow },
          s.aumentoTileGradientCss ? { experimental_backgroundImage: s.aumentoTileGradientCss } : null,
        ]}
      >
        <TrendUpGlyph color={s.aumentoIconInk} />
      </View>
      <Text style={[styles.hikeText, { color: s.aumentoRowInk }]}>
        <Text style={{ fontWeight: '900', color: s.aumentoNameInk }}>{row.name}</Text> <Text style={{ fontWeight: '900' }}>{row.pctLabel}</Text> ·{' '}
        {row.fromAmount} <Text style={{ fontWeight: '900', color: s.aumentoArrowInk }}>→</Text> <Text style={{ fontWeight: '900' }}>{row.toAmount}</Text>
      </Text>
      <View style={[styles.checkCircleHike, { boxShadow: s.checkCircleShadow }]}>
        <CheckGlyph color={s.checkGlyphInk} />
      </View>
    </View>
  )
}

/** Fila-resumen de calendario — SIEMPRE la última del bloque de aumentos
 *  (sin `borderBottom`, `alignItems:'flex-start'` porque el texto puede
 *  ocupar 2 líneas), sin círculo de check (no es una fila dismissible, es un
 *  agregado). `reminderSuffix` solo lo usa A5 ("— pagalos para no
 *  acumular"). */
function ReminderRow({
  s,
  label,
  rest,
  amount,
  suffix,
}: {
  s: FijosSpec
  label: string
  rest: string
  amount: string
  suffix: string
}) {
  return (
    <View style={styles.reminderRow}>
      <View
        style={[
          styles.hikeIconTile,
          { backgroundColor: s.reminderTileBackground ?? 'transparent', boxShadow: s.aumentoTileShadow },
          s.reminderTileGradientCss ? { experimental_backgroundImage: s.reminderTileGradientCss } : null,
        ]}
      >
        <ReminderGlyph color={s.aumentoIconInk} />
      </View>
      <Text style={[styles.reminderText, { color: s.aumentoRowInk }]}>
        <Text style={{ fontWeight: '900', color: s.aumentoNameInk }}>{label}</Text> · {rest} <Text style={{ fontWeight: '900' }}>{amount}</Text>
        {suffix ? ` ${suffix}` : ''}
      </Text>
    </View>
  )
}

/** Cuerpo "default": ticker o pozo estático + aumentos o fila calma. Cubre
 *  A1/A2/A3/A5 (mismo layout de 2 sub-secciones, distinto contenido). */
function AvisosDefaultBody({ s, c }: { s: FijosSpec; c: FijosAvisosContent }) {
  const hasTicker = c.tickerItems.length > 0
  const hasHikes = c.hikeRows.length > 0
  return (
    <>
      <View style={styles.avisosEyebrowRow}>
        <Text style={[styles.avisosEyebrowText, { color: s.sectionEyebrowInk }]}>POR PAGAR · ESTE MES</Text>
        {hasTicker ? <LiveDot s={s} /> : null}
      </View>
      {hasTicker ? (
        <FijosTicker s={s} items={c.tickerItems} />
      ) : (
        <View style={[styles.tickerStaticWell, { backgroundColor: s.tickerWellBackground, boxShadow: s.tickerWellShadow }]}>
          <Text style={[styles.tickerStaticText, { color: s.green }]}>{c.staticMessage}</Text>
        </View>
      )}

      <View style={styles.aumentosHeaderRow}>
        <Text style={[styles.avisosEyebrowText, { color: s.sectionEyebrowInk }]}>AUMENTOS Y RECORDATORIOS</Text>
        <View style={[styles.aumentosDividerLine, { backgroundColor: s.aumentoDivider }]} />
      </View>
      {hasHikes ? (
        <View style={styles.aumentosList}>
          {c.hikeRows.map((row) => (
            <HikeRow key={row.id} s={s} row={row} />
          ))}
          <ReminderRow s={s} label={c.reminderLabel} rest={c.reminderRest} amount={c.reminderAmount} suffix={c.reminderSuffix} />
        </View>
      ) : (
        <View style={styles.calmRow}>
          <View style={[styles.checkCircleCalm, { boxShadow: s.checkCircleShadow }]}>
            <CheckGlyph color={s.checkGlyphInk} />
          </View>
          <Text style={[styles.calmText, { color: s.faint }]}>{c.calmMessage}</Text>
        </View>
      )}
    </>
  )
}

/** A4 — todo tranquilo: reemplaza LAS 2 sub-secciones por un único bloque
 *  centrado (sin Brot grande — a diferencia del hero, acá el único Brot es
 *  el del header, ver `FijosAvisos`). */
function AvisosCalmBody({ s, c }: { s: FijosSpec; c: FijosAvisosContent }) {
  return (
    <View style={styles.avisosCalmBlock}>
      <Text style={[styles.avisosMessageTitle, { color: s.text }]}>{c.calmTitle}</Text>
      <Text style={[styles.avisosMessageSub, styles.avisosMessageSubCalm, { color: s.sub }]}>{c.calmSub}</Text>
    </View>
  )
}

/** A6 — sin fijos: mismo criterio que A4 más el CTA (reusa `CtaPill`, ver su
 *  docblock más arriba). */
function AvisosEmptyBody({
  s,
  c,
  onPressEmptyCta,
}: {
  s: FijosSpec
  c: FijosAvisosContent
  onPressEmptyCta?: () => void
}) {
  return (
    <View style={styles.avisosEmptyBlock}>
      <Text style={[styles.avisosMessageTitle, { color: s.text }]}>{c.emptyTitle}</Text>
      <Text style={[styles.avisosMessageSub, styles.avisosMessageSubEmpty, { color: s.sub }]}>{c.emptySub}</Text>
      <View style={styles.ctaSpacing}>
        <CtaPill
          label={c.emptyCtaLabel}
          ink={AVISOS_EMPTY_CTA_INK}
          gradientCss={AVISOS_EMPTY_CTA_GRADIENT}
          shadow={AVISOS_EMPTY_CTA_SHADOW}
          onPress={onPressEmptyCta}
        />
      </View>
    </View>
  )
}

export interface FijosAvisosProps extends Partial<FijosAvisosContent> {
  mode: FijosMode
  /** A1 con avisos (default/actual) · A2 sin aumentos · A3 nada por pagar ·
   *  A4 todo tranquilo · A5 urgente · A6 sin fijos. Cada variante trae sus
   *  propios defaults (idénticos al mockup) para los campos de
   *  `FijosAvisosContent` — pasalos solo para pisar un valor puntual. */
  variant?: FijosAvisosVariant
  /** Anima el Brot del header. Default `true` → el preview aprobado late
   *  igual que siempre; el cableado real lo apaga por perf, mismo criterio
   *  que `FijosHero`/`animated`. */
  animated?: boolean
  /** CTA "+ Agregar tu primer fijo" (A6). */
  onPressEmptyCta?: () => void
}

export function FijosAvisos(props: FijosAvisosProps) {
  const { mode, animated = true, onPressEmptyCta } = props
  const variant = props.variant ?? 'A1'
  const s = FIJOS_SPEC[mode]
  const c = withAvisosDefaults(AVISOS_CONTENT[variant], props)

  const badgeBackground = c.badgeTone === 'urgent' ? AVISOS_URGENT_BADGE_BACKGROUND : s.avisosBadgeBackground
  const badgeInk = c.badgeTone === 'urgent' ? AVISOS_URGENT_BADGE_INK : s.avisosBadgeInk
  const cardShadow = c.cardUrgent ? `${s.avisosCardShadow}, ${s.urgentRing}` : s.avisosCardShadow

  return (
    <View
      style={[
        styles.avisosCard,
        { backgroundColor: s.avisosCardBackground, boxShadow: cardShadow },
        s.avisosCardGradientCss ? { experimental_backgroundImage: s.avisosCardGradientCss } : null,
      ]}
    >
      <View style={styles.avisosHeaderRow}>
        <View style={styles.avisosTitleRow}>
          <Text style={[styles.avisosTitle, { color: s.avisosTitleInk }]}>Avisos</Text>
          <View style={[styles.avisosBadge, { backgroundColor: badgeBackground }]}>
            <Text style={[styles.avisosBadgeText, { color: badgeInk }]}>{c.badgeCount}</Text>
          </View>
        </View>
        <View style={styles.avisosBrotSlot}>
          <BrotMascot pose={c.brotPose} size={44} shadow={false} animated={animated} />
        </View>
      </View>

      {variant === 'A4' ? (
        <AvisosCalmBody s={s} c={c} />
      ) : variant === 'A6' ? (
        <AvisosEmptyBody s={s} c={c} onPressEmptyCta={onPressEmptyCta} />
      ) : (
        <AvisosDefaultBody s={s} c={c} />
      )}
    </View>
  )
}

// ─── Estilos ────────────────────────────────────────────────────────
// UN solo StyleSheet.create para todo el kit — Task 4 (Avisos) y Task 5
// (tabs/categorías/filas) le agregan más claves a este mismo objeto, no
// crean uno nuevo (mismo patrón que gastos-screen.tsx).

const styles = StyleSheet.create({
  pressedDim: { opacity: 0.65 },

  // ① header
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerLeft: { flexShrink: 1, minWidth: 0 },
  // lineHeight con headroom (~1.18×) sobre el fontSize: en Nunito 900 un
  // lineHeight == fontSize clippea el ascender en RN (mismo gotcha que
  // documenta gastos-screen.tsx para su título).
  title: { fontSize: 32, fontWeight: '900', fontFamily: nunitoFamily('900'), lineHeight: 38 },
  cycTrig: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  cycDotWrap: { width: 7, height: 7, alignItems: 'center', justifyContent: 'center' },
  cycDotGlow: { position: 'absolute', width: 13, height: 13, borderRadius: 6.5 },
  cycDot: { width: 7, height: 7, borderRadius: 3.5 },
  cycTrigLabel: { fontSize: 13, fontWeight: '800', fontFamily: nunitoFamily('800') },
  cycCaret: { fontSize: 9, opacity: 0.75 },
  headerIconBtn: {
    width: 48,
    height: 48,
    borderRadius: FIJOS_RADII.tile,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ② hero — contenedor + fila superior
  hero: { position: 'relative', borderRadius: FIJOS_RADII.hero, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16 },
  heroParticles: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: FIJOS_RADII.hero, overflow: 'hidden' },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroDotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  heroDotGlowCircle: { position: 'absolute', width: 15, height: 15, borderRadius: 7.5 },
  heroDot: { width: 8, height: 8, borderRadius: 4 },
  heroTag: { fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.61 },
  heroChip: { borderRadius: FIJOS_RADII.heroTag, paddingVertical: 6, paddingHorizontal: 10 },
  heroChipText: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800') },

  // pozo "Te falta pagar" / "Total de la edición" (shape default)
  well: { marginTop: 14, borderRadius: FIJOS_RADII.well, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 16 },
  wellLabel: { fontSize: 13, fontWeight: '800', fontFamily: nunitoFamily('800') },
  wellAmount: {
    fontSize: 42,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.84,
    lineHeight: 48,
    marginTop: 5,
  },
  statusChip: {
    alignSelf: 'flex-start',
    borderRadius: FIJOS_RADII.alertChip,
    paddingVertical: 5,
    paddingHorizontal: 11,
    marginTop: 11,
  },
  statusChipText: { fontSize: 11.5, fontWeight: '900', fontFamily: nunitoFamily('900') },

  // "Pagaste X de Y fijos" + barra + "$paid / de $total"
  paidRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 17 },
  paidLabel: { fontSize: 13.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  pctLabel: { fontSize: 14, fontWeight: '900', fontFamily: nunitoFamily('900') },
  segRow: { flexDirection: 'row', gap: 3, marginTop: 10 },
  segCell: { flex: 1, height: 15, borderRadius: 4 },
  paidTotalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 9 },
  paidAmount: { fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  totalAmount: { fontSize: 11.5, fontWeight: '700', fontFamily: nunitoFamily('700') },

  // "TE QUEDA DISPONIBLE"
  availableCard: {
    marginTop: 17,
    borderRadius: FIJOS_RADII.availableCard,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  availableLabel: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.05 },
  availableValue: { fontSize: 27, fontWeight: '900', fontFamily: nunitoFamily('900'), marginTop: 3, lineHeight: 31 },
  availableRight: { alignItems: 'flex-end' },
  availableOf: { fontSize: 11, fontWeight: '700', fontFamily: nunitoFamily('700') },
  // Sin marginTop: el markup (líneas 78/377) apila los dos divs de la
  // derecha sin gap — el spacing lo da solo el line-height de cada uno.
  availableNote: { fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  // E5: la nota de alerta engorda a 900 (el markup la dibuja más pesada que
  // la nota calma "21% va a fijos", que es 800).
  availableNoteWarning: { fontWeight: '900', fontFamily: nunitoFamily('900') },

  // E1 — bloque de celebración
  zeroBlock: { alignItems: 'center', marginTop: 12 },
  zeroBadge: { borderRadius: FIJOS_RADII.alertChip, paddingVertical: 5, paddingHorizontal: 11, marginTop: 10 },
  zeroBadgeText: { fontSize: 10.5, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: 0.63 },
  zeroTitle: { fontSize: 22, fontWeight: '900', fontFamily: nunitoFamily('900'), lineHeight: 26, marginTop: 10, textAlign: 'center' },
  zeroSub: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 18,
    marginTop: 5,
    maxWidth: 250,
    textAlign: 'center',
  },

  // E6 — vacío de usuario nuevo. padding:6px 4px 4px literal (línea 501) —
  // el paddingTop se había perdido en la primera pasada (fix round 1).
  emptyBlock: { alignItems: 'center', marginTop: 12, paddingTop: 6, paddingHorizontal: 4, paddingBottom: 4 },
  emptyTitle: { fontSize: 19, fontWeight: '900', fontFamily: nunitoFamily('900'), lineHeight: 22, marginTop: 8, textAlign: 'center' },
  emptySub: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 19,
    marginTop: 6,
    maxWidth: 270,
    textAlign: 'center',
  },

  // E8 — fuera de ciclo
  outOfCycleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 14 },
  outOfCycleBrotSlot: { flexShrink: 0, marginTop: 2 },
  outOfCycleTexts: { flex: 1, minWidth: 0 },
  outOfCycleTitle: { fontSize: 17, fontWeight: '900', fontFamily: nunitoFamily('900'), lineHeight: 21 },
  outOfCycleSub: { fontSize: 12, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 17, marginTop: 4 },
  outOfCycleWell: {
    marginTop: 13,
    borderRadius: FIJOS_RADII.chip,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  outOfCycleWellLabel: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  outOfCycleWellAmount: { fontSize: 15, fontWeight: '900', fontFamily: nunitoFamily('900') },

  // CTA compartido (E6/E8, y A6 de Avisos)
  ctaSpacing: { alignSelf: 'stretch', marginTop: 15 },
  ctaSpacingSm: { marginTop: 12 },
  ctaPill: { borderRadius: FIJOS_RADII.chipSm, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  ctaPillText: { fontSize: 14, fontWeight: '900', fontFamily: nunitoFamily('900'), textAlign: 'center' },

  // ③ Avisos — card + header (título/badge/Brot)
  avisosCard: { borderRadius: FIJOS_RADII.card, paddingTop: 17, paddingHorizontal: 16, paddingBottom: 14 },
  avisosHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avisosTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avisosTitle: { fontSize: 15, fontWeight: '900', fontFamily: nunitoFamily('900') },
  avisosBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: FIJOS_RADII.avisosBadge,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avisosBadgeText: { fontSize: 10.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  // Brot del header "cuelga" ligeramente afuera de su celda — margin negativo
  // literal del markup (`margin:-6px -2px -10px 0`).
  avisosBrotSlot: { marginTop: -6, marginRight: -2, marginBottom: -10 },

  // "POR PAGAR · ESTE MES" (eyebrow compartido con "AUMENTOS Y RECORDATORIOS")
  avisosEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 2 },
  avisosEyebrowText: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.47 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },

  // Ticker — pozo + fila animada + chip + fades de borde
  tickerWell: { position: 'relative', overflow: 'hidden', marginTop: 9, borderRadius: FIJOS_RADII.tickerWell, paddingVertical: 9 },
  tickerStaticWell: { marginTop: 9, borderRadius: FIJOS_RADII.tickerWell, padding: 15 },
  tickerStaticText: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800'), textAlign: 'center' },
  tickerRow: { flexDirection: 'row', alignItems: 'center', gap: TICKER_GAP, paddingHorizontal: 10 },
  tickerCopy: { flexDirection: 'row', alignItems: 'center', gap: TICKER_GAP },
  tickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: FIJOS_RADII.chipSm,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  tickerDot: { width: 8, height: 8, borderRadius: 4 },
  tickerName: { fontSize: 12.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  tickerAmount: { fontSize: 12.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  tickerTag: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 7 },
  tickerTagText: { fontSize: 8, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: 0.32 },
  tickerFade: { position: 'absolute', top: 0, bottom: 0, width: TICKER_FADE_WIDTH },
  tickerFadeLeft: { left: 0 },
  tickerFadeRight: { right: 0 },

  // "AUMENTOS Y RECORDATORIOS" — filas de aumento + fila-resumen + fila calma
  aumentosHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingHorizontal: 2 },
  aumentosDividerLine: { flex: 1, height: 1.5 },
  aumentosList: { marginTop: 2, paddingHorizontal: 2 },
  hikeRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1.5 },
  hikeIconTile: { width: 40, height: 40, borderRadius: FIJOS_RADII.aumentoTile, alignItems: 'center', justifyContent: 'center' },
  hikeText: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 17.55 },
  checkCircleHike: { width: 25, height: 25, borderRadius: 12.5, alignItems: 'center', justifyContent: 'center' },
  reminderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingTop: 12, paddingBottom: 2 },
  reminderText: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 17.5 },
  calmRow: {
    marginTop: 2,
    paddingTop: 16,
    paddingHorizontal: 2,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  checkCircleCalm: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  calmText: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800') },

  // A4 (todo tranquilo) / A6 (sin fijos) — bloque centrado que reemplaza las
  // 2 sub-secciones de arriba
  avisosCalmBlock: { alignItems: 'center', paddingTop: 14, paddingHorizontal: 8, paddingBottom: 8 },
  avisosEmptyBlock: { alignItems: 'center', paddingTop: 12, paddingHorizontal: 8, paddingBottom: 6 },
  avisosMessageTitle: { fontSize: 18, fontWeight: '900', fontFamily: nunitoFamily('900'), textAlign: 'center' },
  avisosMessageSub: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 18.75,
    marginTop: 6,
    textAlign: 'center',
  },
  avisosMessageSubCalm: { maxWidth: 280 },
  avisosMessageSubEmpty: { maxWidth: 290 },
})
