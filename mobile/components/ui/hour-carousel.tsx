// Infinite hour carousel — picks an hour (0–23) on a horizontal reel that
// loops seamlessly (after 23 comes 00 and vice-versa). Replaces the finite
// hour strip: the centered tile is the selection, grows + turns primary,
// neighbours scale/fade toward the edges for depth.
//
// Design notes (ui-ux-pro-max / emil / impeccable):
//  · Centre = selection. A fixed focus ring marks the centre slot; the reel
//    slides under it and snaps. Commit happens when it settles.
//  · Scroll-driven scale + opacity via RN Animated on the NATIVE driver
//    (smooth on the UI thread, and sidesteps the Reanimated cross-runtime
//    Easing pitfall). Min scale 0.7 — nothing animates from scale(0).
//  · Infinite by rendering N copies of the 24 hours and silently re-centring
//    to the middle copy once the reel comes to rest (invisible to the user).
//  · A light haptic ticks each time a new hour passes the centre.
//  · Respects reduced motion (no depth scaling; snap still works).

import { memo, useCallback, useRef, useState } from 'react'
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { triggerHaptic } from '@/lib/haptics'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

const ITEM_WIDTH = 62
const HEIGHT = 88
const COPIES = 5 // odd → a real middle copy. 5×24 = 120 tiles of buffer.
const MIDDLE = Math.floor(COPIES / 2)
const BASE_HOURS = Array.from({ length: 24 }, (_, h) => h)
const DATA = Array.from({ length: COPIES }, () => BASE_HOURS).flat()

interface Props {
  /** Selected hour, 0–23. Read once on mount — remount (via key) to reset. */
  value: number
  onChange: (hour: number) => void
  accessibilityLabel?: string
}

export function HourCarousel({ value, onChange, accessibilityLabel }: Props) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const hourSuffix = t('states:hourPicker.suffix')
  const reduced = useReducedMotion()
  // Texto sobre el pill primary: mismo patrón que el Button canónico —
  // blanco en light (5.5:1 sobre #297811) y el canvas oscuro en dark
  // (sobre el verde claro #A6EF8F), para que el número central se lea bien
  // en ambos temas.
  const onPrimary = theme.isDark ? theme.colors.background : '#FFFFFF'
  const scrollRef = useRef<ScrollView>(null)
  const scrollX = useRef(new Animated.Value(0)).current

  const [width, setWidth] = useState(0)
  // Read `value` once: live onChange updates must not re-apply contentOffset
  // and yank the reel. Remount (key) to reset to a different hour.
  const initialIndexRef = useRef(MIDDLE * 24 + value)
  const initialIndex = initialIndexRef.current
  const [centeredIndex, setCenteredIndex] = useState(initialIndex)
  const lastHourRef = useRef(value)

  const sidePad = width > 0 ? (width - ITEM_WIDTH) / 2 : 0

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width)
  }, [])

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: true,
      listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / ITEM_WIDTH)
        if (idx !== centeredIndex) setCenteredIndex(idx)
        const hour = ((idx % 24) + 24) % 24
        if (hour !== lastHourRef.current) {
          lastHourRef.current = hour
          void triggerHaptic('selection')
        }
      },
    },
  )

  const settle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / ITEM_WIDTH)
      const hour = ((idx % 24) + 24) % 24
      onChange(hour)
      // Re-centre to the middle copy at the same hour so the reel never runs
      // out of buffer — invisible because it happens at rest, un-animated.
      const target = MIDDLE * 24 + hour
      if (idx !== target) {
        // State before the silent jump so the highlight never lags a frame.
        setCenteredIndex(target)
        scrollRef.current?.scrollTo({ x: target * ITEM_WIDTH, animated: false })
      }
    },
    [onChange],
  )

  // Tap a tile → centre it + commit. (A programmatic animated scroll doesn't
  // reliably fire onMomentumScrollEnd, so commit here too; the next settle
  // re-centres the buffer.) We DON'T setCenteredIndex here — the animated
  // scroll's onScroll tracks the highlight smoothly to the target instead of
  // flashing it on. Stable so memoised tiles don't re-render.
  const onTilePress = useCallback(
    (index: number, hour: number) => {
      lastHourRef.current = hour
      onChange(hour)
      scrollRef.current?.scrollTo({ x: index * ITEM_WIDTH, animated: true })
    },
    [onChange],
  )

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border },
      ]}
      onLayout={onLayout}
    >
      {/* Center slot: a filled band marks where the selection lands, so the
          reel reads as anchored to the centre (not floating). */}
      <View pointerEvents="none" style={styles.focusLayer}>
        <View style={[styles.focusSlot, { backgroundColor: theme.colors.primarySurface }]} />
      </View>

      {width > 0 ? (
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_WIDTH}
          decelerationRate="fast"
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: sidePad }}
          contentOffset={{ x: initialIndex * ITEM_WIDTH, y: 0 }}
          onScroll={handleScroll}
          onMomentumScrollEnd={settle}
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel ?? t('states:hourPicker.label')}
          accessibilityHint={t('states:hourPicker.hint')}
        >
          {DATA.map((hour, idx) => (
            <HourTile
              key={idx}
              hour={hour}
              index={idx}
              isCentered={idx === centeredIndex}
              reduced={reduced}
              scrollX={scrollX}
              primary={theme.colors.primary}
              onPrimary={onPrimary}
              textColor={theme.colors.text}
              mutedColor={theme.colors.textMuted}
              hourSuffix={hourSuffix}
              onTilePress={onTilePress}
            />
          ))}
        </Animated.ScrollView>
      ) : null}
    </View>
  )
}

