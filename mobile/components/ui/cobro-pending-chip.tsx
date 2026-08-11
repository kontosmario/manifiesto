import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { useCobroPending } from '@/features/finance/use-cobro-pending'
import { usePressScale } from '@/hooks/use-press-scale'
import { decorativeDurations, motionEasings } from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

type Surface = 'hero' | 'header'

interface CobroPendingChipProps {
  /** Días desde el día de cobro. 0 → "Cobra hoy", N → "+N días sin cobrar". */
  daysOverdue: number
  /** 'hero' = sobre la card oscura del Home (crema sobre durazno).
   *  'header' = sobre el fondo del tab (ámbar theme-aware). */
  surface?: Surface
  /** Pulso de escala sutil. Lo usa solo el hero; en los headers alcanza
   *  con el BreatheDot para no sobre-animar en todas las pantallas. */
  pulse?: boolean
  /** Si se pasa, el chip es accionable (Pressable + hitSlop ≥44pt). */
  onPress?: () => void
  style?: ViewStyle
}

// Mismo lenguaje durazno del hero. 'hero' va sobre la card oscura (crema
// cálida). 'header' vive sobre el fondo del tab → theme-aware: crema en
// dark, ámbar oscuro legible (≥4.5:1) en light.
const HERO_COLORS = {
  bg: 'rgba(242,167,140,0.18)',
  border: 'rgba(242,167,140,0.55)',
  dot: '#F2EAD3',
  glow: '#F2A78C',
  text: '#F2EAD3',
}

/**
 * Chip de "cobro pendiente" — extraído del hero del Home para reusarlo en
 * el header de las demás secciones. Comunica, de forma persistente y no
 * invasiva, que el cobro de este ciclo todavía no se confirmó (plano
 * PLATA congelado) aunque las obligaciones se muestren en tiempo real.
 */
export function CobroPendingChip({
  daysOverdue,
  surface = 'header',
  pulse = false,
  onPress,
  style,
}: CobroPendingChipProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const press = usePressScale({ pressedScale: 0.96 })

  // Pulso de escala layout-safe (transform). Parkeado en 1 con
  // reduced-motion o cuando pulse=false. cancelAnimation en cleanup para
  // no leakear el driver del UI-runtime por ciclo de mount.
  const pulseScale = useSharedValue(1)
  useEffect(() => {
    if (!pulse || reduceMotion) {
      pulseScale.value = 1
      return
    }
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.04, {
          duration: decorativeDurations.pulse,
          easing: motionEasings.warm,
        }),
        withTiming(1, {
          duration: decorativeDurations.pulse,
          easing: motionEasings.warm,
        }),
      ),
      -1,
      false,
    )
    return () => cancelAnimation(pulseScale)
  }, [pulse, reduceMotion, pulseScale])
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }))

  const colors =
    surface === 'hero'
      ? HERO_COLORS
      : theme.isDark
        ? {
            bg: 'rgba(242,167,140,0.16)',
            border: 'rgba(242,167,140,0.45)',
            dot: '#F2D9C6',
            glow: '#F2A78C',
            text: '#F2D9C6',
          }
        : {
            bg: 'rgba(242,167,140,0.22)',
            border: 'rgba(217,119,87,0.45)',
            dot: '#C2410C',
            glow: '#F2A78C',
            text: '#9A3412',
          }

  const text =
    daysOverdue <= 0
      ? t('states:cobro.today')
      : t('states:cobro.overdue', { count: daysOverdue })

  // pulse (hero) y press-scale (header accionable) nunca coexisten — el
  // hero es read-only y el header no pulsa — así que no hay conflicto de
  // transforms en el mismo Animated.View.
  const body = (
    <Animated.View
      accessibilityRole={onPress ? undefined : 'text'}
      accessibilityLabel={onPress ? undefined : text}
      style={[
        styles.chip,
        { backgroundColor: colors.bg, borderColor: colors.border },
        pulse ? pulseStyle : undefined,
        onPress ? press.animatedStyle : undefined,
        style,
      ]}
    >
      <BreatheDot size={6} color={colors.dot} glow={colors.glow} />
      <Text style={[styles.text, { color: colors.text }]}>{text}</Text>
    </Animated.View>
  )

  if (!onPress) return body
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t('states:cobro.confirmHint', { label: text })}
    >
      {body}
    </Pressable>
  )
}

/**
 * Versión conectada para el header de los tabs (Gastos, Fijos, Control).
 * Lee el estado del cobro y, si está pendiente, muestra el chip accionable
 * que lleva al Home (donde vive el flujo de confirmar el cobro). Devuelve
 * null cuando no hay cobro pendiente — cero huella en el caso normal.
 */
export function CobroPendingHeaderChip({ familyId }: { familyId?: string }) {
  const router = useRouter()
  const { pending, daysOverdue } = useCobroPending(familyId)
  if (!pending) return null
  return (
    <CobroPendingChip
      daysOverdue={daysOverdue}
      surface="header"
      onPress={() => router.navigate('/(app)/(tabs)/home')}
      style={styles.headerSlot}
    />
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  // En el header (columna) el chip se autoajusta al contenido (no full
  // width) y respira un poco abajo del subtítulo.
  headerSlot: {
    alignSelf: 'flex-start',
    marginTop: 10,
  },
})
