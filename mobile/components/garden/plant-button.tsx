import { memo } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated from 'react-native-reanimated'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'

interface PlantButtonProps {
  planted: boolean
  onPress: () => void
  disabled?: boolean
}

// Verde primario del CTA (135deg #3FA13F → #2E7D31) — del prototipo hifi.
const PLANT_GRADIENT = ['#3FA13F', '#2E7D31'] as const

/**
 * CTA "Plantar el brote de hoy". Sin plantar → gradiente verde + sombra.
 * Plantado → tile suave "Brote plantado · volvé mañana" (one-shot por día).
 */
function PlantButtonImpl({ planted, onPress, disabled }: PlantButtonProps) {
  const { theme } = useAppTheme()
  const press = usePressScale({ pressedScale: 0.97 })

  if (planted) {
    return (
      <Pressable disabled accessibilityRole="button" accessibilityLabel="Brote plantado, volvé mañana">
        <Animated.View
          style={[
            styles.button,
            { backgroundColor: theme.isDark ? 'rgba(166,239,143,0.16)' : '#E7F2DF' },
          ]}
        >
          <Text style={[styles.text, { color: theme.colors.success }]}>
            🌱 Brote plantado · volvé mañana
          </Text>
        </Animated.View>
      </Pressable>
    )
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel="Plantar el brote de hoy"
    >
      <Animated.View style={[styles.shadowWrap, press.animatedStyle]}>
        <LinearGradient
          colors={PLANT_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.button}
        >
          <Text style={[styles.text, { color: '#FFFFFF' }]}>Plantar el brote de hoy</Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: 18,
    boxShadow: '0 8px 22px rgba(46,125,49,0.32)',
  },
  button: {
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: {
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
})

export const PlantButton = memo(PlantButtonImpl)
