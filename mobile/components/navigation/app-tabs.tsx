import { memo, useCallback, useMemo, useRef } from 'react'
import { Tabs } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { BottomTabBarButtonProps, BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { CommonActions } from '@react-navigation/native'
import {
  AddExpenseTabButton,
  TabBarBackground,
  TabBarIcon,
  TabLabel,
  tabBarUiStyles,
} from '@/components/navigation/app-tabs-ui'
import { NeoTabBarLive } from '@/components/navigation/neo-tab-bar-live'
import {
  NEO_TAB_KEY_TO_ROUTE,
  routeNameToTabKey,
  type NeoTabKey,
} from '@/components/navigation/neo-tab-bar-route-map'
import type { HomeMode } from '@/components/redesign/home/home-spec'
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

// ─── Nav nueva (F4): adapter renderNeoTabBar(props: BottomTabBarProps) ────────
//
// Traduce el estado de expo-router al contrato presentational de NeoTabBarLive.
// CONECTADO al <Tabs> vía `tabBar={renderNeoTabBar}` (F5 swap live, 2026-07-22).
// Ver design/home-final-2026-07/PLAN-NAV-CABLEADO.md (Fases 4 + 5).

// FAB central: el AddExpenseTabButton EXISTENTE montado tal cual — MISMA lógica
// (handlePress/overlay/burst/no-spend/import/tour), solo cambia la CARA vía
// `variant="neo"` (F3): disco con surco + gradiente invertido en dark + press
// inset. El host de ancho fijo (fabSlot en NeoTabBarLive) lo confina al centro.
// Referencia module-level → estable entre renders.
const renderNeoFab = () => (
  <AddExpenseTabButton variant="neo" accessibilityState={{ selected: false }} />
)

/**
 * Hoja memoizada que lee `useAdvisorBadge` AISLADO — igual patrón que
 * InsightsTabIcon: el hook (RQ cache + filtro de Map) solo re-evalúa cuando
 * cambian `mode` / `activeTab` / `bottomInset` / `onPressTab`, no en cada render
 * de la barra por publishes de pulse o lectores de tema. `onPressTab` llega
 * estable (useCallback sin deps sobre refs) así el memo no se invalida por
 * churn de identidad. El kit suprime el dot en la tab activa internamente.
 */
const NeoTabBarView = memo(function NeoTabBarView({
  mode,
  activeTab,
  bottomInset,
  onPressTab,
}: {
  mode: HomeMode
  activeTab: NeoTabKey | undefined
  bottomInset: number
  onPressTab: (key: NeoTabKey) => void
}) {
  const { show } = useAdvisorBadge()
  const itemDots = useMemo(() => ({ control: show }), [show])
  return (
    <NeoTabBarLive
      mode={mode}
      activeTab={activeTab}
      itemDots={itemDots}
      // Sin fuente de datos hoy → paridad con el FAB live actual (no pinta
      // badge). Requiere decisión owner para activarlo (PLAN Fase 2, decisión c).
      fabBadge={null}
      onPressTab={onPressTab}
      bottomInset={bottomInset}
      renderFab={renderNeoFab}
    />
  )
})

function NeoTabBarConnected({ state, navigation, insets }: BottomTabBarProps) {
  const { theme } = useAppTheme()
  const mode: HomeMode = theme.isDark ? 'dark' : 'light'

  const activeRouteName = state.routes[state.index]?.name
  const activeTab = activeRouteName ? routeNameToTabKey(activeRouteName) : undefined

  // Refs para leer el state/navigation vigente sin recrear `onPressTab` en cada
  // nav render (patrón tourActiveRef de abajo). Mantiene estable la prop del
  // memo → el hook del badge no re-corre por churn de identidad.
  const stateRef = useRef(state)
  stateRef.current = state
  const navRef = useRef(navigation)
  navRef.current = navigation

  const onPressTab = useCallback((key: NeoTabKey) => {
    const s = stateRef.current
    const nav = navRef.current
    const route = s.routes.find((r) => r.name === NEO_TAB_KEY_TO_ROUTE[key])
    if (!route) return
    const isFocused = s.routes[s.index]?.key === route.key
    // EMITIR tabPress (canPreventDefault) es obligatorio: así corren
    // `useTabHaptics` (haptic + focus-pulse, G4) y el `preventDefault()` del
    // tour-lock (G5) vía screenListeners, sin duplicar nada. Y hay que RESPETAR
    // `defaultPrevented`: si el tour lo cancela, NO navegar (sino se saltea el
    // tutorial). Mismo dispatch que el BottomTabBar default (navigate por route
    // + target del state).
    const event = nav.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    })
    if (!event.defaultPrevented && !isFocused) {
      nav.dispatch({
        ...CommonActions.navigate(route),
        target: s.key,
      })
    }
  }, [])

  return (
    <NeoTabBarView
      mode={mode}
      activeTab={activeTab}
      bottomInset={insets.bottom}
      onPressTab={onPressTab}
    />
  )
}

