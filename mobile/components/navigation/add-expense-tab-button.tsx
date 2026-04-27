import {
  type PressableProps,
  type PressableStateCallbackType,
  Pressable,
  StyleSheet,
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { AddExpenseGlowMesh } from '@/components/navigation/add-expense-glow-mesh'
import { AddExpenseTabButtonFace } from '@/components/navigation/add-expense-tab-button-face'
import {
  ADD_BUTTON_GLOW_SIZE,
  useAddExpenseButtonBreath,
  useAddExpenseButtonBurst,
  useAddExpenseButtonGlow,
  useAddExpenseButtonIconRotation,
} from '@/components/navigation/add-expense-tab-button.model'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { brand } from '@/theme/palette'
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
  const {
    animateGlowTo,
    glowMeshStyle,
    colorBoostStyle,
    shineBoostStyle,
    intensityShared,
  } = useAddExpenseButtonGlow(isReducedMotionEnabled)
  const { breathHaloStyle } = useAddExpenseButtonBreath(isReducedMotionEnabled)
  const { burstRingStyle, triggerBurst } = useAddExpenseButtonBurst(isReducedMotionEnabled)
  const { iconRotateStyle, animateRotationTo } = useAddExpenseButtonIconRotation(isReducedMotionEnabled)
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
        triggerBurst()
        router.push('/(app)/add-expense')
      }}
      onPressIn={(event) => {
        pressScale.onPressIn()
        animateGlowTo(1)
        animateRotationTo(1)
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        pressScale.onPressOut()
        animateGlowTo(0)
        animateRotationTo(0)
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
          <Animated.View
            pointerEvents="none"
            style={[styles.addButtonGlowMeshWrap, glowMeshStyle]}
          >
            <AddExpenseGlowMesh intensity={intensityShared} isDark={theme.isDark} />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.breathHalo,
              { backgroundColor: withAlpha(brand.bright, 0.22) },
              breathHaloStyle,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.burstRing,
              { borderColor: withAlpha(brand.bright, 0.9) },
              burstRingStyle,
            ]}
          />
          <Animated.View
            style={[
              pressScale.animatedStyle,
              // Shadow on a wrapper without `overflow: 'hidden'` so iOS
              // can paint the drop-shadow outside bounds. Classic
              // shadow* props instead of CSS `boxShadow` — more reliable
              // across Expo Go SDK versions and plays nicely with the
              // circular FAB shape.
              {
                shadowColor: theme.isDark ? '#62F49C' : '#31DB82',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: theme.isDark ? 0.34 : 0.22,
                shadowRadius: 18,
                elevation: 12,
              },
            ]}
          >
            <AddExpenseTabButtonFace
              colorBoostStyle={colorBoostStyle}
              shineBoostStyle={shineBoostStyle}
              iconRotateStyle={iconRotateStyle}
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
  breathHalo: {
    position: 'absolute',
    alignSelf: 'center',
    width: 82,
    height: 82,
    borderRadius: 41,
  },
  burstRing: {
    position: 'absolute',
    alignSelf: 'center',
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
  },
})
