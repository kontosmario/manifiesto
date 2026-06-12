import { useEffect, useMemo, useRef } from 'react'
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
import { buildCycleDays, type CycleDay } from '@/features/import-review/cycle-date-math'

const TILE_WIDTH = 48
const TILE_HEIGHT = 58
const TILE_GAP = 6
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

  const days = useMemo(
    () => buildCycleDays(cycleStart, cycleDays, today),
    [cycleStart, cycleDays, today],
  )

  const selectedIndex = useMemo(
    () => days.findIndex((d) => d.iso === value),
    [days, value],
  )

  // Center the strip on the selected day. We only auto-scroll when the
  // selection changes externally (e.g., row patched) — the user's own
  // free-swipe is left untouched so they can scan dates without the
  // strip jumping under them.
  useEffect(() => {
    if (selectedIndex < 0) return
    const node = scrollRef.current
    if (!node) return
    const x = selectedIndex * TILE_TOTAL_WIDTH
    requestAnimationFrame(() => {
      node.scrollTo({ x, animated: true })
    })
  }, [selectedIndex])

  return (
    <View
      style={styles.container}
      accessibilityRole="adjustable"
      accessibilityLabel="Fecha del movimiento"
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        // Snap keeps the strip visually tidy when the user lets go after
        // a free swipe, but we DON'T fire selection on momentum-end. The
        // user told us that auto-selecting on swipe felt wrong — swipe
        // should let them browse dates without committing; tap commits.
        snapToInterval={TILE_TOTAL_WIDTH}
        decelerationRate="fast"
        snapToAlignment="center"
        contentContainerStyle={styles.scrollContent}
      >
        {days.map((d, idx) => (
          <DayTile
            key={d.iso}
            day={d}
            isSelected={d.iso === value}
            onPress={() => {
              // Un gasto no puede ser futuro — el tile está atenuado y
              // este guard es la red de seguridad.
              if (d.isFuture || d.iso === value) return
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
  const press = useSharedValue(1)
  // Días futuros: no seleccionables (un gasto no puede ser de mañana).
  const disabled = day.isFuture

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }))

  return (
    <Animated.View style={[styles.tileWrap, animatedStyle]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => {
          if (disabled) return
          press.value = withTiming(0.94, {
            duration: motionDurations.micro,
            easing: Easing.bezier(0.32, 0.72, 0, 1),
          })
        }}
        onPressOut={() => {
          if (disabled) return
          press.value = withTiming(1, {
            duration: motionDurations.micro,
            easing: Easing.bezier(0.32, 0.72, 0, 1),
          })
        }}
        accessibilityRole="button"
        accessibilityLabel={`día ${day.day}${disabled ? ', fecha futura no disponible' : ''}`}
        accessibilityState={{ selected: isSelected, disabled }}
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
        style={[styles.tile, disabled ? styles.tileDisabled : null]}
      >
        <Text
          style={[
            styles.weekday,
            { color: isSelected ? primary : mutedColor },
          ]}
        >
          {WEEKDAY_LABELS[day.weekday]}
        </Text>
        <View
          style={[
            styles.dayPill,
            isSelected ? { backgroundColor: primary } : null,
          ]}
        >
          <Text
            style={[
              styles.dayNum,
              {
                color: isSelected ? '#0F2D06' : textColor,
                fontWeight: isSelected ? '900' : '700',
              },
            ]}
          >
            {day.day}
          </Text>
        </View>
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  tileDisabled: {
    opacity: 0.32,
  },
  weekday: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'lowercase',
  },
  dayPill: {
    minWidth: 32,
    height: 28,
    borderRadius: 999,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
  },
  todayDotSpacer: {
    width: 4,
    height: 4,
  },
})
