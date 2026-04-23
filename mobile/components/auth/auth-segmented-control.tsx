import { LinearGradient } from 'expo-linear-gradient'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useEffect, useState } from 'react'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { USE_NATIVE_DRIVER } from '@/lib/runtime-environment'
import { authPalette } from '@/theme/auth-theme'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET, MIN_TOUCH_TARGET } from '@/theme/interaction'
import { radii } from '@/theme/palette'

export interface SegmentOption<T extends string> {
  label: string
  value: T
}

export function AuthSegmentedControl<T extends string>({
  compact = false,
  dense = false,
  disabled,
  onChange,
  options,
  reducedMotion = false,
  value,
}: {
  compact?: boolean
  dense?: boolean
  disabled?: boolean
  onChange: (value: T) => void
  options: readonly SegmentOption<T>[]
  reducedMotion?: boolean
  value: T
}) {
  const [trackWidth, setTrackWidth] = useState(0)
  const [indicatorTranslateX] = useState(() => new Animated.Value(0))
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const indicatorInset = compact ? 6 : dense ? 3 : 4
  const segmentGap = compact ? 8 : 0
  const segmentWidth =
    trackWidth > 0
      ? (trackWidth - indicatorInset * 2 - segmentGap * (options.length - 1)) / options.length
      : 0

  useEffect(() => {
    const nextOffset = segmentWidth > 0 ? activeIndex * (segmentWidth + segmentGap) : 0

    if (reducedMotion || trackWidth <= 0) {
      indicatorTranslateX.setValue(nextOffset)
      return
    }

    const animation = Animated.spring(indicatorTranslateX, {
      toValue: nextOffset,
      tension: 58,
      friction: 9,
      useNativeDriver: USE_NATIVE_DRIVER,
    })

    animation.start()

    return () => {
      animation.stop()
    }
  }, [activeIndex, indicatorTranslateX, reducedMotion, segmentGap, segmentWidth, trackWidth])

  return (
    <View
      onLayout={(event) => {
        setTrackWidth(event.nativeEvent.layout.width)
      }}
      style={[
        compact ? styles.miniSegmented : styles.segmented,
        dense && !compact && styles.segmentedDense,
      ]}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            styles.segmentIndicatorWrap,
            compact ? styles.segmentIndicatorWrapCompact : styles.segmentIndicatorWrapDefault,
            dense && !compact && styles.segmentIndicatorWrapDense,
            {
              pointerEvents: 'none',
              left: indicatorInset,
              transform: [{ translateX: indicatorTranslateX }],
              width: segmentWidth,
            },
          ]}
        >
          <LinearGradient
            colors={
              compact
                ? authPalette.segmented.activeGradientCompact
                : authPalette.segmented.activeGradientDefault
            }
            end={{ x: 0.94, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      ) : null}

      {options.map((option) => (
        <SegmentButton
          active={option.value === value}
          compact={compact}
          dense={dense}
          disabled={disabled}
          key={option.value}
          label={option.label}
          onPress={() => {
            onChange(option.value)
          }}
        />
      ))}
    </View>
  )
}

function SegmentButton({
  active,
  compact = false,
  dense = false,
  disabled,
  label,
  onPress,
}: {
  active: boolean
  compact?: boolean
  dense?: boolean
  disabled?: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), selected: active }}
      android_ripple={{
        color: withAlpha(authPalette.segmented.labelActive, active ? 0.08 : 0.14),
        borderless: false,
      }}
      disabled={disabled}
      hitSlop={DEFAULT_HIT_SLOP}
      onPressIn={() => {
        if (!disabled && !active) {
          void triggerHaptic('selection')
        }
      }}
      onPress={onPress}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      style={({ pressed }) => [
        compact ? styles.miniSegmentButton : styles.segmentButton,
        pressed && !disabled && styles.segmentButtonPressed,
      ]}
    >
      <View style={[styles.segmentInner, dense && !compact && styles.segmentInnerDense]}>
        <Text
          style={[
            compact ? styles.miniSegmentLabel : styles.segmentLabel,
            dense && !compact && styles.segmentLabelDense,
            active ? styles.segmentLabelActive : styles.segmentLabelInactive,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    padding: 4,
    borderRadius: radii.xl,
    backgroundColor: authPalette.segmented.background,
  },
  segmentedDense: {
    padding: 3,
    borderRadius: radii.xl,
  },
  segmentButton: {
    flex: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  miniSegmentButton: {
    flex: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  segmentIndicatorWrap: {
    position: 'absolute',
    overflow: 'hidden',
  },
  segmentIndicatorWrapDefault: {
    top: 4,
    bottom: 4,
    borderRadius: radii.lg,
  },
  segmentIndicatorWrapDense: {
    top: 3,
    bottom: 3,
    borderRadius: radii.lg,
  },
  segmentIndicatorWrapCompact: {
    top: 6,
    bottom: 6,
    borderRadius: radii.lg,
  },
  segmentInner: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 12,
  },
  segmentInnerDense: {
    minHeight: 40,
    borderRadius: radii.lg,
  },
  segmentLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  segmentLabelDense: {
    fontSize: 13,
  },
  miniSegmentLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  segmentLabelActive: {
    color: authPalette.segmented.labelActive,
  },
  segmentLabelInactive: {
    color: authPalette.segmented.labelInactive,
  },
  segmentButtonPressed: {
    opacity: 0.9,
  },
  miniSegmented: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 6,
    borderRadius: radii.lg,
    backgroundColor: authPalette.cta.miniSegmentFill,
    borderWidth: 1,
    borderColor: authPalette.cta.miniSegmentBorder,
  },
})
