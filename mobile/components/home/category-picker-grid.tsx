import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CategoryBadge } from '@/components/ui/category-badge'
import { SelectableCard } from '@/components/ui/selectable-card'
import type { Category } from '@/features/categories/use-categories'
import { radii } from '@/theme/palette'
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
      <Text
        style={[typography.eyebrow, styles.eyebrow, { color: theme.colors.textMuted }]}
      >
        Categoría
      </Text>
      <View style={styles.grid}>
        {visible.map((category) => (
          <View key={category.id} style={styles.cell}>
            <SelectableCard
              selected={category.id === selectedCategoryId}
              onPress={() => onSelect(category.id)}
              accessibilityLabel={`Seleccionar ${category.name}`}
              size="md"
            >
              <View style={styles.cardRow}>
                <CategoryBadge categoryId={category.id} size="sm" tone="soft" />
                <Text
                  style={[
                    typography.buttonCompact,
                    styles.cardLabel,
                    { color: theme.colors.text },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {category.name}
                </Text>
              </View>
            </SelectableCard>
          </View>
        ))}
        {showSeeAll ? (
          <View style={styles.cell}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver todas las categorías"
              onPress={onSeeAll}
              style={({ pressed }) => [
                styles.seeAll,
                {
                  backgroundColor: theme.colors.surfaceMuted,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <Text
                style={[typography.buttonDefault, { color: theme.colors.primaryStrong }]}
              >
                Ver todas
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  eyebrow: {},
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
  },
  cell: {
    width: '48%',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    flex: 1,
    minWidth: 0,
  },
  cardLabel: {
    flexShrink: 1,
    flex: 1,
  },
  seeAll: {
    height: 64,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
