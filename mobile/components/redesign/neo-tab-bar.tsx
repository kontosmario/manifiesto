import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { NeoTabIcon, type NeoTabIconName } from '@/components/navigation/neo-tab-icons'
import { cssGradient } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'

export type NeoTabKey = 'inicio' | 'gastos' | 'fijos' | 'control'

interface NeoTabBarProps {
  mode: 'light' | 'dark'
  activeTab?: NeoTabKey
  onTabPress?: (tab: NeoTabKey) => void
  onFabPress?: () => void
}

/**
 * RÉPLICA PIXEL-PERFECT de la barra de navegación del rediseño
 * 2026-07. Fuente literal: design/rediseno-2026-07/screens/1b.html
 * (claro) y 1c.html (oscuro) — cada valor sale del markup, no de
 * tokens intermedios. NO tocar "para adaptar": este componente es el
 * contrato visual que aprueba el owner; la integración live se cablea
 * recién después de esa aprobación.
 *
 * Gradientes con `experimental_backgroundImage` (RN 0.81 + New Arch,
 * vía el seam `cssGradient()` de neo-tokens): acepta los strings CSS
 * del mockup tal cual — linear-gradient(145deg)
 * y radial-gradient(circle at 32% 28%) — sin aproximar ángulos, y los
 * inset de boxShadow pintan encima del fondo como en CSS.
 */

const TABS: Array<{ key: NeoTabKey; icon: NeoTabIconName; labelKey: string }> = [
  { key: 'inicio', icon: 'home', labelKey: 'states:tabs.home' },
  { key: 'gastos', icon: 'expenses', labelKey: 'states:tabs.expenses' },
  { key: 'fijos', icon: 'fixed', labelKey: 'states:tabs.fixed' },
  { key: 'control', icon: 'control', labelKey: 'states:tabs.control' },
]

const SPEC = {
  light: {
    barBackground: 'linear-gradient(145deg, #F0F2E7, #E1E4D6)',
    barFallback: '#E9EBE0',
    barShadow: '10px 10px 22px rgba(151,160,136,0.45), -10px -10px 22px rgba(255,255,255,0.95)',
    pillBackground: undefined,
    pillShadow: 'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)',
    active: '#2E7C39',
    inactive: '#6C7B67',
    fabBackground: 'radial-gradient(circle at 32% 28%, #63B168, #2E7434 78%)',
    fabFallback: '#2E7434',
    fabShadow:
      '0 14px 28px rgba(46,116,52,0.45), -6px -6px 14px rgba(255,255,255,0.85), inset 0 2px 3px rgba(255,255,255,0.35)',
    fabIcon: '#F5F2E1',
    fabStroke: 2.6,
  },
  dark: {
    barBackground: 'linear-gradient(145deg, #1D3426, #132318)',
    barFallback: '#16271C',
    barShadow: '10px 10px 22px rgba(0,0,0,0.55), -10px -10px 22px rgba(101,152,113,0.12)',
    pillBackground: '#142519',
    pillShadow: 'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)',
    active: '#A4E3A6',
    inactive: '#7C917A',
    fabBackground: 'radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 80%)',
    fabFallback: '#3E7D46',
    fabShadow:
      '0 0 26px rgba(140,225,150,0.35), 0 12px 24px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,0.35)',
    fabIcon: '#0F1E14',
    fabStroke: 2.8,
  },
} as const

export function NeoTabBar({ mode, activeTab = 'inicio', onTabPress, onFabPress }: NeoTabBarProps) {
  const { t } = useTranslation()
  const s = SPEC[mode]

  const renderTab = ({ key, icon, labelKey }: (typeof TABS)[number]) => {
    const focused = key === activeTab
    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        onPress={onTabPress ? () => onTabPress(key) : undefined}
        style={[
          styles.tab,
          focused
            ? {
                borderRadius: 18,
                paddingVertical: 8,
                paddingHorizontal: 13,
                backgroundColor: SPEC[mode].pillBackground,
                boxShadow: s.pillShadow,
              }
            : styles.tabIdle,
        ]}
      >
        <NeoTabIcon
          color={focused ? s.active : s.inactive}
          name={icon}
          size={20}
          strokeWidth={focused ? 2.3 : 2.2}
        />
        <Text
          style={{
            fontSize: 10.5,
            fontFamily: nunitoFamily(focused ? '900' : '800'),
            fontWeight: focused ? '900' : '800',
            color: focused ? s.active : s.inactive,
          }}
        >
          {t(labelKey)}
        </Text>
      </Pressable>
    )
  }

  return (
    <View
      style={[
        styles.bar,
        cssGradient(s.barBackground, s.barFallback),
        { boxShadow: s.barShadow },
      ]}
    >
      {renderTab(TABS[0])}
      {renderTab(TABS[1])}
      <Pressable
        accessibilityRole="button"
        onPress={onFabPress}
        style={[
          styles.fab,
          cssGradient(s.fabBackground, s.fabFallback),
          { boxShadow: s.fabShadow },
        ]}
      >
        <NeoTabIcon color={s.fabIcon} name="plus" size={26} strokeWidth={s.fabStroke} />
      </Pressable>
      {renderTab(TABS[2])}
      {renderTab(TABS[3])}
    </View>
  )
}

const styles = StyleSheet.create({
  // margin del mockup: 26px 18px 22px — la pone el contenedor que lo
  // monta (preview o pantalla), no la barra.
  bar: {
    borderRadius: 32,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tab: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  tabIdle: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    // `position:relative; top:-26px; margin-bottom:-26px` del mockup.
    top: -26,
    marginBottom: -26,
  },
})
