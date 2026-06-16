// Horizontal hour picker — same "strip slider" pattern as the bulk-import
// wizard's day selector (components/import-review/cycle-date-slider.tsx):
// a snap-to-tile horizontal reel, tap commits + re-centers, swipe browses.
// Used for the assistant's quiet-hours ("no molestar desde / volver a
// avisar") so picking an hour feels like the day picker, not a long list.
//
// Reanimated note: Easing + withTiming come from the SAME runtime
// (react-native-reanimated) on purpose — mixing react-native Easing with
// reanimated withTiming compiles but crashes at runtime.

import { useEffect, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'

const TILE_WIDTH = 46
const TILE_HEIGHT = 60
const TILE_GAP = 6
const TILE_TOTAL_WIDTH = TILE_WIDTH + TILE_GAP
const HOURS = Array.from({ length: 24 }, (_, h) => h)
// Texto sobre el pill primary (verde): mismo dark-green que el day slider.
const ON_PRIMARY = '#0F2D06'

interface Props {
  /** Selected hour, 0–23. */
  value: number
  onChange: (hour: number) => void
  accessibilityLabel?: string
}

export function HourStripSlider({ value, onChange, accessibilityLabel }: Props) {
  const { theme } = useAppTheme()
  const scrollRef = useRef<ScrollView>(null)

  // Center the strip on the selected hour when it changes (e.g. on open).
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const x = value * TILE_TOTAL_WIDTH
    requestAnimationFrame(() => {
      node.scrollTo({ x, animated: true })
    })
  }, [value])

  return (
    <View
      style={styles.container}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel ?? 'Hora'}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={TILE_TOTAL_WIDTH}
        decelerationRate="fast"
        snapToAlignment="center"
        contentContainerStyle={styles.scrollContent}
      >
        {HOURS.map((h, idx) => (
          <HourTile
            key={h}
            hour={h}
            isSelected={h === value}
            onPress={() => {
              void triggerHaptic('selection')
              onChange(h)
              scrollRef.current?.scrollTo({ x: idx * TILE_TOTAL_WIDTH, animated: true })
            }}
            primary={theme.colors.primary}
            textColor={theme.colors.text}
            mutedColor={theme.colors.textMuted}
          />
        ))}
      </ScrollView>
    </View>
  )
}

interface TileProps {
  hour: number
  isSelected: boolean
  onPress: () => void
  primary: string
  textColor: string
  mutedColor: string
}

function HourTile({ hour, isSelected, onPress, primary, textColor, mutedColor }: TileProps) {
  const press = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }))
  const hh = String(hour).padStart(2, '0')

  return (
    <Animated.View style={[styles.tileWrap, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          press.value = withTiming(0.94, {
            duration: motionDurations.micro,
            easing: Easing.bezier(0.32, 0.72, 0, 1),
          })
        }}
        onPressOut={() => {
          press.value = withTiming(1, {
            duration: motionDurations.micro,
            easing: Easing.bezier(0.32, 0.72, 0, 1),
          })
        }}
        accessibilityRole="button"
        accessibilityLabel={`${hh}:00`}
        accessibilityState={{ selected: isSelected }}
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
        style={styles.tile}
      >
        <View style={[styles.hourPill, isSelected ? { backgroundColor: primary } : null]}>
          <Text
            style={[
              styles.hourNum,
              {
                color: isSelected ? ON_PRIMARY : textColor,
                fontWeight: isSelected ? '900' : '700',
              },
            ]}
          >
            {hh}
          </Text>
        </View>
        <Text style={[styles.hourSuffix, { color: isSelected ? primary : mutedColor }]}>hs</Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  scrollContent: {
    paddingHorizontal: 12,
    gap: TILE_GAP,
    alignItems: 'center',
  },
  tileWrap: { width: TILE_WIDTH },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  hourPill: {
    minWidth: 38,
    height: 34,
    borderRadius: 999,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourNum: {
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  hourSuffix: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
})
