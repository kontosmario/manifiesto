import { memo, useEffect, useState } from 'react'
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'
import type { BillingCycle } from '@/features/billing/billing-plans'

interface BillingCyclePickerProps {
  selected: BillingCycle
  monthlyLabel: string
  yearlyLabel: string
  /** Mini badge text shown next to the yearly segment, e.g. "−33%". null hides it. */
  savingsBadgeText: string | null
  onChange: (cycle: BillingCycle) => void
  disabled?: boolean
}

export const BillingCyclePicker = memo(function BillingCyclePicker({
  selected,
  monthlyLabel,
  yearlyLabel,
  savingsBadgeText,
  onChange,
  disabled = false,
}: BillingCyclePickerProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const [trackWidth, setTrackWidth] = useState(0)
  const progress = useSharedValue(selected === 'yearly' ? 1 : 0)

  useEffect(() => {
    const target = selected === 'yearly' ? 1 : 0
    if (reduced) {
      progress.value = withTiming(target, { duration: 1 })
    } else {
      progress.value = withSpring(target, { damping: 18, stiffness: 200, mass: 0.9 })
    }
  }, [selected, reduced, progress])

  const handleTrack = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)

  const segmentWidth = trackWidth > 0 ? trackWidth / 2 : 0
  const marbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * segmentWidth }],
  }))

  const monthlyTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [theme.colors.text, theme.colors.textMuted]),
  }))
  const yearlyTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [theme.colors.textMuted, theme.colors.text]),
  }))

  const handlePress = (cycle: BillingCycle) => {
    if (disabled || cycle === selected) return
    void triggerHaptic('selection')
    onChange(cycle)
  }

  return (
    <View
      accessibilityRole="tablist"
      onLayout={handleTrack}
      style={[
        styles.track,
        {
          backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamSoft,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.marble,
          { width: segmentWidth, backgroundColor: theme.colors.creamCard },
          marbleStyle,
        ]}
      />
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: selected === 'monthly' }}
        accessibilityLabel={`Plan ${monthlyLabel.toLowerCase()}`}
        onPress={() => handlePress('monthly')}
        disabled={disabled}
        style={styles.segment}
      >
        <Animated.Text style={[styles.segmentText, monthlyTextStyle]}>{monthlyLabel}</Animated.Text>
      </Pressable>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: selected === 'yearly' }}
        accessibilityLabel={savingsBadgeText ? `Plan ${yearlyLabel.toLowerCase()}, ahorrás ${savingsBadgeText}` : `Plan ${yearlyLabel.toLowerCase()}`}
        onPress={() => handlePress('yearly')}
        disabled={disabled}
        style={styles.segment}
      >
        <Animated.Text style={[styles.segmentText, yearlyTextStyle]}>{yearlyLabel}</Animated.Text>
        {savingsBadgeText ? (
          <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.badgeText}>{savingsBadgeText}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  )
})

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 4,
    minHeight: 48,
    position: 'relative',
  },
  marble: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: radii.md,
    shadowColor: '#0F2D06',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    minHeight: 40,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0F2D06',
    letterSpacing: 0.3,
  },
})
