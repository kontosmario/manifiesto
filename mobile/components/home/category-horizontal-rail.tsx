import { useEffect, useMemo, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, {
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
}

const DEFAULT_TILE_WIDTH = 60
const DEFAULT_TILE_HEIGHT = 68
const TILE_GAP = 8
const BADGE_SIZE = 30

export function CategoryHorizontalRail({
  categories,
  selectedCategoryId,
  onSelect,
  rows = 3,
  iconResolver = pickIconForCategory,
  label = 'Categoría',
  tileWidth = DEFAULT_TILE_WIDTH,
  tileHeight = DEFAULT_TILE_HEIGHT,
}: CategoryHorizontalRailProps) {
  const { theme } = useAppTheme()
  const scrollRef = useRef<ScrollView>(null)

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
    if (selectedColumnIndex < 0 || !scrollRef.current) return
    const x = Math.max(0, selectedColumnIndex * (tileWidth + TILE_GAP) - tileWidth)
    scrollRef.current.scrollTo({ x, animated: true })
  }, [selectedColumnIndex, tileWidth])

  return (
    <View style={styles.root}>
      <Text style={[typography.eyebrow, { color: theme.colors.textMuted, paddingHorizontal: 4 }]}>
        {label}
      </Text>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={tileWidth + TILE_GAP}
        snapToAlignment="start"
      >
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
      </ScrollView>
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
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
          scale.value = withSpring(0.94, motionSprings.press)
        }}
        onPressOut={() => {
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
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
  column: {
    gap: TILE_GAP,
  },
  tileWrap: {
    // width/height are applied inline so the rail can adapt per call site.
  },
  tile: {
    paddingVertical: 6,
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
    fontSize: 16,
    lineHeight: 18,
    textAlign: 'center',
    includeFontPadding: false,
  },
  label: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: -0.1,
    textAlign: 'center',
    width: '100%',
  },
})
