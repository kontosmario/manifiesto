import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
  useReducedMotion,
} from 'react-native-reanimated'
import type { Category } from '@/features/categories/use-categories'
import { pickIconForCategory } from '@/features/gastos/category-icons'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations, motionSprings } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme, useCategoryHueByName } from '@/theme/theme-provider'

interface CategoryHorizontalRailProps {
  categories: Category[]
  selectedCategoryId: string
  onSelect: (categoryId: string) => void
  /** Number of rows to stack vertically. Columns flow horizontally
   *  with overflow scroll. Defaults to 3 (gastos). */
  rows?: number
  /** Override how an icon is picked from a category name. Defaults to
   *  the variable-expense icon set. Use this from fijos to pass the
   *  fixed-expense icon resolver. */
  iconResolver?: (name: string) => string
  /** Override which label is shown above the rail. */
  label?: string
  /** Per-tile width in points. Defaults to 60. Increase from screens
   *  where the full set of categories is small enough to fill the row
   *  (e.g. fijos with 8 cats × 2 rows = 4 columns). */
  tileWidth?: number
  /** Per-tile height in points. Defaults to 68. */
  tileHeight?: number
  /** When true, render the columns inside a static View that
   *  distributes them across the available width with no horizontal
   *  scroll. Use from screens where the catalog is small enough to
   *  always fit (add-expense after the fixed-only filter). When false
   *  (default) the columns sit inside a horizontal ScrollView. */
  staticGrid?: boolean
  /** When true, the label above the rail tints to `theme.colors.warning`
   *  and the label text overrides to "Elegí una categoría". Used by
   *  callers that need to surface "this field is required and unfilled"
   *  without wrapping the rail in extra chrome (which would change
   *  layout). The tint glides in smoothly via Reanimated. */
  warning?: boolean
}

const DEFAULT_TILE_WIDTH = 60
// Bumped from 68 → 76pt to improve aspect ratio against the wider
// stretched tiles (~88pt) the static grid uses — the old 0.77 ratio
// felt squat. 76pt keeps tiles comfortably under thumb without
// inflating overall picker height beyond ~248pt for 3 rows.
const DEFAULT_TILE_HEIGHT = 76
const TILE_GAP = 8
// Wider gap for the static grid — without horizontal overflow to use
// as breathing room, tiles end up visually adjacent at 8pt. 12pt
// keeps them comfortably separated on a 4-column layout.
export const STATIC_TILE_GAP = 12
// Bumped from 30 → 34pt so the icon reads as the focal point of the
// tile, not a small badge floating in whitespace. Pairs with the
// taller tileHeight above.
const BADGE_SIZE = 34

