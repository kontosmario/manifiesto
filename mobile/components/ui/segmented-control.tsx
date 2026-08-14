import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { triggerHaptic } from '@/lib/haptics'
import { buildElevationStyle } from '@/theme/elevation'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET, MIN_TOUCH_TARGET } from '@/theme/interaction'
import { neoMaterial, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'
import { motionSprings } from '@/lib/motion'

interface SegmentOption<T extends string> {
  label: string
  value: T
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  /**
   * Piel neumórfica del rediseño 2026-07: pista hundida (`neo.well` +
   * `insetSm`) y píldora activa en relieve (`raisedSm`), vocabulario de
   * los tiles de frecuencia de `design/rediseno-2026-07/screens/3c.html`.
   *
   * Opt-in, mismo criterio que `ModalCard`: el control lo montan también
   * pantallas que siguen en V1 (join) y ahí el material neo desentonaría
   * con las cards que lo rodean.
   */
  skin?: 'classic' | 'neo'
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  skin = 'classic',
}: SegmentedControlProps<T>) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)
  const isNeo = skin === 'neo'
  const reduceMotion = useReducedMotion()
  // Items share `flex: 1`, so every segment renders at the same width.
  // We measure that width once and keep it static — animating only
  // `translateX` instead of `width` keeps the pill on the compositor
  // (transform-only) and avoids triggering a layout pass on every
  // frame on Android. `pillStaticWidth` is plain React state so the
  // <Animated.View>'s `width` prop is set declaratively, not driven
  // by a SharedValue.
  const pillX = useSharedValue(0)
  const [pillStaticWidth, setPillStaticWidth] = useState(0)
  const layoutsRef = useRef<Array<{ x: number; width: number } | undefined>>([])

  const handleLayout = (index: number) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout
    layoutsRef.current[index] = { x, width }
    const activeIndex = options.findIndex((o) => o.value === value)
    if (activeIndex === index) {
      // first layout while active — snap immediately
      pillX.value = x
      if (pillStaticWidth !== width) setPillStaticWidth(width)
    }
  }

  useEffect(() => {
    const activeIndex = options.findIndex((o) => o.value === value)
    const layout = layoutsRef.current[activeIndex]
    if (!layout) return
    if (pillStaticWidth !== layout.width) setPillStaticWidth(layout.width)
    if (reduceMotion) {
      pillX.value = layout.x
    } else {
      pillX.value = withSpring(layout.x, motionSprings.press)
    }
  }, [value, reduceMotion, options, pillX, pillStaticWidth])

  // Cancel any in-flight pill movement on unmount so the worklet
  // driver doesn't outlive the component.
  useEffect(() => {
    return () => {
      cancelAnimation(pillX)
    }
  }, [pillX])

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }))

  const trackSkin = isNeo
    ? {
        backgroundColor: neo.well,
        boxShadow: neo.shadows.insetSm,
        // Android < API 29 descarta el inset EN SILENCIO: sin este
        // límite la pista se aplana contra la card que la contiene y no
        // se ve dónde termina el control. Ver `SUPPORTS_INSET_SHADOW`.
        borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
        borderColor: neo.sheetDivider,
      }
    : {
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.border,
      }

  const pillSkin = isNeo
    ? {
        ...neoMaterial(theme.mode, 'raisedSm'),
        // Mismo piso de Android: sin la sombra outset la píldora queda a
        // ~1.05:1 contra el pozo y el segmento activo no se distingue.
        borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1.5,
        borderColor: neo.green,
      }
    : { ...buildElevationStyle(theme, 'segmentedActive'), backgroundColor: theme.colors.surface }

  return (
    <View style={[styles.container, isNeo && styles.containerNeo, trackSkin]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pill,
          isNeo && styles.pillNeo,
          pillSkin,
          { width: pillStaticWidth },
          pillStyle,
        ]}
      />
      {options.map((option, index) => {
        const isActive = option.value === value

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            android_ripple={{
              borderless: false,
              color: isActive
                ? withAlpha(isNeo ? neo.text : theme.colors.text, theme.isDark ? 0.16 : 0.08)
                : withAlpha(isNeo ? neo.green : theme.colors.primary, theme.isDark ? 0.2 : 0.12),
            }}
            key={option.value}
            onLayout={handleLayout(index)}
            onPress={() => {
              if (!isActive) {
                void triggerHaptic('selection')
              }
              onChange(option.value)
            }}
            hitSlop={DEFAULT_HIT_SLOP}
            pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
            style={({ pressed }) => [
              styles.item,
              isNeo && styles.itemNeo,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: isNeo
                    ? isActive
                      ? neo.text
                      : neo.textMuted
                    : isActive
                      ? theme.colors.text
                      : theme.colors.textMuted,
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radii.md, // 14 — exact match
    borderWidth: 1,
    padding: 3,
    gap: 4,
    overflow: 'hidden',
  },
  containerNeo: {
    borderRadius: neoRadii.tile,
    padding: 4,
  },
  pill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 0,
    borderRadius: radii.sm,
  },
  // `top`/`bottom` acompañan al padding de `containerNeo`: la píldora se
  // posiciona en absoluto contra la pista, no la separa el padding.
  pillNeo: {
    top: 4,
    bottom: 4,
    borderRadius: neoRadii.chip,
  },
  item: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.sm, // was 11; nearest token sm=10 (intentional 1pt tightening)
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  itemNeo: {
    borderRadius: neoRadii.chip,
  },
  label: {
    ...typography.buttonCompact, // fontSize:13, fontWeight:'700'
    textAlign: 'center',
  },
})
