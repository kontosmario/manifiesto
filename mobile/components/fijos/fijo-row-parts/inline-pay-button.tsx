import { useEffect } from 'react'
import { Pressable, StyleSheet } from 'react-native'
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
 *   · Círculo 40pt + hitSlop 8 = ~56pt efectivo (HIG/MD ≥44pt).
 *   · Brand color por status: forest-deep (pending, "go") /
 *     red-brand (overdue, "urgente"). Bg sólido + icono blanco
 *     reads como primario, no genérico negro.
 *   · Ícono `attach-money` (símbolo $) — universalmente asociado a
 *     pago. Mejor que `check` (que es post-confirmación / done) y
 *     mejor que `paid` (mismo problema).
 *   · Borde 1.5pt en tono más profundo del bg → finish curado.
 *   · Press scale 0.88 (pronunciado para icon-only).
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
}: {
  status: 'pending' | 'overdue'
  pressScale: ReturnType<typeof usePressScale>
  onPress: () => void
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
  // Paleta brand-aware. Light: deep-forest verde / deep-red rojo.
  // Dark: variantes brand-bright para contraste con surfaceMuted.
  const bg = isOverdue ? '#A8211B' : '#297811' // forest deep / red brand
  const borderColor = isOverdue ? '#7A1810' : '#1F5A0D' // 1 stop darker

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
            { backgroundColor: bg },
            haloStyle,
          ]}
        />
      ) : null}

      <Animated.View
        style={[
          styles.inlinePayBtn,
          { backgroundColor: bg, borderColor },
          pressScale.animatedStyle,
        ]}
      >
        <MaterialIcons name="attach-money" size={22} color="#FFFFFF" />
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
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  inlinePayBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  // Halo pulse continuo para overdue — se renderiza absoluto detrás
  // del botón, escalando y desvaneciéndose en loop. Color = mismo bg
  // del botón pero alpha-modulado vía el animatedStyle (NO bg-alpha
  // hardcodeado para que el dark mode también funcione).
  inlinePayHalo: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 999,
  },
})
