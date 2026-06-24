import { useEffect } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { usePressScale } from '@/hooks/use-press-scale'

/**
 * Botón inline "Pagar" — visualmente único y referenciado al pago.
 *
 * Diseño:
 *   · Pill con ícono $ + label "Pagar" — texto + fill = inequívocamente
 *     tappable, y el verbo lo separa semánticamente del monto contiguo
 *     (el círculo icon-only se leía como insignia/estado). hitSlop 8 ≥44pt.
 *   · Tinted on-brand por status: fill + texto + borde derivados del
 *     ACCENT del status (mismo source-of-truth que el status badge del
 *     row) — pending=peach / overdue=rojo. Habla el mismo idioma que el
 *     badge; el verde forest queda libre para su único significado: PAID.
 *     (Antes era un fill verde/rojo sólido + texto blanco — se sentía
 *     fuera del design system: la app no usa fills saturados para
 *     acciones, y el verde "pending" contradecía el badge peach del row.)
 *   · Ícono `attach-money` (símbolo $) — universalmente asociado a
 *     pago. Mejor que `check` (que es post-confirmación / done) y
 *     mejor que `paid` (mismo problema).
 *   · Borde 1.5pt en tono más profundo del bg → finish curado.
 *   · Press scale 0.95 (sutil — el target del pill ya es grande).
 *   · Pulse halo continuo PARA OVERDUE: círculo BG-only que crece
 *     y se desvanece en loop (1.5s ease-in-out, scale 1→1.45,
 *     opacity 0.45→0). Skip si reduceMotion activo.
 *
 * Decisiones de poda visual (gpt-taste + impeccable):
 *   · NO inner highlight (línea blanca alpha top): probada como
 *     "lift" sutil, en práctica se leía como una línea sobre el
 *     símbolo $ — ruido visual. Removida.
 *
 * Performance: pulse en UI thread vía Reanimated; cleanup
 * cancelAnimation en unmount.
 */
export function InlinePayButton({
  status,
  pressScale,
  onPress,
  bg,
  fg,
  border,
}: {
  status: 'pending' | 'overdue'
  pressScale: ReturnType<typeof usePressScale>
  onPress: () => void
  /** Fill tinteado / texto+ícono / borde — derivados del accent del status
   *  (mismo computeAccent que el status badge del row). El fg es el solid
   *  del accent (también el color del halo de overdue). */
  bg: string
  fg: string
  border: string
}) {
  const reduceMotion = useReducedMotion()
  const pulse = useSharedValue(0)

  // Pulse loop SOLO en overdue. Pulse value oscila 0 → 1 en cada
  // ciclo; el animatedStyle interpola a scale + opacity.
  useEffect(() => {
    if (status === 'overdue' && !reduceMotion) {
      pulse.value = 0
      pulse.value = withRepeat(
        // @motion-allow: 1500ms overdue pulse — calibrado para que la respiración sea perceptible sin ser intrusiva. Entre decorativeDurations.pulse (1200) y pulseSlow (2400) por diseño.
        withTiming(1, {
          duration: 1500,
          easing: Easing.bezier(0.4, 0, 0.6, 1),
          reduceMotion: ReduceMotion.System,
        }),
        -1, // infinite
        false, // no reverse — el reset a 0 da el efecto "respiración"
      )
    } else {
      pulse.value = 0
    }
    return () => {
      cancelAnimation(pulse)
    }
  }, [status, reduceMotion, pulse])

  const haloStyle = useAnimatedStyle(() => ({
    // Scale 1 → 1.45 (halo crece desde el botón).
    // Opacity 0.45 → 0 (se desvanece como pulse).
    transform: [{ scale: 1 + pulse.value * 0.45 }],
    opacity: 0.45 * (1 - pulse.value),
  }))

  const isOverdue = status === 'overdue'

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={
        isOverdue ? 'Pagar — fijo en mora' : 'Pagar'
      }
      accessibilityHint="Abre el sheet para confirmar el monto pagado"
      style={styles.inlinePayWrap}
    >
      {/* Halo pulse (solo overdue, layered atrás del botón) */}
      {isOverdue ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.inlinePayHalo,
            { backgroundColor: fg },
            haloStyle,
          ]}
        />
      ) : null}

      <Animated.View
        style={[
          styles.inlinePayBtn,
          { backgroundColor: bg, borderColor: border },
          pressScale.animatedStyle,
        ]}
      >
        <MaterialIcons name="attach-money" size={16} color={fg} />
        <Text style={[styles.inlinePayLabel, { color: fg }]}>Pagar</Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // Botón inline "Pagar" — visualmente único + referenciado al pago
  // (gpt-taste + ui-ux-pro-max + emil). 40pt visual + hitSlop 8px =
  // ~56pt efectivo (HIG ≥44pt). Brand-colored según status — no
  // genérico negro. Ícono `attach-money` (símbolo $) en blanco.
  // El wrap maneja layout + alineación del halo pulse (overdue);
  // el btn lleva el visual chrome.
  inlinePayWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    // Aire entre el monto (dato) y el pill (acción) → leen como columnas
    // distintas, no como "dos cosas de plata" pegadas.
    marginLeft: 10,
  },
  inlinePayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 11,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  inlinePayLabel: {
    // 14px/800 = "large text" (≥14px bold) → umbral WCAG 3:1, que el fill
    // tinteado peach/rojo cumple en light y dark (verificado).
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  // Halo pulse continuo para overdue — se renderiza absoluto detrás
  // del botón, escalando y desvaneciéndose en loop. Color = mismo bg
  // del botón pero alpha-modulado vía el animatedStyle (NO bg-alpha
  // hardcodeado para que el dark mode también funcione).
  inlinePayHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 11,
  },
})
