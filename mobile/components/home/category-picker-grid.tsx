import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import { CategoryBadge } from '@/components/ui/category-badge'
import type { Category } from '@/features/categories/use-categories'
import { triggerHaptic } from '@/lib/haptics'
import { motionSprings } from '@/lib/motion'
import { brand, radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

const GRID_LIMIT = 4

interface CategoryPickerGridProps {
  categories: Category[]
  selectedCategoryId: string
  onSelect: (categoryId: string) => void
  onSeeAll: () => void
}

export function CategoryPickerGrid({
  categories,
  selectedCategoryId,
  onSelect,
  onSeeAll,
}: CategoryPickerGridProps) {
  const { theme } = useAppTheme()
  const visible = categories.slice(0, GRID_LIMIT)
  const showSeeAll = categories.length > GRID_LIMIT

  return (
    <View style={styles.root}>
      <Text style={[typography.eyebrow, { color: theme.colors.textMuted }]}>
        Categoría
      </Text>
      <View style={styles.grid}>
        {visible.map((category) => (
          <CategoryTile
            key={category.id}
            category={category}
            selected={category.id === selectedCategoryId}
            onPress={() => {
              void triggerHaptic('selection')
              onSelect(category.id)
            }}
          />
        ))}
        {showSeeAll ? (
          <SeeAllTile
            onPress={() => {
              void triggerHaptic('light')
              onSeeAll()
            }}
          />
        ) : null}
      </View>
    </View>
  )
}

interface CategoryTileProps {
  category: Category
  selected: boolean
  onPress: () => void
}

function CategoryTile({ category, selected, onPress }: CategoryTileProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  return (
    <Animated.View style={[styles.cell, animatedStyle]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`Seleccionar ${category.name}`}
        onPressIn={() => {
          if (reduceMotion) return
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
          scale.value = withSpring(0.97, motionSprings.press)
        }}
        onPressOut={() => {
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
          scale.value = withSpring(1, motionSprings.press)
        }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tile,
          {
            backgroundColor: theme.colors.surface,
            borderColor: selected ? brand.deep : theme.colors.border,
            borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <CategoryBadge categoryId={category.id} size="sm" tone="soft" />
        <Text
          style={[styles.tileLabel, typography.buttonCompact, { color: theme.colors.text }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {category.name}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

interface SeeAllTileProps {
  onPress: () => void
}

function SeeAllTile({ onPress }: SeeAllTileProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  return (
    <Animated.View style={[styles.cell, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ver todas las categorías"
        onPressIn={() => {
          if (reduceMotion) return
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
          scale.value = withSpring(0.97, motionSprings.press)
        }}
        onPressOut={() => {
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
          scale.value = withSpring(1, motionSprings.press)
        }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tile,
          styles.seeAllTile,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
            borderWidth: StyleSheet.hairlineWidth,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Text
          style={[typography.buttonCompact, { color: theme.colors.primaryStrong }]}
        >
          Ver todas
        </Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
  },
  cell: {
    width: '48.5%',
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radii.lg,
    minHeight: 56,
  },
  tileLabel: {
    flex: 1,
    flexShrink: 1,
  },
  seeAllTile: {
    justifyContent: 'center',
  },
})
