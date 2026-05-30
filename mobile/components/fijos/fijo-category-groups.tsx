import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { RiseView } from '@/components/home/animated/rise-view'
import { FijoRow } from '@/components/fijos/fijo-row'
import { pickIconForFixedExpenseCategory } from '@/features/gastos/category-icons'
import type { FijoCategoryGroup, FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { usePressScale } from '@/hooks/use-press-scale'
import { motionStagger } from '@/lib/motion'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface FijoCategoryGroupsProps {
  groups: FijoCategoryGroup[]
  /** Current UTC day-of-month. Computed once in the parent screen so
   *  rows share a single value instead of each creating a new Date. */
  todayDay: number
  onMarkPaid?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  /** Fixed expense id whose delete/edit mutation is in flight. */
  pendingFixedExpenseId?: string | null
}

export function FijoCategoryGroups({
  groups,
  todayDay,
  onMarkPaid,
  onEdit,
  onDelete,
  pendingFixedExpenseId,
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
        // Stagger entry by `motionStagger.listItem` (40ms) per group
        // for a cascading reveal. Capped at 200ms total so long lists
        // don't have a noticeably slow finish.
        <RiseView
          key={group.categoryId}
          delay={Math.min(60 + gi * motionStagger.listItem, 240)}
        >
          <CategoryGroup
            group={group}
            todayDay={todayDay}
            onMarkPaid={onMarkPaid}
            onEdit={onEdit}
            onDelete={onDelete}
            pendingFixedExpenseId={pendingFixedExpenseId ?? null}
          />
        </RiseView>
      ))}
    </View>
  )
}

function CategoryGroup({
  group,
  todayDay,
  onMarkPaid,
  onEdit,
  onDelete,
  pendingFixedExpenseId,
}: {
  group: FijoCategoryGroup
  todayDay: number
  onMarkPaid?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  pendingFixedExpenseId?: string | null
}) {
  const { theme } = useAppTheme()
  const [expanded, setExpanded] = useState(true)
  const emoji = pickIconForFixedExpenseCategory(group.label)
  // Press scale subtle 0.98 — toda la row es tap-target grande, escala
  // sutil para no competir con la rotation del chevron.
  const press = usePressScale({ pressedScale: 0.98 })
  return (
    <Animated.View layout={LinearTransition.duration(240)}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Categoría ${group.label}`}
      >
        <Animated.View style={[styles.header, press.animatedStyle]}>
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
          <Chevron color={theme.colors.textMuted} expanded={expanded} />
        </View>
        </Animated.View>
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
              todayDay={todayDay}
              onMarkPaid={onMarkPaid}
              onEdit={onEdit}
              onDelete={onDelete}
              isPending={pendingFixedExpenseId === item.id}
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
  todayDay,
  onMarkPaid,
  onEdit,
  onDelete,
  isPending,
}: {
  item: FijoItem
  color: string
  label: string
  todayDay: number
  onMarkPaid?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  isPending?: boolean
}) {
  // FijoRow ya wrappea el card en SwipeRow internamente (con la acción
  // 'Eliminar' cuando recibe onDelete). No hace falta wrappear acá —
  // hacerlo causaba double-wrap y press-halo. Solo pasamos los handlers.
  return (
    <FijoRow
      item={item}
      categoryColor={color}
      categoryName={label}
      todayDay={todayDay}
      onMarkPaid={onMarkPaid}
      onEdit={onEdit}
      onDelete={onDelete}
      isPending={isPending}
    />
  )
}

function Chevron({ color, expanded }: { color: string; expanded: boolean }) {
  // Antes hacíamos path-swap entre up y down → SNAP visual sin transition.
  // Ahora: path fijo "down" + rotation 180° animado vía Reanimated.
  // Resultado: el chevron rota suavemente cuando expandís/colapsás.
  const rotation = useSharedValue(expanded ? 180 : 0)
  useEffect(() => {
    rotation.value = withTiming(expanded ? 180 : 0, {
      duration: 240,
      easing: Easing.bezier(0.16, 1, 0.30, 1),
    })
  }, [expanded, rotation])
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }))
  return (
    <Animated.View style={style}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <Path
          d="M6 9l6 6 6-6"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
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
  // Tabular nums para que totals por categoría alineen verticalmente
  // cuando varios groups están expandidos uno encima del otro.
  total: { fontSize: 14, fontWeight: '800', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  list: { gap: 6 },
  emptyWrap: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13 },
})
