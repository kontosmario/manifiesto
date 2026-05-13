import { useCallback } from 'react'
import { Pressable } from 'react-native'
import Animated from 'react-native-reanimated'
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs'
import { usePressScale } from '@/hooks/use-press-scale'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Tab bar button con scale + haptic feedback en press. Reemplaza el
 * `Pressable` default de @react-navigation/bottom-tabs para los tabs
 * Home / Gastos / Fijos / Control. El FAB (Agregar) tiene su propio
 * botón con burst ring custom — no reusa este.
 *
 * Antes: tab bar default no daba ningún feedback visual al tocar un
 * tab · el user esperaba que el screen montara para confirmar el
 * input → la nav se sentía "muerta". Ahora: scale 0.94 + spring
 * elastic en <100ms · feedback inmediato regla Emil ("buttons must
 * feel responsive").
 *
 * Haptic ya lo dispara `useTabHaptics()` vía `screenListeners` del
 * `<Tabs>` parent · no duplicamos acá.
 */
export function TabBarPressable(props: BottomTabBarButtonProps) {
  const {
    children,
    onPress,
    onPressIn: forwardedOnPressIn,
    onPressOut: forwardedOnPressOut,
    onLongPress,
    accessibilityRole,
    accessibilityState,
    accessibilityLabel,
    accessibilityHint,
    testID,
    style,
    delayLongPress,
    android_ripple,
  } = props

  const pressScale = usePressScale({ pressedScale: 0.94 })

  const handlePressIn = useCallback(
    (event: Parameters<NonNullable<BottomTabBarButtonProps['onPressIn']>>[0]) => {
      pressScale.onPressIn()
      forwardedOnPressIn?.(event)
    },
    [pressScale, forwardedOnPressIn],
  )

  const handlePressOut = useCallback(
    (event: Parameters<NonNullable<BottomTabBarButtonProps['onPressOut']>>[0]) => {
      pressScale.onPressOut()
      forwardedOnPressOut?.(event)
    },
    [pressScale, forwardedOnPressOut],
  )

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      android_ripple={android_ripple}
      style={[style, pressScale.animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  )
}
