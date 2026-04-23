import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Path, G } from 'react-native-svg'
import { GreetingHeader } from '@/components/home/greeting-header'
import { HomeCircleButton } from '@/components/home/home-circle-button'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeHeaderProps {
  name: string
  hour?: number
  hasUnreadNotifications?: boolean
  onPressNotifications?: () => void
  onPressSettings?: () => void
}

/**
 * Top block of the Home V1 Cuaderno: contextual greeting on the left,
 * bell + sliders circle buttons on the right. Uses `alignItems:
 * flex-start` + a small `marginTop` on the actions so the buttons sit
 * visually centered against the "Hola, Mario" line — matching the mock
 * spacing.
 */
export function HomeHeader({
  name,
  hour,
  hasUnreadNotifications = false,
  onPressNotifications,
  onPressSettings,
}: HomeHeaderProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.row}>
      <View style={styles.greetingSlot}>
        <GreetingHeader name={name} hour={hour} />
      </View>
      <View style={styles.actions}>
        <HomeCircleButton
          accessibilityLabel="Ir a notificaciones"
          onPress={onPressNotifications}
          showBadge={hasUnreadNotifications}
          badgeColor={theme.colors.peach}
        >
          <BellIcon color={theme.colors.text} />
        </HomeCircleButton>
        <HomeCircleButton
          accessibilityLabel="Ir a ajustes"
          onPress={onPressSettings}
        >
          <SlidersIcon color={theme.colors.text} />
        </HomeCircleButton>
      </View>
    </View>
  )
}

const BellIcon = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path
      d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2z"
      stroke={color}
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
    <Path
      d="M10 20a2 2 0 004 0"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
    />
  </Svg>
)

const SlidersIcon = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <G stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Path d="M4 6h10M4 12h6M4 18h14" />
    </G>
    <Circle cx={17} cy={6} r={2} stroke={color} strokeWidth={1.8} fill="none" />
    <Circle cx={13} cy={12} r={2} stroke={color} strokeWidth={1.8} fill="none" />
    <Circle cx={19} cy={18} r={2} stroke={color} strokeWidth={1.8} fill="none" />
  </Svg>
)

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  greetingSlot: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
})
