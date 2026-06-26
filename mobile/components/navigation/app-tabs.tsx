import { memo, useCallback, useMemo, useRef } from 'react'
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
import { useTour } from '@/features/tours/tour-context'
import { withNavDevLog } from '@/lib/dev/anim-log'
import { useAdvisorBadge } from '@/features/insights/use-advisor-badge'
import { buildFloatingTabBarStyle } from '@/theme/elevation'
import { DARK_TAB_CANVAS } from '@/theme/palette'
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
  // DEV-only: agrega logging de focus/blur/tabPress + sampler de frames por
  // transición. En release devuelve `tabHaptics` sin tocar (no-op).
  const baseListeners = useMemo(() => withNavDevLog(tabHaptics), [tabHaptics])

  // Mientras un tour guiado está activo, bloqueamos el cambio de tab. El overlay
  // del tour es un <Modal> que tapa el contenido pero NO la barra de tabs, así
  // que tocar una tab saltaba a otra vista y OMITÍA el tutorial. Ref para que el
  // listener estable lea el valor vigente sin recrear screenListeners.
  const { activeTour } = useTour()
  const tourActiveRef = useRef(false)
  tourActiveRef.current = activeTour != null

  const screenListeners = useMemo(
    () => ({
      ...baseListeners,
      tabPress: (e: { preventDefault: () => void; target?: string }) => {
        if (tourActiveRef.current) {
          e.preventDefault()
          return
        }
        baseListeners.tabPress?.(e)
      },
    }),
    [baseListeners],
  )

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
      // The tab scene container sits directly under each tab Screen.
      // The tab screens override their canvas to the near-black
      // DARK_TAB_CANVAS in dark mode, so the scene MUST match — otherwise
      // the forest `background` (#12211A) flashes for a frame under the
      // Screen on the first (cold) attach of each tab before the
      // near-black content paints → the "first-visit flicker". Light
      // mode keeps `background` (which already matches the light canvas).
      sceneStyle: {
        backgroundColor: theme.isDark ? DARK_TAB_CANVAS : theme.colors.background,
      },
      tabBarActiveTintColor: theme.colors.primaryStrong,
      tabBarInactiveTintColor: theme.colors.textSoft,
      tabBarHideOnKeyboard: true,
      tabBarLabel: renderTabBarLabel,
      tabBarItemStyle: tabBarUiStyles.item,
      tabBarStyle: buildFloatingTabBarStyle(theme),
      tabBarBackground: renderTabBarBackground,
      // ─── Speed boost (post-NativeTabs A/B test) ────────────────────
      // Cuando probamos `NativeTabs` (path A), el owner notó que la
      // navegación era "MUY SUPERIOR en rapidez". El boost no venía
      // del Liquid Glass — venía de dos cosas que UITabBarController
      // hace por default:
      //   1. Pre-mount de los view controllers de cada tab (no lazy).
      //   2. Switch instantáneo (zero animation JS).
      // Replicamos ambos aquí:
      //
      //   `lazy: false` · pre-monta los 5 tab screens al app start.
      //   Cuando el user tap Gastos/Fijos/Control por primera vez, el
      //   React tree YA está montado · sólo cambia el active screen ·
      //   first-tap feel = instant en vez de 200-400ms de mount work.
      //   La data ya viene hot por `useWarmTabsSnapshots()` así que
      //   no hay RPC tampoco. El cost: ~80ms extra en app boot para
      //   mountear los 4 tabs inactivos · trade-off net positivo.
      lazy: false,
      //
      //   `animation: 'none'` · UITabBarController nativo NO anima
      //   transición de tab. Salida instantánea. Antes teníamos `shift`
      //   (220ms JS slide direccional Apple-HIG) que con screens cold
      //   se sentía OK, pero ahora que están pre-mounted la animación
      //   ES la fuente de "delay percibido". Quitándola: tap = active
      //   tab visible en 1 frame. Match el feel native.
      animation: 'none' as const,
    }),
    [theme, renderTabBarLabel],
  )

  return (
    <Tabs screenListeners={screenListeners} screenOptions={screenOptions}>
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
