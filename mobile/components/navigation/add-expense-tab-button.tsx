import { type PressableProps, type PressableStateCallbackType, Animated, Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AddExpenseGlowMesh } from '@/components/navigation/add-expense-glow-mesh'
import { AddExpenseTabButtonFace } from '@/components/navigation/add-expense-tab-button-face'
import {
  ADD_BUTTON_GLOW_SIZE,
  useAddExpenseButtonGlow,
} from '@/components/navigation/add-expense-tab-button.model'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'

export function AddExpenseTabButton({
  accessibilityState,
  onPress: forwardedOnPress,
  onPressIn,
  onPressOut,
  style,
  ...pressableProps
}: PressableProps & {
  accessibilityState?: { selected?: boolean }
}) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const isReducedMotionEnabled = useReducedMotion()
  const pressScale = usePressScale({
    pressedScale: 0.93,
  })
  const { animateGlowTo, buttonColorBoostOpacity, buttonShineBoostOpacity, glowIntensity, glowMeshScale } =
    useAddExpenseButtonGlow(isReducedMotionEnabled)
  void forwardedOnPress

  const resolveForwardedStyle = (state: PressableStateCallbackType) =>
    typeof style === 'function' ? style(state) : style

  return (
    <Pressable
      accessibilityLabel="Agregar gasto"
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      android_ripple={{
        borderless: false,
        color: withAlpha('#FFFFFF', 0.2),
        radius: 40,
      }}
      hitSlop={DEFAULT_HIT_SLOP}
      onPress={() => {
        void triggerHaptic('medium')
        router.push('/(app)/add-expense')
      }}
      onPressIn={(event) => {
        pressScale.onPressIn()
        animateGlowTo(1)
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        pressScale.onPressOut()
        animateGlowTo(0)
        onPressOut?.(event)
      }}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      style={(state) => [
        resolveForwardedStyle(state),
        styles.addButtonWrap,
        {
          opacity: state.pressed ? 0.96 : 1,
        },
      ]}
      {...pressableProps}
    >
      {({ pressed }) => (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.addButtonGlowMeshWrap,
              {
                transform: [{ scale: glowMeshScale }],
              },
            ]}
          >
            <AddExpenseGlowMesh intensity={glowIntensity} isDark={theme.isDark} />
          </View>
          <Animated.View style={pressScale.animatedStyle}>
            <AddExpenseTabButtonFace
              buttonColorBoostOpacity={buttonColorBoostOpacity}
              buttonShineBoostOpacity={buttonShineBoostOpacity}
              pressed={pressed}
              theme={theme}
            />
          </Animated.View>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  addButtonWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    top: -18,
    position: 'relative',
  },
  addButtonGlowMeshWrap: {
    position: 'absolute',
    alignSelf: 'center',
    width: ADD_BUTTON_GLOW_SIZE,
    height: ADD_BUTTON_GLOW_SIZE,
    top: -118,
  },
})
