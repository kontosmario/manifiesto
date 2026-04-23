import { useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { BottomSheet, type BottomSheetHandle } from '@/components/ui/bottom-sheet'
import { pickIconForCategory } from '@/features/gastos/category-icons'
import type { CategoryLite } from '@/features/gastos/gastos-aggregates.model'
import { useAppTheme } from '@/theme/theme-provider'

interface CategoryWithCount extends CategoryLite {
  count: number
}

interface GastosCategoriesSheetProps {
  visible: boolean
  onClose: () => void
  categories: CategoryWithCount[] // already ranked
  totalCount: number
  selectedCategoryId: string | null
  onSelect: (id: string | null) => void
}

export function GastosCategoriesSheet({
  visible,
  onClose,
  categories,
  totalCount,
  selectedCategoryId,
  onSelect,
}: GastosCategoriesSheetProps) {
  const { theme } = useAppTheme()
  const sheetRef = useRef<BottomSheetHandle>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (visible) sheetRef.current?.present()
    else sheetRef.current?.dismiss()
  }, [visible])

  const filtered = useMemo(() => {
    if (!query) return categories
    const q = query.toLowerCase()
    return categories.filter((c) => c.name.toLowerCase().includes(q))
  }, [categories, query])

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={['70%', '92%']}
      onDismiss={() => {
        setQuery('')
        onClose()
      }}
      backgroundStyle={{ backgroundColor: theme.colors.pageBg }}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Categorías</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={[styles.done, { color: theme.colors.textMuted }]}>Listo</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.searchRow,
            { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
          ]}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Circle cx={11} cy={11} r={7} stroke={theme.colors.textMuted} strokeWidth={2} />
            <Path d="M16 16l4 4" stroke={theme.colors.textMuted} strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar categoría…"
            placeholderTextColor={theme.colors.textSoft}
            style={[styles.searchInput, { color: theme.colors.text }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Circle cx={12} cy={12} r={9} fill={theme.colors.line} />
                <Path
                  d="M9 9l6 6M15 9l-6 6"
                  stroke={theme.colors.textMuted}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
            </Pressable>
          ) : null}
        </View>

        <CategoryRow
          emoji="📋"
          label="Todas las categorías"
          count={totalCount}
          active={selectedCategoryId == null}
          color={theme.colors.textMuted}
          onPress={() => onSelect(null)}
        />

        {filtered.length === 0 && query ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
              Sin resultados para "{query}"
            </Text>
          </View>
        ) : null}

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CategoryRow
              emoji={pickIconForCategory(item.name)}
              label={item.name}
              count={item.count}
              color={item.color}
              active={selectedCategoryId === item.id}
              onPress={() => onSelect(item.id)}
            />
          )}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      </View>
    </BottomSheet>
  )
}

function CategoryRow({
  emoji,
  label,
  count,
  color,
  active,
  onPress,
}: {
  emoji: string
  label: string
  count: number
  color: string
  active: boolean
  onPress: () => void
}) {
  const { theme } = useAppTheme()
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: active ? theme.colors.text : theme.colors.creamCard,
          borderColor: active ? theme.colors.text : theme.colors.line,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <View
        style={[
          styles.icon,
          { backgroundColor: hexAlpha(color, 0.18), borderColor: hexAlpha(color, 0.32) },
        ]}
      >
        <Text style={styles.iconText}>{emoji}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text
          style={[styles.rowLabel, { color: active ? theme.colors.creamCard : theme.colors.text }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.rowSub,
            { color: active ? 'rgba(255,255,255,0.65)' : theme.colors.textMuted },
          ]}
        >
          {count} movimiento{count === 1 ? '' : 's'}
        </Text>
      </View>
      {active ? (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path
            d="M5 12l4 4 10-10"
            stroke={theme.colors.heroAccent}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </Pressable>
  )
}

function hexAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6 && normalized.length !== 3) return hex
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 6, flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  done: { fontSize: 14, fontWeight: '600' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 6,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconText: { fontSize: 18 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 11, marginTop: 1 },
  listContent: { paddingBottom: 30 },
  emptyState: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 13 },
})
