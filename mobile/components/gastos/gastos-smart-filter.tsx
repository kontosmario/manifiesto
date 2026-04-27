import { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { RiseView } from '@/components/home/animated/rise-view'
import { GastosFilterPill } from '@/components/gastos/gastos-filter-pill'
import { pickIconForCategory } from '@/features/gastos/category-icons'
import type { CategoryLite } from '@/features/gastos/gastos-aggregates.model'
import { useAppTheme } from '@/theme/theme-provider'

interface GastosSmartFilterProps {
  categories: CategoryLite[]
  expenseCountByCategoryId: Map<string, number>
  totalCount: number
  selectedCategoryId: string | null
  onSelect: (id: string | null) => void
}

/**
 * Two-row, horizontally-scrollable category filter. Only categories
 * with expenses are rendered as chips, sorted by count desc. Items are
 * dealt alternately across the two rows so each "column" represents
 * two consecutive ranks — scrolling right reveals the next pair, and
 * the visible block stays balanced regardless of label length. The
 * "Todas" reset chip pins the start of the top row.
 */
export function GastosSmartFilter({
  categories,
  expenseCountByCategoryId,
  totalCount,
  selectedCategoryId,
  onSelect,
}: GastosSmartFilterProps) {
  const { theme } = useAppTheme()

  const ranked = useMemo(
    () =>
      categories
        .map((c) => ({ ...c, count: expenseCountByCategoryId.get(c.id) ?? 0 }))
        .filter((c) => c.count > 0)
        .sort((a, b) => b.count - a.count),
    [categories, expenseCountByCategoryId],
  )

  const { row1, row2 } = useMemo(() => {
    const r1: typeof ranked = []
    const r2: typeof ranked = []
    ranked.forEach((c, idx) => {
      if (idx % 2 === 0) r1.push(c)
      else r2.push(c)
    })
    return { row1: r1, row2: r2 }
  }, [ranked])

  return (
    <RiseView delay={140}>
      <View style={styles.container}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          FILTRAR POR CATEGORÍA
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.rows}>
            <View style={styles.row}>
              <GastosFilterPill
                active={selectedCategoryId == null}
                label="Todas"
                emoji="📋"
                count={totalCount}
                onPress={() => onSelect(null)}
              />
              {row1.map((c) => (
                <GastosFilterPill
                  key={c.id}
                  active={selectedCategoryId === c.id}
                  label={c.name}
                  emoji={pickIconForCategory(c.name)}
                  color={c.color}
                  count={c.count}
                  onPress={() => onSelect(c.id)}
                />
              ))}
            </View>

            {row2.length > 0 ? (
              <View style={styles.row}>
                {row2.map((c) => (
                  <GastosFilterPill
                    key={c.id}
                    active={selectedCategoryId === c.id}
                    label={c.name}
                    emoji={pickIconForCategory(c.name)}
                    color={c.color}
                    count={c.count}
                    onPress={() => onSelect(c.id)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  scrollContent: {
    // Match the screen's horizontal padding so the first chip starts
    // flush with the rest of the content but the scroll itself can
    // overflow edge-to-edge.
    paddingRight: 16,
  },
  rows: {
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
})
