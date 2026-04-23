import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { RiseView } from '@/components/home/animated/rise-view'
import { FijoRow } from '@/components/fijos/fijo-row'
import { pickIconForCategory } from '@/features/gastos/category-icons'
import type { FijoCategoryGroup, FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface FijoCategoryGroupsProps {
  groups: FijoCategoryGroup[]
  onMarkPaid?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

export function FijoCategoryGroups({
  groups,
  onMarkPaid,
  onEdit,
  onDelete,
}: FijoCategoryGroupsProps) {
  const { theme } = useAppTheme()
  if (groups.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
          No hay fijos para este filtro.
        </Text>
      </View>
    )
  }
  return (
    <View style={styles.stack}>
      {groups.map((group, gi) => (
        <RiseView key={group.categoryId} delay={380 + gi * 60}>
          <CategoryGroup
            group={group}
            onMarkPaid={onMarkPaid}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </RiseView>
      ))}
    </View>
  )
}

function CategoryGroup({
  group,
  onMarkPaid,
  onEdit,
  onDelete,
}: {
  group: FijoCategoryGroup
  onMarkPaid?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}) {
  const { theme } = useAppTheme()
  const [expanded, setExpanded] = useState(true)
  const emoji = pickIconForCategory(group.label)
  return (
    <Animated.View layout={LinearTransition.duration(240)}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Categoría ${group.label}`}
      >
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.iconTile,
              {
                backgroundColor: hexAlpha(group.color, 0.16),
                borderColor: hexAlpha(group.color, 0.4),
              },
            ]}
          >
            <Text style={styles.iconText}>{emoji}</Text>
          </View>
          <View>
            <Text style={[styles.title, { color: theme.colors.text }]}>{group.label}</Text>
            <Text style={[styles.count, { color: theme.colors.textMuted }]}>
              {group.items.length} {group.items.length === 1 ? 'ítem' : 'ítems'}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.total, { color: theme.colors.text }]}>
            {formatMoney(group.total)}
          </Text>
          <Chevron color={theme.colors.textMuted} pointing={expanded ? 'up' : 'down'} />
        </View>
      </Pressable>
      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(140)}
          style={styles.list}
        >
          {group.items.map((item) => (
            <ItemSlot
              key={item.id}
              item={item}
              color={group.color}
              label={group.label}
              onMarkPaid={onMarkPaid}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

function ItemSlot({
  item,
  color,
  label,
  onMarkPaid,
  onEdit,
  onDelete,
}: {
  item: FijoItem
  color: string
  label: string
  onMarkPaid?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}) {
  return (
    <FijoRow
      item={item}
      categoryColor={color}
      categoryName={label}
      onMarkPaid={onMarkPaid}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  )
}

function Chevron({ color, pointing }: { color: string; pointing: 'up' | 'down' }) {
  const d = pointing === 'up' ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function hexAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
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
  stack: { gap: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconText: { fontSize: 16 },
  title: { fontSize: 14, fontWeight: '700' },
  count: { fontSize: 11 },
  total: { fontSize: 14, fontWeight: '800', letterSpacing: -0.3 },
  list: { gap: 6 },
  emptyWrap: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13 },
})
