// @i18n-ignore-file — kit de rediseño bajo gate; copy literal, i18n en el pase posterior.
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Path, Rect } from 'react-native-svg'
import { BrotMascot } from '@/components/brot/brot-mascot'
import { BrotParticles } from '@/components/brot/brot-particles'
import { FIJOS_RADII, FIJOS_SPEC, type FijosMode, type FijosSpec } from '@/components/redesign/fijos/fijos-spec'
import { neoParticlePresets } from '@/theme/neo-tokens'
import { usePressScale } from '@/hooks/use-press-scale'
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

/** Pill de acción de los estados especiales (E6 "+ Agregar tu primer fijo",
 *  E8 "✓ Confirmar cobro") — mismo patrón que `GastosEmptyCta`: usePressScale
 *  0.94 + gradiente/sombra por prop, sin Pressable si no hay `onPress` (el
 *  kit no inventa handlers; el destino de ninguno de los dos está definido
 *  todavía). */
function HeroCtaPill({
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
        <HeroCtaPill
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
        <HeroCtaPill
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

  // CTA compartido (E6/E8)
  ctaSpacing: { alignSelf: 'stretch', marginTop: 15 },
  ctaSpacingSm: { marginTop: 12 },
  ctaPill: { borderRadius: FIJOS_RADII.chipSm, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  ctaPillText: { fontSize: 14, fontWeight: '900', fontFamily: nunitoFamily('900'), textAlign: 'center' },
})
