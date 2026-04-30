import { useEffect, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { AppSymbol } from '@/components/ui/app-symbol'
import { useAppTheme } from '@/theme/theme-provider'
import { brand, radii } from '@/theme/palette'

function useFocusProgress(focused: boolean) {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(focused ? 1 : 0)

  useEffect(() => {
    const target = focused ? 1 : 0
    if (reduceMotion) {
      progress.value = target
      return
    }
    // Reanimated v3 runs on the UI thread on native and compiles to
    // CSS animations on web — same code path, smooth motion on both
    // Expo Go (device) and Expo Web without the `useNativeDriver`
    // branch we used to need.
    progress.value = withSpring(target, {
      damping: 16,
      stiffness: 180,
      mass: 0.7,
    })
  }, [focused, progress, reduceMotion])

  return progress
}

function TabIconFrame({
  children,
  focused,
  showAlert,
}: {
  children: ReactNode
  focused: boolean
  showAlert?: boolean
}) {
  const { theme } = useAppTheme()
  const progress = useFocusProgress(focused)
  const pillBackground = theme.isDark ? brand.bright : brand.deep

  const dotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: interpolate(progress.value, [0, 1], [0, 1]) },
    ],
  }))

  const frameAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(progress.value, [0, 1], [0.94, 1]) },
    ],
  }))

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }))

  return (
    <View style={styles.iconSlot}>
      {/* Signature brand dot floating above the pill on the active tab */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.signatureDot,
          { backgroundColor: brand.bright },
          dotAnimatedStyle,
        ]}
      />

      <Animated.View style={[styles.iconFrame, frameAnimatedStyle]}>
        {/* Branded pill — fades in when active, sits flat for a confident look. */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.pillShape,
            { backgroundColor: pillBackground },
            pillAnimatedStyle,
          ]}
        />
        <View style={styles.iconCenter}>{children}</View>
      </Animated.View>

      {/* Unread-alert dot — sibling of the frame so the frame's
          overflow:hidden doesn't clip it. Suppressed while focused. */}
      {showAlert && !focused ? (
        <View
          pointerEvents="none"
          style={[
            styles.alertDot,
            {
              backgroundColor: theme.colors.warning,
              borderColor: theme.colors.background,
            },
          ]}
        />
      ) : null}
    </View>
  )
}

export function TabBarIcon({
  color,
  fallback,
  focused,
  name,
  size,
  showAlert = false,
}: {
  color: string
  fallback: keyof typeof MaterialIcons.glyphMap
  focused: boolean
  name: string
  size: number
  /** When true, render a small unread-alert dot (top-right of the
   *  icon frame). Suppressed automatically while focused — the user
   *  is already on this tab. */
  showAlert?: boolean
}) {
  const { theme } = useAppTheme()
  const activeIconColor = theme.isDark ? brand.deep : '#FFFFFF'
  const idleIconColor = theme.colors.textMuted
  const resolvedColor = focused ? activeIconColor : idleIconColor
  void color

  return (
    <TabIconFrame focused={focused} showAlert={showAlert}>
      <AppSymbol
        color={resolvedColor}
        fallback={fallback}
        name={name}
        size={focused ? size - 1 : size - 2}
      />
    </TabIconFrame>
  )
}

const styles = StyleSheet.create({
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  signatureDot: {
    position: 'absolute',
    top: -8,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  iconFrame: {
    width: 50,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pillShape: {
    borderRadius: radii.pill,
  },
  iconCenter: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertDot: {
    position: 'absolute',
    top: 1,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
})
