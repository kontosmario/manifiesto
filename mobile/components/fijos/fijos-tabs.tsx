import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { RiseView } from '@/components/home/animated/rise-view'
import type { FijosTab } from '@/features/fijos/use-fijos-controller'
import { usePressScale } from '@/hooks/use-press-scale'
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
    { id: 'pendientes', label: 'Pendientes', count: counts.pendientes, dot: '#EC7A51' },  // V1 accent-400
    { id: 'pagados', label: 'Pagados', count: counts.pagados, dot: '#49D61F' },  // V1 primary-500
    { id: 'zombis', label: 'Zombi', count: counts.zombis, dot: '#C9A6E0' },  // plum (intentional, distinct from brand)
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
  // Press scale subtle 0.96 — tabs son tap-targets medianos, no necesitan
  // escala pronunciada. La sensación es de "tactil response" sin que
  // compita con el state change (active color morph 240ms).
  const press = usePressScale({ pressedScale: 0.96 })

  // V1 Cuaderno palette:
  //  · Light active → solid ink `#0F2A1E`, cream label.
  //  · Dark active  → green gradient `#C7EE9C→#8DD66A`, near-black label.
  //  · Inactive     → creamCard / dark surface, themed label + muted count.
  const fg = active
    ? theme.isDark
      ? '#12211A'  // V1 surface-950
      : theme.colors.creamCard
    : theme.colors.text
  const countBg = active
    ? theme.isDark
      ? 'rgba(18,33,26,0.15)'  // V1 surface-950 alpha
      : 'rgba(242,234,211,0.1)'  // V1 cream alpha
    : theme.isDark
      ? '#12211A'  // V1 surface-950
      : theme.colors.pageBg
  const countFg = active
    ? theme.isDark
      ? 'rgba(18,33,26,0.65)'
      : 'rgba(242,234,211,0.55)'
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
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={tab.label}
      >
        <Animated.View style={press.animatedStyle}>
          <LinearGradient
            colors={['#A6EF8F', '#49D61F'] as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.pill, styles.pillActiveDark]}
          >
            {content}
          </LinearGradient>
        </Animated.View>
      </Pressable>
    )
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={tab.label}
    >
      <Animated.View
        style={[
          styles.pill,
          {
            backgroundColor: active ? theme.colors.text : theme.colors.creamCard,
            borderColor: active ? theme.colors.text : theme.colors.line,
          },
          // Active state shadow theme-aware. Antes era forest-dark
          // hardcoded → invisible en dark. Light: forest shadow. Dark:
          // lime halo arriba del pill (lift tonal). Mismo patrón que
          // Gastos filter pills Sprint F.
          active
            ? {
                boxShadow: theme.isDark
                  ? '0px 6px 16px -6px rgba(166,239,143,0.32)'
                  : '0px 6px 16px -6px rgba(15,42,30,0.4)',
              }
            : null,
          press.animatedStyle,
        ]}
      >
        {content}
      </Animated.View>
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
    boxShadow: '0px 8px 20px -8px rgba(73,214,31,0.55)',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 13, fontWeight: '700' },
  countChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  countText: { fontSize: 11, fontWeight: '700' },
})
