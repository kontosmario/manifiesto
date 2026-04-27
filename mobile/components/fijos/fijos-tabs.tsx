import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { RiseView } from '@/components/home/animated/rise-view'
import type { FijosTab } from '@/features/fijos/use-fijos-controller'
import { useAppTheme } from '@/theme/theme-provider'

interface FijosTabsProps {
  tab: FijosTab
  setTab: (tab: FijosTab) => void
  counts: { todos: number; pendientes: number; pagados: number; zombis: number }
}

interface TabDef {
  id: FijosTab
  label: string
  count: number
  dot?: string
}

export function FijosTabs({ tab, setTab, counts }: FijosTabsProps) {
  const tabs: TabDef[] = [
    { id: 'todos', label: 'Todos', count: counts.todos },
    { id: 'pendientes', label: 'Pendientes', count: counts.pendientes, dot: '#E8976A' },
    { id: 'pagados', label: 'Pagados', count: counts.pagados, dot: '#8DD66A' },
    { id: 'zombis', label: 'Zombi', count: counts.zombis, dot: '#C9A6E0' },
  ]
  return (
    <RiseView delay={120}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {tabs.map((t) => (
          <TabPill key={t.id} tab={t} active={tab === t.id} onPress={() => setTab(t.id)} />
        ))}
      </ScrollView>
    </RiseView>
  )
}

function TabPill({ tab, active, onPress }: { tab: TabDef; active: boolean; onPress: () => void }) {
  const { theme } = useAppTheme()

  // V1 Cuaderno palette:
  //  · Light active → solid ink `#0F2A1E`, cream label.
  //  · Dark active  → green gradient `#C7EE9C→#8DD66A`, near-black label.
  //  · Inactive     → creamCard / dark surface, themed label + muted count.
  const fg = active
    ? theme.isDark
      ? '#0A1410'
      : theme.colors.creamCard
    : theme.colors.text
  const countBg = active
    ? theme.isDark
      ? 'rgba(10,20,16,0.15)'
      : 'rgba(246,251,239,0.1)'
    : theme.isDark
      ? '#0E1A15'
      : theme.colors.pageBg
  const countFg = active
    ? theme.isDark
      ? 'rgba(10,20,16,0.65)'
      : 'rgba(246,251,239,0.55)'
    : theme.colors.textMuted

  const content = (
    <>
      {tab.dot ? <View style={[styles.dot, { backgroundColor: tab.dot }]} /> : null}
      <Text style={[styles.label, { color: fg }]}>{tab.label}</Text>
      <View style={[styles.countChip, { backgroundColor: countBg }]}>
        <Text style={[styles.countText, { color: countFg }]}>{tab.count}</Text>
      </View>
    </>
  )

  if (active && theme.isDark) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={tab.label}
      >
        <LinearGradient
          colors={['#C7EE9C', '#8DD66A'] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.pill, styles.pillActiveDark]}
        >
          {content}
        </LinearGradient>
      </Pressable>
    )
  }

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: active ? theme.colors.text : theme.colors.creamCard,
          borderColor: active ? theme.colors.text : theme.colors.line,
        },
        active ? { boxShadow: '0px 6px 16px -6px rgba(15, 42, 30, 0.4)' } : null,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={tab.label}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { gap: 6, paddingRight: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillActiveDark: {
    borderWidth: 0,
    boxShadow: '0px 8px 20px -8px rgba(141,214,106,0.55)',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 13, fontWeight: '700' },
  countChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  countText: { fontSize: 11, fontWeight: '700' },
})
