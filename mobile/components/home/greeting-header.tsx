import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path, G } from 'react-native-svg'
import { getGreeting } from '@/features/home/home-dashboard-model'
import { FloatView } from '@/components/home/animated/float-view'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'

interface GreetingHeaderProps {
  name: string
  hour?: number
}

export function GreetingHeader({ name, hour = new Date().getHours() }: GreetingHeaderProps) {
  const { theme } = useAppTheme()
  const greeting = getGreeting(hour)
  const Icon = hour < 6 || hour >= 19 ? MoonIcon : hour < 12 ? SunIcon : SunLowIcon

  return (
    <RiseView>
      <View
        style={styles.row}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${greeting}, ${name}`}
      >
        <FloatView amplitude={4} periodMs={5000} style={styles.iconWrap}>
          <Icon />
        </FloatView>
        <Text
          style={[styles.greeting, { color: theme.colors.textMuted }]}
          maxFontSizeMultiplier={1.4}
        >
          {greeting.toLowerCase()},
        </Text>
      </View>
      <Text
        style={[styles.name, { color: theme.colors.text }]}
        maxFontSizeMultiplier={1.4}
      >
        Hola, {name}
      </Text>
    </RiseView>
  )
}

const SunIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={4} fill="#F2A78C" />
    <G stroke="#F2A78C" strokeWidth={1.8} strokeLinecap="round">
      <Path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" />
    </G>
  </Svg>
)
const SunLowIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Circle cx={12} cy={14} r={4} fill="#EC7A51" />
    <G stroke="#EC7A51" strokeWidth={1.8} strokeLinecap="round">
      <Path d="M4 18h16M12 7v2M6 9l1.4 1.4M18 9l-1.4 1.4" />
    </G>
  </Svg>
)
const MoonIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" fill="#6B3A4F" />
  </Svg>
)

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  greeting: { fontSize: 14, fontWeight: '500' },
  name: { fontSize: 34, lineHeight: 36, fontWeight: '800', marginTop: 2, letterSpacing: -1.2 },
})
