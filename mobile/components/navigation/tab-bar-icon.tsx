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
import { motionSprings } from '@/lib/motion/tokens'

/**
 * V1 modernized tab icon.
 *
 * Active state visual model (post-2026-05-04 nav audit · restaurado
 * tras prueba de pill en 97387ac):
 *   · No pill background behind the icon (dropped Material 2 pattern)
 *   · Icon color shifts from `textMuted` to `primary`
 *   · A 4×4 brand dot sits above the icon as the focus indicator
 *     (Cash App / Revolut convention — calmer than a pill, owner pick)
 *   · Label bolds via tab-label.tsx (separate component)
 *
 * Idle state is visually quiet — only the icon is colored, no
 * decoration. Combined con `tab-label.tsx`, the active tab reads:
 * primary-coloured icon + dot above + bold label.
 */

function useFocusProgress(focused: boolean) {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(focused ? 1 : 0)

  useEffect(() => {
    const target = focused ? 1 : 0
    if (reduceMotion) {
      progress.value = target
      return
    }
    progress.value = withSpring(target, motionSprings.tabIcon)
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

  // Active focus dot above the icon. Fades + scales in on focus, out
  // on blur. Spring runs on UI thread vía Reanimated worklet.
  const dotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0, 1]) }],
  }))

  return (
    <View style={styles.iconSlot}>
      {/* V1 primary focus dot — the only active-state ornament. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.focusDot,
          { backgroundColor: theme.colors.primary },
          dotAnimatedStyle,
        ]}
      />

      <View style={styles.iconCenter}>{children}</View>

      {/* Unread alert (Control tab when advisor has new high-priority
          signals). Suppressed while focused — user is already on the
          tab. */}
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
  showAlert?: boolean
}) {
  const { theme } = useAppTheme()
  // Active uses V1 primary directly (primary-800 light, primary-300
  // dark — both AA on the tab bar background). Idle uses textMuted
  // (V1 surface-700 light, primary-300 dark).
  const resolvedColor = focused ? theme.colors.primary : theme.colors.textMuted
  void color

  return (
    <TabIconFrame focused={focused} showAlert={showAlert}>
      <AppSymbol
        color={resolvedColor}
        fallback={fallback}
        name={name}
        size={size}
      />
    </TabIconFrame>
  )
}

const styles = StyleSheet.create({
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusDot: {
    position: 'absolute',
    top: -7,
    width: 4,
    height: 4,
    borderRadius: 2,
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
