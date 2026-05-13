import { useEffect, useRef, useState } from 'react'
import { type LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import { useNavigationState } from '@react-navigation/native'
import { useAppTheme } from '@/theme/theme-provider'
import { motionSprings } from '@/lib/motion/tokens'

// La tab bar tiene 5 cells equidistantes:
//   0=home · 1=expenses · 2=FAB · 3=fixed-expenses · 4=insights
// La pill se hide cuando el active es el FAB (presentational only,
// nunca focused en steady state porque abre un modal y vuelve).
const TAB_COUNT = 5
const FAB_INDEX = 2

// Inset horizontal · cuánto angosta queda la pill comparado con la
// celda entera. 14px da una pill cómoda alrededor del icon+label sin
// que se vea como un fill completo de la celda.
const PILL_HORIZONTAL_INSET = 14
// Inset vertical · debe matchear el padding del shell de la tab bar
// (paddingTop 10, paddingBottom 14 en buildFloatingTabBarStyle) más
// un breathing room sutil arriba/abajo del cluster icon+label.
const PILL_TOP_INSET = 12
const PILL_BOTTOM_INSET = 16

/**
 * Sliding Liquid Glass pill que vive detrás del icon+label del tab
 * focused. Reemplaza el `focusDot` 4×4 de Cash App style con el
 * indicator nativo iOS (UIVisualEffectView vía expo-blur con
 * `systemMaterial(Light|Dark)` tint).
 *
 * - **iOS**: `BlurView intensity={45} tint='systemMaterial'` · subtle
 *   step-up sobre el material del bg de la tab bar (`systemChromeMaterial`),
 *   da la sensación de "glass inside glass" como el segmented control
 *   nativo de iOS Settings.
 * - **Android**: solid fill con tinte brand (lime translúcido en dark ·
 *   forest translúcido en light). BlurView en Android requiere
 *   `experimentalBlurMethod='dimezisBlurView'` con GPU overhead alto.
 *
 * La posición se anima con `motionSprings.tabShift` (damping 26,
 * stiffness 340, mass 0.9) — match el rhythm del tab `shift` animation
 * para que el pill y el contenido del tab se muevan en concierto.
 *
 * Mounted INSIDE TabBarBackground (que se renderea dentro del
 * BottomTabBar context) → tiene acceso a `useNavigationState` para
 * leer el active index sin props pasados manualmente.
 */
export function TabBarPillIndicator() {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const useGlass = Platform.OS === 'ios'

  // Selector mínimo · solo el index. Re-render únicamente cuando el
  // tab cambia, no en cada update interno del state tree.
  const activeIndex = useNavigationState((state) => state?.index ?? 0)

  const [layoutWidth, setLayoutWidth] = useState(0)

  // Geometría · ancho de celda + posición X del cell del active index.
  const cellWidth = layoutWidth > 0 ? layoutWidth / TAB_COUNT : 0
  const pillWidth = Math.max(0, cellWidth - PILL_HORIZONTAL_INSET * 2)
  const targetX =
    cellWidth > 0 ? cellWidth * activeIndex + PILL_HORIZONTAL_INSET : 0
  const isHidden = activeIndex === FAB_INDEX || layoutWidth === 0

  const x = useSharedValue(targetX)
  const opacity = useSharedValue(isHidden ? 0 : 1)
  // En el primer layout válido, snap a la posición correcta sin
  // animar (sin esto, la pill aparece deslizándose desde 0 = edge
  // izquierdo de la tab bar hasta el home tab, visible ~200ms en el
  // first paint).
  const hasMountedRef = useRef(false)

  useEffect(() => {
    if (layoutWidth === 0) return
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      x.value = targetX
      opacity.value = isHidden ? 0 : 1
      return
    }
    if (reduced) {
      x.value = targetX
      opacity.value = isHidden ? 0 : 1
      return
    }
    // No animar la posición cuando hide → unhide · que aparezca ya en
    // el spot correcto del nuevo tab, no que se deslice desde el FAB.
    if (activeIndex !== FAB_INDEX) {
      x.value = withSpring(targetX, motionSprings.tabShift)
    }
    opacity.value = withSpring(isHidden ? 0 : 1, {
      damping: 24,
      stiffness: 280,
      mass: 0.8,
    })
    return () => {
      cancelAnimation(x)
      cancelAnimation(opacity)
    }
  }, [activeIndex, targetX, isHidden, layoutWidth, reduced, x, opacity])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    opacity: opacity.value,
    width: pillWidth,
  }))

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width
    if (width !== layoutWidth) setLayoutWidth(width)
  }

  return (
    <View
      onLayout={handleLayout}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Animated.View style={[styles.pill, animStyle]} pointerEvents="none">
        {useGlass ? (
          // iOS · Liquid Glass step-up. systemMaterial es ligeramente
          // más saturado que systemChromeMaterial (que usa la tab bar
          // background), generando contraste sutil glass-sobre-glass.
          <BlurView
            intensity={45}
            tint={theme.isDark ? 'systemMaterialDark' : 'systemMaterialLight'}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          // Android fallback · solid brand-tinted fill.
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: theme.isDark
                  ? 'rgba(166,239,143,0.18)'
                  : 'rgba(31,89,13,0.10)',
              },
            ]}
          />
        )}
        {/* Inner highlight + soft brand-tinted border para lift the
            pill off the bar background. Aplicado encima del material
            para que sea visible sobre el blur. */}
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.pillBorder,
            {
              borderColor: theme.isDark
                ? 'rgba(166,239,143,0.32)'
                : 'rgba(31,89,13,0.20)',
            },
          ]}
        />
        {/* Top sheen — sugiere la "elevación" del material, mismo
            patrón Apple usa en sus glass surfaces. Solo 1px alto pero
            cambia mucho la lectura del pill como "objeto" en vez de
            "región". */}
        <View
          pointerEvents="none"
          style={[
            styles.pillSheen,
            {
              backgroundColor: theme.isDark
                ? 'rgba(255,255,255,0.10)'
                : 'rgba(255,255,255,0.55)',
            },
          ]}
        />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: PILL_TOP_INSET,
    bottom: PILL_BOTTOM_INSET,
    left: 0,
    borderRadius: 999,
    overflow: 'hidden',
  },
  pillBorder: {
    borderRadius: 999,
    borderWidth: 1,
  },
  pillSheen: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1,
    borderRadius: 999,
  },
})
