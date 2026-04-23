import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { RiseView } from '@/components/home/animated/rise-view'
import { pickIconForCategory } from '@/features/gastos/category-icons'
import type { FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney } from '@/utils/money'

interface FijosUpcomingStripProps {
  upcoming: FijoItem[]
  todayDay: number
  categoriesById: Map<string, { id: string; name: string; color: string }>
}

export function FijosUpcomingStrip({
  upcoming,
  todayDay,
  categoriesById,
}: FijosUpcomingStripProps) {
  const { theme } = useAppTheme()
  if (upcoming.length === 0) return null
  const maxDays = Math.max(...upcoming.map((u) => u.dayOfMonth - todayDay))

  return (
    <RiseView delay={280}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>PRÓXIMOS A VENCER</Text>
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          en los próximos {Math.max(1, maxDays)} {maxDays === 1 ? 'día' : 'días'}
        </Text>
      </View>
      <View style={styles.row}>
        {upcoming.map((item, i) => (
          <UpcomingCard
            key={item.id}
            item={item}
            todayDay={todayDay}
            category={item.category_id ? categoriesById.get(item.category_id) : undefined}
            delay={320 + i * 60}
          />
        ))}
      </View>
    </RiseView>
  )
}

function UpcomingCard({
  item,
  todayDay,
  category,
  delay,
}: {
  item: FijoItem
  todayDay: number
  category?: { id: string; name: string; color: string }
  delay: number
}) {
  const { theme } = useAppTheme()
  const diffDays = Math.max(0, item.dayOfMonth - todayDay)
  const urgent = diffDays <= 2
  const label = diffDays === 0 ? 'HOY' : diffDays === 1 ? 'MAÑANA' : `EN ${diffDays}D`
  const catColor = category?.color ?? theme.colors.peach
  const catEmoji = pickIconForCategory(category?.name ?? '')
  void delay

  const content = (
    <>
      <Text
        style={[
          styles.daysLabel,
          { color: urgent ? '#A3452A' : theme.colors.textMuted },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[styles.name, { color: theme.colors.text }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {item.name}
      </Text>
      <Text style={[styles.amount, { color: theme.colors.text }]}>
        {formatMoney(item.amount)}
      </Text>
      <View
        style={[
          styles.catBadge,
          { backgroundColor: hexAlpha(catColor, 0.18), borderColor: hexAlpha(catColor, 0.4) },
        ]}
      >
        <Text style={styles.catBadgeText}>{catEmoji}</Text>
      </View>
    </>
  )

  if (urgent) {
    return (
      <LinearGradient
        colors={['#FADFC8', '#F5C6B6'] as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: '#F2B58A' }]}
      >
        {content}
      </LinearGradient>
    )
  }
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
      ]}
    >
      {content}
    </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  hint: { fontSize: 11, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  card: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  daysLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  name: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '800', letterSpacing: -0.3, marginTop: 4 },
  catBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  catBadgeText: { fontSize: 11 },
})
