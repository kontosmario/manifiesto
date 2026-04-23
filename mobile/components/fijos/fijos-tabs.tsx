import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
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
    <RiseView delay={340}>
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
  const bg = active ? theme.colors.text : theme.colors.creamCard
  const fg = active ? theme.colors.creamCard : theme.colors.text
  const border = active ? theme.colors.text : theme.colors.line
  const countBg = active ? 'rgba(255,255,255,0.1)' : theme.colors.pageBg
  const countFg = active ? theme.colors.heroAccent : theme.colors.textMuted
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: bg,
          borderColor: border,
        },
        active
          ? { boxShadow: '0px 6px 16px -6px rgba(15, 42, 30, 0.4)' }
          : null,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={tab.label}
    >
      {tab.dot ? <View style={[styles.dot, { backgroundColor: tab.dot }]} /> : null}
      <Text style={[styles.label, { color: fg }]}>{tab.label}</Text>
      <View style={[styles.countChip, { backgroundColor: countBg }]}>
        <Text style={[styles.countText, { color: countFg }]}>{tab.count}</Text>
      </View>
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
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 13, fontWeight: '700' },
  countChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  countText: { fontSize: 11, fontWeight: '700' },
})
