/**
 * Vacío de la sección "Todos tus fijos" (tabs + categorías + filas).
 *
 * CALCO ADAPTADO del pozo vacío del feed de Gastos —
 * `GastosMovementsEmptyWell` en `components/redesign/gastos/gastos-screen.tsx`.
 * Es una COPIA a propósito (pedido del owner), no una generalización: el de
 * Gastos queda intacto y este resuelve sus tokens contra `FIJOS_SPEC`, con
 * copy propio de Fijos. Un componente compartido habría obligado a
 * parametrizar dos specs distintos por cada literal, que es justo el
 * acoplamiento que el rediseño evita entre secciones.
 *
 * Qué se calcó, literal:
 *   · `RiseView translateY={12}` como raíz + `marginTop` de separación;
 *   · pozo INSET (`insBg` + `ins`) con radio 22, padding 18, gap 9;
 *   · Brot sin sombra + título 13/900 + bajada 11.5/700 centrada;
 *   · pill de CTA con `usePressScale(0.94)` y gradiente/sombra por token.
 *
 * Qué NO se calcó, y por qué:
 *   · Las FILAS FANTASMA (`ghostRows`, el molde punteado EV6 de Gastos). El
 *     molde necesita `dashStroke` y `ghostFill`, dos tokens que existen en
 *     `GASTOS_SPEC` y NO en `FIJOS_SPEC`. Inventar esos dos hex para Fijos
 *     sería meter color fuera del design system, así que se calca la forma
 *     v1 del pozo (bloque centrado) y nada más. Si algún día el handoff de
 *     Fijos define su punteado, el molde entra acá sin tocar el resto.
 *
 * El componente es TONTO: no sabe por qué la lista está vacía. Los tres casos
 * (sin fijos en la cuenta / ninguno cae en este ciclo / la tab activa quedó
 * sin fijos) los resuelve `neo-fijos-screen.tsx`, que es quien tiene los
 * datos, y le pasa copy + CTA ya decididos.
 */
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated from 'react-native-reanimated'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import { RiseView } from '@/components/home/animated/rise-view'
import {
  AVISOS_EMPTY_CTA_GRADIENT,
  AVISOS_EMPTY_CTA_INK,
  AVISOS_EMPTY_CTA_SHADOW,
} from '@/components/redesign/fijos/fijos-screen'
import { FIJOS_SPEC, type FijosMode } from '@/components/redesign/fijos/fijos-spec'
import { usePressScale } from '@/hooks/use-press-scale'
import { nunitoFamily } from '@/theme/typography'

export interface FijosListEmptyStateProps {
  mode: FijosMode
  title: string
  sub: string
  /** Sin `ctaLabel` el pozo muestra solo Brot + título + bajada. Los vacíos
   *  que NO se resuelven creando un fijo (tab sin ítems, ciclo sin fijos) no
   *  llevan botón: el arreglo es cambiar de tab o esperar al ciclo. */
  ctaLabel?: string
  onPressCta?: () => void
  /** Pose de Brot. `wave` para el vacío de bienvenida (sin fijos en la
   *  cuenta, mismo gesto que el hero E6), `idle` para el resto. */
  brotPose?: BrotPose
  /** `false` en la pantalla viva — mismo convenio de perf que el resto del
   *  cableado de Fijos (los Brot del hero y de Avisos también van quietos). */
  animated?: boolean
}

export function FijosListEmptyState({
  mode,
  title,
  sub,
  ctaLabel,
  onPressCta,
  brotPose = 'idle',
  animated = false,
}: FijosListEmptyStateProps) {
  const s = FIJOS_SPEC[mode]
  return (
    <RiseView translateY={12} style={styles.spacing}>
      {/* Dos cosas, las dos deliberadas:
          · el `boxShadow` vive en ESTE hijo y no en el nodo que anima
            RiseView — material decorativo sobre un nodo que anima Reanimated
            se recorta. Misma estructura que el pozo de Gastos;
          · SIN `accessible` en el pozo: agrupar el bloque entero como un solo
            nodo se traga el botón de adentro (iOS deja de exponer el
            Pressable anidado). Título y bajada son `<Text>` reales, el lorito
            los lee en orden y el CTA queda como su propio control. */}
      <View style={[styles.well, { backgroundColor: s.insBg ?? 'transparent', boxShadow: s.ins }]}>
        <BrotMascot pose={brotPose} size={56} shadow={false} animated={animated} />
        <Text style={[styles.title, { color: s.text }]}>{title}</Text>
        <Text style={[styles.sub, { color: s.sub }]}>{sub}</Text>
        {ctaLabel ? <FijosEmptyCta label={ctaLabel} onPress={onPressCta} /> : null}
      </View>
    </RiseView>
  )
}

/**
 * Pill del CTA — calco de `GastosEmptyCta` (usePressScale 0.94 + gradiente y
 * sombra por token). Los 3 literales de color son los MISMOS que usa el CTA
 * del estado A6 de Avisos ("sin fijos"), importados de su módulo: el usuario
 * ve los dos botones en la misma pantalla y tienen que ser el mismo botón.
 */
function FijosEmptyCta({ label, onPress }: { label: string; onPress?: () => void }) {
  const press = usePressScale({ pressedScale: 0.94 })
  const inner = (
    <View
      style={[
        styles.cta,
        {
          experimental_backgroundImage: AVISOS_EMPTY_CTA_GRADIENT,
          boxShadow: AVISOS_EMPTY_CTA_SHADOW,
        },
      ]}
    >
      <Text style={[styles.ctaText, { color: AVISOS_EMPTY_CTA_INK }]}>{label}</Text>
    </View>
  )
  if (!onPress) return inner
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // El pill mide ~34pt de alto: el hitSlop lo lleva por arriba del mínimo
      // de 44pt sin engordar el botón dibujado.
      hitSlop={{ bottom: 8, left: 12, right: 12, top: 8 }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      {inner}
    </AnimatedPressable>
  )
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

const styles = StyleSheet.create({
  spacing: { marginTop: 4 },
  well: { borderRadius: 22, padding: 18, alignItems: 'center', gap: 9 },
  title: { fontSize: 13, fontWeight: '900', fontFamily: nunitoFamily('900'), textAlign: 'center' },
  sub: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: -4,
    lineHeight: 16,
  },
  cta: { borderRadius: 15, marginTop: 3, paddingVertical: 9, paddingHorizontal: 15 },
  ctaText: { fontSize: 12, fontWeight: '900', fontFamily: nunitoFamily('900') },
})