interface TileProps {
  hour: number
  index: number
  isCentered: boolean
  reduced: boolean
  scrollX: Animated.Value
  primary: string
  onPrimary: string
  textColor: string
  mutedColor: string
  hourSuffix: string
  onTilePress: (index: number, hour: number) => void
}

// Memoised: while scrolling, only the two tiles whose `isCentered` flips
// re-render (not all 120). Props are stable refs/primitives + a stable
// onTilePress, so memo holds.
const HourTile = memo(function HourTile({
  hour,
  index,
  isCentered,
  reduced,
  scrollX,
  primary,
  onPrimary,
  textColor,
  mutedColor,
  hourSuffix,
  onTilePress,
}: TileProps) {
  const inputRange = [
    (index - 2) * ITEM_WIDTH,
    (index - 1) * ITEM_WIDTH,
    index * ITEM_WIDTH,
    (index + 1) * ITEM_WIDTH,
    (index + 2) * ITEM_WIDTH,
  ]
  const scale = reduced
    ? 1
    : scrollX.interpolate({
        inputRange,
        outputRange: [0.68, 0.84, 1, 0.84, 0.68],
        extrapolate: 'clamp',
      })
  const opacity = reduced
    ? 1
    : scrollX.interpolate({
        inputRange,
        outputRange: [0.32, 0.6, 1, 0.6, 0.32],
        extrapolate: 'clamp',
      })
  const hh = String(hour).padStart(2, '0')

  return (
    <Pressable
      onPress={() => onTilePress(index, hour)}
      hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
      accessibilityRole="button"
      accessibilityLabel={`${hh}:00`}
      accessibilityState={{ selected: isCentered }}
      style={styles.tileTap}
    >
      <Animated.View style={[styles.tile, { transform: [{ scale }], opacity }]}>
        <View style={[styles.pill, isCentered ? { backgroundColor: primary } : null]}>
          <Text
            style={[
              styles.num,
              {
                color: isCentered ? onPrimary : textColor,
                fontWeight: isCentered ? '900' : '700',
              },
            ]}
          >
            {hh}
          </Text>
        </View>
        <Text style={[styles.suffix, { color: isCentered ? primary : mutedColor }]}>{hourSuffix}</Text>
      </Animated.View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: HEIGHT,
    justifyContent: 'center',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  focusLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusSlot: {
    width: ITEM_WIDTH - 4,
    height: 56,
    borderRadius: radii.md,
  },
  tileTap: {
    width: ITEM_WIDTH,
    height: HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  pill: {
    minWidth: 42,
    height: 38,
    borderRadius: 999,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: {
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  suffix: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
})