export function CategoryHorizontalRail({
  categories,
  selectedCategoryId,
  onSelect,
  rows = 3,
  iconResolver = pickIconForCategory,
  label = 'Categoría',
  tileWidth = DEFAULT_TILE_WIDTH,
  tileHeight = DEFAULT_TILE_HEIGHT,
  staticGrid = false,
  warning = false,
}: CategoryHorizontalRailProps) {
  const { theme } = useAppTheme()
  const scrollRef = useRef<ScrollView>(null)
  // Smooth label tint transition when `warning` toggles. iOS-cubic at
  // standard duration so the color glides in instead of snapping.
  const warningProgress = useSharedValue(warning ? 1 : 0)
  useEffect(() => {
    warningProgress.value = withTiming(warning ? 1 : 0, {
      duration: motionDurations.standard,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
    })
  }, [warning, warningProgress])
  const labelAnimatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      warningProgress.value,
      [0, 1],
      [theme.colors.textMuted, theme.colors.warning],
    ),
  }))
  const labelText = warning ? 'Elegí una categoría' : label

  const columns = useMemo(() => {
    const chunked: Category[][] = []
    for (let i = 0; i < categories.length; i += rows) {
      chunked.push(categories.slice(i, i + rows))
    }
    return chunked
  }, [categories, rows])

  const selectedIndex = categories.findIndex((c) => c.id === selectedCategoryId)
  const selectedColumnIndex = selectedIndex >= 0 ? Math.floor(selectedIndex / rows) : -1

  useEffect(() => {
    if (staticGrid) return
    if (selectedColumnIndex < 0 || !scrollRef.current) return
    const x = Math.max(0, selectedColumnIndex * (tileWidth + TILE_GAP) - tileWidth)
    scrollRef.current.scrollTo({ x, animated: true })
  }, [selectedColumnIndex, tileWidth, staticGrid])

  // Measure the rail's own container width (not the screen width) so
  // we don't have to guess what padding the parent <Screen> applies.
  // First render uses the prop default; after onLayout fires the real
  // width takes over and tiles snap to fill exactly.
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)
  const handleStaticLayout = useCallback((e: LayoutChangeEvent) => {
    setMeasuredWidth(e.nativeEvent.layout.width)
  }, [])
  const staticTileWidth = useMemo(() => {
    if (!staticGrid || measuredWidth == null) return tileWidth
    // measuredWidth is the staticContent View's width. Subtract its
    // own paddingHorizontal (4 + 4 = 8) and the gaps between
    // columns, then divide by column count.
    const STATIC_INNER_PADDING = 8
    const totalGap = Math.max(0, columns.length - 1) * STATIC_TILE_GAP
    const available = measuredWidth - STATIC_INNER_PADDING - totalGap
    if (columns.length === 0 || available <= 0) return tileWidth
    const computed = Math.floor(available / columns.length)
    // Clamp at the default tile width (don't shrink past readable
    // size — let the parent overflow instead) and the iPad cap.
    return Math.max(tileWidth, Math.min(computed, 110))
  }, [staticGrid, measuredWidth, tileWidth, columns.length])

  const columnTiles = (
    <>
      {columns.map((column, columnIndex) => (
        <View key={columnIndex} style={styles.column}>
          {column.map((category) => (
            <CategoryTile
              key={category.id}
              category={category}
              selected={category.id === selectedCategoryId}
              iconResolver={iconResolver}
              width={tileWidth}
              height={tileHeight}
              onPress={() => {
                void triggerHaptic('selection')
                onSelect(category.id)
              }}
            />
          ))}
        </View>
      ))}
    </>
  )

  return (
    <View style={styles.root}>
      <Animated.Text
        style={[typography.eyebrow, { paddingHorizontal: 4 }, labelAnimatedStyle]}
      >
        {labelText}
      </Animated.Text>
      {staticGrid ? (
        <View
          onLayout={handleStaticLayout}
          style={[styles.staticContent, { gap: STATIC_TILE_GAP }]}
        >
          {columns.map((column, columnIndex) => (
            <View key={columnIndex} style={[styles.column, { gap: STATIC_TILE_GAP }]}>
              {column.map((category) => (
                <CategoryTile
                  key={category.id}
                  category={category}
                  selected={category.id === selectedCategoryId}
                  iconResolver={iconResolver}
                  width={staticTileWidth}
                  height={tileHeight}
                  onPress={() => {
                    void triggerHaptic('selection')
                    onSelect(category.id)
                  }}
                />
              ))}
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          decelerationRate="fast"
          snapToInterval={tileWidth + TILE_GAP}
          snapToAlignment="start"
        >
          {columnTiles}
        </ScrollView>
      )}
    </View>
  )
}

interface CategoryTileProps {
  category: Category
  selected: boolean
  iconResolver: (name: string) => string
  width: number
  height: number
  onPress: () => void
}

function CategoryTile({ category, selected, iconResolver, width, height, onPress }: CategoryTileProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const selectedProgress = useSharedValue(selected ? 1 : 0)
  const hue = useCategoryHueByName(category.name)

  // Animate the selected state via Reanimated so the border eases in
  // and out — same pattern AmountCard uses for its focus ring.
  useEffect(() => {
    const target = selected ? 1 : 0
    selectedProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [selected, reduceMotion, selectedProgress])

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      selectedProgress.value,
      [0, 1],
      [theme.colors.border, theme.colors.primary],
    ),
    borderWidth: 1 + selectedProgress.value,
  }))

  return (
    <Animated.View style={[styles.tileWrap, { width, height }, scaleStyle]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`Seleccionar ${category.name}`}
        hitSlop={4}
        onPressIn={() => {
          if (reduceMotion) return
           
          scale.value = withSpring(0.94, motionSprings.press)
        }}
        onPressOut={() => {
           
          scale.value = withSpring(1, motionSprings.press)
        }}
        onPress={onPress}
        style={({ pressed }) => [
          { width, height, opacity: pressed ? 0.92 : 1 },
        ]}
      >
        <Animated.View
          style={[
            styles.tile,
            { width, height, backgroundColor: theme.colors.surface },
            borderStyle,
          ]}
        >
          <View style={[styles.badge, { backgroundColor: hue.surface }]}>
            <Text allowFontScaling={false} style={styles.emoji}>
              {iconResolver(category.name)}
            </Text>
          </View>
          <Text
            style={[styles.label, { color: theme.colors.text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            allowFontScaling={false}
          >
            {category.name}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: 10,
  },
  scrollContent: {
    paddingHorizontal: 4,
    gap: TILE_GAP,
    paddingVertical: 4,
  },
  // Static grid: same paddings as the scroll variant, but rendered
  // as a flex row with explicit `gap`. The tile width is measured
  // and computed inside the component (see `staticTileWidth`) so it
  // adapts to whatever horizontal space the parent gives us — no
  // assumption about screen padding leaks into the API.
  staticContent: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  column: {
    gap: TILE_GAP,
  },
  tileWrap: {
    // width/height are applied inline so the rail can adapt per call site.
  },
  tile: {
    // 8/4 padding aligns the inner stack with the 4/8pt spacing
    // rhythm used elsewhere in the app — was 6/4 before, which
    // broke the cadence visible inside dense grids.
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    // Bumped 16 → 18pt to match the larger badge (34pt) and keep
    // the emoji visually filling the disc.
    fontSize: 18,
    lineHeight: 20,
    textAlign: 'center',
    includeFontPadding: false,
  },
  label: {
    // Bumped 9.5 → 11pt — the previous size was below the mobile
    // legibility floor and looked cramped at default Dynamic Type.
    // 11pt with weight 700 stays compact but reads cleanly.
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
    width: '100%',
  },
})
