import { useEffect, useMemo, useRef } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'
import { buildCycleDays, type CycleDay } from '@/features/import-review/cycle-date-math'

const TILE_WIDTH = 56
const TILE_HEIGHT = 64
const TILE_GAP = 8
const TILE_TOTAL_WIDTH = TILE_WIDTH + TILE_GAP

const WEEKDAY_LABELS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const

interface Props {
  /** Selected day ISO (YYYY-MM-DD). */
  value: string
  cycleStart: Date
  cycleDays: number
  /** Today ISO for the "today" dot indicator. */
  today: string
  onChange: (iso: string) => void
}

export function CycleDateSlider({
  value,
  cycleStart,
  cycleDays,
  today,
  onChange,
}: Props) {
  const { theme } = useAppTheme()
  const scrollRef = useRef<ScrollView>(null)
  const containerWidth = useSharedValue(0)

  const days = useMemo(
    () => buildCycleDays(cycleStart, cycleDays, today),
    [cycleStart, cycleDays, today],
  )

  const selectedIndex = useMemo(
    () => days.findIndex((d) => d.iso === value),
    [days, value],
  )

  // When `value` changes externally, scroll the strip to center that day.
  useEffect(() => {
    if (selectedIndex < 0) return
    const node = scrollRef.current
    if (!node) return
    const x = selectedIndex * TILE_TOTAL_WIDTH
    requestAnimationFrame(() => {
      node.scrollTo({ x, animated: true })
    })
  }, [selectedIndex])

  // Snap-handler: when the user's scroll settles on a tile, that's
  // the new selection.
  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x
    const index = Math.round(offsetX / TILE_TOTAL_WIDTH)
    const clamped = Math.max(0, Math.min(days.length - 1, index))
    const day = days[clamped]
    if (day && day.iso !== value) {
      void triggerHaptic('selection')
      onChange(day.iso)
    }
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        containerWidth.value = e.nativeEvent.layout.width
      }}
      accessibilityRole="adjustable"
      accessibilityLabel="Fecha del movimiento"
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={TILE_TOTAL_WIDTH}
        decelerationRate="fast"
        snapToAlignment="center"
        onMomentumScrollEnd={handleMomentumEnd}
        contentContainerStyle={styles.scrollContent}
      >
        {days.map((d, idx) => (
          <DayTile
            key={d.iso}
            day={d}
            isSelected={d.iso === value}
            onPress={() => {
              if (d.iso === value) return
              void triggerHaptic('selection')
              onChange(d.iso)
              scrollRef.current?.scrollTo({
                x: idx * TILE_TOTAL_WIDTH,
                animated: true,
              })
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
  day: CycleDay
  isSelected: boolean
  onPress: () => void
  primary: string
  textColor: string
  mutedColor: string
}

function DayTile({
  day,
  isSelected,
  onPress,
  primary,
  textColor,
  mutedColor,
}: TileProps) {
  const scale = useSharedValue(isSelected ? 1.06 : 1)
  const press = useSharedValue(1)

  useEffect(() => {
    scale.value = withTiming(isSelected ? 1.06 : 1, {
      duration: motionDurations.quick,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
    })
  }, [isSelected, scale])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * press.value }],
  }))

  return (
    <Animated.View style={[styles.tileWrap, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          press.value = withTiming(0.97, {
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
        accessibilityLabel={`día ${day.day}`}
        accessibilityState={{ selected: isSelected }}
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
        style={[
          styles.tile,
          isSelected ? { borderColor: primary } : { borderColor: 'transparent' },
        ]}
      >
        <Text style={[styles.weekday, { color: mutedColor }]}>
          {WEEKDAY_LABELS[day.weekday]}
        </Text>
        <Text
          style={[
            styles.dayNum,
            { color: textColor, fontWeight: isSelected ? '900' : '700' },
          ]}
        >
          {day.day}
        </Text>
        {day.isToday ? (
          <View style={[styles.todayDot, { backgroundColor: primary }]} />
        ) : (
          <View style={styles.todayDotSpacer} />
        )}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: TILE_GAP,
    alignItems: 'center',
  },
  tileWrap: {
    width: TILE_WIDTH,
  },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  weekday: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'lowercase',
    marginBottom: 2,
  },
  dayNum: {
    fontSize: 22,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    marginTop: 4,
  },
  todayDotSpacer: {
    width: 4,
    height: 4,
    marginTop: 4,
  },
})
