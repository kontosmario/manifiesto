import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import Animated from 'react-native-reanimated'
import { TourTarget } from '@/features/tours'
import { TOUR_KEYS } from '@/features/tours/tour-keys'
import { useAppTheme } from '@/theme/theme-provider'
import { useBorderGlow } from '@/hooks/use-border-glow'
import { triggerHaptic } from '@/lib/haptics'

interface StartingBalanceCtaProps {
  /** Called when user taps "Confirmar". Owner provides the modal/sheet UX. */
  onPress: () => void
  /** Tour order to register with — kept loose so the home-tour author
   *  can renumber steps without changing this component. */
  tourOrder: number
}

// Texto del pill lime → verde forest oscuro (legible sobre el lime en ambos temas).
const PILL_TEXT = '#0F2E1F'

/**
 * Barra COMPACTA (una línea) que aparece en Home cuando el ciclo todavía no
 * tiene `current_cycle_starting_balance` confirmado. Estilo de la HERO card:
 * gradiente forest + texto crema (heroText) + acento lime (heroAccent), así
 * esta card —que es importante— se siente parte de la jerarquía del hero, no un
 * cartel suelto. El efecto es un BORDER GLOW (useBorderGlow): el borde lime
 * respira, queda dentro de los límites → nunca se corta. El gradiente se
 * redondea a sí mismo (sin overflow:hidden) para que el borde no quede seamed
 * en las esquinas. Una vez confirmado el saldo, el padre (CollapsingReveal) la
 * colapsa y desmonta.
 */
function StartingBalanceCtaImpl({ onPress, tourOrder }: StartingBalanceCtaProps) {
  const { theme } = useAppTheme()
  const glowBorderStyle = useBorderGlow()

  const handlePress = () => {
    void triggerHaptic('selection')
    onPress()
  }

  return (
    <TourTarget order={tourOrder} tour={TOUR_KEYS.home} text="Confirmá cuánta plata tenés disponible hoy para arrancar el ciclo.">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Confirmá tu saldo inicial del mes"
        onPress={handlePress}
        style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
      >
        <Animated.View style={[styles.card, glowBorderStyle]}>
          <LinearGradient
            colors={
              [...theme.colors.heroGradient] as unknown as readonly [
                string,
                string,
                ...string[],
              ]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            // El gradiente se redondea a sí mismo (mismo radio que la card) en
            // vez de depender de overflow:hidden — así el borde no queda
            // "cropeado"/seamed en las esquinas redondeadas.
            style={[StyleSheet.absoluteFillObject, styles.gradient]}
          />
          <View style={styles.row}>
            <MaterialIcons name="savings" size={18} color={theme.colors.heroAccent} />
            <Text
              style={[styles.title, { color: theme.colors.heroText }]}
              numberOfLines={1}
            >
              Confirmá tu saldo inicial
            </Text>
            <View style={[styles.ctaPill, { backgroundColor: theme.colors.heroAccent }]}>
              <Text style={[styles.ctaPillText, { color: PILL_TEXT }]}>
                Confirmar
              </Text>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </TourTarget>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1.5,
  },
  gradient: {
    borderRadius: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  title: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  ctaPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  ctaPillText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
})

export const StartingBalanceCta = memo(StartingBalanceCtaImpl)
