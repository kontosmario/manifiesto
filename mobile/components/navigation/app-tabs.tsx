import { Tabs } from 'expo-router'
import {
  AddExpenseTabButton,
  TabBarBackground,
  TabBarIcon,
  TabLabel,
  tabBarUiStyles,
} from '@/components/navigation/app-tabs-ui'
import { useTabHaptics } from '@/hooks/use-tab-haptics'
import { buildFloatingTabBarStyle } from '@/theme/elevation'
import { useAppTheme } from '@/theme/theme-provider'

export function AppTabs() {
  const { theme } = useAppTheme()
  const tabHaptics = useTabHaptics()

  return (
    <Tabs
      screenListeners={tabHaptics}
      screenOptions={{
        freezeOnBlur: false,
        headerShown: false,
        sceneStyle: { backgroundColor: theme.colors.background },
        tabBarActiveTintColor: theme.colors.primaryStrong,
        tabBarInactiveTintColor: theme.colors.textSoft,
        tabBarHideOnKeyboard: true,
        tabBarLabel: ({ children, focused }) => <TabLabel focused={focused}>{String(children)}</TabLabel>,
        tabBarItemStyle: tabBarUiStyles.item,
        tabBarStyle: buildFloatingTabBarStyle(theme),
        tabBarBackground: () => <TabBarBackground />,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, focused, size }) => (
            <TabBarIcon color={color} fallback="home" focused={focused} name="house.fill" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Gastos',
          tabBarIcon: ({ color, focused, size }) => (
            <TabBarIcon
              color={color}
              fallback="receipt-long"
              focused={focused}
              name="list.bullet.rectangle.portrait.fill"
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Agregar',
          tabBarButton: (props) => <AddExpenseTabButton {...props} />,
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="fixed-expenses"
        options={{
          title: 'Fijos',
          tabBarIcon: ({ color, focused, size }) => (
            <TabBarIcon color={color} fallback="payments" focused={focused} name="calendar.badge.clock" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Control',
          tabBarIcon: ({ color, focused, size }) => (
            <TabBarIcon
              color={color}
              fallback="insights"
              focused={focused}
              name="chart.line.uptrend.xyaxis"
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  )
}
