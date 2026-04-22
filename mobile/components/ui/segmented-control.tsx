import { useEffect, useRef } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import { triggerHaptic } from '@/lib/haptics'
import { buildElevationStyle } from '@/theme/elevation'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET, MIN_TOUCH_TARGET } from '@/theme/interaction'
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
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const pillX = useSharedValue(0)
  const pillWidth = useSharedValue(0)
  const layoutsRef = useRef<Array<{ x: number; width: number } | undefined>>([])

  const handleLayout = (index: number) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout
    layoutsRef.current[index] = { x, width }
    const activeIndex = options.findIndex((o) => o.value === value)
    if (activeIndex === index) {
      // first layout while active — snap immediately
      pillX.value = x
      pillWidth.value = width
    }
  }

  useEffect(() => {
    const activeIndex = options.findIndex((o) => o.value === value)
    const layout = layoutsRef.current[activeIndex]
    if (!layout) return
    if (reduceMotion) {
      pillX.value = layout.x
      pillWidth.value = layout.width
    } else {
      pillX.value = withSpring(layout.x, motionSprings.press)
      pillWidth.value = withSpring(layout.width, motionSprings.press)
    }
  }, [value, reduceMotion, options, pillX, pillWidth])

  const pillStyle = useAnimatedStyle(() => ({
    width: pillWidth.value,
    transform: [{ translateX: pillX.value }],
  }))

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.pill,
          buildElevationStyle(theme, 'segmentedActive'),
          { backgroundColor: theme.colors.surface },
          pillStyle,
        ]}
        pointerEvents="none"
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
                ? withAlpha(theme.colors.text, theme.isDark ? 0.16 : 0.08)
                : withAlpha(theme.colors.primary, theme.isDark ? 0.2 : 0.12),
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
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: isActive ? theme.colors.text : theme.colors.textMuted,
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
  pill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 0,
    borderRadius: radii.sm,
  },
  item: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.sm, // was 11; nearest token sm=10 (intentional 1pt tightening)
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  label: {
    ...typography.buttonCompact, // fontSize:13, fontWeight:'700'
    textAlign: 'center',
  },
})
