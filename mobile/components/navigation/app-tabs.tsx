import { memo, useCallback, useMemo } from 'react'
import { Tabs } from 'expo-router'
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs'
import {
  AddExpenseTabButton,
  TabBarBackground,
  TabBarIcon,
  TabLabel,
  tabBarUiStyles,
} from '@/components/navigation/app-tabs-ui'
import { TabBarPressable } from '@/components/navigation/tab-bar-pressable'
import { useTabHaptics } from '@/hooks/use-tab-haptics'
import { useAdvisorBadge } from '@/features/insights/use-advisor-badge'
import { buildFloatingTabBarStyle } from '@/theme/elevation'
import { useAppTheme } from '@/theme/theme-provider'

// ─── Memoized leaf components ───────────────────────────────────
// The tab bar re-renders on every navigation event (focus changes,
// pulse publishes, theme readers). Wrapping the leaves in `memo`
// keeps each icon/background/button render cheap and stops their
// internal hooks (e.g. `useAdvisorBadge`) from re-evaluating unless
// their props actually change.

/**
 * Control tab icon — overlays an unread dot when the advisor has
 * high-priority signals. `useAdvisorBadge` reads from React-Query
 * cache, so the cost here is hook bookkeeping + a Map filter; cheap
 * per render but we still memo so it doesn't re-run while the user
 * is on Home/Gastos/Fijos (the icon's color/focused/size don't change
 * during transitions, so this turns the cost into 0).
 */
const InsightsTabIcon = memo(function InsightsTabIcon({
  color,
  focused,
  size,
}: {
  color: string
  focused: boolean
  size: number
}) {
  const { show } = useAdvisorBadge()
  return (
    <TabBarIcon
      color={color}
      fallback="insights"
      focused={focused}
      name="chart.line.uptrend.xyaxis"
      size={size}
      showAlert={show}
    />
  )
})

const MemoTabBarBackground = memo(TabBarBackground)

const renderTabBarBackground = () => <MemoTabBarBackground />
const renderAddExpenseButton = (props: BottomTabBarButtonProps) => (
  <AddExpenseTabButton {...props} />
)
// Wrap los 4 tabs no-FAB con press feedback (scale 0.94 + spring). El
// FAB tiene su propio button con burst ring — no usa este. Definido
// module-level para que el reference sea stable across renders.
const renderTabBarButton = (props: BottomTabBarButtonProps) => (
  <TabBarPressable {...props} />
)

interface TabIconRenderProps {
  color: string
  focused: boolean
  size: number
}

const renderHomeIcon = ({ color, focused, size }: TabIconRenderProps) => (
  <TabBarIcon color={color} fallback="home" focused={focused} name="house.fill" size={size} />
)
const renderExpensesIcon = ({ color, focused, size }: TabIconRenderProps) => (
  <TabBarIcon
    color={color}
    fallback="receipt-long"
    focused={focused}
    name="list.bullet.rectangle.portrait.fill"
    size={size}
  />
)
const renderFijosIcon = ({ color, focused, size }: TabIconRenderProps) => (
  <TabBarIcon color={color} fallback="payments" focused={focused} name="calendar.badge.clock" size={size} />
)
const renderInsightsIcon = ({ color, focused, size }: TabIconRenderProps) => (
  <InsightsTabIcon color={color} focused={focused} size={size} />
)
const renderAddIcon = () => null

export function AppTabs() {
  const { theme } = useAppTheme()
  const tabHaptics = useTabHaptics()

  // Theme-dependent option chunks are the only thing that should
  // recompute on theme change. Everything else (icon renderers, tab
  // bar background, button) is module-level so the closure identity
  // is stable across renders.
  const renderTabBarLabel = useCallback(
    ({ children, focused }: { children: string; focused: boolean }) => (
      <TabLabel focused={focused}>{String(children)}</TabLabel>
    ),
    [],
  )

  const screenOptions = useMemo(
    () => ({
      freezeOnBlur: false,
      headerShown: false,
      sceneStyle: { backgroundColor: theme.colors.background },
      tabBarActiveTintColor: theme.colors.primaryStrong,
      tabBarInactiveTintColor: theme.colors.textSoft,
      tabBarHideOnKeyboard: true,
      tabBarLabel: renderTabBarLabel,
      tabBarItemStyle: tabBarUiStyles.item,
      tabBarStyle: buildFloatingTabBarStyle(theme),
      tabBarBackground: renderTabBarBackground,
      // Tab transition: `shift` desliza el contenido del tab nuevo
      // desde el lado correspondiente al orden (izquierda → derecha
      // si vas a un tab posterior, vice versa). Esto da continuidad
      // direccional Apple-HIG style cuando navegás Home → Gastos →
      // Fijos → Control via tab bar o via `router.push` a una ruta
      // de tab (ej. "Ver todos" link en Home). Default era 'none' —
      // snap instantáneo que sentía jarring. `'shift'` cuesta una
      // animación de 220ms run on UI thread, imperceptible en perf.
      animation: 'shift' as const,
    }),
    [theme, renderTabBarLabel],
  )

  return (
    <Tabs screenListeners={tabHaptics} screenOptions={screenOptions}>
      <Tabs.Screen
        name="home"
        options={{ title: 'Inicio', tabBarIcon: renderHomeIcon, tabBarButton: renderTabBarButton }}
      />
      <Tabs.Screen
        name="expenses"
        options={{ title: 'Gastos', tabBarIcon: renderExpensesIcon, tabBarButton: renderTabBarButton }}
      />
      <Tabs.Screen
        name="add"
        options={{ title: 'Agregar', tabBarButton: renderAddExpenseButton, tabBarIcon: renderAddIcon }}
      />
      <Tabs.Screen
        name="fixed-expenses"
        options={{ title: 'Fijos', tabBarIcon: renderFijosIcon, tabBarButton: renderTabBarButton }}
      />
      <Tabs.Screen
        name="insights"
        options={{ title: 'Control', tabBarIcon: renderInsightsIcon, tabBarButton: renderTabBarButton }}
      />
    </Tabs>
  )
}