/**
 * Glue de routing pasada como `tabBar` al <Tabs>. CONECTADA (F5 swap live,
 * 2026-07-22): la barra neo canónica reemplaza al tab bar default.
 */
export function renderNeoTabBar(props: BottomTabBarProps) {
  return <NeoTabBarConnected {...props} />
}

export function AppTabs() {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
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
      // `animation: 'fade'` · el `shift` original (220ms de desplazamiento
      // direccional) se sentía lento y por eso se había apagado del todo. Lo
      // que costaba era el RECORRIDO, no el fundido: con `lazy: false` las
      // cinco pantallas ya están montadas, así que un crossfade es compositing
      // puro y no re-monta nada. Si vuelve a leerse como demora, esta línea
      // sola vuelve a `'none'`.
      animation: 'fade' as const,
    }),
    [theme, renderTabBarLabel],
  )

  return (
    // F5 SWAP LIVE (2026-07-22): `tabBar={renderNeoTabBar}` reemplaza el tab bar
    // default por la barra neo canónica (home-final). Es la ÚNICA línea del swap
    // — revertible borrándola (vuelve el bar default sin tocar routing ni
    // screenOptions). Lo que sigue INTACTO (son opciones de Screen/navigator,
    // sobreviven al tabBar custom): freezeOnBlur:false (gestos RNGH), lazy:false
    // (pre-montaje 5 screens), animation:'none' (switch instantáneo), sceneStyle,
    // headerShown:false, detachInactiveScreens default. Las opciones per-Screen
    // (tabBarIcon/tabBarButton/tabBarBackground) quedan INERTES con el bar custom
    // pero se dejan para que borrar la línea restaure el bar default 1:1.
    <Tabs screenListeners={screenListeners} screenOptions={screenOptions} tabBar={renderNeoTabBar}>
      <Tabs.Screen
        name="home"
        options={{ title: t('states:tabs.home'), tabBarIcon: renderHomeIcon, tabBarButton: renderTabBarButton }}
      />
      <Tabs.Screen
        name="expenses"
        options={{ title: t('states:tabs.expenses'), tabBarIcon: renderExpensesIcon, tabBarButton: renderTabBarButton }}
      />
      <Tabs.Screen
        name="add"
        options={{ title: t('states:tabs.add'), tabBarButton: renderAddExpenseButton, tabBarIcon: renderAddIcon }}
      />
      <Tabs.Screen
        name="fixed-expenses"
        options={{ title: t('states:tabs.fixed'), tabBarIcon: renderFijosIcon, tabBarButton: renderTabBarButton }}
      />
      <Tabs.Screen
        name="insights"
        options={{ title: t('states:tabs.control'), tabBarIcon: renderInsightsIcon, tabBarButton: renderTabBarButton }}
      />
    </Tabs>
  )
}
