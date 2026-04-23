import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { RiseView } from '@/components/home/animated/rise-view'
import { GastosFilterPill } from '@/components/gastos/gastos-filter-pill'
import { GastosCategoriesSheet } from '@/components/gastos/gastos-categories-sheet'
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

export function GastosSmartFilter({
  categories,
  expenseCountByCategoryId,
  totalCount,
  selectedCategoryId,
  onSelect,
}: GastosSmartFilterProps) {
  const { theme } = useAppTheme()
  const [sheetOpen, setSheetOpen] = useState(false)

  const ranked = useMemo(() => {
    return [...categories]
      .map((c) => ({ ...c, count: expenseCountByCategoryId.get(c.id) ?? 0 }))
      .sort((a, b) => b.count - a.count)
  }, [categories, expenseCountByCategoryId])

  const topFour = ranked.filter((c) => c.count > 0).slice(0, 4)
  const topFourIds = new Set(topFour.map((c) => c.id))
  const activeCat =
    selectedCategoryId == null ? null : categories.find((c) => c.id === selectedCategoryId)
  const activeIsHidden = activeCat != null && !topFourIds.has(activeCat.id)

  return (
    <>
      <RiseView delay={350}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
              FILTRAR POR CATEGORÍA
            </Text>
            <Pressable
              onPress={() => setSheetOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Ver todas las categorías"
              style={styles.seeAllBtn}
            >
              <Text style={[styles.seeAllText, { color: theme.colors.text }]}>Ver todas</Text>
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M9 6l6 6-6 6"
                  stroke={theme.colors.text}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Pressable>
          </View>

          <View style={styles.pillsRow}>
            <GastosFilterPill
              active={selectedCategoryId == null}
              label="Todas"
              emoji="📋"
              count={totalCount}
              onPress={() => onSelect(null)}
            />
            {topFour.map((c) => (
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
            {activeIsHidden && activeCat ? (
              <GastosFilterPill
                active
                label={activeCat.name}
                emoji={pickIconForCategory(activeCat.name)}
                color={activeCat.color}
                count={expenseCountByCategoryId.get(activeCat.id) ?? 0}
                onPress={() => onSelect(null)}
              />
            ) : null}
            <Pressable
              onPress={() => setSheetOpen(true)}
              style={[
                styles.searchPill,
                { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Buscar categoría"
            >
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                <Circle cx={11} cy={11} r={7} stroke={theme.colors.textMuted} strokeWidth={2} />
                <Path
                  d="M16 16l4 4"
                  stroke={theme.colors.textMuted}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
              <Text style={[styles.searchText, { color: theme.colors.textMuted }]}>Buscar</Text>
            </Pressable>
          </View>
        </View>
      </RiseView>

      <GastosCategoriesSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        categories={ranked}
        totalCount={totalCount}
        selectedCategoryId={selectedCategoryId}
        onSelect={(id) => {
          onSelect(id)
          setSheetOpen(false)
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  seeAllText: { fontSize: 11, fontWeight: '700' },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  searchText: { fontSize: 12, fontWeight: '700' },
})
