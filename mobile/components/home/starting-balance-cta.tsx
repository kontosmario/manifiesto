import { memo, useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { TourTarget } from '@/features/tours'
import { TOUR_KEYS } from '@/features/tours/tour-keys'
import { useAppTheme } from '@/theme/theme-provider'
import { triggerHaptic } from '@/lib/haptics'

interface StartingBalanceCtaProps {
  /** Called when user taps "Confirmar". Owner provides the modal/sheet UX. */
  onPress: () => void
  /** Tour order to register with — kept loose so the home-tour author
   *  can renumber steps without changing this component. */
  tourOrder: number
}

/**
 * Card destacada que aparece en Home cuando el ciclo todavía no
 * tiene `current_cycle_starting_balance` confirmado. Pulse sutil
 * para llamar la atención sin gritar. El tour de Home la highlightea
 * como step. Una vez confirmado el saldo, el padre desmonta la card.
 */
function StartingBalanceCtaImpl({ onPress, tourOrder }: StartingBalanceCtaProps) {
  const { theme } = useAppTheme()
  const isDark = theme.isDark
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

  useEffect(() => {
    if (reduceMotion) {
      scale.value = 1
      return
    }
    scale.value = withRepeat(
      withSequence(
        // @motion-allow: 1400ms pulse half-cycle for a low-urgency cta
        withTiming(1.012, { duration: 1400 }),
        // @motion-allow: 1400ms pulse half-cycle for a low-urgency cta
        withTiming(1, { duration: 1400 }),
      ),
      -1,
      false,
    )
    return () => {
      cancelAnimation(scale)
    }
  }, [reduceMotion, scale])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const handlePress = () => {
    void triggerHaptic('selection')
    onPress()
  }

  return (
    <TourTarget order={tourOrder} tour={TOUR_KEYS.home} text="Confirmá cuánta plata tenés disponible hoy para arrancar el ciclo.">
      <Animated.View style={animatedStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Confirmá tu saldo inicial del mes"
          onPress={handlePress}
          style={({ pressed }) => [
            styles.card,
            {
              // Identidad de "ahorro" (la alcancía) → verde de marca (success),
              // mismo patrón AA que MetaCard. Antes: ícono theme.colors.text
              // sobre tile peach → ambos invertían en paralelo y el contraste
              // colapsaba (dark-on-dark en light, light-on-light en dark).
              backgroundColor: theme.colors.creamCard,
              borderColor: isDark ? 'rgba(166,239,143,0.42)' : 'rgba(166,239,143,0.32)',
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: isDark
                  ? 'rgba(166,239,143,0.20)'
                  : 'rgba(166,239,143,0.12)',
              },
            ]}
          >
            <MaterialIcons name="savings" size={20} color={theme.colors.success} />
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              Confirmá tu saldo inicial
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSoft }]}>
              Empezá tu ciclo con la plata que tenés disponible hoy.
            </Text>
          </View>
          <View
            style={[
              styles.ctaPill,
              { backgroundColor: theme.colors.text },
            ]}
          >
            <Text style={[styles.ctaPillText, { color: theme.colors.canvas }]}>
              Confirmar
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </TourTarget>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
    lineHeight: 16,
  },
  ctaPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  ctaPillText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
})

export const StartingBalanceCta = memo(StartingBalanceCtaImpl)
