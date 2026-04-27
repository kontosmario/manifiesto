import type { ComponentType, PropsWithChildren } from 'react'
import { StyleSheet, type ViewStyle } from 'react-native'
import Animated, {
  interpolate,
  useAnimatedStyle,
  type AnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Defs as DefsRaw, RadialGradient, Rect, Stop } from 'react-native-svg'
import { ADD_BUTTON_GLOW_SIZE } from '@/components/navigation/add-expense-tab-button.model'

// react-native-svg v15 types `Defs` without children in its BaseProps
// even though it accepts them at runtime. Re-type locally so JSX
// compiles without a widespread type-declaration shim.
const Defs = DefsRaw as unknown as ComponentType<PropsWithChildren>

type ViewAnimatedStyle = AnimatedStyle<ViewStyle>

/**
 * Soft ambient glow behind the "+" FAB. Renders a **single** SVG with
 * a real `RadialGradient` — a true GPU-rendered radial falloff from
 * center to edge with no visible rings or edges. The view itself
 * animates its opacity in sync with press intensity.
 *
 * Why SVG instead of stacked circles: four stacked circular views
 * with solid backgrounds (our previous attempt) left concentric
 * rings visible — the human eye picked up the hard edge of each
 * circle even with smoothly-stepped opacities. A radial gradient has
 * continuous alpha, so there are no edges to perceive. react-native-svg
 * works on iOS, Android and web identically.
 */
export function AddExpenseGlowMesh({
  intensity,
  isDark,
}: {
  intensity: SharedValue<number>
  isDark: boolean
}) {
  // Whole component fades in/out with press intensity. The gradient
  // itself is static; opacity is what reveals it.
  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intensity.value, [0, 1, 1.75], [0.35, 0.85, 1]),
  })) as ViewAnimatedStyle

  // Hot center color — this is what the gradient starts at (core).
  const centerColor = isDark ? '#9CFFCB' : '#74F4A4'
  // Edge color transparent — gradient fades to 0 alpha.
  const edgeColor = isDark ? '#0F3A22' : '#0F3A22'

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, glowStyle]}
    >
      <Svg
        width={ADD_BUTTON_GLOW_SIZE}
        height={ADD_BUTTON_GLOW_SIZE}
        viewBox={`0 0 ${ADD_BUTTON_GLOW_SIZE} ${ADD_BUTTON_GLOW_SIZE}`}
      >
        <Defs>
          <RadialGradient
            id="fab-glow"
            cx="50%"
            cy="50%"
            rx="50%"
            ry="50%"
            fx="50%"
            fy="50%"
          >
            {/* Bright hot core */}
            <Stop offset="0%" stopColor={centerColor} stopOpacity={isDark ? 0.45 : 0.38} />
            {/* Warm mid */}
            <Stop offset="20%" stopColor={centerColor} stopOpacity={isDark ? 0.3 : 0.24} />
            {/* Fall-off zone */}
            <Stop offset="45%" stopColor={centerColor} stopOpacity={isDark ? 0.14 : 0.1} />
            {/* Tail */}
            <Stop offset="72%" stopColor={centerColor} stopOpacity={isDark ? 0.05 : 0.035} />
            {/* Fully transparent edge */}
            <Stop offset="100%" stopColor={edgeColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect
          width={ADD_BUTTON_GLOW_SIZE}
          height={ADD_BUTTON_GLOW_SIZE}
          fill="url(#fab-glow)"
        />
      </Svg>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: ADD_BUTTON_GLOW_SIZE,
    height: ADD_BUTTON_GLOW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
