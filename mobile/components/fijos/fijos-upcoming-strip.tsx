import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { RiseView } from '@/components/home/animated/rise-view'
import { pickIconForFixedExpenseCategory } from '@/features/gastos/category-icons'
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
  const maxDays = Math.max(...upcoming.map((u) => u.daysUntilDue))

  return (
    <RiseView delay={100}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>PRÓXIMOS A VENCER</Text>
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          en los próximos {Math.max(1, maxDays)} {maxDays === 1 ? 'día' : 'días'}
        </Text>
      </View>
      <View style={styles.row}>
        {upcoming.map((item) => (
          <UpcomingCard
            key={item.id}
            item={item}
            todayDay={todayDay}
            category={item.category_id ? categoriesById.get(item.category_id) : undefined}
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
}: {
  item: FijoItem
  todayDay: number
  category?: { id: string; name: string; color: string }
}) {
  const { theme } = useAppTheme()
  void todayDay
  const diffDays = Math.max(0, item.daysUntilDue)
  const urgent = diffDays <= 2
  const label = diffDays === 0 ? 'HOY' : diffDays === 1 ? 'MAÑANA' : `EN ${diffDays}D`
  const catColor = category?.color ?? theme.colors.peach
  const catEmoji = pickIconForFixedExpenseCategory(category?.name ?? '')

  // V1 Cuaderno palette — urgent cards get a peach wash in light mode
  // and a deep warm brown in dark mode, so the strip reads the same in
  // either theme. Non-urgent cards fall back to the surface tokens.
  const urgentGradient: readonly [string, string] = theme.isDark
    ? ['#5C200A', '#2E1005']  // V1 accent-900 → accent-950
    : ['#FCEAE3', '#F8D1C3']  // V1 accent-100 → accent-200
  const urgentBorder = '#EC7A51'  // V1 accent-400 (uniform)
  const urgentLabelColor = theme.isDark ? '#F8D1C3' : '#973511'  // V1 accent-200 / accent-700

  const content = (
    <>
      <Text
        style={[
          styles.daysLabel,
          { color: urgent ? urgentLabelColor : theme.colors.textMuted },
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
        colors={urgentGradient as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: urgentBorder }]}
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
  // Tabular nums para que montos alineen entre las 3 cards horizontales.
  amount: { fontSize: 14, fontWeight: '800', letterSpacing: -0.3, marginTop: 4, fontVariant: ['tabular-nums'] },
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
